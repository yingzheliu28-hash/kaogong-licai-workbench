# 考公·理财 个人工作台 · 项目总览

> 给接手这个项目的人（包括下一个对话里的新 agent）一份**自包含的全景说明**：项目是什么、怎么跑、文件在哪、怎么改、迁移时要注意什么。

最后更新：**2026-08-19 15:50**（随项目进度滚动更新，改完大迭代请同步到本文件 + `进度说明.md`）

---

## 1. 项目一句话

一个**极简文艺清新**风格的个人静态站点 `https://yingzheliu28-hash.github.io/kaogong-licai-workbench/`，每天自动推送并展示「考公常识判断（含周末小测）+ 财经热点知识」两条轨道的内容、行情、错题本、和周测分析。

---

## 2. ⚠️ 关键路径说明（最高优先级，请先读）

> **核心约定（2026-08-13 v5）**：**项目文件夹完全自包含**——02_每日推送源/ 是自动化的写入点 + 所有源数据 + 每周小测子目录，全部在这里。**三个 Python 脚本全部通过 `__file__` 自动检测项目根，跨盘跨机无需改任何路径或代码**。历史归档 `每日wb推送\` 仅作保留，不再被工作流读取。

| 项 | 路径 | 备注 |
|---|---|---|
| **canonical 项目文件夹** | **任意路径**（推荐 `C:\Users\<用户名>\考公理财工作台_完整迁移包\`） | **唯一总目录**；Python 脚本自动检测项目根，跨盘跨机无需改路径 |
| ├ 01_站点前端 | 项目内 `01_站点前端\` | index.html / styles.css / app.js / data.js / build_cloud.py / github_workflow_sync.yml |
| ├ 02_每日推送源 | 项目内 `02_每日推送源\` | **唯一数据源** |
| ├ 03_部署脚本 | 项目内 `03_部署脚本\` | 全部自动检测路径 |
| ├ 04_密钥与配置 | 项目内 `04_密钥与配置\` | GitHub PAT + SSH |
| └ 05_项目交接 | 项目内 `05_项目交接\` | README + 进度说明 + 周测答卷处理流程 + 换电脑迁移指南 + **新电脑自动化提示词** + **前后端解析一致性规范** |
| **历史归档（不再读写）** | `每日wb推送\` | 11 天历史 + 项目交接/快照；**保留不删**，但工作流不再读它 |
| **GitHub 仓库** | https://github.com/yingzheliu28-hash/kaogong-licai-workbench | source/ 收录全部 md + 05_项目交接/ 完整备份 |
| **GitHub Pages 站点** | https://yingzheliu28-hash.github.io/kaogong-licai-workbench/ | 浏览器实际访问的站点 |
| **Python 解释器** | `C:\Users\<用户名>\.workbuddy\binaries\python\versions\3.13.12\python.exe` | WorkBuddy 托管；用绝对路径 |
| **GitHub PAT** | `C:\Users\<用户名>\.workbuddy\secrets\wb_github_pat` | contents:write + workflow |
| **自动化 cwds** | `<项目根>\02_每日推送源` | 唯一需要手填绝对路径的地方；prompt 内全用相对路径 |

### ⚠️ Sandbox 镜像 ≠ 真实桌面（教训必读）

WorkBuddy 沙箱里的 `C:\Users\EDY\Desktop\...` 是隔离的私有副本，**不会**反映到 Windows 真实桌面。Windows API 返回的是 `D:\Desktop`。WorkBuddy 桌面端**不会**自动用 Windows API 检测真实 Desktop——所以 cwds 写错就落到 sandbox、用户在 Windows Explorer 看不到。

修改路径前**必做**：
```bash
[Environment]::GetFolderPath('Desktop')   # PowerShell → D:\Desktop
ls -la "D:/Desktop/每日wb推送/"           # 真实目录（看最新修改时间）
ls -la "C:/Users/EDY/Desktop/每日wb推送/" # sandbox 镜像（**只看做参考**）
```

---

## 3. 目录结构（2026-08-07 后定版）

```
D:\Desktop\考公理财工作台_完整迁移包\        ← canonical 项目根（打开 Windows Explorer 看这 1 个文件夹）
├── 01_站点前端\                            ← 站点文件
│   ├── index.html / styles.css / app.js
│   ├── data.js                             # 数据快照（git diff 推送 GitHub Pages）
│   └── build_cloud.py                      # 数据快照构建（直接读 02_ 镜像）
├── 02_每日推送源\                          ← wb_push_source.py 自动同步的真实桌面副本
│   ├── 公考常识判断/
│   │   ├── 2026-07-28.md ... 2026-08-07.md   每日考点
│   │   ├── progress.json
│   │   ├── 本周知识要点.md                    ← 周末总结 Tab 直接显示
│   │   ├── 我的错题本.md                      ← 错题本 Tab 直接显示（跨周错题重考池）
│   │   └── 每周小测/                          ← 周末小测 skill 数据
│   │       ├── 2026-08-01-本周小测.md          ← 周测分析 Tab 折叠展开
│   │       └── 2026-08-01-成绩.md              ← 周测分析 Tab 真实成绩（每一道）
│   └── 财经热点知识/
│       ├── 2026-07-28.md ... 2026-08-07.md
│       └── progress.json
├── 03_部署脚本\
│   ├── wb_push_source.py                   # 单一源 = D:\Desktop\每日wb推送；镜像到 02_ + 推 GitHub
│   ├── wb_deploy_api.py                    # 推 01_站点前端/data.js → GitHub Pages
│   ├── wb_repo_push.py                     # 通用 Contents API 推送器
│   └── build_cloud.py                      # = 01_站点前端/build_cloud.py 的副本
├── 04_密钥与配置\
│   ├── wb_github_pat
│   ├── wb_workbench_deploy_key / .pub
│   └── ssh_config.txt
└── 05_项目交接\
    ├── README.md                           # 本文件
    ├── 进度说明.md
    └── 新对话启动模板.md
