// Vercel Serverless Function：接收站点「笔记」保存，写回 GitHub source/notes.json
//
// 作用：前端在每个知识点卡片里点「保存笔记」→ localStorage 落盘后，异步 POST 到这里
//       → 本函数把完整笔记 map 写回 source/notes.json
//       → push 触发 GitHub Actions sync.yml 重建 data.js → 站点云端兜底实时更新。
//       用户无需手动「导出笔记 JSON」，跨设备也能同步。
//
// 环境变量（与 api/submit.js 共用 Vercel 项目配置）：
//   GITHUB_PAT : GitHub Personal Access Token（contents:write）
//   AUTH_KEY   : 自定义字符串，前端提交时带上，用于轻量防滥用

const OWNER = "yingzheliu28-hash";
const REPO = "kaogong-licai-workbench";
const BRANCH = "main";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function ghHeaders(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wb-note-save",
    "Content-Type": "application/json",
  };
}

// GET 文件（返回 { text, sha }；不存在返回 { text: "", sha: null }）
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
    message: `chore(workbench): 同步用户笔记 ${new Date().toISOString().slice(0, 10)}`,
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

  const notes = body.notes;
  if (typeof notes !== "object" || notes === null || Array.isArray(notes)) {
    res.status(400).json({ ok: false, error: "缺少 notes（应为对象）" });
    return;
  }

  // 前端传来的是「本地 + 云端」合并后的完整 map（loadAllNotes 已合并 D.notes），
  // 这里直接覆盖写回即可；但再做一层并集兜底：读云端现有，保留云端有、前端无的 key，
  // 避免极端情况下（另一标签页新增的笔记尚未合并）被冲掉。
  try {
    const { text } = await getFile(token, "source/notes.json");
    let merged = {};
    if (text) {
      try { merged = JSON.parse(text); } catch (e) { merged = {}; }
    }
    if (typeof merged !== "object" || merged === null || Array.isArray(merged)) merged = {};
    Object.keys(notes).forEach((k) => { merged[k] = notes[k]; });

    const json = JSON.stringify(merged, null, 2);
    const c = await putFile(token, "source/notes.json", json);

    res.status(200).json({
      ok: true,
      count: Object.keys(merged).length,
      commit: c.slice(0, 8),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
