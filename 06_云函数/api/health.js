// Vercel Serverless Function：凭据体检端点（**只读**，不会写任何文件；2026-08-31 部署）
//
// 用途：本地 `03_部署脚本/wb_check_credentials.py` 调用它，用来验证「Vercel 环境变量里的
//       GITHUB_PAT」是否仍然有效，并与本地 PAT 副本做对比。
//
// 为什么需要（2026-08-31 事故）：GitHub PAT 在本项目里有**两份互不相干的副本**——
//   副本 1：本地 ~/.workbuddy/secrets/wb_github_pat（Python 脚本用）
//   副本 2：Vercel 环境变量 GITHUB_PAT（本云函数用）
// PAT 过期时若只换一处，另一处会静默失效。副本 2 失效时**站点浏览、每日推送全都正常**，
// 只有「在线做小测 → 提交成绩」报 401，极易误判成代码 bug。
//
// 用法：GET /api/health?key=<AUTH_KEY>
//
// ⚠️ 安全：本端点**绝不返回 token 本身**，只返回前 4 位前缀（用于人工比对是哪一份 token）。

const OWNER = "yingzheliu28-hash";
const REPO = "kaogong-licai-workbench";
const GH_USER = "https://api.github.com/user";
const GH_REPO = `https://api.github.com/repos/${OWNER}/${REPO}`;

function ghHeaders(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "wb-exam-health",
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // key 校验与 submit.js 保持一致（AUTH_KEY 未配置时不做限制）
  const authKey = process.env.AUTH_KEY;
  const q = req.query || {};
  const key = String(q.key || (req.body && req.body.key) || "");
  if (authKey && key !== authKey) {
    res.status(403).json({ ok: false, error: "key 校验失败" });
    return;
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    res.status(200).json({
      ok: false,
      configured: false,
      error: "Vercel 未配置 GITHUB_PAT 环境变量",
    });
    return;
  }

  const out = {
    ok: true,
    configured: true,
    token_prefix: token.slice(0, 4), // 仅前缀，供人工比对，绝不回传完整 token
    token_len: token.length,
    owner: OWNER,
    repo: REPO,
  };

  // 1) token 本身是否有效 + 授权范围
  try {
    const r = await fetch(GH_USER, { headers: ghHeaders(token) });
    out.token_valid = r.ok;
    out.user_http = r.status;
    out.scopes = r.headers.get("X-OAuth-Scopes") || "";
    if (r.ok) {
      const j = await r.json();
      out.login = j.login;
    } else {
      out.error = `GitHub /user 返回 HTTP ${r.status}（401 = token 过期或已被撤销）`;
    }
  } catch (e) {
    out.ok = false;
    out.error = "请求 GitHub 失败：" + String((e && e.message) || e);
    res.status(200).json(out);
    return;
  }

  // 2) 对目标仓库是否有写权限
  try {
    const r2 = await fetch(GH_REPO, { headers: ghHeaders(token) });
    out.repo_http = r2.status;
    if (r2.ok) {
      const j2 = await r2.json();
      out.repo_push = !!(j2.permissions && j2.permissions.push);
      out.repo_admin = !!(j2.permissions && j2.permissions.admin);
    } else {
      out.repo_push = false;
    }
  } catch (e) {
    out.repo_error = String((e && e.message) || e);
  }

  out.checked_at = new Date().toISOString();
  res.status(200).json(out);
};
