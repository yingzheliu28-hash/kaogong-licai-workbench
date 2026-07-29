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
SOURCE_DIR = os.environ.get("SOURCE_DIR") or os.path.join(HERE, "source")
DATA_OUT = os.environ.get("DATA_OUT") or os.path.join(HERE, "data.js")

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


def latest_md_path(track_dir):
    if not os.path.isdir(track_dir):
        return None
    cands = [f for f in os.listdir(track_dir) if re.match(r"^\d{4}-\d{2}-\d{2}\.md$", f)]
    if not cands:
        return None
    cands.sort()
    return os.path.join(track_dir, cands[-1])


def load_progress(track_dir):
    p = os.path.join(track_dir, "progress.json")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
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


def build(kg_dir, lc_dir, data_out):
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

    funds = fetch_funds(data_out)
    out = []
    out.append("/*")
    out.append(" * 工作台数据快照（由云端 build_cloud.py 自动生成，勿手工修改）")
    out.append(" * 数据唯一事实源：source/ 下每日 md 与 progress.json")
    out.append(" */")
    out.append("window.WB_DATA = {")
    out.append('  source: "source/",')
    out.append('  snapshot_date: "%s",' % snap)
    out.append("")
    out.append("  // 考公：公考常识判断/progress.json")
    out.append("  kaogong: {")
    out.append("    progress: " + json.dumps(kg_progress, ensure_ascii=False) + ",")
    out.append("    modules: " + json.dumps(KG_MODULES, ensure_ascii=False) + ",")
    out.append("    weakness: null,")
    out.append("    wrongbook: null,")
    out.append("    weekly_quiz: null,")
    out.append("    today_md: " + js_md_lit(kg_md_text))
    out.append("  },")
    out.append("")
    out.append("  // 理财：财经热点知识/progress.json")
    out.append("  licai: {")
    out.append("    progress: " + json.dumps(lc_progress, ensure_ascii=False) + ",")
    out.append("    levels: " + json.dumps(LC_LEVELS, ensure_ascii=False) + ",")
    out.append("    fund: " + json.dumps(funds, ensure_ascii=False) + ",")
    out.append("    today_md: " + js_md_lit(lc_md_text))
    out.append("  }")
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
    kg_dir = a.kg_dir or os.environ.get("KG_DIR") or os.path.join(src, "kaogong")
    lc_dir = a.lc_dir or os.environ.get("LC_DIR") or os.path.join(src, "licai")
    data_out = a.out or os.environ.get("DATA_OUT") or DATA_OUT
    build(kg_dir, lc_dir, data_out)
