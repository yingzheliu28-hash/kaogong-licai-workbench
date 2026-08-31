// Vercel Serverless Function：接收站点「每周小测」提交的成绩，写回 GitHub source/
//
// 作用：前端做完小测 → POST 到这里 → 本函数用 GitHub PAT（环境变量）写
//       source/kaogong/每周小测/<date>-成绩.md + 更新 source/kaogong/我的错题本.md
//       → 触发 GitHub Actions 重建 data.js → 站点自动刷新。
//
// 环境变量（在 Vercel 项目 Settings → Environment Variables 配置）：
//   GITHUB_PAT : 你的 GitHub Personal Access Token（contents:write + workflow）
//   AUTH_KEY   : 一个自定义字符串，前端提交时带上，用于轻量防滥用

const OWNER = "yingzheliu28-hash";
const REPO = "kaogong-licai-workbench";
const BRANCH = "main";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function ghHeaders(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wb-exam-submit",
    "Content-Type": "application/json",
  };
}

// GET 文件内容（返回 { text, sha }；不存在返回 { text: "", sha: null }）
async function getFile(token, path) {
  const r = await fetch(`${API}/contents/${path}?ref=${BRANCH}`, {
    headers: ghHeaders(token),
  });
  if (r.status === 404) return { text: "", sha: null };
  if (!r.ok) throw new Error(`GET ${path} 失败 HTTP ${r.status}`);
  const j = await r.json();
  const text = Buffer.from(j.content || "", "base64").toString("utf8");
  return { text, sha: j.sha };
}

// 写文件（自动处理新建 / 更新）
async function putFile(token, path, content) {
  const { sha } = await getFile(token, path);
  const body = {
    message: `chore(workbench): 更新 ${path.split("/").pop()}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.text();
    throw new Error(`PUT ${path} 失败 HTTP ${r.status}: ${e.slice(0, 200)}`);
  }
  return (await r.json()).commit.sha;
}

// 触发 GitHub Actions 重建 data.js
async function dispatchWorkflow(token) {
  const r = await fetch(`${API}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({ ref: BRANCH }),
  });
  if (!r.ok && r.status !== 404) {
    // 404 = workflow 文件名不对；不阻断主流程
    throw new Error(`dispatch 失败 HTTP ${r.status}`);
  }
}

// 生成成绩.md 内容
function buildScoreMd(date, week, range, answers, total, score) {
  const today = new Date().toISOString().slice(0, 10);
  const wrongCount = total - score;
  const wrongModules = [];
  answers.forEach((a) => {
    if (!a.ok && a.module && wrongModules.indexOf(a.module.split("·")[0]) < 0) {
      wrongModules.push(a.module.split("·")[0]);
    }
  });
  const weak = wrongModules.length ? wrongModules.join("、") : "无";

  const lines = [];
  lines.push(`# 第 ${week} 周 逐题成绩存档`);
  lines.push("");
  lines.push(`> 周六日期：${date} ｜ 小测作答日：${today} ｜ 题源：${range || date}`);
  lines.push(
    `> 得分：**${score} / ${total}**（${wrongCount === 0 ? total + " 题全对" : "错 " + wrongCount + " 题"}）｜ 薄弱模块：${weak}`
  );
  lines.push("");
  lines.push("| 题号 | 模块 | 你的选项 | 正确选项 | 结果 | 错因 |");
  lines.push("|---|---|---|---|---|---|");
  answers.forEach((a) => {
    const ok = a.ok ? "✅" : "❌";
    lines.push(`| ${a.idx} | ${a.module || ""} | ${a.user || ""} | ${a.correct || ""} | ${ok} | ${a.reason || ""} |`);
  });
  lines.push("");
  return lines.join("\n");
}

// 更新错题本.md：追加错题到重考池 + 追加存档索引行
function buildNewWrongBook(text, date, week, wrong, score, total) {
  const today = new Date().toISOString().slice(0, 10);

  // 1) 追加错题到重考池（插到 "## 附：各周存档索引" 之前）
  let out = text;
  if (wrong.length) {
    const poolLines = wrong.map((w) => {
      const stem = (w.stem || w.topic || "").replace(/\s+/g, " ").slice(0, 60);
      const reason = w.reason || "未标注";
      return `- ${stem}／ 你的选项 ${w.user} ／ 正确 ${w.correct} ／ ${w.module} ／ 第 ${week} 周（${date} 小测）／ ${reason}`;
    }).join("\n");
    const idx = out.indexOf("## 附：各周存档索引");
    if (idx >= 0) {
      out = out.slice(0, idx).trimEnd() + "\n" + poolLines + "\n\n" + out.slice(idx);
    } else {
      out = out.trimEnd() + "\n" + poolLines + "\n";
    }
  }

  // 2) 追加存档索引行
  const indexLine =
    `- 第 ${week} 周（周六 ${date}，作答 ${today}，${score}/${total}）：` +
    `[本周小测](每周小测/${date}-本周小测.md) ｜ [成绩](每周小测/${date}-成绩.md)`;
  if (out.indexOf(`（周六 ${date}，`) < 0) {
    out = out.trimEnd() + "\n" + indexLine + "\n";
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "仅支持 POST" });
    return;
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    res.status(500).json({ ok: false, error: "服务端未配置 GITHUB_PAT" });
    return;
  }
  const authKey = process.env.AUTH_KEY;
  const body = req.body || {};

  if (authKey && body.key !== authKey) {
    res.status(403).json({ ok: false, error: "key 校验失败" });
    return;
  }

  const date = String(body.date || "");
  const week = Number(body.week || 0);
  const range = String(body.range || "");
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const wrong = Array.isArray(body.wrong) ? body.wrong : [];
  const total = Number(body.total || answers.length);
  const score = Number(body.score || answers.filter((a) => a.ok).length);

  if (!date || !answers.length || !week) {
    res.status(400).json({ ok: false, error: "缺少 date / answers / week" });
    return;
  }

  try {
    const scoreMd = buildScoreMd(date, week, range, answers, total, score);
    const c1 = await putFile(token, `source/kaogong/每周小测/${date}-成绩.md`, scoreMd);

    const wbPath = "source/kaogong/我的错题本.md";
    const { text: wbText } = await getFile(token, wbPath);
    const newWb = buildNewWrongBook(wbText || "", date, week, wrong, score, total);
    const c2 = await putFile(token, wbPath, newWb);

    let dispatchMsg = "";
    try {
      await dispatchWorkflow(token);
      dispatchMsg = "已触发云端重建";
    } catch (e) {
      dispatchMsg = "重建触发失败：" + (e.message || e);
    }

    res.status(200).json({
      ok: true,
      date,
      score: `${score}/${total}`,
      wrong: wrong.length,
      commits: { score: c1.slice(0, 8), wrongbook: c2.slice(0, 8) },
      dispatch: dispatchMsg,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
