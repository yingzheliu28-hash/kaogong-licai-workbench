# 06_云函数 · 小测成绩写回（Vercel）

站点做完「每周小测」后，前端自动 POST 到这个 Vercel 云函数，云函数用 GitHub PAT
把成绩写回 `source/kaogong/每周小测/<date>-成绩.md` + 更新 `我的错题本.md`，并触发
GitHub Actions 重建 data.js → 站点自动刷新。免去「导出 → 贴回对话」的手动步骤。

## 目录

```
06_云函数/
├── api/submit.js      # 云函数主体（POST 成绩 → 写 GitHub）
├── api/health.js      # 凭据体检端点（只读，供本地自检脚本调用）
├── package.json
├── vercel.json
└── README.md
```

---

## ⚠️ 最重要：GitHub PAT 有两份副本，必须同步更新

本项目里同一个 PAT 被**两个互不相干的地方**各存了一份：

| 副本 | 存放位置 | 谁在用 | 失效后的症状 |
|---|---|---|---|
| **1. 本地** | `C:\Users\<用户名>\.workbuddy\secrets\wb_github_pat` | `wb_push_source.py` / `wb_deploy_api.py` / `wb_repo_push.py` | 本地推送脚本报 401 |
| **2. Vercel** | Vercel → `kaogong-exam-api` → Settings → Environment Variables → `GITHUB_PAT` | 本目录下的 `api/submit.js` | **站点一切正常，只有点「提交成绩」报 401** |

**这是全项目最坑的故障模式**（2026-08-31 实际踩过）：副本 2 过期时，
本地脚本、站点浏览、每日推送**全都正常**，只有「在线做小测 → 提交」这一个动作失败，
极易误判成代码 bug 或前端问题。

### PAT 到期 / 重新生成时，两处必须一起换

1. 覆盖写入 `C:\Users\<用户名>\.workbuddy\secrets\wb_github_pat`
2. Vercel → `kaogong-exam-api` → Settings → Environment Variables → 更新 `GITHUB_PAT`
3. **在 Vercel 项目里点 Redeploy** —— Vercel 不热加载环境变量，不重新部署改了也不生效
4. 跑一次体检确认两边都活：

```bash
python 03_部署脚本/wb_check_credentials.py
```

### 权限要求

`repo` 即可，`workflow` **非必需**。
`sync.yml` 是 `on: push: paths: ['source/**']`，云函数写文件本身就会触发重建；
`submit.js` 里的 `dispatchWorkflow()` 只是冗余保险，失败也不影响主流程。

---

## ⚠️ 第二件事：Vercel 项目连接的是**独立仓库**

实际部署的 Vercel 项目 **`kaogong-exam-api`** 导入的是独立仓库：

```
https://github.com/yingzheliu28-hash/kaogong-exam-api
```

而不是主仓库 `kaogong-licai-workbench` 里的 `06_云函数/` 子目录。

**这意味着**：
- 主仓库 `kaogong-licai-workbench/06_云函数/` 只是**备份/归档**（换电脑时能从主仓库拉回）
- 想让站点真正生效，必须推到 **独立仓库** `yingzheliu28-hash/kaogong-exam-api`
- 只推主仓库不会触发 Vercel 重新部署

### ✅ 推荐：一键双推（不会漏）

```bash
python 03_部署脚本/wb_push_cloudfn.py
```

它会扫描 `06_云函数/` 下所有文件，**同时推两个仓库**：

| 目标 | 路径 | 作用 |
|---|---|---|
| 主仓库 `kaogong-licai-workbench` | `06_云函数/<文件>` | 备份，换电脑可拉回 |
| 独立仓库 `kaogong-exam-api` | `<文件>` | **Vercel 实际拉的，决定站点行为** |

推完 Vercel 会自动重新部署（一般 10~30 秒）。验证：

```bash
python 03_部署脚本/wb_check_credentials.py
```

可选参数：
- `--main-only` —— 只推主仓库（**若已改成方案 B：Vercel 直连主仓库**）
- `--vercel-only` —— 只推独立仓库

### 备选：手动逐个推

```bash
python "03_部署脚本/wb_repo_push.py" --repo=yingzheliu28-hash/kaogong-exam-api \
  "06_云函数/api/submit.js" "api/submit.js" \
  "06_云函数/api/health.js" "api/health.js" \
  "06_云函数/vercel.json" "vercel.json" \
  "06_云函数/package.json" "package.json" \
  "06_云函数/README.md" "README.md"
```