```

---

## 4. 数据流（v3：项目自包含）

```
[11:00 LLM 自动化]  cwd = <项目根>\02_每日推送源
  ↓ LLM 写 md 到：
<项目根>\02_每日推送源\公考常识判断\YYYY-MM-DD.md
<项目根>\02_每日推送源\财经热点知识\YYYY-MM-DD.md
                                                  ↓ wb_push_source.py
GitHub source/{kaogong,licai}/  （含每周小测/ 子目录 + 周维度文件）
  ↓ build_cloud.py（本地或云端 workflow）
<项目根>\01_站点前端\data.js
  ↓ wb_deploy_api.py
GitHub Pages
```

**整个工作台迁移/备份 = 打包 `考公理财工作台_完整迁移包\` 这一个文件夹**（脚本自动检测路径，任意目录均可）。

---

## 5. 真实考公小测体系（已运行 11 天，2026-07-28 起到现在）

| 真实文件 | 作用 | 工作台 Tab |
|---|---|---|
| `每周小测/<日期>-本周小测.md` | 题源（按周切分） | 🗓️ 周末总结 / 📊 周测分析（折叠） |
| `每周小测/<日期>-成绩.md` | 你的逐题成绩（含错因） | 📊 周测分析 + 📝 错题本 |
| `我的错题本.md` | 跨周错题重考池 | 📝 错题本 |
| `本周知识要点.md` | 本周常要点合集 | 🗓️ 周末总结 |

**联动逻辑**：build_cloud.py 直接读以上 4 个真实文件 → 嵌入 data.js → 站点展示。所有展示数据 100% 来自你的真实文件，**没有模拟数据**。

---

## 6. 站点架构

```
index.html / styles.css / app.js  ← 静态 SPA，左侧导航 + 右侧主区
data.js                           ← 单一数据快照（window.WB_DATA）
                                  
  kaogong:
    progress, modules, today_md, history_md
    weekly_summary   ← 本周知识要点.md（真实）
    weekly_quiz      ← 每周小测/<最近>-本周小测.md（真实）
    weekly_range
    quiz_history     ← 每周小测/<日期>-成绩.md（真实，自动解析）
    quiz_stats       ← 累计统计（真实多周聚合）
    wrongbook        ← 我的错题本.md（真实）
    
  licai:
    progress, levels, fund (7 ETFs), today_md, history_md
    weekly_summary / weekly_hot
```

---

## 7. 自动化清单（当前）

⚠️ 换电脑后需重建全部自动化，详见 `换电脑迁移指南.md` + `新电脑自动化提示词.md`。

| 名称 | 触发 | 行为 |
|---|---|---|
| 考公常识判断每日推送 | 每天 11:00 | 生成 md + 跑 wb_push_source + build_cloud + wb_deploy_api |
| 财经热点知识每日推送 | 每天 11:00 | 同上（理财轨道） |
| 考公本周要点周日周更 | 每周日 20:00 | 覆盖写 `本周知识要点.md` |
| 考公周末小测周六出题源 | 每周六 20:00 | 生成 5-12 题到 `每周小测/<下周日>-本周小测.md` |
| WorkBuddy 每日签到 | 每天 10:00 | 签到领积分 |
| GitHub Actions sync.yml | 云端自动构建 | 每 2h + push(source/**) + manual；用 source/ 重建 data.js 推 main |

自动化跑完 → 当天内容即时上线；后续云端每 2h 兜底。

---

## 8. 故障排查速查

| 现象 | 检查 |
|---|---|
| 站点内容没更新 | `wb_deploy_api.py` 状态；GitHub 最新 commit |
| 自动化写文件失败 | cwds 是不是 `<项目根>\02_每日推送源` |
| 周测分析为空 | `02_每日推送源/公考常识判断/每周小测/` 下是否有 `*-成绩.md` |
| 错题本为空 | `02_每日推送源/公考常识判断/我的错题本.md` 是否存在 |
| 周末总结不显示 | `02_每日推送源/公考常识判断/本周知识要点.md` 是否存在 |
| 理财「今日知识」内容重复 / 漏 `**` | 读 `前后端解析一致性规范.md`（2026-08-19 事故：`bullet()` lookahead 未容 emoji 前缀） |

---

## 9. 给接手者 + 换电脑指南

- **了解项目**：读本文件（README.md）+ `进度说明.md`
- **换电脑**：读 `换电脑迁移指南.md`（5 步 checklist）+ `新电脑自动化提示词.md`（5 条可直接复制的 prompt）
- **改解析/格式前必读**：`前后端解析一致性规范.md`（三处实现同步 + lookahead 容 emoji + markdown 标记统一出口 + 回归测试）
- **故障排查**：本文件 §8
- **手动修复**：`wb_push_source.py` + `build_cloud.py` + `wb_deploy_api.py`
