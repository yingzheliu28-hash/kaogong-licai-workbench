#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云端构建脚本：由 source/ 下的 md + progress.json 与公开行情接口，重建站点 data.js。

输入（默认脚本所在目录的 source/，可用 SOURCE_DIR 覆盖，例如指向本地 Desktop 做预览）：
  source/kaogong/progress.json + YYYY-MM-DD.md
  source/licai/progress.json   + YYYY-MM-DD.md

输出（默认脚本所在目录的 data.js，可用 DATA_OUT 覆盖）：
  data.js —— GitHub Pages 站点读取的单一数据快照

基金行情（替代本机 tdx-connector，纯公开 HTTP 接口）：
  - 场内 ETF（510300/510500/159915）：腾讯 gtimg 接口
  - 场外基金（025857/022459/006479/007639）：东方财富 lsjz 接口（净值 DWJZ + 日涨幅 JZZZL）
"""
import os, sys, json, re, datetime, urllib.request, urllib.error, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
# 项目根：build_cloud.py 位于 01_站点前端/ 下，往上一级即项目根（自包含，不依赖绝对路径）
PKG_ROOT = os.path.dirname(HERE)
SOURCE_DIR = os.environ.get("SOURCE_DIR") or os.path.join(HERE, "source")
DATA_OUT = os.environ.get("DATA_OUT") or os.path.join(HERE, "data.js")
# 本地项目内源目录（v4 自包含）；云端构建时不存在，回退到 source/
LOCAL_KG_DIR = os.path.join(PKG_ROOT, "02_每日推送源", "公考常识判断")
LOCAL_LC_DIR = os.path.join(PKG_ROOT, "02_每日推送源", "财经热点知识")
LOCAL_DATA_OUT = os.path.join(PKG_ROOT, "01_站点前端", "data.js")

# 固定结构
KG_MODULES = ["政治", "法律", "经济", "人文历史", "科技与生活", "地理国情", "管理公文"]
LC_LEVELS = ["L1 基础认知", "L2 市场术语", "L3 策略指标", "L4 宏观风险", "L5 进阶专题"]

# 基金元数据：(code, name, sector, type, market)
FUNDS = [
    ("510300", "沪深300ETF", "宽基指数·沪深300", "etf", "sh"),
    ("510500", "中证500ETF", "宽基指数·中证500", "etf", "sh"),
    ("159915", "创业板ETF", "宽基指数·创业板", "etf", "sz"),
    ("025857", "华夏电网ETF联接C", "新能源·电网设备", "fund", ""),
    ("022459", "易方达中证A500A", "宽基指数·中证A500", "fund", ""),
    ("006479", "广发纳指100ETFC", "海外·纳斯达克100(QDII)", "fund", ""),
    ("007639", "汇添富竞争优势", "主动权益·混合偏股", "fund", ""),
]


def log(*a):
    print("[build]", *a, flush=True)


def http_get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "Mozilla/5.0"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def all_md_paths(track_dir):
    """收集目录下所有 YYYY-MM-DD.md（按日期升序）。"""
    if not os.path.isdir(track_dir):
        return []
    cands = [f for f in os.listdir(track_dir) if re.match(r"^\d{4}-\d{2}-\d{2}\.md$", f)]
    cands.sort()
    return [os.path.join(track_dir, f) for f in cands]


def read_optional_file(path):
    """读文件内容（不存在返回 None）。"""
    if not os.path.isfile(path):
        return None
    try:
        return open(path, encoding="utf-8").read()
    except Exception:
        return None


_KG_MODULE_PATTERNS = [
    ("政治",        r"政治"),
    ("法律",        r"法律"),
    ("经济",        r"经济"),
    ("人文历史",    r"人文"),
    ("科技与生活",  r"科技"),
    ("地理国情",    r"地理"),
    ("管理公文",    r"(管理|公文)"),
]


def detect_module_from_md(md_text):
    """从每日 md 文本里推断模块（取第一个匹配的）。"""
    head = md_text.split("\n", 1)[0]
    for mod, pat in _KG_MODULE_PATTERNS:
        if re.search(pat, head):
            return mod
    return "未识别"


def parse_quiz_score_md(path):
    """解析 每周小测/<日期>-成绩.md（你真实维护的格式）。

    表头行: | 题号 | 模块 | 你的选项 | 正确选项 | 结果 | 错因 |
    数据行: | 1 | 政治·会议 | B | B | ✅ | — |   ← 全对，忽略
            | 3 | 法律·选举权 | A | C | ❌ | 知识点薄弱 |  ← 错题，记入 history

    返回: dict(week=YYYY-MM-DD, total=N, correct=K, wrong=[{q_idx, title, module, user_answer, correct_answer, reason}])
    （注：title 从每周小测/<日期>-本周小测.md 用相同 q_idx 查表，避免依赖 md 里写 title）
    """
    if not os.path.isfile(path):
        return None
    text = open(path, encoding="utf-8").read()
    fname = os.path.basename(path)
    week_m = re.match(r"(\d{4}-\d{2}-\d{2})-成绩\.md$", fname)
    week = week_m.group(1) if week_m else ""
    # 解析 markdown 表格
    rows = []
    for line in text.split("\n"):
        line = line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            continue
        # 过滤表头与分隔行（---|---）
        if re.match(r"^\|\s*-+", line.replace(" ", "")):
            continue
        if "题号" in line and "模块" in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 6:
            continue
        try:
            idx = int(cells[0])
        except ValueError:
            continue
        rows.append({
            "q_idx": idx,
            "module_full": cells[1],         # 政治·会议 / 法律·选举权 / ...
            "user_answer": cells[2],
            "correct_answer": cells[3],
            "result": cells[4],
            "reason_raw": cells[5] if len(cells) > 5 else "—",
        })
    if not rows:
        return None
    correct = sum(1 for r in rows if r["result"].strip() in ("✅", "√"))
    wrong_rows = [r for r in rows if r["result"].strip() not in ("✅", "√")]
    # 把 "政治·会议" 拆成主模块 "政治"（取 · 前段）
    wrong = []
    for r in wrong_rows:
        topic = r["module_full"].strip()
        module_main = topic.split("·")[0].strip() if "·" in topic else topic
        reason = r["reason_raw"].strip()
        if reason in ("—", "-", ""):
            reason = "未标注"
        wrong.append({
            "q_idx": r["q_idx"],
            "module": module_main,
            "topic": topic,                  # 保留全 topic（用于回溯原始日推送）
            "user_answer": r["user_answer"],
            "correct_answer": r["correct_answer"],
            "reason": reason,
        })
    # title 留给前端从 weekly_quiz md 里拿 q_idx 关联，这里先用 module_full 占位
    for w in wrong:
        w["title"] = ""  # 由前端在 weekly_quiz md 里反查
    return {
        "week": week,
        "total": len(rows),
        "correct": correct,
        "wrong": wrong,
    }


def find_quiz_title(weekly_quiz_md, q_idx):
    """从 `每周小测/<日期>-本周小测.md` 里按 q_idx 反查 title（保留旧兼容）。"""
    if not weekly_quiz_md:
        return ""
    pat = re.compile(r"^\*\*\s*(\d+)\s*\.\*\*\s*([^\n]+)", re.M)
    for m in pat.finditer(weekly_quiz_md):
        if int(m.group(1)) == q_idx:
            return m.group(2).strip()
    return ""


def find_quiz_question(weekly_quiz_md, q_idx):
    """从 `每周小测/<日期>-本周小测.md` 里按 q_idx 解析完整题目。

    返回 dict(stem, options, answer, explanation, knowledge_point)；
    解析失败返回 None。options 是 [(letter, text)] 列表。
    """
    if not weekly_quiz_md:
        return None
    # 题目块起点：**N.** 或 **N.**（不定项）
    start_pat = re.compile(r"^\*\*\s*(\d+)\s*\.\*\*\s*(.+?)\s*$", re.M)
    m_start = None
    for m in start_pat.finditer(weekly_quiz_md):
        if int(m.group(1)) == q_idx:
            m_start = m
            break
    if not m_start:
        return None

    stem_full = m_start.group(2).strip()
    # 去掉 (不定项) / （多选） / （单选） 等题型标记
    stem = re.sub(r"^[（(][^）)]+[）)]\s*", "", stem_full).strip()

    # 题目块终点：下一题 **N+1.** 或 --- 分隔符
    pos_start = m_start.end()
    end_pat = re.compile(r"^\*\*\s*" + str(q_idx + 1) + r"\s*\.\*\*", re.M)
    m_end = end_pat.search(weekly_quiz_md, pos_start)
    if m_end:
        block = weekly_quiz_md[pos_start:m_end.start()]
    else:
        sep = re.search(r"\n---\n", weekly_quiz_md[pos_start:])
        block = weekly_quiz_md[pos_start:pos_start + sep.start()] if sep else weekly_quiz_md[pos_start:]

    # 解析选项：兼容单行多选 + 多行分选；优先取选项多的解析
    options = []
    block_lines = [l.strip() for l in block.split("\n") if l.strip()]

    # 路径 1：多行（每行一个选项）
    per_line = []
    for line in block_lines:
        m_opt = re.match(r"^([A-Z])\.\s*(.+)$", line)
        if m_opt:
            per_line.append((m_opt.group(1), m_opt.group(2).strip()))

    # 路径 2：单行多选项（A. xx　B. xx ...），用 findall 解决首项缺前置空白的问题
    single_line = []
    for line in block_lines:
        # 匹配每个 "X. <text>" 段（X 在行首或紧跟空白），text 至下一个 "X. " 或行尾
        matches = re.findall(
            r"(?:^|\s)([A-Z])\.\s*([^A-Z]+?)(?=\s+[A-Z]\.|$)",
            line,
        )
        if len(matches) >= 2 and len(matches) > len(single_line):
            single_line = [(m[0], m[1].strip()) for m in matches]

    # 取选项多的那份
    options = single_line if len(single_line) > len(per_line) else per_line

    # 答案 + 解析 + 知识点（从密钥段提）
    ans_pat = re.compile(
        r"^\s*" + str(q_idx) + r"\s*[\.、]\s*答案[：:]\s*([^\s|｜]+)\s*[|｜]\s*解析[：:]\s*(.+?)(?=\n\s*\n|\n\s*\d+\s*[\.、]|\n\s*---\n|\Z)",
        re.M | re.S,
    )
    m_ans = ans_pat.search(weekly_quiz_md)
    answer = ""
    explanation = ""
    knowledge_point = ""
    if m_ans:
        answer = m_ans.group(1).strip()
        explanation = m_ans.group(2).strip()
        # 1. 显式考点标记：**考点：xxx**
        kp_match = re.search(r"\*\*\s*考点[：:]\s*([^*]+?)\s*\*\*", explanation)
        if kp_match:
            knowledge_point = kp_match.group(1).strip()
        else:
            # 2. 兜底：取解析首句（肯定描述，通常是新增/正确部分）
            #    解析常见格式 "X 是 ...；Y 不是 ..." → 首段是知识本身
            chunks = re.split(r"[；;]", explanation)
            for c in chunks:
                c = c.strip()
                if 4 <= len(c) <= 100:
                    knowledge_point = c.rstrip("。.") + ("。" if not c.endswith("。") else "")
                    break
            if not knowledge_point:
                # 整个解析当知识点
                knowledge_point = explanation[:200]

    return {
        "stem": stem,
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "knowledge_point": knowledge_point,
    }


def _extract_quiz_date_range(weekly_quiz_md, week_date_str):
    """从本周小测 md 头部提取覆盖日期范围，如 "08/03–08/09"。

    返回 (start_date, end_date) ISO 字符串，年份取 week_date_str 的年份；
    找不到正则匹配则兜底为 [week_date - 6 天, week_date]。
    """
    if not week_date_str:
        return None, None
    year = week_date_str[:4]
    if weekly_quiz_md:
        m = re.search(r"(\d{1,2})/(\d{1,2})\s*[-–~]\s*(\d{1,2})/(\d{1,2})", weekly_quiz_md)
        if m:
            return ("%s-%02d-%02d" % (year, int(m.group(1)), int(m.group(2))),
                    "%s-%02d-%02d" % (year, int(m.group(3)), int(m.group(4))))
    # 兜底：用 quiz 日期向前推 6 天（大多数周测覆盖最近 7 天）
    try:
        d = datetime.date.fromisoformat(week_date_str)
        return (d - datetime.timedelta(days=6)).isoformat(), week_date_str
    except Exception:
        return None, None


def find_full_knowledge_for_wrong(kg_dir, week_start, week_end, wrong_module):
    """根据错题的 topic 字段，回溯到本周原始日推送 md，找到匹配日及标题。

    返回 dict(source_date, title) 或 None。
    （v3：不再提取完整讲解，改为前端跳转到当日"知识考点"Tab）
    """
    if not wrong_module:
        return None
    parts = wrong_module.split("·", 1)
    sub = parts[1].strip() if len(parts) > 1 else parts[0].strip()
    primary = parts[0].strip()

    # 关键词分级（从精确到宽泛）：sub → sub 去掉常见后缀 → sub 前 4 字 → primary 模块
    keywords = []
    if sub and sub != primary:
        keywords.append(sub)
        for suf in ["种类", "类型", "范畴", "内容", "问题", "情况", "条款", "要件"]:
            if sub.endswith(suf) and len(sub) > len(suf) + 2:
                keywords.append(sub[: -len(suf)])
                break
        if len(sub) >= 4:
            keywords.append(sub[:4])
    keywords.append(primary)

    weekly_pushes = []
    for p in all_md_paths(kg_dir):
        d = os.path.basename(p)[:10]
        if d and week_start <= d <= week_end:
            weekly_pushes.append((d, p))
    weekly_pushes.sort()

    # 在本周内按 keywords 优先级找首个含该关键词的知识点
    for kw in keywords:
        for d, p in weekly_pushes:
            try:
                with open(p, encoding="utf-8") as f:
                    txt = f.read()
            except Exception:
                continue
            if kw and kw in txt:
                parsed = parse_kg_md(txt)
                for pt in parsed:
                    if kw in (pt["title"] + (pt.get("explain") or "")):
                        return {"source_date": d, "title": pt["title"]}
    return None


def read_kaogong_quiz_state(kg_dir):
    """扫描每周小测/ 下的 <日期>-成绩.md + <日期>-本周小测.md，聚合出 quiz_history + stats + weekly_quiz + wrongbook。

    真实数据流：
      每周小测/<日期>-本周小测.md    ← 你/「公考小测」自动化生成的题源
      每周小测/<日期>-成绩.md         ← 你作答后的逐题成绩
      我的错题本.md                  ← 跨周错题重考池（直接当错题本内容）
      本周知识要点.md                ← 当周末总结

    返回 dict(weekly_quiz_md, quiz_history, stats, wrongbook_md, weekly_summary_md)
    """
    out = {"weekly_quiz_md": None, "quiz_history": [], "stats": {"cumulative": False, "total_quizzes": 0},
           "wrongbook_md": None, "weekly_summary_md": None}

    weekly_quiz_dir = os.path.join(kg_dir, "每周小测")
    if not os.path.isdir(weekly_quiz_dir):
        return out

    # 找所有 <日期>-成绩.md，按日期升序
    score_files = []
    for f in sorted(os.listdir(weekly_quiz_dir)):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})-成绩\.md$", f)
        if m:
            score_files.append((m.group(1), os.path.join(weekly_quiz_dir, f)))
    if not score_files:
        return out

    quiz_files = {}  # 日期 -> 本周小测.md 路径
    for f in sorted(os.listdir(weekly_quiz_dir)):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})-本周小测\.md$", f)
        if m:
            quiz_files[m.group(1)] = os.path.join(weekly_quiz_dir, f)

    history = []
    for week, score_path in score_files:
        one = parse_quiz_score_md(score_path)
        if not one:
            continue
        # 用对应日期的本周小测 md 反查 完整题目（题干+选项+解析+知识点）
        qm = read_optional_file(quiz_files.get(week))
        # 从小测 md 头部提取覆盖日期范围（如 "08/03–08/09"）
        week_start, week_end = _extract_quiz_date_range(qm, week)
        for w in one["wrong"]:
            w["title"] = find_quiz_title(qm, w["q_idx"])
            qd = find_quiz_question(qm, w["q_idx"])
            if qd:
                w["question"] = qd
            else:
                w["question"] = {"stem": "", "options": [], "answer": "", "explanation": "", "knowledge_point": ""}
            # 回溯原始���推送：取完整「讲解」（不受小测解析简化版的限制）
            if week_start and week_end and w.get("topic"):
                fk = find_full_knowledge_for_wrong(kg_dir, week_start, week_end, w["topic"])
                if fk:
                    w["question"]["full_knowledge"] = fk
        history.append({
            "date": week,
            "week": week,
            "score": "%d/%d" % (one["correct"], one["total"]),
            "total": one["total"],
            "correct": one["correct"],
            "wrong": one["wrong"],
            "feedback": "",  # 真实场景由辅导老师在「我的错题本.md」里维护
        })

    if not history:
        return out

    # 累计统计
    total_quizzes = len(history)
    total_questions = sum(h["total"] for h in history)
    total_correct = sum(h["correct"] for h in history)
    total_wrong = sum(len(h["wrong"]) for h in history)
    accuracy = round(100 * total_correct / total_questions, 1) if total_questions else 0

    mod_wrong = {}
    title_wrong = {}
    reason_wrong = {}
    for h in history:
        for w in h["wrong"]:
            mod = w.get("module", "未分类")
            mod_wrong[mod] = mod_wrong.get(mod, 0) + 1
            title = w.get("title", "")
            if title:
                title_wrong[title] = title_wrong.get(title, 0) + 1
            reason = w.get("reason", "未标注")
            reason_wrong[reason] = reason_wrong.get(reason, 0) + 1

    stats = {
        "total_quizzes": total_quizzes,
        "total_questions": total_questions,
        "total_correct": total_correct,
        "total_wrong": total_wrong,
        "accuracy_pct": accuracy,
        "wrong_by_module": [{"module": m, "count": c} for m, c in sorted(mod_wrong.items(), key=lambda x: -x[1])],
        "wrong_by_reason": reason_wrong,
        "top_wrong_modules": [{"module": m, "count": c} for m, c in sorted(mod_wrong.items(), key=lambda x: -x[1])[:5]],
        "top_wrong_titles": [{"title": t, "count": c} for t, c in sorted(title_wrong.items(), key=lambda x: -x[1])[:5]],
        "last_quiz": history[-1],
        "cumulative": total_quizzes >= 2,
    }

    # 最近的本周小测 md（即"最新一周的题源"）：从 quiz_files 取最后一周
    if score_files and score_files[-1][0] in quiz_files:
        out["weekly_quiz_md"] = read_optional_file(quiz_files[score_files[-1][0]])

    # 错题本 = 我的错题本.md（用户维护的跨周错题重考池）
    out["wrongbook_md"] = read_optional_file(os.path.join(kg_dir, "我的错题本.md"))

    # 周末总结 = 本周知识要点.md
    out["weekly_summary_md"] = read_optional_file(os.path.join(kg_dir, "本周知识要点.md"))

    out["quiz_history"] = history
    out["stats"] = stats
    return out


def latest_md_path(track_dir):
    paths = all_md_paths(track_dir)
    return paths[-1] if paths else None


def load_progress(track_dir):
    p = os.path.join(track_dir, "progress.json")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_notes(source_root):
    """从 source/notes.json 读取用户笔记（云端发布层用）。"""
    p = os.path.join(source_root, "notes.json")
    if os.path.isfile(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log("读取 notes.json 失败:", e)
    return {}


def fetch_etf(market, code):
    url = "https://qt.gtimg.cn/q=%s%s" % (market, code)
    txt = http_get(url)
    m = re.search(r'="([^"]*)"', txt)
    if not m:
        raise RuntimeError("gtimg 无数据: %s" % code)
    parts = m.group(1).split("~")
    price = float(parts[3])      # 当前价
    chg = float(parts[32])       # 涨跌幅 %
    return price, chg


def fetch_fund(code):
    url = "https://api.fund.eastmoney.com/f10/lsjz?fundCode=%s&pageIndex=1&pageSize=1" % code
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "http://fundf10.eastmoney.com/"}
    txt = http_get(url, headers)
    obj = json.loads(txt)
    row = obj["Data"]["LSJZList"][0]
    price = float(row["DWJZ"])    # 单位净值
    chg = float(row["JZZZL"])     # 日涨幅 %
    return price, chg


def load_fallback_funds(data_out):
    """接口失败时的兜底：读取已有 data.js 中的旧价格。"""
    fall = {}
    if os.path.isfile(data_out):
        try:
            with open(DATA_OUT, encoding="utf-8") as f:
                txt = f.read()
            for m in re.finditer(r'code:\s*"(\d+)"[\s\S]*?price:\s*([-\d.]+),\s*chg:\s*([-\d.]+)', txt):
                fall[m.group(1)] = (float(m.group(2)), float(m.group(3)))
        except Exception as e:
            log("读取兜底行情失败:", e)
    return fall


def fetch_funds(data_out):
    fall = load_fallback_funds(data_out)
    result = []
    for code, name, sector, typ, market in FUNDS:
        price = chg = None
        for attempt in range(2):
            try:
                if typ == "etf":
                    price, chg = fetch_etf(market, code)
                else:
                    price, chg = fetch_fund(code)
                break
            except Exception as e:
                log("第%d次拉取 %s 失败: %s" % (attempt + 1, code, e))
        if price is None:
            if code in fall:
                price, chg = fall[code]
                log("%s 使用兜底值" % code)
            else:
                price, chg = 0.0, 0.0
                log("%s 无数据，置 0" % code)
        result.append({
            "name": name, "code": code,
            "price": round(price, 4), "chg": round(chg, 2), "sector": sector,
        })
    return result


def js_md_lit(s):
    """把 markdown 安全地放进 JS 模板字面量（转义 \、`、${）。"""
    s = s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    return "`" + s.rstrip("\n") + "`"


# ─────────────────────────────────────────────────────────────
# 自动分析：薄弱项、周测真题、周总结
# ─────────────────────────────────────────────────────────────

# 简易模块识别：用 progress.json 的 last_module + recent_topics 推断
# 由于历史 md 已包含完整模块标识（## 知识点 N：xxx），可解析更准
_KG_MODULE_PATTERNS = [
    ("政治", r"政治|党的|中央|二十大|三中全会|时政|政府工作报告|总书记|国务院"),
    ("法律", r"法律|民法|刑法|宪法|行政法|诉讼法|法条|司法|法院|检察|正当防卫|诉讼时效"),
    ("经济", r"经济|货币|财政|通胀|通缩|GDP|央行|美联储|利率|汇率|PMI|恩格尔|基尼"),
    ("人文历史", r"历史|文学|艺术|诗词|文物|非遗|遗产|唐宋|古代|文化|名著"),
    ("科技与生活", r"科技|生活|医学|健康|生物|化学|物理|天文|地理常识|生活常识|安全"),
    ("地理国情", r"地理|国情|国土|河流|山脉|气候|行政区|省份|城市|海洋"),
    ("管理公文", r"管理|公文|行文|格式|通知|请示|报告|函|决定"),
]


def detect_kg_module(text):
    """从每日 md 中识别今日模块。"""
    # 优先看标题行 "今日模块：X"
    m = re.search(r"今日模块[：:]\s*([①②③④⑤⑥⑦\d]+)?\s*([^(\n]+)", text)
    if m:
        cat = m.group(2).strip()
        # 直接匹配模块名
        for mod, _ in _KG_MODULE_PATTERNS:
            if cat.startswith(mod):
                return mod
        # 处理 "人文历史（day 11 · 第 2 轮人文历史）" 这类
        cat_clean = re.sub(r"[（(].*$", "", cat).strip()
        for mod, _ in _KG_MODULE_PATTERNS:
            if mod in cat_clean or cat_clean in mod:
                return mod
    # 兜底：用关键词
    for mod, pat in _KG_MODULE_PATTERNS:
        if re.search(pat, text[:600]):
            return mod
    return "未识别"


_KG_POINT_RE = re.compile(r"### 知识点\s*\d+\s*[:：]\s*([^\n]+)")
_KG_EXPLAIN_RE = re.compile(r"📌 \*\*讲解\*\*[：:]?\s*([^\n]+(?:\n(?![🧠📝✅🔍#\n]).*)*)")
_KG_MNEMONIC_RE = re.compile(r"🧠 \*\*口诀\*\*[：:]?\s*([^\n]+(?:\n(?![📝✅🔍#]).*)*)")
_KG_QUES_RE = re.compile(r"📝 \*\*真题\*\*[^\n]*\n> ([^\n]+)\n> ([^\n]+)\n> ([^\n]+)\n> ([^\n]+)\n> ([^\n]+)")
_KG_ANS_RE = re.compile(r"✅ \*\*答案\*\*[：:]?\s*([^\n]+)")
_KG_SRC_RE = re.compile(r"📝 \*\*真题\*\*[（(]([^）)]+)[）)]")


def parse_kg_md(text):
    """从每日 md 抽出每个知识点的标题/讲解/口诀/真题/选项/答案/来源。"""
    points = []
    # 按 "### 知识点" 分割
    chunks = re.split(r"### 知识点\s*\d+", text)
    for chunk in chunks[1:]:
        # 标题在第一行
        title_m = re.match(r"\s*[:：]\s*([^\n]+)", chunk)
        if not title_m:
            title_m = re.match(r"\s*([^\n]+)", chunk)
        if not title_m:
            continue
        title = title_m.group(1).strip()
        # 来源
        src_m = _KG_SRC_RE.search(chunk[:300])
        src = src_m.group(1).strip() if src_m else ""
        # 答案
        ans_m = _KG_ANS_RE.search(chunk)
        ans = ans_m.group(1).strip() if ans_m else ""
        # 讲解（新法重点呈现：小测的解析只是简化版，��取原始日推送的完整讲解）
        explain_m = _KG_EXPLAIN_RE.search(chunk)
        explain = explain_m.group(1).strip() if explain_m else ""
        # 口诀
        mnemonic_m = _KG_MNEMONIC_RE.search(chunk)
        mnemonic = mnemonic_m.group(1).strip() if mnemonic_m else ""
        # 真题题干 + 选项（取 📝 块第一组）
        ques_m = _KG_QUES_RE.search(chunk)
        if ques_m:
            q = ques_m.group(1).strip()
            opts = [ques_m.group(i).strip() for i in (2, 3, 4, 5)]
        else:
            q = ""
            opts = []
        points.append({
            "title": title, "src": src, "ans": ans,
            "explain": explain, "mnemonic": mnemonic,
            "q": q, "opts": opts,
        })
    return points


_LC_HOT_RE = re.compile(r"##\s*🔥 今日热点[^\n]*\n(.+?)(?=\n##\s|\Z)", re.S)
_LC_KNOW_RE = re.compile(r"##\s*📚 今日知识[：:]\s*([^\n（(]+)[（(]([^）)\n]+)[）)]")
_LC_KNOW_BODY_RE = re.compile(r"##\s*📚 今日知识[^\n]*\n(.+?)(?=\n##\s|\Z)", re.S)
_LC_DABAI_RE = re.compile(r"📌 \*\*一句人话\*\*[：:]?\s*(.+?)(?=\n\s*🍎|\n\s*💡|\n\s*##|\Z)", re.S)
_LC_BIYU_RE = re.compile(r"🍎 \*\*举个例子\*\*[：:]?\s*\n(.+?)(?=\n\s*💡|\n\s*##|\Z)", re.S)
_LC_ZHUYI_RE = re.compile(r"💡 \*\*对我有什么用\*\*[：:]?\s*\n(.+?)(?=\n\s*##|\Z)", re.S)
_LC_TIP_RE = re.compile(r"##\s*💬 小白提示\s*\n(.+?)(?=\n---\n|\n\s*##|\Z)", re.S)


def parse_lc_md(text):
    """从每日 md 抽出热点 + 知识概念（名/层/大白话/举个例子/对我有什么用/小白提示）。"""
    hot_m = _LC_HOT_RE.search(text)
    hot_body = hot_m.group(1) if hot_m else ""
    ev_m = re.search(r"\*\*事件\*\*[：:]\s*([^\n]+)", hot_body)
    src_m = re.search(r"\*\*来源\*\*[：:]\s*([^\n]+)", hot_body)

    know_m = _LC_KNOW_RE.search(text)
    know_name = know_m.group(1).strip() if know_m else ""
    know_level = know_m.group(2).strip() if know_m else ""

    dabai_m = _LC_DABAI_RE.search(text)
    dabai = dabai_m.group(1).strip() if dabai_m else ""
    biyu_m = _LC_BIYU_RE.search(text)
    biyu = biyu_m.group(1).strip() if biyu_m else ""
    zhuyi_m = _LC_ZHUYI_RE.search(text)
    zhuyi = zhuyi_m.group(1).strip() if zhuyi_m else ""
    tip_m = _LC_TIP_RE.search(text)
    tip = tip_m.group(1).strip() if tip_m else ""

    return {
        "hot_event": ev_m.group(1).strip() if ev_m else "",
        "hot_src": src_m.group(1).strip() if src_m else "",
        "know_name": know_name,
        "know_level": know_level,
        "dabai": dabai,
        "biyu": biyu,
        "zhuyi": zhuyi,
        "tip": tip,
    }


def week_bounds(history):
    """从 history_md 列表算出最近一个完整的"自然周"（周一到周日）。返回该周内所有条目。
    若没有完整一周，则取最近 7 天。"""
    if not history:
        return [], []
    dates = sorted([h["date"] for h in history])
    last = datetime.date.fromisoformat(dates[-1])
    # 该周一是 last - (last.weekday())；weekday() 周一=0
    week_start = last - datetime.timedelta(days=last.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    this_week = [h for h in history if week_start.isoformat() <= h["date"] <= week_end.isoformat()]
    if len(this_week) >= 3:
        # 至少 3 天才算"本周"
        return this_week, []
    # 不足则取最近 7 天为窗口
    recent = history[-7:]
    return recent, []


def analyze_weekly(history, kind="kaogong"):
    """返回 weekly_summary / weekly_quiz / weekly_review（考公）
    或 weekly_summary / weekly_hot（理财）。"""
    if kind == "kaogong":
        return _analyze_kg_weekly(history)
    return _analyze_lc_weekly(history)


def _analyze_kg_weekly(history):
    this_week, _ = week_bounds(history)
    if not this_week:
        return {"summary": None, "quiz": None, "review": None, "week_range": None}
    week_start = this_week[0]["date"]
    week_end = this_week[-1]["date"]

    # 模块分布
    module_count = {}
    all_points = []
    for h in this_week:
        mod = detect_kg_module(h["md"])
        module_count[mod] = module_count.get(mod, 0) + 1
        pts = parse_kg_md(h["md"])
        for p in pts:
            p["date"] = h["date"]
            p["module"] = mod
            all_points.append(p)
    # 模块排序
    mods_sorted = sorted(module_count.items(), key=lambda x: -x[1])
    covered_mods = [m for m, _ in mods_sorted]

    # ── 薄弱项：基于覆盖度 = 出现 0 次的模块 + 出现 1 次的模块（频率最低）
    all_modules = [m for m, _ in _KG_MODULE_PATTERNS]
    weakness_modules = [m for m in all_modules if m not in module_count]
    # 出现 1 次且非最近的也算薄弱
    weak_1x = [m for m, c in module_count.items() if c == 1]
    weakness_list = weakness_modules + weak_1x
    # 限 3 个
    weakness_list = weakness_list[:3]

    # ── 周总结：模块分布 + 重点题回顾
    summary_lines = []
    summary_lines.append(f"## 📚 本周回顾（{week_start} ~ {week_end}）")
    summary_lines.append("")
    summary_lines.append(f"**本周覆盖 {len(covered_mods)} 个模块，共 {len(all_points)} 个知识点**")
    summary_lines.append("")
    summary_lines.append("**模块分布**：")
    for mod, cnt in mods_sorted:
        bar = "▇" * cnt
        summary_lines.append(f"- {mod}：{bar} {cnt} 天")
    summary_lines.append("")
    if weakness_list:
        summary_lines.append(f"**⚠️ 薄弱提醒**：本周未涉及或仅 1 次的模块 → {' / '.join(weakness_list)}，下周可重点补。")
        summary_lines.append("")
    summary_lines.append("**本周知识点索引**：")
    for i, p in enumerate(all_points, 1):
        summary_lines.append(f"{i}. [{p['date']}] **{p['title']}**（{p['module']}）")

    # ── 周测真题：精选本周所有真题（去重：同题不重复），上限 8 题
    quiz_lines = []
    quiz_lines.append(f"## 📝 本周真题回顾（{week_start} ~ {week_end}，共 {min(8, len(all_points))} 题）")
    quiz_lines.append("")
    seen_titles = set()
    selected = []
    for p in all_points:
        if p["title"] in seen_titles:
            continue
        seen_titles.add(p["title"])
        selected.append(p)
        if len(selected) >= 8:
            break
    for i, p in enumerate(selected, 1):
        quiz_lines.append(f"### 第 {i} 题 · {p['title']}")
        quiz_lines.append(f"**来源**：{p['src'] or '模拟题（原创）'}")
        if p["q"]:
            quiz_lines.append(f"**题干**：{p['q']}")
        for opt in p["opts"]:
            if opt:
                quiz_lines.append(f"- {opt}")
        quiz_lines.append(f"**答案**：{p['ans']}")
        quiz_lines.append("")

    # ── 错题本：暂无用户实际做题数据。给出"建议记录"框架
    review_lines = []
    review_lines.append(f"## 📊 本周易错提示（{week_start} ~ {week_end}）")
    review_lines.append("")
    if weakness_list:
        for m in weakness_list:
            review_lines.append(f"- **{m}** 出现频率低（{module_count.get(m, 0)} 次），属本周薄弱模块，建议周末做 5-10 道该模块真题巩固。")
    else:
        review_lines.append("- 本周模块覆盖较均衡，未检测出明显薄弱。")
    review_lines.append("")
    review_lines.append("> ⚠️ 错题本需实际做题数据填充。当你开始「周测」互动后，错题会自动收录。")

    return {
        "week_range": [week_start, week_end],
        "module_distribution": module_count,
        "weakness_modules": weakness_list,
        "summary": "\n".join(summary_lines),
        "quiz": "\n".join(quiz_lines),
        "review": "\n".join(review_lines),
    }


def _analyze_lc_weekly(history):
    this_week, _ = week_bounds(history)
    if not this_week:
        return {"summary": None, "hot": None, "week_range": None, "concepts": []}
    week_start = this_week[0]["date"]
    week_end = this_week[-1]["date"]

    # 收集本周所有概念 + 热点
    concepts = []
    hots = []
    for h in this_week:
        p = parse_lc_md(h["md"])
        if p["know_name"]:
            concepts.append({
                "date": h["date"],
                "know_name": p["know_name"],
                "know_level": p["know_level"],
                "dabai": p["dabai"],
                "biyu": p["biyu"],
                "zhuyi": p["zhuyi"],
                "tip": p["tip"],
            })
        if p["hot_event"]:
            hots.append({"date": h["date"], "event": p["hot_event"]})

    levels_seen = sorted(set(c.get("know_level", "").split(" ")[0] for c in concepts if c.get("know_level")))

    # ── 本周回顾：重点回顾新概念，附大白话/举个例子/对我有什么用/小白提示 ──
    summary_lines = []
    summary_lines.append(f"## 📈 本周回顾（{week_start} ~ {week_end}）")
    summary_lines.append("")
    summary_lines.append(f"**本周共学 {len(concepts)} 个新概念，{len(hots)} 条财经热点**")
    summary_lines.append("")
    if levels_seen:
        summary_lines.append(f"**覆盖层级**：{' → '.join(levels_seen)}")
        summary_lines.append("")
    if not concepts:
        summary_lines.append("本周暂无新概念推送，每天 12:30 自动学习一个。")
        summary_lines.append("")
    else:
        summary_lines.append("**📚 本周新概念回顾**：")
        summary_lines.append("")
        for i, c in enumerate(concepts, 1):
            summary_lines.append(f"### {i}. {c['know_name']}（{c.get('know_level', '—')}）· [{c['date']}]")
            if c.get("dabai"):
                summary_lines.append(f"- **一句人话**：{c['dabai']}")
            if c.get("biyu"):
                summary_lines.append(f"- **举个例子**：{c['biyu']}")
            if c.get("zhuyi"):
                summary_lines.append(f"- **对我有什么用**：{c['zhuyi']}")
            if c.get("tip"):
                summary_lines.append(f"- **小白提示**：{c['tip']}")
            summary_lines.append("")

    # ── 本周热点回顾：不含来源，事件本身 ──
    hot_lines = []
    hot_lines.append(f"## 🔥 本周热点回顾（{week_start} ~ {week_end}）")
    hot_lines.append("")
    if not hots:
        hot_lines.append("本周暂无热点。")
        hot_lines.append("")
    else:
        for i, h in enumerate(hots, 1):
            hot_lines.append(f"### 热点 {i} · [{h['date']}]")
            hot_lines.append(f"{h['event']}")
            hot_lines.append("")

    return {
        "week_range": [week_start, week_end],
        "levels_seen": levels_seen,
        "summary": "\n".join(summary_lines),
        "hot": "\n".join(hot_lines),
        "concepts": concepts,  # 结构化，供前端渲染可跳转按钮
    }


def build(kg_dir, lc_dir, data_out, source_root=None):
    kg_md = latest_md_path(kg_dir)
    lc_md = latest_md_path(lc_dir)
    kg_p = load_progress(kg_dir)
    lc_p = load_progress(lc_dir)

    kg_md_text = open(kg_md, encoding="utf-8").read() if kg_md else ""
    lc_md_text = open(lc_md, encoding="utf-8").read() if lc_md else ""

    dates = []
    for p in (kg_md, lc_md):
        if p:
            dates.append(os.path.basename(p)[:10])
    snap = max(dates) if dates else datetime.date.today().isoformat()

    kg_progress = {
        "day": kg_p.get("day", 1),
        "last_module": kg_p.get("last_module", 1),
        "recent_topics": kg_p.get("recent_topics", []),
        "last_date": kg_p.get("last_date", os.path.basename(kg_md)[:10] if kg_md else snap),
    }
    lc_progress = {
        "day": lc_p.get("day", 1),
        "level": lc_p.get("level", "L1"),
        "covered": lc_p.get("covered", []),
        "last_date": lc_p.get("last_date", os.path.basename(lc_md)[:10] if lc_md else snap),
    }

    # 历史 md：考公 + 理财全部 YYYY-MM-DD.md，按日期升序；用于「周末总结」Tab。
    kg_history = []
    for p in all_md_paths(kg_dir):
        d = os.path.basename(p)[:10]
        kg_history.append({"date": d, "md": open(p, encoding="utf-8").read()})
    lc_history = []
    for p in all_md_paths(lc_dir):
        d = os.path.basename(p)[:10]
        lc_history.append({"date": d, "md": open(p, encoding="utf-8").read()})

    # 自动分析：考公 + 理财的薄弱项 / 周总结 / 周测真题 / 周热点
    kg_weekly = analyze_weekly(kg_history, kind="kaogong")
    lc_weekly = analyze_weekly(lc_history, kind="licai")

    # 读取"本周知识要点.md" + 每周小测/<日期>-成绩.md（真实） + 我的错题本.md（真实）
    quiz_state = read_kaogong_quiz_state(kg_dir)
    weekly_summary_md = quiz_state.get("weekly_summary_md")
    weekly_quiz_md = quiz_state.get("weekly_quiz_md")
    quiz_history = quiz_state.get("quiz_history") or []
    quiz_stats = quiz_state.get("stats") or {"cumulative": False, "total_quizzes": 0}
    wrongbook_md = quiz_state.get("wrongbook_md")

    # 笔记：浏览器导出到 source/notes.json 即可跨设备同步
    notes = load_notes(source_root) if source_root else {}

    funds = fetch_funds(data_out)
    out = []
    out.append("/*")
    out.append(" * 工作台数据快照（由云端 build_cloud.py 自动生成，勿手工修改）")
    out.append(" * 数据唯一事实源：source/ 下每日 md + progress.json + 每周小测/<日期>.md + 我的错题本.md + notes.json")
    out.append(" */")
    out.append("window.WB_DATA = {")
    out.append('  source: "source/",')
    out.append('  snapshot_date: "%s",' % snap)
    out.append("")
    out.append("  // 考公：公考常识判断/progress.json")
    out.append("  kaogong: {")
    out.append("    progress: " + json.dumps(kg_progress, ensure_ascii=False) + ",")
    out.append("    modules: " + json.dumps(KG_MODULES, ensure_ascii=False) + ",")
    # 周末总结：直接显示 真实文件 本周知识要点.md；fallback 到 analyze_weekly 推导
    out.append("    weekly_summary: " + (js_md_lit(weekly_summary_md) if weekly_summary_md else (js_md_lit(kg_weekly["summary"]) if kg_weekly.get("summary") else "null")) + ",")
    out.append("    weekly_range: " + json.dumps(kg_weekly.get("week_range"), ensure_ascii=False) + ",")
    # 周末小测：直接读 真实文件 每周小测/<最近>-本周小测.md
    out.append("    weekly_quiz: " + (js_md_lit(weekly_quiz_md) if weekly_quiz_md else (js_md_lit(kg_weekly["quiz"]) if kg_weekly.get("quiz") else "null")) + ",")
    # 错题本 + 周测分析 + 累计统计（全部联动 真实文件 每周小测/<日期>-成绩.md）
    out.append("    quiz_history: " + json.dumps(quiz_history, ensure_ascii=False) + ",")
    out.append("    quiz_stats: " + json.dumps(quiz_stats, ensure_ascii=False) + ",")
    # 错题本 = 真实文件 我的错题本.md（跨周错题重考池）
    out.append("    wrongbook: " + (js_md_lit(wrongbook_md) if wrongbook_md else "null") + ",")
    # 兼容旧字段
    out.append("    weakness: null,")
    out.append("    weakness_modules: " + json.dumps(quiz_stats.get("top_wrong_modules", []), ensure_ascii=False) + ",")
    out.append("    today_md: " + js_md_lit(kg_md_text) + ",")
    out.append("    history_md: " + json.dumps([{"date": h["date"], "md": h["md"]} for h in kg_history], ensure_ascii=False))
    out.append("  },")
    out.append("")
    out.append("  // 理财：财经热点知识/progress.json")
    out.append("  licai: {")
    out.append("    progress: " + json.dumps(lc_progress, ensure_ascii=False) + ",")
    out.append("    levels: " + json.dumps(LC_LEVELS, ensure_ascii=False) + ",")
    out.append("    fund: " + json.dumps(funds, ensure_ascii=False) + ",")
    out.append("    weekly_summary: " + (js_md_lit(lc_weekly["summary"]) if lc_weekly.get("summary") else "null") + ",")
    out.append("    weekly_hot: " + (js_md_lit(lc_weekly["hot"]) if lc_weekly.get("hot") else "null") + ",")
    out.append("    weekly_range: " + json.dumps(lc_weekly.get("week_range"), ensure_ascii=False) + ",")
    out.append("    weekly_concepts: " + json.dumps(lc_weekly.get("concepts", []), ensure_ascii=False) + ",")
    out.append("    today_md: " + js_md_lit(lc_md_text) + ",")
    out.append("    history_md: " + json.dumps([{"date": h["date"], "md": h["md"]} for h in lc_history], ensure_ascii=False))
    out.append("  },")
    out.append("")
    out.append("  // 笔记：浏览器导出后落到 source/notes.json，云端嵌入后可跨设备同步")
    out.append("  notes: " + json.dumps(notes, ensure_ascii=False))
    out.append("};")
    content = "\n".join(out) + "\n"
    with open(data_out, "w", encoding="utf-8") as f:
        f.write(content)
    log("已写入 %s (snapshot=%s, funds=%d)" % (data_out, snap, len(funds)))
    return content


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kg-dir")
    ap.add_argument("--lc-dir")
    ap.add_argument("--out")
    ap.add_argument("--source")
    a = ap.parse_args()
    src = a.source or os.environ.get("SOURCE_DIR") or SOURCE_DIR
    # 本地优先：若项目内 02_每日推送源 存在则用本地，否则回退云端 source/
    kg_dir = a.kg_dir or os.environ.get("KG_DIR") or (LOCAL_KG_DIR if os.path.isdir(LOCAL_KG_DIR) else os.path.join(src, "kaogong"))
    lc_dir = a.lc_dir or os.environ.get("LC_DIR") or (LOCAL_LC_DIR if os.path.isdir(LOCAL_LC_DIR) else os.path.join(src, "licai"))
    data_out = a.out or os.environ.get("DATA_OUT") or (LOCAL_DATA_OUT if os.path.isdir(PKG_ROOT) else DATA_OUT)
    build(kg_dir, lc_dir, data_out, source_root=src)