> ⚠️ 手动推容易漏掉主仓库那份备份，优先用上面的双推脚本。

### 根治方案（可选）：让 Vercel 直连主仓库

如果已经把 Vercel 项目的 Git 连接改成主仓库 `kaogong-licai-workbench`、
并把 **Root Directory** 设为 `06_云函数`，那么：
- 独立仓库 `kaogong-exam-api` 可以弃用
- 以后只需 `--main-only`（或普通 `wb_push_source.py` 流程）
- 只剩一份代码，彻底不可能漏

---

## 部署步骤（Vercel）

1. 用 GitHub 账号登录 vercel.com
2. 新建项目 → Import 一个 Git 仓库（或把本目录 `06_云函数/` 单独推到一个新仓库再 Import）
3. 在 Vercel 项目 Settings → Environment Variables 配两个变量：
   - `GITHUB_PAT` = 你的 GitHub Token（见上面「两份副本」说明）
   - `AUTH_KEY`  = 一个自定义字符串（前端提交时带上，防滥用；可选但建议配）
4. Deploy，得到函数地址，形如 `https://<项目名>.vercel.app/api/submit`
5. 把这个地址 + AUTH_KEY 填到 `01_站点前端/app.js` 里的 `EXAM_SUBMIT_URL` / `EXAM_AUTH_KEY` 常量
6. 重新跑 `wb_deploy_api.py` 推送前端文件

> 06_云函数/ 目录内**任何文件改动后都要重新 Deploy**（包括新增 `api/health.js`）。

## 数据流

```
站点做完小测 → 点「提交成绩」
  → POST https://xxx.vercel.app/api/submit  (body 含 key/date/week/answers/wrong)
  → 云函数写 source/kaogong/每周小测/<date>-成绩.md
  → 云函数更新 source/kaogong/我的错题本.md
  → push 触发 GitHub Actions sync.yml 重建 data.js
  → 站点 1~2 分钟内刷新出最新成绩/错题本/周测分析
```

## 端点

### `POST /api/submit`

写成绩。body：

```json
{
  "key": "<AUTH_KEY>",
  "date": "2026-08-30",
  "week": 5,
  "score": 7,
  "total": 10,
  "answers": [{ "idx": 1, "module": "政治·矛盾论", "user": "C", "correct": "C", "ok": true }],
  "wrong": []
}
```

返回码速查（**这是判断 PAT 副本 2 状态的依据**）：

| 返回 | 含义 |
|---|---|
| 200 | 成功写入 |
| 400 | 缺少 `date` / `answers` / `week` |
| 403 | `key` 校验失败 → 同时也说明 `GITHUB_PAT` **有值**（`!token` 检查排在它前面） |
| 500 + 「服务端未配置 GITHUB_PAT」 | Vercel 环境变量缺失 |
| 500 + `GET <path> 失败 HTTP 401` | **`GITHUB_PAT` 过期/被撤销/权限不足** ← 今天这个报错 |

### `GET /api/health?key=<AUTH_KEY>`（2026-08-31 新增）

只读体检，**不写任何文件**。返回云端 PAT 是否有效、scopes、对仓库是否有 push 权限。

```json
{
  "ok": true, "configured": true,
  "token_prefix": "ghp_", "token_len": 40,
  "token_valid": true, "login": "yingzheliu28-hash",
  "scopes": "repo", "repo_push": true,
  "checked_at": "2026-08-31T09:50:00.000Z"
}
```

供 `03_部署脚本/wb_check_credentials.py` 调用，用来和本地 PAT 副本对比。
**绝不返回 token 本身**，只回传前 4 位前缀供人工比对。

若未部署该端点，自检脚本会退化为「间接推断」：只能确认 PAT 有值，无法验证有效性。

## 注意

- **成绩/错题本的权威源 = GitHub source/**（由云函数写）。本地 `02_每日推送源` 里的
  `我的错题本.md` 与 `每周小测/*-成绩.md` 不再作为权威；`wb_push_source.py` 已改为
  不覆盖这两个文件（避免本地旧内容冲掉云函数写的新成绩）。
- 若改为「对话做小测」，agent 写本地后应直接用 `wb_repo_push.py` 单独推这两个文件，
  而不是依赖 `wb_push_source.py`（后者有 `SCORE_RE` 硬跳过 `*-成绩.md`）。
