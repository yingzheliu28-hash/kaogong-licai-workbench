/* ══════════════════════════════════════
   路遥求索 · 个人工作台  SPA 渲染引擎
   ══════════════════════════════════════ */
(function () {
  "use strict";

  /* ── 数据校验 ── */
  var D = window.WB_DATA;
  if (!D) { document.getElementById("main").innerHTML = '<p style="padding:48px;color:#8A8780;text-align:center;">数据未加载</p>'; return; }

  /* ── 工具函数 ── */
  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function between(s, a, b) {
    var i = s.indexOf(a); if (i < 0) return "";
    var from = i + a.length;
    if (!b) return s.slice(from);
    var j = s.indexOf(b, from); return j < 0 ? s.slice(from) : s.slice(from, j);
  }
  function clean(t) { return (t || "").replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " ").trim(); }

  // 轻量级 markdown → HTML（仅支持周总结/周测/薄弱项里用到的子集）
  function mdToHtml(md) {
    if (!md || typeof md !== "string") return "";
    var lines = md.split("\n");
    var out = [];
    var inList = false;
    var inOl = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      // 标题
      var hm = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (hm) {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        var lvl = hm[1].length;
        out.push("<h" + lvl + " style=\"margin:var(--sp-3) 0 var(--sp-2);font-weight:600;color:var(--kg-accent);\">" + inlineMd(hm[2]) + "</h" + lvl + ">");
        continue;
      }
      // 无序列表
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) { out.push("<ul style=\"margin:var(--sp-2) 0;padding-left:1.4em;\">"); inList = true; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push("<li>" + inlineMd(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      // 有序列表
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inOl) { out.push("<ol style=\"margin:var(--sp-2) 0;padding-left:1.6em;\">"); inOl = true; }
        if (inList) { out.push("</ul>"); inList = false; }
        out.push("<li>" + inlineMd(trimmed.replace(/^\d+\.\s+/, "")) + "</li>");
        continue;
      }
      // 空行
      if (trimmed === "") {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        continue;
      }
      // 普通段落
      if (inList) { out.push("</ul>"); inList = false; }
      if (inOl) { out.push("</ol>"); inOl = false; }
      out.push("<p style=\"margin:var(--sp-2) 0;line-height:1.65;\">" + inlineMd(trimmed) + "</p>");
    }
    if (inList) out.push("</ul>");
    if (inOl) out.push("</ol>");
    return out.join("");
  }
  function inlineMd(s) {
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/`([^`]+)`/g, "<code style=\"background:var(--kg-bg);padding:0 4px;border-radius:3px;font-family:var(--mono);font-size:0.92em;\">$1</code>");
    return s;
  }
  function bullet(s, key) {
    var re = new RegExp("\\*\\*[^\\n]*?" + key + "[^\\n]*?\\*\\*：([^\\n]*)");
    var m = s.match(re); return m ? m[1].trim() : "";
  }

  /* ── 每日标语池 ── */
  var MOTTOES = [
    "路遥知马力，日久见人心。每天的一小步，都是未来的一大步。",
    "不积跬步，无以至千里；不积小流，无以成江海。",
    "星光不问赶路人，时光不负有心人。今天也请继续加油。",
    "种一棵树最好的时间是十年前，其次是现在。",
    "学习这件事，不在乎有没有人教你，最重要的是在于你自己有没有觉悟和恒心。",
    "你的坚持，终将美好。"
  ];

  /* ── 解析 md 快照 ── */
  // 从 md 头部识别今日模块（"今日模块：①政治 · xxx"），去掉圆圈数字与「·xxx」副标题与「。xxx」补充
  function detectKgModuleFromMd(md) {
    if (!md) return "—";
    var m = md.match(/今日模块[：:]\s*(?:[①②③④⑤⑥⑦]\s*)?([^（(\n·。]+)/);
    if (m) return m[1].trim();
    // 兜底：老格式 md 没有"今日模块："，用头部 800 字做关键词扫描
    var head = md.slice(0, 800);
    var patterns = [
      ["法律",        /法律|民法|刑法|宪法|行政法|诉讼法|法条|司法|法院|检察|正当防卫|诉讼时效/],
      ["政治",        /政治|党的|中央|二十大|三中全会|时政|政府工作报告|总书记|国务院/],
      ["经济",        /经济|货币|财政|通胀|通缩|GDP|央行|美联储|利率|汇率|PMI|恩格尔|基尼/],
      ["人文历史",    /历史|文学|艺术|诗词|文物|非遗|遗产|唐宋|古代|文化|名著/],
      ["科技与生活",  /科技|生活|医学|健康|生物|化学|物理|天文|地理常识|生活常识|安全/],
      ["地理国情",    /地理|国情|国土|河流|山脉|气候|行政区|省份|城市|海洋/],
      ["管理公文",    /管理|公文|行文|格式|通知|请示|报告|函|决定/]
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i][1].test(head)) return patterns[i][0];
    }
    return "—";
  }
  function parseKaogong(md, dayNum) {
    // 模块名：优先从 md 头部"今日模块："取；其次 fallback 到 progress.json（兼容老格式 md）
    var moduleName = detectKgModuleFromMd(md);
    if (moduleName === "—" && D.kaogong.modules && D.kaogong.modules[D.kaogong.progress.last_module]) {
      moduleName = D.kaogong.modules[D.kaogong.progress.last_module];
    }
    var day = dayNum || D.kaogong.progress.day || 1;

    // 拆分知识点：兼容 ## 与 ###（新每日推送用三级标题 ### 知识点 N：）
    var segs = md.split(/\n[#]{2,3} 知识点 \d+：/).slice(1);

    var points = segs.map(function (seg) {
      // 归一化：兼容 LLM 偶发漏写加粗 ** 的格式（📌 讲解：→ 📌 **讲解**：等），避免讲解/口诀解析丢失
      seg = seg
        .replace(/📌 讲解：/g, "📌 **讲解**：")
        .replace(/🧠 口诀：/g, "🧠 **口诀**：")
        .replace(/✅ 答案：/g, "✅ **答案**：")
        .replace(/🔍 解析：/g, "🔍 **解析**：")
        .replace(/📝 真题：/g, "📝 **真题**：");
      var title = (seg.match(/^([^\n]+)/) || [, "知识点"])[1].trim();

      // 讲解：新格式 📌 **讲解**：…🧠；旧格式 📌 知识点讲解：** …**🧠
      var jiangjie = clean(
        between(seg, "📌 **讲解**：", "🧠 **口诀**") ||
        between(seg, "📌 知识点讲解：**", "**🧠 记忆口诀：**")
      );

      // 口诀：新 🧠 **口诀**：…📝；旧 🧠 记忆口诀：** …**📝
      var koujue = clean(
        between(seg, "🧠 **口诀**：", "📝") ||
        between(seg, "🧠 记忆口诀：**", "**📝 对应原题：**")
      );

      // 原题段：从 📝 到 ✅ **答案**：；旧 📝 对应原题：** 到 **✅ 答案：**
      var yuan = between(seg, "📝", "✅ **答案**：") ||
                 between(seg, "📝 对应原题：**", "**✅ 答案：**");
      var qLines = (yuan || "").split("\n").map(function (l) {
        return l.replace(/^>\s?/, "").trim();
      }).filter(function (l) { return l && !/^[#📝✅🔍💡📌🧠🍎]/.test(l); });

      // 答案：新 ✅ **答案**：；旧 ✅ 答案：**
      var answer = clean(
        between(seg, "✅ **答案**：", "🔍") ||
        between(seg, "✅ 答案：**", "**🔍 解析：**")
      );

      // 解析：新 🔍 **解析**：；旧 🔍 解析：**
      var jiexi = clean(
        between(seg, "🔍 **解析**：", null) ||
        between(seg, "🔍 解析：**", null)
      );

      return { title: title, jiangjie: jiangjie, koujue: koujue, qLines: qLines, answer: answer, jiexi: jiexi };
    });

    return { moduleName: moduleName, day: day, points: points };
  }

  function parseLicai(md) {
    // ── 热点：兼容两种格式 ──
    // 格式A（旧）：**事件标题（来源：来源名）**
    // 格式B（新/每日推送）：**事件**：...\n**来源**：...\n**影响**：\n①...
    var hotM = md.match(/## 🔥 今日热点[^\n]*\n\*\*([^（]+)（来源：([^）]+)）\*\*/);
    var hotTitle, hotSrc, fa, why, mean;
    if (hotM) {
      hotTitle = hotM[1].trim();
      hotSrc = hotM[2].trim();
      fa = bullet(md, "发生了什么") || bullet(md, "事件");
      why = bullet(md, "为什么影响股市") || bullet(md, "为什么影响净值") || "";
      mean = bullet(md, "意味着什么") || "";
    } else {
      // 格式B：逐字段提取
      hotTitle = clean(between(md, "**事件**：", "\n**来源**")) || "—";
      hotSrc = clean(between(md, "**来源**：", "\n**影响**")) ||
                clean(between(md, "**来源**：", "\n")) || "";
      var impactRaw = between(md, "**影响**：", "\n## ") || between(md, "**影响**：", null);
      var lines = impactRaw.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);
      fa = lines.length > 0 ? clean(lines[0].replace(/^[①②③\d.\s]+/, "")) : "";
      why = lines.length > 1 ? clean(lines[1].replace(/^[①②③\d.\s]+/, "")) : "";
      mean = lines.length > 2 ? clean(lines[2].replace(/^[①②③\d.\s]+/, "")) : "";
      if (!fa) fa = impactRaw.replace(/\n/g," ").substring(0, 200);
    }

    // ── 知识：兼容两种格式 ──
    var knowM = md.match(/## 📚 今日知识[：:]?\s*([^\n（]+)[（(]([^\n)]+)[）)]/);
    var knowName = knowM ? knowM[1].trim() : "—";
    var knowLevelRaw = knowM ? knowM[2].trim() : "";
    var lvlMatch = knowLevelRaw.match(/(?:第\s*)?(\d+)\s*级?\s*[·\.]\s*(.+)/);
    var knowLevel = lvlMatch ? ("第 " + lvlMatch[1] + " 级 · " + lvlMatch[2]) : knowLevelRaw;

    var dabai   = bullet(md, "一句人话")  || bullet(md, "大白话")  || "";
    var biyu    = bullet(md, "举个例子")  || bullet(md, "生活化比喻") || "";
    var zhuyi   = bullet(md, "对我有什么用") || bullet(md, "注意什么")  || "";
    var tipM    = md.match(/## 💬 小白提示\s*\n([\s\S]+)$/)||
                  md.match(/## 💡 小白提示\s*\n([\s\S]+)$/);
    var tip     = tipM ? tipM[1].replace(/\*\*/g, "").trim() : "";

return {
    hotTitle: hotTitle,
    hotSrc: hotSrc,
    fa: fa,
    why: why,
    mean: mean,
    knowName: knowName,
    knowLevel: knowLevel,
    dabai: dabai,
    biyu: biyu,
    zhuyi: zhuyi,
    tip: tip
  };
}

  /* ── 历史 md 解析（周末总结 Tab 用） ── */
  function parseHistory(historyMd, parserFn) {
    if (!Array.isArray(historyMd)) return [];
    return historyMd.map(function (h, i) {
      var dayNum = i + 1;
      var parsed = parserFn(h.md || "", dayNum);
      return { date: h.date, day: dayNum, parsed: parsed };
    });
  }

  var kgHistory = parseHistory(D.kaogong.history_md, parseKaogong);
  var lcHistory = parseHistory(D.licai.history_md, parseLicai);

  // 考公历史按日期索引（O(1) 查找），同时建检索用的扁平化搜索池
  var kgHistoryByDate = {};
  var kgSearchPool = [];  // [{date, day, moduleName, point, idx}]
  kgHistory.forEach(function (h) {
    kgHistoryByDate[h.date] = h;
    (h.parsed.points || []).forEach(function (p, idx) {
      kgSearchPool.push({
        date: h.date,
        day: h.day,
        moduleName: h.parsed.moduleName,
        idx: idx,
        point: p
      });
    });
  });

  // 理财历史按日期索引 + 概念名 → 日期映射（用于"已覆盖概念"按钮跳转）
  var lcHistoryByDate = {};
  var lcConceptToDate = {};  // 概念名（去括号）→ 最早出现的日期
  lcHistory.forEach(function (h) {
    lcHistoryByDate[h.date] = h;
    var name = (h.parsed.knowName || "").trim();
    if (name && name !== "—" && !lcConceptToDate[name]) {
      lcConceptToDate[name] = h.date;
    }
  });
  // 根据 covered 概念标签（如 "做空(卖空/融券)"）找对应日期
  function lcConceptDate(label) {
    var base = String(label || "").split("(")[0].split("（")[0].trim();
    if (base && lcConceptToDate[base]) return lcConceptToDate[base];
    // 兜底：包含匹配
    var keys = Object.keys(lcConceptToDate);
    for (var i = 0; i < keys.length; i++) {
      if (base && keys[i].indexOf(base) >= 0) return lcConceptToDate[keys[i]];
      if (base && base.indexOf(keys[i]) >= 0) return lcConceptToDate[keys[i]];
    }
    return "";
  }

  /* ── 笔记存储（localStorage 单设备；云端同步靠导出 notes.json 落 source/） ── */
  var NOTES_LS_KEY = "wb_notes_v1";
  function loadAllNotes() {
    try {
      var raw = localStorage.getItem(NOTES_LS_KEY);
      var stored = raw ? JSON.parse(raw) : {};
      // 与 data.js 内嵌的 notes 合并（云端/历史）作为兜底
      var fromCloud = D.notes || {};
      var merged = {};
      Object.keys(stored).forEach(function (k) { merged[k] = stored[k]; });
      Object.keys(fromCloud).forEach(function (k) {
        if (!merged[k]) merged[k] = fromCloud[k];
      });
      return merged;
    } catch (e) { return D.notes || {}; }
  }
  function saveAllNotes(map) {
    try { localStorage.setItem(NOTES_LS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function noteKey(module, date, idx) {
    return module + "::" + date + "::" + idx;
  }
  var notesAll = loadAllNotes();

  /* ═════════════════════════════════
     知识考点 Tab：日期导航 / 日历 / 检索 辅助
     ═════════════════════════════════ */
  var WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  function weekdayLabel(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    return WEEKDAY_LABELS[(d.getDay() + 6) % 7];
  }
  // 某日期所在自然周的 Mon..Sun 日期数组（YYYY-MM-DD 字符串）
  function weekDatesOf(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var offset = (mon.getDay() + 6) % 7;  // Mon=0
    mon.setDate(mon.getDate() - offset);
    var arr = [];
    for (var i = 0; i < 7; i++) {
      var dd = new Date(mon);
      dd.setDate(mon.getDate() + i);
      arr.push(dd.getFullYear() + "-" +
        String(dd.getMonth() + 1).padStart(2, "0") + "-" +
        String(dd.getDate()).padStart(2, "0"));
    }
    return arr;
  }
  // 月历网格（仅返回当月日期；Mon..Sun 7 列；行高 aspect 1:1 由 CSS 控制）
  function monthGrid(yearMonth) {
    var parts = yearMonth.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var first = new Date(y, m - 1, 1);
    var last = new Date(y, m, 0);
    var startOffset = (first.getDay() + 6) % 7;  // Mon=0
    var rows = [];
    var row = [];
    for (var i = 0; i < startOffset; i++) row.push(null);
    for (var d = 1; d <= last.getDate(); d++) {
      row.push(d);
      if (row.length === 7) { rows.push(row); row = []; }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return { year: y, month: m, rows: rows };
  }
  function dateStrOf(y, m, d) {
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }
  function shiftMonth(yearMonth, delta) {
    var parts = yearMonth.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) + delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  // 跨日关键词检索：在所有历史日的所有知识点里搜；命中片段对关键词做高亮
  function searchKgPoints(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    var hits = [];
    for (var i = 0; i < kgSearchPool.length; i++) {
      var item = kgSearchPool[i];
      var p = item.point;
      var hay = [
        p.title || "",
        p.jiangjie || "",
        p.koujue || "",
        (p.qLines || []).join(" "),
        p.answer || "",
        p.jiexi || ""
      ].join(" ").toLowerCase();
      if (hay.indexOf(q) >= 0) {
        // 合集里取片段 + 高亮关键词（使用安全的 esc + <b> 拼接，不含原始 innerHTML）
        var src = (p.jiangjie || p.koujue || p.jiexi || (p.qLines && p.qLines.join(" ")) || "");
        var lowerSrc = src.toLowerCase();
        var pos = lowerSrc.indexOf(q);
        var snippet;
        if (pos >= 0) {
          var s = Math.max(0, pos - 16);
          var e = Math.min(src.length, pos + q.length + 48);
          snippet = (s > 0 ? "…" : "")
            + esc(src.slice(s, pos))
            + '<b class="kg-highlight">' + esc(src.slice(pos, pos + q.length)) + '</b>'
            + esc(src.slice(pos + q.length, e))
            + (e < src.length ? "…" : "");
        } else {
          snippet = esc((p.jiangjie || p.koujue || "").slice(0, 60));
        }
        // 标题也高亮
        var titleLower = (p.title || "").toLowerCase();
        var ti = titleLower.indexOf(q);
        var titleHighlighted;
        if (ti >= 0) {
          titleHighlighted = esc(p.title.slice(0, ti))
            + '<b class="kg-highlight">' + esc(p.title.slice(ti, ti + q.length)) + '</b>'
            + esc(p.title.slice(ti + q.length));
        } else {
          titleHighlighted = esc(p.title || "未命名知识点");
        }
        hits.push({
          date: item.date,
          day: item.day,
          moduleName: item.moduleName,
          idx: item.idx,
          titleHtml: titleHighlighted,
          snippetHtml: snippet
        });
      }
    }
    return hits;
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  /* ── 笔记按钮 HTML（在每个知识点卡片底部渲染） ── */
  function noteBtnHtml(module, date, idx) {
    var k = noteKey(module, date, idx);
    var has = !!(notesAll[k] && notesAll[k].trim());
    var label = has ? "✏️ 修改笔记" : "📝 笔记";
    return '<button class="note-btn ' + (has ? "has-note" : "") + '" data-note-key="' + k + '">' + label + '</button>';
  }
  function noteDisplayHtml(module, date, idx) {
    var k = noteKey(module, date, idx);
    var t = notesAll[k] || "";
    if (!t.trim()) return "";
    return '<div class="note-display">' + esc(t) + '</div>';
  }
  /* 渲染笔记编辑器（点击按钮后展开） */
  function noteEditorHtml(module, date, idx) {
    var k = noteKey(module, date, idx);
    var t = notesAll[k] || "";
    return '<div class="note-editor" data-note-editor="' + k + '">' +
      '<textarea placeholder="写下你的理解感悟…">' + esc(t) + '</textarea>' +
      '<div class="note-editor-actions">' +
        '<button class="note-cancel" data-note-cancel="' + k + '">取消</button>' +
        '<button class="note-save" data-note-save="' + k + '">保存</button>' +
      '</div>' +
    '</div>';
  }

  /* 导出全部笔记为 JSON（用户下载后放进 source/notes.json 即可跨设备同步） */
  function exportNotesJson() {
    var map = {};
    Object.keys(notesAll).forEach(function (k) {
      if (notesAll[k] && notesAll[k].trim()) map[k] = notesAll[k];
    });
    var json = JSON.stringify(map, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "notes.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
    toast("已下载 notes.json，把它放进 source/ 目录即可云端同步");
  }

  var kg = parseKaogong(D.kaogong.today_md);
  var cj = parseLicai(D.licai.today_md);

  /* ── 全局状态 ── */
  var state = {
    page: "home",          // home | kaogong | licai
    kgTab: "kg-knowledge", // 考公子 tab
    lcTab: "lc-hot",       // 理财子 tab
    // 知识考点 Tab 的本地视图状态
    kgSelectedDate: D.snapshot_date,   // 当前展示的日期（YYYY-MM-DD）
    kgCalendarExpanded: false,          // 日历是否展开
    kgCalendarMonth: null,              // 日历展示月份（YYYY-MM）
    kgSearchQuery: "",                  // 检索词
    // 理财「今日知识」Tab 的本地视图状态
    lcSelectedDate: D.snapshot_date,   // 当前展示的理财日期（YYYY-MM-DD）
    lcCalendarExpanded: false,          // 日历是否展开
    lcCalendarMonth: null,              // 日历展示月份（YYYY-MM）
    // 每周小测 Tab 的本地视图状态
    examDate: null,     // 当前小测日期（YYYY-MM-DD），null=最新一期
    examMode: "redo"    // redo（做题判分）| review（仅回顾）
  };

  /* ── 日期 & 周次 ── */
  var now = new Date();
  var h = now.getHours();
  var greet = h < 11 ? "早安" : h < 14 ? "午安" : h < 18 ? "下午好" : "晚安";
  var weekNum = Math.ceil(Math.max(D.kaogong.progress.day, D.licai.progress.day) / 7);
  var totalDays = Math.max(D.kaogong.progress.day, D.licai.progress.day);
  var dateStr = now.getFullYear() + "-" +
    String(now.getMonth()+1).padStart(2,"0") + "-" +
    String(now.getDate()).padStart(2,"0");

  /* ── 随机标语 ── */
  function pickMotto() { return MOTTOES[Math.floor(Math.random() * MOTTOES.length)]; }

  /* ═════════════════════════════════
     渲染：首页总览
     ═════════════════════════════════ */
  function renderHome() {
    document.getElementById("home-greet").textContent = greet + "，欢迎回来。";
    document.getElementById("home-date").textContent =
      dateStr + " · 第 " + weekNum + " 周 · 连续学习 " + totalDays + " 天";
    var dash = document.getElementById("home-dashboard");

    // 快捷入口（放在进度总览上方）
    dash.innerHTML =
      '<div style="grid-column:1/-1;margin-bottom:var(--sp-3);" class="fade">' +
        '<div class="card" style="display:flex;gap:var(--sp-4);flex-wrap:wrap;justify-content:center;padding:var(--sp-4) var(--sp-5);">' +
          '<button class="nav-item" style="background:var(--kg-bg);color:var(--kg-accent);border:1px solid var(--kg-border);padding:var(--sp-3) var(--sp-5);border-radius:var(--radius);" onclick="WB.navigate(\'kaogong\')">' +
            '<span class="nav-emoji">📚</span><span class="nav-label">进入考公 →</span></button>' +
          '<button class="nav-item" style="background:var(--lc-bg);color:var(--lc-accent);border:1px solid var(--lc-border);padding:var(--sp-3) var(--sp-5);border-radius:var(--radius);" onclick="WB.navigate(\'licai\')">' +
            '<span class="nav-emoji">💰</span><span class="nav-label">进入理财 →</span></button>' +
        '</div>' +
      '</div>' +
      // 进度总览卡片
      '<div class="dash-card fade">' +
        '<div class="dash-icon">📚</div>' +
        '<div class="dash-value">' + D.kaogong.progress.day + '</div>' +
        '<div class="dash-label">考公天数</div>' +
        '<div class="dash-sub">' + esc(kg.moduleName) + '</div>' +
      '</div>' +
      '<div class="dash-card fade">' +
        '<div class="dash-icon">💰</div>' +
        '<div class="dash-value">' + D.licai.progress.day + '</div>' +
        '<div class="dash-label">理财天数</div>' +
        '<div class="dash-sub">' + esc(D.licai.progress.level) + '</div>' +
      '</div>' +
      '<div class="dash-card fade">' +
        '<div class="dash-icon">🔥</div>' +
        '<div class="dash-value">' + totalDays + '</div>' +
        '<div class="dash-label">连续打卡</div>' +
        '<div class="dash-sub">第 ' + weekNum + ' 周</div>' +
      '</div>' +
      '<div class="dash-card fade">' +
        '<div class="dash-icon">📖</div>' +
        '<div class="dash-value">' + kg.points.length + '</div>' +
        '<div class="dash-label">今日考点</div>' +
        '<div class="dash-sub">' + (D.kaogong.modules[D.kaogong.progress.last_module] || "—") + '</div>' +
      '</div>';
  }

  /* ═════════════════════════════════
     渲染：考公板块
     ═════════════════════════════════ */

  /* -- 页头 -- */
  function renderKgHeader() {
    document.getElementById("kg-motto").innerHTML = '<div class="motto-wrap">' + esc(pickMotto()) + '</div>';
    document.getElementById("kg-stats").innerHTML =
      '<div class="stat-chip">📅 ' + dateStr + '</div>' +
      '<div class="stat-chip">📆 第 ' + weekNum + ' 周</div>' +
      '<div class="stat-chip">🔥 连续 ' + D.kaogong.progress.day + ' 天</div>' +
      '<div class="stat-chip">📍 ' + esc(kg.moduleName) + '</div>';
  }

  /* -- Tab: 知识考点（日期导航 + 检索 + 当日/历史日推送） -- */
  // 1. 顶部日期卡（默认 = 本周 7 个日期按钮；展开 = 当月日历）
  function renderKgDateNav() {
    if (state.kgCalendarExpanded) return renderKgCalendarCard();
    return renderKgWeekStripCard();
  }

  function renderKgWeekStripCard() {
    var weekDates = weekDatesOf(state.kgSelectedDate);
    var todayStr = D.snapshot_date;
    var dotsHtml = "";
    weekDates.forEach(function (d) {
      var entry = kgHistoryByDate[d];
      var dnum = d.slice(8, 10);
      var isSelected = d === state.kgSelectedDate;
      var isToday = d === todayStr;
      var cls = "kg-date-btn" + (entry ? " has" : " no") +
        (isSelected ? " selected" : "") + (isToday ? " today" : "");
      var onclick = entry ? 'onclick="WB.selectKgDate(\'' + d + '\')"' : '';
      dotsHtml += '<button type="button" class="' + cls + '" ' + onclick + '>' +
        '<div class="kg-date-num">' + dnum + '</div>' +
        '<div class="kg-date-day">' + weekdayLabel(d) + '</div>' +
      '</button>';
    });
    return '<div class="kg-card fade">' +
      '<div class="kg-card-head">' +
        '<h3 class="kg-card-title">📅 本周速览</h3>' +
        '<button type="button" class="kg-expand-btn" onclick="WB.toggleKgCalendar()">▼ 展开</button>' +
      '</div>' +
      '<div class="kg-week-strip">' + dotsHtml + '</div>' +
      '<div class="kg-week-tip">点击日期按钮可跳转查看当天推送；不点击默认显示当天内容</div>' +
    '</div>';
  }

  function renderKgCalendarCard() {
    var monthKey = state.kgCalendarMonth || state.kgSelectedDate.slice(0, 7);
    state.kgCalendarMonth = monthKey;
    var grid = monthGrid(monthKey);
    var headerDays = ["一", "二", "三", "四", "五", "六", "日"];
    var cellsHtml = "";
    grid.rows.forEach(function (row) {
      row.forEach(function (d) {
        if (d === null) {
          cellsHtml += '<div class="kg-cal-day empty"></div>';
        } else {
          var dateStr = dateStrOf(grid.year, grid.month, d);
          var entry = kgHistoryByDate[dateStr];
          var cls = "kg-cal-day" + (entry ? " has" : " no") +
            (dateStr === state.kgSelectedDate ? " selected" : "") +
            (dateStr === D.snapshot_date ? " today" : "");
          var onclick = entry ? 'onclick="WB.selectKgDate(\'' + dateStr + '\')"' : '';
          cellsHtml += '<button type="button" class="' + cls + '" ' + onclick + '>' + d + '</button>';
        }
      });
    });
    var weekdayHeader = headerDays.map(function (h) {
      return '<div class="kg-cal-weekday">' + h + '</div>';
    }).join("");
    return '<div class="kg-card fade">' +
      '<div class="kg-card-head">' +
        '<h3 class="kg-card-title">📅 ' + grid.year + ' 年 ' + grid.month + ' 月</h3>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="kg-expand-btn" onclick="WB.shiftKgMonth(-1)">◀ 上月</button>' +
          '<button type="button" class="kg-expand-btn" onclick="WB.toggleKgCalendar()">▲ 收起</button>' +
          '<button type="button" class="kg-expand-btn" onclick="WB.shiftKgMonth(1)">下月 ▶</button>' +
        '</div>' +
      '</div>' +
      '<div class="kg-cal-weekdays">' + weekdayHeader + '</div>' +
      '<div class="kg-cal-grid">' + cellsHtml + '</div>' +
      '<div class="kg-week-tip">只显示本月日期；带边框的日期可点击进入当天推送；灰色日期无推送</div>' +
    '</div>';
  }

  // 2. 关键词检索框（与下方内容区解耦：输入只在内容区重渲染，搜索框保持焦点）
  function renderKgSearchBox() {
    return '<div class="kg-card kg-search-card fade">' +
      '<div class="kg-search-wrap">' +
        '<span class="kg-search-icon">🔍</span>' +
        '<input id="kgSearchInput" type="text" placeholder="输入关键词（如「口诀」「民法典」「秦岭」），跨日检索所有知识点" value="' + esc(state.kgSearchQuery) + '" autocomplete="off" />' +
      '</div>' +
    '</div>';
  }

  // 3. 内容区：当有检索词时显示检索结果；否则显示当前选中日的考点
  function renderKgContentArea() {
    if (state.kgSearchQuery.trim()) return renderKgSearchResults(state.kgSearchQuery);
    return renderKgDayPoints(state.kgSelectedDate);
  }

  function renderKgDayPoints(dateStr) {
    var entry = kgHistoryByDate[dateStr];
    if (!entry) {
      return '<div class="kg-empty fade">' +
        '<div class="kg-empty-emoji">📭</div>' +
        '<p>' + esc(dateStr) + ' 当天还没有推送内容。<br/>选个有边框的日期看看，或用上方检索找知识点。</p>' +
      '</div>';
    }
    var parsed = entry.parsed;
    var kpHtml = "";
    parsed.points.forEach(function (p, idx) {
      var stem = p.qLines[0] || "";
      var opts = p.qLines.slice(1).map(function (o) {
        return '<div class="opt">' + esc(o) + "</div>";
      }).join("");
      kpHtml +=
        '<div class="kp-card fade">' +
          '<div class="kp-title"><span class="kp-num">' + (idx + 1) + '</span>' + esc(p.title) + '</div>' +
          (p.jiangjie ?
            '<div class="kp-explain">📌 ' + esc(p.jiangjie) + '</div>' : '') +
          (p.koujue ?
            '<div class="kp-mnemonic"><span class="mn-label">🧠 口诀</span>' + esc(p.koujue) + '</div>' : '') +
          '<details><summary>展开原题 / 解析</summary>' +
            '<div class="kp-q"><div class="stem">' + esc(stem) + '</div>' + opts + '</div>' +
            (p.answer ? '<div class="kp-ans">答案：<span class="ok">' + esc(p.answer) + '</span></div>' : '') +
            (p.jiexi ? '<div class="kp-exp">💡 ' + esc(p.jiexi) + '</div>' : '') +
          '</details>' +
          noteBtnHtml("kaogong", dateStr, idx) +
          noteDisplayHtml("kaogong", dateStr, idx) +
        '</div>';
    });
    var dateLabel = dateStr === D.snapshot_date
      ? '<span class="kg-date-tag today-tag">📌 今日</span>'
      : '<span class="kg-date-tag">' + weekdayLabel(dateStr) + '</span>';
    return '<div class="kg-day-head">' +
        '<span class="kg-day-title">📖 知识考点</span>' +
        '<span class="kg-day-day">DAY ' + entry.day + '</span>' +
        '<span class="kg-day-source">来自「' + dateStr + '.md」</span>' +
        '<span class="kg-day-module">' + esc(parsed.moduleName) + '</span>' +
        dateLabel +
      '</div>' +
      kpHtml;
  }

  function renderKgSearchResults(query) {
    var hits = searchKgPoints(query);
    if (hits.length === 0) {
      return '<div class="kg-empty fade">' +
        '<div class="kg-empty-emoji">🔍</div>' +
        '<p>未找到包含「<b>' + esc(query) + '</b>」的知识点。<br/>试试换个关键词，或清除检索回到当天推送。</p>' +
      '</div>';
    }
    var items = hits.map(function (h) {
      return '<div class="kg-result-item" onclick="WB.openKgResult(\'' + h.date + '\', ' + h.idx + ')">' +
        '<div class="kg-result-meta">' +
          '<span class="kg-result-date">' + h.date + '</span>' +
          '<span class="kg-result-day">DAY ' + h.day + '</span>' +
          '<span class="kg-result-module">' + esc(h.moduleName) + '</span>' +
          '<span class="kg-result-num">第 ' + (h.idx + 1) + ' 题</span>' +
        '</div>' +
        '<div class="kg-result-title">' + h.titleHtml + '</div>' +
        '<div class="kg-result-snippet">' + h.snippetHtml + '</div>' +
      '</div>';
    }).join("");
    return '<div class="kg-card fade kg-results-card">' +
      '<div class="kg-result-header">🔍 检索「<b>' + esc(query) + '</b>」共 ' + hits.length + ' 条结果 · 点击进入该日推送</div>' +
      items +
    '</div>';
  }

  function renderKgKnowledge() {
    document.getElementById("kg-content").innerHTML =
      renderKgDateNav() +
      renderKgSearchBox() +
      '<div id="kgContentArea">' + renderKgContentArea() + '</div>';
  }
  // 仅重渲染内容区（输入检索词时使用，避免搜索框失焦）
  function refreshKgContentArea() {
    var area = document.getElementById("kgContentArea");
    if (area) area.innerHTML = renderKgContentArea();
  }

  /* -- Tab: 薄弱项（已合并到周测分析 Tab；保留以避免 tab 找不到 renderer） -- */
  function renderKgWeak() {
    document.getElementById("kg-content").innerHTML = "";
  }

  /* ── 错题原因选择（块状按钮 + 自定义输入 + localStorage 同步） ── */
  var REASON_PRESETS = [
    "知识点未掌握",
    "知识模糊/记忆不准",
    "粗心大意",
    "读题不准"
  ];
  var REASON_LS_KEY = "kg_wrong_reason_v1";
  function loadWrongReasons() {
    try { return JSON.parse(localStorage.getItem(REASON_LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveWrongReasons(map) {
    try { localStorage.setItem(REASON_LS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function wrongReasonKey(dateStr, qIdx) { return dateStr + "::" + qIdx; }
  function getUserWrongReason(dateStr, qIdx) {
    var m = loadWrongReasons();
    return m[wrongReasonKey(dateStr, qIdx)] || "";
  }
  // 显示用：优先用户自定原因 → 退回 md 的 reason → "未标注"
  /* ── 每周小测：作答记录 + 本地错题（localStorage） ── */
  var EXAM_LS_KEY = "kg_exam_answers_v1";
  var LOCAL_WRONG_LS_KEY = "kg_local_wrong_v1";
  // 云函数写回地址（部署 Vercel 后填入真实地址）；留空则「提交成绩」按钮降级为「导出」提示
  var EXAM_SUBMIT_URL = "https://kaogong-exam-api.vercel.app/api/submit";
  var EXAM_AUTH_KEY = "wb-exam-2026";
  function loadExamAnswers() {
    try { return JSON.parse(localStorage.getItem(EXAM_LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveExamAnswers(map) {
    try { localStorage.setItem(EXAM_LS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function loadLocalWrong() {
    try { return JSON.parse(localStorage.getItem(LOCAL_WRONG_LS_KEY) || "[]") || []; }
    catch (e) { return []; }
  }
  function saveLocalWrong(list) {
    try { localStorage.setItem(LOCAL_WRONG_LS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function getDisplayReason(w) {
    var user = getUserWrongReason(w.date, w.q_idx);
    if (user) return user;
    return w.reason || "未标注";
  }

  // 错题 / 周测中的"去完整推送"按钮（跳转知识考点 Tab 的对应日期）
  function renderKgSourceJumpBtn(fk) {
    var sourceDate = fk.source_date || "";
    var title = fk.title || "";
    return '<button type="button" class="kg-jump-btn" onclick="WB.jumpToKgDate(\'' + esc(sourceDate) + '\')">' +
      '📖 去完整推送（' + esc(sourceDate) + ' · ' + esc(title) + '）→</button>';
  }

  // 渲染块状按钮 + 自定义输入；selected 来自 localStorage（高亮已选）
  function renderReasonSelector(dateStr, qIdx) {
    var current = getUserWrongReason(dateStr, qIdx);
    var isCustom = current && REASON_PRESETS.indexOf(current) < 0;
    var presetBtns = REASON_PRESETS.map(function (r) {
      var sel = (r === current) ? " selected" : "";
      return '<button type="button" class="reason-btn' + sel + '" ' +
        'onclick="WB.setWrongReason(\'' + dateStr + '\',' + qIdx + ',\'' + esc(r).replace(/'/g, "\\'") + '\')">' +
        esc(r) + '</button>';
    }).join("");
    var otherBtn = '<button type="button" class="reason-btn' + (isCustom ? " selected" : "") + '" ' +
      'onclick="WB.focusCustomReason(\'' + dateStr + '\',' + qIdx + ')">其他</button>';
    var customVal = isCustom ? current : "";
    return '<div class="reason-selector" data-rk="' + dateStr + '_' + qIdx + '">' +
      '<div class="reason-prompt">💡 本题错误原因是什么？</div>' +
      '<div class="reason-btns">' + presetBtns + otherBtn + '</div>' +
      '<div class="reason-custom-wrap">' +
        '<input type="text" class="reason-custom-input" id="reasonInput_' + dateStr + '_' + qIdx + '" ' +
        'placeholder="或输入自己的原因（自定义）" value="' + esc(customVal) + '" ' +
        'oninput="WB.setWrongReasonCustom(\'' + dateStr + '\',' + qIdx + ',this.value)" />' +
      '</div>' +
    '</div>';
  }

  /* -- Tab: 错题本（联动周测结果，完整呈现题目/选项/解析/答案 + 错误原因选择） -- */
  function renderKgWrong() {
    var history = D.kaogong.quiz_history || [];
    var allWrong = [];
    history.forEach(function (h) {
      (h.wrong || []).forEach(function (w) {
        allWrong.push(Object.assign({}, w, { date: h.date, week: h.week, score: h.score }));
      });
    });
    // 合并本地错题（在站点「每周小测」上做的题，尚未回写 md）
    loadLocalWrong().forEach(function (w) {
      allWrong.push({
        q_idx: w.qIdx, module: w.module, topic: w.topic,
        user_answer: w.userAnswer, correct_answer: w.correctAnswer,
        reason: w.reason || "", question: w.question,
        date: w.date, week: "", score: "", local: true
      });
    });
    if (allWrong.length === 0) {
      document.getElementById("kg-content").innerHTML =
        '<div class="wrong-empty fade">' +
          '<div class="big-emoji">📝</div>' +
          '<p>错题本是空的～<br/>每周「周末小测」做错的题会自动收录到这里，错题上会标注对应知识点。</p>' +
          '<p style="font-size:var(--fs-xs);color:var(--mist);margin-top:var(--sp-2);">💡 在 WorkBuddy 对话中回复「<b>开始小测</b>」即可作答</p>' +
        '</div>';
      return;
    }
    var cards = allWrong.map(function (w) { return renderWrongCard(w); }).join("");
    document.getElementById("kg-content").innerHTML =
      '<div class="weekly-toolbar">' +
        '<span class="toolbar-label">📝 共 ' + allWrong.length + ' 道错题（来自 ' + history.length + ' 次小测）· 完整呈现题目 / 选项 / 解析 / 你的答案 / 正确选项</span>' +
      '</div>' +
      cards;
  }
  // 错题单卡：完整呈现
  function renderWrongCard(w) {
    var q = w.question || {};
    var stem = q.stem || w.title || "（题源未解析）";
    var opts = q.options || [];
    var userAns = (w.user_answer || "").split("").filter(function (c) { return /[A-Z]/.test(c); });
    var corrAns = (w.correct_answer || "").split("").filter(function (c) { return /[A-Z]/.test(c); });
    var optsHtml = opts.length
      ? opts.map(function (o) {
          var L = o[0], t = o[1];
          var u = userAns.indexOf(L) >= 0;
          var c = corrAns.indexOf(L) >= 0;
          var cls = "wrong-opt" + (u ? " user" : "") + (c ? " correct" : "");
          var mark = "";
          if (u && c) mark = '<span class="opt-mark ok">✓✓</span>';        // 选且对
          else if (u && !c) mark = '<span class="opt-mark err">✗</span>';   // 选了但错（多选漏选不会到这里）
          else if (!u && c) mark = '<span class="opt-mark miss">漏</span>'; // 漏选
          return '<div class="' + cls + '"><span class="opt-letter">' + L + '</span><span class="opt-text">' + esc(t) + '</span>' + mark + '</div>';
        }).join("")
      : '<div style="color:var(--mist);font-size:var(--fs-xs);">（未抓到选项）</div>';
    var moduleTag = w.module
      ? '<span class="sector-tag" style="background:rgba(225,109,118,.12);color:#c95b6b;margin-left:var(--sp-2);">📍 ' + esc(w.module) + '</span>'
      : '';
    var reason = getDisplayReason(w);
    var isUser = !!getUserWrongReason(w.date, w.q_idx);
    var reasonTag = '<span class="sector-tag" style="background:' + (isUser ? 'rgba(94,123,90,.15)' : 'rgba(255,200,87,.15)') + ';color:' + (isUser ? '#3a7a4d' : '#a07820') + ';">' +
      (isUser ? '✓ ' : '❓ ') + esc(reason) + '</span>';

    return '<div class="wrong-card fade" data-wk="' + w.date + '_' + w.q_idx + '">' +
      '<div class="wrong-card-head">' +
        '<div class="wrong-card-meta">' +
          '<span class="wrong-card-date">' + esc(w.date || "") + '</span>' +
          '<span class="wrong-card-score">得分 ' + esc(w.score || "—") + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="wrong-card-title">' +
        '第 ' + esc(String(w.q_idx || "?")) + ' 题 · ' + esc(stem) +
        moduleTag + reasonTag +
      '</div>' +
      '<div class="wrong-card-opts">' + optsHtml + '</div>' +
      '<div class="wrong-card-answers">' +
        '<span><b>你选：</b><span class="user-ans">' + esc(w.user_answer || "—") + '</span></span>' +
        '<span><b>正确：</b><span class="correct-ans">' + esc(w.correct_answer || "—") + '</span></span>' +
        '<span><b>题型：</b>' + esc(opts.length > 4 ? "不定项" : "单选") + '</span>' +
      '</div>' +
      (q.explanation ? '<div class="wrong-card-explain">💡 解析：' + esc(q.explanation) + '</div>' : '') +
      (q.full_knowledge ? renderKgSourceJumpBtn(q.full_knowledge) : '') +
      renderReasonSelector(w.date, w.q_idx) +
    '</div>';
  }

  /* -- Tab: 每周小测（在线作答 / 判分 / 仅回顾） -- */
  var examPending = {};  // 不定项临时勾选 {dateStr: {qIdx: [letters]}}

  function getExamPapers() {
    return (D.kaogong.quiz_papers || []).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : -1;
    });
  }
  function getCurrentExamPaper() {
    var papers = getExamPapers();
    if (!papers.length) return null;
    if (state.examDate) {
      for (var i = 0; i < papers.length; i++) {
        if (papers[i].date === state.examDate) return papers[i];
      }
    }
    return papers[0];
  }
  function ansLetters(s) {
    return String(s || "").split("").filter(function (c) { return /[A-Z]/.test(c); }).sort().join("");
  }
  function isAnswerCorrect(user, correct) { return ansLetters(user) === ansLetters(correct); }
  function getPending(dateStr, qIdx) {
    var p = examPending[dateStr] || {};
    return (p[qIdx] || []).slice();
  }
  function togglePending(dateStr, qIdx, letter) {
    if (!examPending[dateStr]) examPending[dateStr] = {};
    var arr = examPending[dateStr][qIdx] || [];
    var i = arr.indexOf(letter);
    if (i >= 0) arr.splice(i, 1); else arr.push(letter);
    arr.sort();
    examPending[dateStr][qIdx] = arr;
  }
  function clearPending(dateStr, qIdx) {
    if (examPending[dateStr]) delete examPending[dateStr][qIdx];
  }
  function removeLocalWrong(dateStr, qIdx) {
    var list = loadLocalWrong();
    list = list.filter(function (w) { return !(w.date === dateStr && w.qIdx === qIdx); });
    saveLocalWrong(list);
  }
  function recordLocalWrong(dateStr, q, userAns) {
    var list = loadLocalWrong();
    list = list.filter(function (w) { return !(w.date === dateStr && w.qIdx === q.idx); });
    list.push({
      date: dateStr, qIdx: q.idx, module: q.module, topic: q.topic,
      userAnswer: userAns, correctAnswer: q.answer, reason: "",
      question: {
        stem: q.stem, options: q.options, answer: q.answer,
        explanation: q.explanation, knowledge_point: q.knowledge_point
      }
    });
    saveLocalWrong(list);
  }
  function copyText(text) {
    function fb() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fb);
    } else fb();
  }

  function renderKgExam() {
    var papers = getExamPapers();
    var paper = getCurrentExamPaper();
    if (!paper) {
      document.getElementById("kg-content").innerHTML =
        '<div class="wrong-empty fade"><div class="big-emoji">🧪</div>' +
        '<p>还没有小测题源。周六晚由「考公周末小测」自动化生成，生成后可在这里在线作答。</p></div>';
      return;
    }
    var answers = loadExamAnswers()[paper.date] || {};
    var answeredCount = paper.questions.filter(function (q) { return !!answers[String(q.idx)]; }).length;
    var correctCount = paper.questions.filter(function (q) {
      var u = answers[String(q.idx)] || "";
      return u && isAnswerCorrect(u, q.answer);
    }).length;

    var dateNav = papers.map(function (p) {
      var active = p.date === paper.date ? " active" : "";
      var doneMap = loadExamAnswers()[p.date] || {};
      var done = Object.keys(doneMap).length > 0;
      return '<button type="button" class="exam-date-btn' + active + '" onclick="WB.selectExamDate(\'' + p.date + '\')">' +
        p.date.slice(5).replace("-", "/") + (done ? ' ✓' : '') + '</button>';
    }).join("");

    var modeBar =
      '<button type="button" class="exam-mode-btn' + (state.examMode === "redo" ? " active" : "") + '" onclick="WB.setExamMode(\'redo\')">✏️ 重做</button>' +
      '<button type="button" class="exam-mode-btn' + (state.examMode === "review" ? " active" : "") + '" onclick="WB.setExamMode(\'review\')">👀 仅回顾</button>';

    var questionsHtml = paper.questions.map(function (q) {
      return renderExamQuestion(q, paper.date, answers);
    }).join("");

    document.getElementById("kg-content").innerHTML =
      '<div class="exam-date-nav">' + dateNav + '</div>' +
      '<div class="exam-controls">' +
        modeBar +
        '<span class="exam-progress">已答 ' + answeredCount + '/' + paper.questions.length +
          ' · 对 ' + correctCount + '</span>' +
        '<button type="button" class="kg-jump-btn primary" onclick="WB.submitExam(\'' + paper.date + '\')">📤 提交成绩（自动存档）</button>' +
        '<button type="button" class="kg-jump-btn" onclick="WB.exportExamResult(\'' + paper.date + '\')">📋 导出文本</button>' +
      '</div>' +
      '<div class="exam-questions">' + questionsHtml + '</div>' +
      '<div style="margin-top:var(--sp-3);font-size:var(--fs-xs);color:var(--mist);text-align:center;">' +
        '📌 选完立即判分（对→绿 / 错→红）；做错的题自动进「错题本」。全部答完后点「提交成绩」自动存档到 GitHub（需已配置云函数）。</div>';
  }

  function renderExamQuestion(q, dateStr, answers) {
    var isMulti = q.is_multiple || ansLetters(q.answer).length > 1;
    var userAns = answers[String(q.idx)] || "";
    var done = !!userAns;
    var correct = done ? isAnswerCorrect(userAns, q.answer) : null;
    var pending = (isMulti && !done) ? getPending(dateStr, q.idx) : [];
    var showResult = (state.examMode === "review") || done;

    var tagHtml =
      (q.topic ? '<span class="sector-tag" style="background:rgba(160,150,220,.15);color:#6d5bd0;margin-left:6px;">📍 ' + esc(q.topic) + '</span>' : '') +
      (isMulti ? '<span class="sector-tag" style="background:rgba(255,200,87,.18);color:#a07820;margin-left:6px;">不定项</span>' : '') +
      (q.is_review ? '<span class="sector-tag" style="background:rgba(94,123,90,.15);color:#3a7a4d;margin-left:6px;">🔁 错题重考</span>' : '');

    var optsHtml = q.options.map(function (o) {
      var L = o.letter, t = o.text;
      var cls = "exam-opt"; var mark = "";
      if (showResult) {
        var isCorr = ansLetters(q.answer).indexOf(L) >= 0;
        var isUser = (userAns.indexOf(L) >= 0);
        if (isCorr) { cls += " correct"; mark = '<span class="opt-mark ok">✓</span>'; }
        else if (isUser && !isCorr) { cls += " wrong"; mark = '<span class="opt-mark err">✗</span>'; }
      } else if (isMulti && pending.indexOf(L) >= 0) {
        cls += " picked";
      }
      var click = showResult ? "" :
        (isMulti
          ? 'onclick="WB.pickExamOption(\'' + dateStr + '\',' + q.idx + ',\'' + L + '\')"'
          : 'onclick="WB.answerExamSingle(\'' + dateStr + '\',' + q.idx + ',\'' + L + '\')"');
      return '<button type="button" class="' + cls + '" ' + click + '>' +
        '<span class="opt-letter">' + L + '</span><span class="opt-text">' + esc(t) + '</span>' + mark + '</button>';
    }).join("");

    var explHtml = "";
    if (showResult) {
      var verdict = "";
      if (done) verdict = correct
        ? '<div class="exam-verdict ok">✅ 答对了</div>'
        : '<div class="exam-verdict wrong">❌ 答错了</div>';
      explHtml = '<div class="exam-explain">' + verdict +
        '<div class="exam-answer">正确答案：<b>' + esc(q.answer) + '</b>' +
          (done ? '　你的答案：<b class="' + (correct ? "correct-ans" : "user-ans") + '">' + esc(userAns) + '</b>' : '') +
        '</div>' +
        (q.explanation ? '<div class="exam-exp-text">💡 ' + esc(q.explanation) + '</div>' : '') +
        (q.knowledge_point ? '<div class="exam-kp">🎯 考点：' + esc(q.knowledge_point) + '</div>' : '') +
      '</div>';
    }

    var submitHtml = "";
    if (state.examMode === "redo" && isMulti && !done) {
      submitHtml = '<button type="button" class="exam-submit-btn" onclick="WB.submitExamMulti(\'' + dateStr + '\',' + q.idx + ')">提交本题</button>';
    }

    return '<div class="exam-card fade" data-eq="' + dateStr + '_' + q.idx + '">' +
      '<div class="exam-card-head"><span class="exam-num">第 ' + q.idx + ' 题</span>' + tagHtml + '</div>' +
      '<div class="exam-stem">' + esc(q.stem) + '</div>' +
      '<div class="exam-opts">' + optsHtml + '</div>' +
      submitHtml + explHtml +
    '</div>';
  }

  /* -- Tab: 周测分析（折叠题回顾 + 答题点评 + 错误原因选择 + 累计统计 + 薄弱项） -- */
  function renderKgQuiz() {
    var stats = D.kaogong.quiz_stats || {};
    var last = stats.last_quiz;
    var history = D.kaogong.quiz_history || [];

    // 1. 答题点评：列出错题（每条只显示知识点 + 原因选择，不重列题干）
    var feedbackSection = "";
    if (last) {
      var lastWrong = last.wrong || [];
      var isAllCorrect = lastWrong.length === 0;
      var lastHeader = isAllCorrect
        ? '<span class="sector-tag" style="background:rgba(58,122,77,.15);color:#3a7a4d;">🟢 全对</span>'
        : '<span class="sector-tag" style="background:rgba(225,109,118,.12);color:#c95b6b;">🔴 ' + esc(last.score || "") + '</span>';
      var lastTitle = "最近一次小测 · " + esc(last.date || "") + " · " + esc(last.week || "");

      var wrongListHtml = "";
      if (lastWrong.length > 0) {
        wrongListHtml =
          '<div class="wrong-summary">' +
            '<div style="font-size:var(--fs-sm);color:var(--mist);margin-bottom:var(--sp-2);">📚 本次错题对应知识点：</div>' +
            lastWrong.map(function (w) {
              var q = w.question || {};
              var moduleTag = w.module
                ? '<span class="sector-tag" style="background:rgba(225,109,118,.12);color:#c95b6b;margin-left:6px;">📍 ' + esc(w.module) + '</span>'
                : '';
              var quizKline = q.knowledge_point
                ? '<div class="quiz-wrong-kp">🎯 小测要点：' + esc(q.knowledge_point) + '</div>'
                : '';
              return '<div class="quiz-wrong-row" data-qr="' + w.date + '_' + w.q_idx + '">' +
                '<div class="quiz-wrong-head">' +
                  '<span class="quiz-wrong-num">第 ' + esc(String(w.q_idx)) + ' 题</span>' +
                  '<span class="quiz-wrong-answers">你选 <span class="user-ans">' + esc(w.user_answer) + '</span> · 正答 <span class="correct-ans">' + esc(w.correct_answer) + '</span></span>' +
                  moduleTag +
                '</div>' +
                (q.full_knowledge ? renderKgSourceJumpBtn(q.full_knowledge) : quizKline) +
                renderReasonSelector(w.date, w.q_idx) +
              '</div>';
            }).join("") +
          "</div>";
      }
      feedbackSection =
        '<div class="kg-card fade" style="margin-bottom:var(--sp-3);">' +
          '<div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-2);">' +
            lastHeader +
            '<span style="font-size:var(--fs-md);font-weight:600;">📊 答题点评</span>' +
            '<span style="font-size:var(--fs-xs);color:var(--mist);">' + lastTitle + '</span>' +
          "</div>" +
          '<div class="md-rendered">' +
            (isAllCorrect
              ? "<p><b>🎉 全对！</b>恭喜你对本周考点掌握得很扎实。</p>" +
                "<p>" + esc(last.feedback || "建议把本周涉及的模块口诀再过一遍，巩固印象。") + "</p>"
              : esc(last.feedback || "")) +
          "</div>" +
          wrongListHtml +
        "</div>";
    } else if (history.length === 0) {
      feedbackSection =
        '<div class="kg-card fade" style="margin-bottom:var(--sp-3);">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">📊 答题点评</h3>' +
          '<p style="color:var(--mist);">还没有小测记录。在 WorkBuddy 对话中回复「<b>开始小测</b>」即可作答。</p>' +
        "</div>";
    }

    // 3. 累计统计（>= 2 次才显示柱状图）
    var cumulativeSection = "";
    if (stats.cumulative) {
      var modBars = (stats.wrong_by_module || []).map(function (m) {
        var pct = stats.total_wrong ? Math.round(100 * m.count / stats.total_wrong) : 0;
        return '<div class="bar-row">' +
          '<div class="bar-label">' + esc(m.module) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;">' + m.count + '</div></div>' +
          "</div>";
      }).join("");
      var reasonBars = Object.keys(stats.wrong_by_reason || {}).map(function (r) {
        var c = stats.wrong_by_reason[r];
        var pct = stats.total_wrong ? Math.round(100 * c / stats.total_wrong) : 0;
        return '<div class="bar-row">' +
          '<div class="bar-label">' + esc(r) + '</div>' +
          '<div class="bar-track"><div class="bar-fill reason" style="width:' + pct + '%;">' + c + '</div></div>' +
          "</div>";
      }).join("");
      cumulativeSection =
        '<div class="kg-card fade" style="margin-bottom:var(--sp-3);">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">📈 累计统计（' + stats.total_quizzes + ' 次小测）</h3>' +
          '<div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-3);">' +
            statBlock("总题数", stats.total_questions) +
            statBlock("总正确", stats.total_correct, "#3a7a4d") +
            statBlock("总错误", stats.total_wrong, "#c95b6b") +
            statBlock("正确率", stats.accuracy_pct + "%", stats.accuracy_pct >= 80 ? "#3a7a4d" : (stats.accuracy_pct >= 60 ? "#a07820" : "#c95b6b")) +
          "</div>" +
          '<div style="font-size:var(--fs-sm);color:var(--mist);margin-bottom:4px;">🔴 错题按模块分布（共 ' + stats.total_wrong + ' 道）</div>' +
          (modBars || '<div style="color:var(--mist);font-size:var(--fs-xs);">还没有错题记录</div>') +
          '<div style="font-size:var(--fs-sm);color:var(--mist);margin:var(--sp-3) 0 4px;">🟡 错题按原因分布</div>' +
          (reasonBars || '<div style="color:var(--mist);font-size:var(--fs-xs);">暂无原因标注</div>') +
        "</div>";
    } else if (history.length === 1) {
      cumulativeSection =
        '<div class="kg-card fade" style="margin-bottom:var(--sp-3);">' +
          '<div style="font-size:var(--fs-sm);color:var(--mist);">完成 2 次及以上小测后，会出现累计柱状图与薄弱项分析。</div>' +
        "</div>";
    }

    // 4. 薄弱项（高频错误知识点）
    var weaknessSection = "";
    if (stats.cumulative && stats.top_wrong_titles && stats.top_wrong_titles.length > 0) {
      var titleList = stats.top_wrong_titles.map(function (t, i) {
        return '<div class="weakness-item">' +
          '<span class="weakness-rank">' + (i+1) + '</span>' +
          '<span class="weakness-text">' + esc(t.title) + '</span>' +
          '<span class="weakness-count">错 ' + t.count + ' 次</span>' +
          "</div>";
      }).join("");
      weaknessSection =
        '<div class="kg-card fade">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">🎯 高频错误知识点（薄弱项）</h3>' +
          '<div style="font-size:var(--fs-xs);color:var(--mist);margin-bottom:var(--sp-2);">来自 ' + stats.total_quizzes + ' 次小测、' + stats.total_wrong + ' 道错题的累计</div>' +
          titleList +
        "</div>";
    } else if (stats.cumulative && (!stats.top_wrong_titles || !stats.top_wrong_titles.length)) {
      weaknessSection =
        '<div class="kg-card fade">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">🎯 高频错误知识点</h3>' +
          '<div style="color:var(--mist);font-size:var(--fs-sm);">✅ 累计 ' + stats.total_quizzes + ' 次小测无错题，没有薄弱项。</div>' +
        "</div>";
    }

    document.getElementById("kg-content").innerHTML =
      feedbackSection +
      cumulativeSection +
      weaknessSection;
  }

  function statBlock(label, val, color) {
    return '<div class="stat-mini" style="' + (color ? "border-color:" + color + ";" : "") + '">' +
      '<div style="font-family:var(--mono);font-size:var(--fs-lg);font-weight:600;' + (color ? "color:" + color + ";" : "") + '">' + val + '</div>' +
      '<div style="font-size:var(--fs-xs);color:var(--mist);margin-top:2px;">' + label + '</div>' +
    "</div>";
  }

  /* -- Tab: 周末总结（考公）-- */
  function renderKgWeekly() {
    var summary = D.kaogong.weekly_summary;
    var range = D.kaogong.weekly_range;
    var rangeTag = (range && range.length === 2)
      ? '<span class="sector-tag" style="background:var(--kg-bg);color:var(--kg-accent);">本周 ' + esc(range[0]) + ' ~ ' + esc(range[1]) + '</span>'
      : '';

    if (!summary) {
      document.getElementById("kg-content").innerHTML =
        '<div class="weekly-empty fade"><div class="big-emoji">🗓️</div>' +
        '<p>暂无历史数据。等 12:30 推送累计几天后，这里会显示本周总结。</p></div>';
      return;
    }

    var noteCount = Object.keys(notesAll).filter(function (k) {
      return k.indexOf("kaogong::") === 0 && notesAll[k] && notesAll[k].trim();
    }).length;

    document.getElementById("kg-content").innerHTML =
      '<div class="weekly-toolbar">' +
        '<span class="toolbar-label">' + rangeTag + ' 已写 ' + noteCount + ' 条笔记</span>' +
        '<button onclick="WB.exportNotes()">📥 导出笔记 JSON</button>' +
      '</div>' +
      '<div class="kg-card fade">' +
        '<div class="md-rendered">' + mdToHtml(summary) + '</div>' +
      '</div>' +
      '<div style="margin-top:var(--sp-3);font-size:var(--fs-xs);color:var(--mist);text-align:right;">' +
        '📅 想看某一天的具体内容？切到「知识考点」Tab 选日期 ↓' +
      '</div>';
  }

  /* 考公 tab 分发 */
  var KgRenderers = {
    "kg-knowledge": renderKgKnowledge,
    "kg-exam": renderKgExam,
    "kg-weak": renderKgWeak,
    "kg-wrong": renderKgWrong,
    "kg-quiz": renderKgQuiz,
    "kg-weekly": renderKgWeekly
  };
  function renderKaogong() {
    renderKgHeader();
    var r = KgRenderers[state.kgTab] || renderKgKnowledge;
    r();
  }

  /* ═════════════════════════════════
     渲染：理财板块
     ═════════════════════════════════ */

  /* -- 页头 -- */
  function renderLcHeader() {
    document.getElementById("lc-motto").innerHTML = '<div class="motto-wrap">' + esc(pickMotto()) + '</div>';
    document.getElementById("lc-stats").innerHTML =
      '<div class="stat-chip">📅 ' + dateStr + '</div>' +
      '<div class="stat-chip">📆 第 ' + weekNum + ' 周</div>' +
      '<div class="stat-chip">🔥 连续 ' + D.licai.progress.day + ' 天</div>' +
      '<div class="stat-chip">📍 ' + esc(D.licai.progress.level) + '</div>';
  }

  /* -- Tab: 热点知识 -- */
  function renderLcHot() {
    document.getElementById("lc-content").innerHTML =
      '<div class="hot-card fade">' +
        '<div class="hot-title">' + esc(cj.hotTitle) + '</div>' +
        '<div class="hot-src">📰 来源：' + esc(cj.hotSrc) + '</div>' +
        '<ul class="hot-list">' +
          '<li><b>发生了什么：</b>' + esc(cj.fa) + '</li>' +
          '<li><b>为什么影响净值：</b>' + esc(cj.why) + '</li>' +
          '<li><b>对你意味着：</b>' + esc(cj.mean) + '</li>' +
        '</ul>' +
      '</div>';
  }

  /* -- Tab: 今日知识 -- */
  // 理财日期导航（仿考公）：展开态看月历，折叠态看本周速览
  function renderLcDateNav() {
    if (state.lcCalendarExpanded) return renderLcCalendarCard();
    return renderLcWeekStripCard();
  }

  // 本周 7 天日期按钮（折叠态）
  function renderLcWeekStripCard() {
    var weekDates = weekDatesOf(state.lcSelectedDate);
    var todayStr = D.snapshot_date;
    var dotsHtml = "";
    weekDates.forEach(function (d) {
      var entry = lcHistoryByDate[d];
      var dnum = d.slice(8, 10);
      var isSelected = d === state.lcSelectedDate;
      var isToday = d === todayStr;
      var cls = "kg-date-btn" + (entry ? " has" : " no") +
        (isSelected ? " selected" : "") + (isToday ? " today" : "");
      var onclick = entry ? 'onclick="WB.selectLcDate(\'' + d + '\')"' : '';
      dotsHtml += '<button type="button" class="' + cls + '" ' + onclick + '>' +
        '<div class="kg-date-num">' + dnum + '</div>' +
        '<div class="kg-date-day">' + weekdayLabel(d) + '</div>' +
      '</button>';
    });
    return '<div class="lc-card fade">' +
      '<div class="kg-card-head">' +
        '<h3 class="kg-card-title">📅 本周速览</h3>' +
        '<button type="button" class="kg-expand-btn" onclick="WB.toggleLcCalendar()">▼ 展开</button>' +
      '</div>' +
      '<div class="kg-week-strip">' + dotsHtml + '</div>' +
      '<div class="kg-week-tip">点击日期按钮查看该日的理财知识；不点击默认显示当天</div>' +
    '</div>';
  }

  // 月历（展开态）
  function renderLcCalendarCard() {
    var monthKey = state.lcCalendarMonth || state.lcSelectedDate.slice(0, 7);
    state.lcCalendarMonth = monthKey;
    var grid = monthGrid(monthKey);
    var headerDays = ["一", "二", "三", "四", "五", "六", "日"];
    var cellsHtml = "";
    grid.rows.forEach(function (row) {
      row.forEach(function (d) {
        if (d === null) {
          cellsHtml += '<div class="kg-cal-day empty"></div>';
        } else {
          var dateStr = dateStrOf(grid.year, grid.month, d);
          var entry = lcHistoryByDate[dateStr];
          var cls = "kg-cal-day" + (entry ? " has" : " no") +
            (dateStr === state.lcSelectedDate ? " selected" : "") +
            (dateStr === D.snapshot_date ? " today" : "");
          var onclick = entry ? 'onclick="WB.selectLcDate(\'' + dateStr + '\')"' : '';
          cellsHtml += '<button type="button" class="' + cls + '" ' + onclick + '>' + d + '</button>';
        }
      });
    });
    var weekdayHeader = headerDays.map(function (h) {
      return '<div class="kg-cal-weekday">' + h + '</div>';
    }).join("");
    return '<div class="lc-card fade">' +
      '<div class="kg-card-head">' +
        '<h3 class="kg-card-title">📅 ' + grid.year + ' 年 ' + grid.month + ' 月</h3>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="kg-expand-btn" onclick="WB.shiftLcMonth(-1)">◀ 上月</button>' +
          '<button type="button" class="kg-expand-btn" onclick="WB.toggleLcCalendar()">▲ 收起</button>' +
          '<button type="button" class="kg-expand-btn" onclick="WB.shiftLcMonth(1)">下月 ▶</button>' +
        '</div>' +
      '</div>' +
      '<div class="kg-cal-weekdays">' + weekdayHeader + '</div>' +
      '<div class="kg-cal-grid">' + cellsHtml + '</div>' +
      '<div class="kg-week-tip">只显示本月日期；带边框的日期可点击进入当天推送；灰色日期无推送</div>' +
    '</div>';
  }

  // 取某天的理财解析（历史日用 lcHistoryByDate，今天兜底用 today_md）
  function lcParsedFor(date) {
    var e = lcHistoryByDate[date];
    if (e) return e.parsed;
    return (date === D.snapshot_date) ? cj : null;
  }

  function renderLcKnow() {
    var lvlIdx = parseInt((D.licai.progress.level || "L1").replace("L",""), 10) - 1;
    var ladderHtml = "";
    D.licai.levels.forEach(function (lv, i) {
      var cls = i < lvlIdx ? "done" : (i === lvlIdx ? "on" : "off");
      ladderHtml += '<div class="ladder-step ' + cls + '"><span class="ladder-num">' + (i+1) + '</span>' + esc(lv) + '</div>';
    });

    var p = lcParsedFor(state.lcSelectedDate);
    var knowCard = "";
    if (p && p.knowName && p.knowName !== "—") {
      var isToday = state.lcSelectedDate === D.snapshot_date;
      var dateTag = isToday
        ? '<span class="kg-date-tag today-tag">📌 今日</span>'
        : '<span class="kg-date-tag">' + weekdayLabel(state.lcSelectedDate) + '</span>';
      knowCard =
        '<div class="know-card fade">' +
          '<div class="know-title">' + esc(p.knowName) + dateTag + '</div>' +
          '<div class="know-level">📊 ' + esc(p.knowLevel) + '</div>' +
          '<ul class="know-list">' +
            (p.dabai ? '<li><b>大白话：</b>' + esc(p.dabai) + '</li>' : '') +
            (p.biyu ? '<li><b>生活化比喻：</b>' + esc(p.biyu) + '</li>' : '') +
            (p.zhuyi ? '<li><b>注意什么：</b>' + esc(p.zhuyi) + '</li>' : '') +
          '</ul>' +
          (p.tip ? '<div class="know-tip">💡 ' + esc(p.tip) + '</div>' : '') +
          noteBtnHtml("licai", state.lcSelectedDate, 0) +
          noteDisplayHtml("licai", state.lcSelectedDate, 0) +
        '</div>';
    } else {
      knowCard =
        '<div class="fund-empty fade">' +
          '<div class="big-emoji">📚</div>' +
          '<p>' + esc(state.lcSelectedDate) + ' 当天还没有理财知识推送。</p>' +
        '</div>';
    }

    document.getElementById("lc-content").innerHTML =
      renderLcDateNav() +
      '<div class="lc-card fade">' +
        '<h3 style="font-size:var(--fs-md);color:var(--lc-accent);margin-bottom:var(--sp-3);">📈 认知进阶</h3>' +
        '<div class="ladder">' + ladderHtml + '</div>' +
      '</div>' +
      knowCard;
  }

  /* -- Tab: 实时行情 -- */
  function renderLcMarket() {
    if (D.licai.fund && D.licai.fund.length) {
      var fundCards = D.licai.fund.map(function (f) {
        var up = f.chg >= 0;
        return '<div class="fund-card fade">' +
          '<div class="fund-name">' + esc(f.name) + '</div>' +
          (f.sector ? '<div style="font-family:var(--mono);font-size:10px;color:var(--mist);margin-bottom:4px;">🏷️ ' + esc(f.sector) + '</div>' : '') +
          '<div class="fund-price">' + (f.price || "—") + '</div>' +
          '<div class="fund-chg ' + (up ? "up" : "down") + '">' +
            (up ? "▲ " : "▼ ") + (typeof f.chg === "number" ? f.chg.toFixed(2) + "%" : f.chg) +
          '</div>' +
        '</div>';
      }).join("");
      document.getElementById("lc-content").innerHTML =
        '<div class="market-grid">' + fundCards + '</div>';
    } else {
      document.getElementById("lc-content").innerHTML =
        '<div class="fund-empty fade">' +
          '<div class="big-emoji">📈</div>' +
          '<p>实时行情尚未接入。<br/>连接 westock 行情源后，这里会显示你关注的 ETF / 基金实时净值。</p>' +
          '<a onclick="alert(\'请在 WorkBuddy 中连上 westock 行情连接器，然后说「把行情接上」即可。\')">🔗 了解如何接入行情</a>' +
        '</div>';
    }
  }

  /* -- Tab: 周末总结（理财）-- */
  // 已覆盖概念按钮（可点击跳转到对应日期的理财推送）
  function renderLcCoveredBtns() {
    var covered = D.licai.progress.covered || [];
    var btns = covered.map(function (c) {
      var d = lcConceptDate(c);
      var label = String(c).split("(")[0].split("（")[0].trim() || c;
      if (d) {
        return '<button type="button" class="lc-concept-btn" onclick="WB.jumpToLcDate(\'' + d + '\')">' + esc(label) + '</button>';
      }
      return '<span class="lc-concept-btn no-jump" title="未找到对应推送">' + esc(label) + '</span>';
    }).join("");
    return '<div class="lc-concept-btns">' + btns + '</div>';
  }

  // 本周新概念重点回顾（结构化，可点击跳转）+ 完整知识点（来自原始日推送）
  function renderLcNewConcepts() {
    var concepts = D.licai.weekly_concepts || [];
    if (!concepts.length) return "";
    var items = concepts.map(function (c) {
      return '<div class="lc-new-concept" onclick="WB.jumpToLcDate(\'' + c.date + '\')">' +
        '<div class="lc-new-head">' +
          '<span class="lc-new-name">' + esc(c.know_name || "—") + '</span>' +
          '<span class="lc-new-level">' + esc(c.know_level || "") + '</span>' +
          '<span class="lc-new-date">' + c.date + '</span>' +
        '</div>' +
        (c.dabai ? '<div class="lc-new-dabai"><b>一句人话：</b>' + esc(c.dabai) + '</div>' : '') +
        (c.biyu ? '<div class="lc-new-biyu"><b>举个例子：</b>' + esc(c.biyu) + '</div>' : '') +
        (c.zhuyi ? '<div class="lc-new-zhuyi"><b>对我有什么用：</b>' + esc(c.zhuyi) + '</div>' : '') +
        (c.tip ? '<div class="lc-new-tip"><b>小白提示：</b>' + esc(c.tip) + '</div>' : '') +
      '</div>';
    }).join("");
    return items;
  }

  function renderLcWeekly() {
    var summary = D.licai.weekly_summary;
    var hot = D.licai.weekly_hot;
    var range = D.licai.weekly_range;
    var rangeTag = (range && range.length === 2)
      ? '<span class="sector-tag" style="background:var(--lc-bg);color:var(--lc-accent);">本周 ' + esc(range[0]) + ' ~ ' + esc(range[1]) + '</span>'
      : '';

    if (!summary && !hot) {
      document.getElementById("lc-content").innerHTML =
        '<div class="weekly-empty fade"><div class="big-emoji">🗓️</div>' +
        '<p>暂无历史数据。等 12:30 推送累计几天后，这里会显示本周总结。</p></div>';
      return;
    }

    var noteCount = Object.keys(notesAll).filter(function (k) {
      return k.indexOf("licai::") === 0 && notesAll[k] && notesAll[k].trim();
    }).length;

    // 本周知识回顾卡（已覆盖概念按钮 + 本周新概念重点回顾）
    var covered = D.licai.progress.covered || [];
    var concepts = D.licai.weekly_concepts || [];
    var knowledgeReview =
      '<div class="lc-card fade" style="margin-top:var(--sp-3);">' +
        '<h3 style="font-size:var(--fs-md);color:var(--lc-accent);margin-bottom:var(--sp-2);">📚 本周知识回顾</h3>' +
        (covered.length
          ? '<div style="font-size:var(--fs-xs);color:var(--mist);margin:var(--sp-2) 0 6px;">已覆盖概念（点击跳转到对应推送）：</div>' +
            renderLcCoveredBtns()
          : '') +
        (concepts.length
          ? '<div style="font-size:var(--fs-xs);color:var(--mist);margin:var(--sp-3) 0 6px;">本周新概念重点回顾（点击查看原文）：</div>' +
            renderLcNewConcepts()
          : '') +
      '</div>';

    document.getElementById("lc-content").innerHTML =
      '<div class="weekly-toolbar">' +
        '<span class="toolbar-label">' + rangeTag + ' 已写 ' + noteCount + ' 条笔记</span>' +
        '<button class="primary" onclick="WB.exportNotes()">📥 导出笔记 JSON</button>' +
      '</div>' +
      (hot
        ? '<div class="lc-card fade">' +
            '<div class="md-rendered">' + mdToHtml(hot) + '</div>' +
          '</div>'
        : '') +
      knowledgeReview +
      '<div style="margin-top:var(--sp-3);font-size:var(--fs-xs);color:var(--mist);text-align:right;">' +
        '📅 想看某一天的具体内容？切到「今日知识」Tab 点日期按钮 ↓' +
      '</div>';
  }

  /* 理财 tab 分发 */
  var LcRenderers = {
    "lc-hot": renderLcHot,
    "lc-know": renderLcKnow,
    "lc-market": renderLcMarket,
    "lc-weekly": renderLcWeekly
  };
  function renderLicai() {
    renderLcHeader();
    var r = LcRenderers[state.lcTab] || renderLcHot;
    r();
  }

  /* ═════════════════════════════════
     导航 & 路由
     ═════════════════════════════════ */
  function switchPage(page) {
    state.page = page;

    // 切换侧边栏激活态
    document.querySelectorAll(".nav-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.page === page);
    });
    document.querySelectorAll(".sidebar-brand").forEach(function (el) {
      el.classList.toggle("active", el.dataset.page === page);
    });

    // 切换页面显示
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.toggle("active", el.id === "page-" + page);
    });

    // 渲染对应页面
    if (page === "home") renderHome();
    else if (page === "kaogong") renderKaogong();
    else if (page === "licai") renderLicai();

    // 移动端关闭侧边栏
    closeMobileSidebar();
  }

  function switchTab(section, tabId) {
    if (section === "kg") {
      state.kgTab = tabId;
      document.querySelectorAll("#kg-tabs .tab").forEach(function (el) {
        el.classList.toggle("active", el.dataset.tab === tabId);
      });
      var r = KgRenderers[tabId];
      if (r) r();
    } else if (section === "lc") {
      state.lcTab = tabId;
      document.querySelectorAll("#lc-tabs .tab").forEach(function (el) {
        el.classList.toggle("active", el.dataset.tab === tabId);
      });
      var r2 = LcRenderers[tabId];
      if (r2) r2();
    }
  }

  /* ═════════════════════════════════
     事件绑定
     ═════════════════════════════════ */

  /* 侧边栏导航点击 */
  document.querySelectorAll(".nav-item, .sidebar-brand").forEach(function (el) {
    el.addEventListener("click", function () { switchPage(el.dataset.page); });
  });

  /* Tab 栏点击 */
  document.querySelectorAll(".tab-bar .tab").forEach(function (el) {
    el.addEventListener("click", function () {
      var bar = el.closest(".tab-bar");
      var section = bar.id === "kg-tabs" ? "kg" : "lc";
      switchTab(section, el.dataset.tab);
    });
  });

  /* 移动端：遮罩关闭侧边栏 */
  var overlay = document.getElementById("overlay");
  overlay.addEventListener("click", closeMobileSidebar);

  /* 移动端：汉堡按钮打开侧边栏 */
  var mobileToggle = document.getElementById("mobileToggle");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", function () {
      document.getElementById("sidebar").classList.add("open");
      overlay.classList.add("show");
    });
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    overlay.classList.remove("show");
  }

  /* 全局 API（供内联 onclick 使用） */
  window.WB = {
    navigate: switchPage,
    switchTab: switchTab,
    exportNotes: exportNotesJson,
    // 知识考点 Tab：日期 / 日历 / 检索 控制
    selectKgDate: function (dateStr) {
      if (!kgHistoryByDate[dateStr]) return;  // 无历史则忽略
      state.kgSelectedDate = dateStr;
      state.kgSearchQuery = "";
      state.kgCalendarMonth = dateStr.slice(0, 7);
      // 同步清空检索输入框
      var inp = document.getElementById("kgSearchInput");
      if (inp) inp.value = "";
      renderKaogong();
    },
    toggleKgCalendar: function () {
      state.kgCalendarExpanded = !state.kgCalendarExpanded;
      if (state.kgCalendarExpanded) {
        state.kgCalendarMonth = state.kgSelectedDate.slice(0, 7);
      }
      renderKaogong();
    },
    shiftKgMonth: function (delta) {
      var cur = state.kgCalendarMonth || state.kgSelectedDate.slice(0, 7);
      state.kgCalendarMonth = shiftMonth(cur, delta);
      renderKaogong();
    },
    openKgResult: function (dateStr, idx) {
      if (!kgHistoryByDate[dateStr]) return;
      state.kgSelectedDate = dateStr;
      state.kgSearchQuery = "";
      state.kgCalendarExpanded = false;
      state.kgCalendarMonth = dateStr.slice(0, 7);
      var inp = document.getElementById("kgSearchInput");
      if (inp) inp.value = "";
      renderKaogong();
      // 滚动到对应知识点卡片（轻微高亮）
      setTimeout(function () {
        var cards = document.querySelectorAll("#kgContentArea .kp-card");
        var card = cards[idx];
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.style.transition = "box-shadow .4s ease";
          card.style.boxShadow = "0 0 0 3px var(--kg-accent)";
          setTimeout(function () { card.style.boxShadow = ""; }, 1400);
        }
      }, 80);
    },
    clearKgSearch: function () {
      state.kgSearchQuery = "";
      var inp = document.getElementById("kgSearchInput");
      if (inp) inp.value = "";
      renderKaogong();
    },
    /* 每周小测：日期 / 模式 / 作答 / 导出 */
    selectExamDate: function (dateStr) {
      state.examDate = dateStr;
      state.examMode = "redo";
      renderKaogong();
    },
    setExamMode: function (mode) {
      state.examMode = mode;
      renderKaogong();
    },
    answerExamSingle: function (dateStr, qIdx, letter) {
      var all = loadExamAnswers();
      if (!all[dateStr]) all[dateStr] = {};
      all[dateStr][String(qIdx)] = letter;
      saveExamAnswers(all);
      var paper = getCurrentExamPaper();
      if (paper) {
        for (var i = 0; i < paper.questions.length; i++) {
          var q = paper.questions[i];
          if (q.idx === qIdx) {
            if (isAnswerCorrect(letter, q.answer)) removeLocalWrong(dateStr, qIdx);
            else recordLocalWrong(dateStr, q, letter);
            break;
          }
        }
      }
      renderKaogong();
    },
    pickExamOption: function (dateStr, qIdx, letter) {
      togglePending(dateStr, qIdx, letter);
      renderKaogong();
    },
    submitExamMulti: function (dateStr, qIdx) {
      var pending = getPending(dateStr, qIdx);
      if (!pending.length) { toast("请先勾选选项"); return; }
      var ans = pending.join("");
      clearPending(dateStr, qIdx);
      var all = loadExamAnswers();
      if (!all[dateStr]) all[dateStr] = {};
      all[dateStr][String(qIdx)] = ans;
      saveExamAnswers(all);
      var paper = getCurrentExamPaper();
      if (paper) {
        for (var i = 0; i < paper.questions.length; i++) {
          var q = paper.questions[i];
          if (q.idx === qIdx) {
            if (isAnswerCorrect(ans, q.answer)) removeLocalWrong(dateStr, qIdx);
            else recordLocalWrong(dateStr, q, ans);
            break;
          }
        }
      }
      renderKaogong();
    },
    exportExamResult: function (dateStr) {
      var paper = getCurrentExamPaper();
      if (!paper) return;
      var all = loadExamAnswers();
      var ans = all[dateStr] || {};
      var lines = [];
      var correctCount = 0;
      paper.questions.forEach(function (q) {
        var u = ans[String(q.idx)] || "";
        if (u && isAnswerCorrect(u, q.answer)) correctCount++;
        lines.push(q.idx + "-" + (u || "未答"));
      });
      var wrong = paper.questions.filter(function (q) {
        var u = ans[String(q.idx)] || "";
        return u && !isAnswerCorrect(u, q.answer);
      });
      var text = "小测做完了，答案如下：\n" + lines.join(" ") +
        "\n（得分 " + correctCount + "/" + paper.questions.length + "）" +
        (wrong.length ? "\n错题：" + wrong.map(function (q) { return "第" + q.idx + "题·" + (q.topic || q.module); }).join("、") : "");
      copyText(text);
      toast("✅ 成绩已复制到剪贴板，请贴回 WorkBuddy 对话存档");
    },
    /* 提交成绩到云函数（自动写回 GitHub） */
    submitExam: function (dateStr) {
      var paper = getCurrentExamPaper();
      if (!paper) return;
      if (!EXAM_SUBMIT_URL) {
        toast("⚠️ 云函数尚未配置，请点「导出文本」或联系我配置");
        return;
      }
      var all = loadExamAnswers();
      var ans = all[dateStr] || {};
      var unanswered = paper.questions.filter(function (q) { return !ans[String(q.idx)]; });
      if (unanswered.length) {
        toast("还有 " + unanswered.length + " 题未作答，请先做完再提交");
        return;
      }
      var score = 0;
      var answers = paper.questions.map(function (q) {
        var u = ans[String(q.idx)] || "";
        var ok = isAnswerCorrect(u, q.answer);
        if (ok) score++;
        return { idx: q.idx, module: q.topic || q.module, user: u, correct: q.answer, ok: ok, reason: "" };
      });
      var wrong = paper.questions.filter(function (q) {
        var u = ans[String(q.idx)] || "";
        return u && !isAnswerCorrect(u, q.answer);
      }).map(function (q) {
        return {
          idx: q.idx, module: q.module, topic: q.topic, stem: q.stem,
          user: ans[String(q.idx)], correct: q.answer,
          explanation: q.explanation, knowledge_point: q.knowledge_point, reason: ""
        };
      });
      var body = {
        key: EXAM_AUTH_KEY,
        date: dateStr,
        week: paper.week || 0,
        range: "",
        score: score,
        total: paper.questions.length,
        answers: answers,
        wrong: wrong
      };
      toast("⏳ 正在提交成绩…");
      fetch(EXAM_SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) {
          toast("✅ 成绩已自动存档（" + j.score + "）到 GitHub，站点 1~2 分钟内更新");
        } else {
          toast("⚠️ 提交失败：" + (j && j.error ? j.error : "未知错误") + "，可点「导出文本」手动存档");
        }
      }).catch(function () {
        toast("⚠️ 提交失败（网络），可点「导出文本」手动存档");
      });
    },
    /* 错题原因选择（块状按钮 + 自定义输入 → localStorage 持久化） */
    setWrongReason: function (dateStr, qIdx, reason) {
      var map = loadWrongReasons();
      map[wrongReasonKey(dateStr, qIdx)] = reason;
      saveWrongReasons(map);
      // 重新渲染当前 Tab（错题本 / 周测分析）
      renderKaogong();
    },
    setWrongReasonCustom: function (dateStr, qIdx, val) {
      var map = loadWrongReasons();
      map[wrongReasonKey(dateStr, qIdx)] = val;
      saveWrongReasons(map);
      // 局部更新：直接重写当前选择器高亮 + 标签，无需全 Tab 重渲染
      var sel = document.querySelector('.reason-selector[data-rk="' + dateStr + '_' + qIdx + '"]');
      if (sel) {
        sel.querySelectorAll(".reason-btn").forEach(function (b) { b.classList.remove("selected"); });
        // 自定义值高亮"其他"按钮
        var otherBtn = sel.querySelector(".reason-btn:last-child");
        if (otherBtn) otherBtn.classList.add("selected");
      }
      // 同步错题本标签（如果当前在错题本）
      var card = document.querySelector('.wrong-card[data-wk="' + dateStr + '_' + qIdx + '"]');
      if (card) {
        var tagsRow = card.querySelector(".wrong-card-title");
        if (tagsRow) {
          // 找现有的 reason 标签并更新
          var oldTag = tagsRow.querySelector(".sector-tag");
          if (oldTag) oldTag.outerHTML = '<span class="sector-tag" style="background:rgba(94,123,90,.15);color:#3a7a4d;">✓ ' + esc(val) + '</span>';
        }
      }
    },
    focusCustomReason: function (dateStr, qIdx) {
      var inp = document.getElementById("reasonInput_" + dateStr + "_" + qIdx);
      if (inp) { inp.focus(); inp.select(); }
    },
    /* 从错题/周测切到知识考点 Tab 的指定日期 */
    jumpToKgDate: function (dateStr) {
      if (!kgHistoryByDate[dateStr]) return;
      // 切换到考公页 + 知识考点 Tab
      if (state.page !== "kaogong") switchPage("kaogong");
      if (state.kgTab !== "kg-knowledge") switchTab("kg", "kg-knowledge");
      // 选中日期
      state.kgSelectedDate = dateStr;
      state.kgCalendarMonth = dateStr.slice(0, 7);
      state.kgCalendarExpanded = false;
      state.kgSearchQuery = "";
      renderKaogong();
    },
    /* 理财「今日知识」Tab：选中日期（本周按钮点击） */
    selectLcDate: function (dateStr) {
      if (!lcHistoryByDate[dateStr]) return;
      state.lcSelectedDate = dateStr;
      renderLicai();
    },
    /* 理财概念按钮跳转到对应日期推送 */
    jumpToLcDate: function (dateStr) {
      if (!lcHistoryByDate[dateStr]) return;
      if (state.page !== "licai") switchPage("licai");
      if (state.lcTab !== "lc-know") switchTab("lc", "lc-know");
      state.lcSelectedDate = dateStr;
      state.lcCalendarExpanded = false;
      state.lcCalendarMonth = dateStr.slice(0, 7);
      renderLicai();
    },
    /* 理财日期导航：展开/收起月历 */
    toggleLcCalendar: function () {
      state.lcCalendarExpanded = !state.lcCalendarExpanded;
      if (state.lcCalendarExpanded && !state.lcCalendarMonth) {
        state.lcCalendarMonth = state.lcSelectedDate.slice(0, 7);
      }
      renderLicai();
    },
    /* 理财月历：上月/下月切换 */
    shiftLcMonth: function (delta) {
      var cur = state.lcCalendarMonth || state.lcSelectedDate.slice(0, 7);
      state.lcCalendarMonth = shiftMonth(cur, delta);
      renderLicai();
    }
  };

  /* ── 检索输入框：仅刷新内容区，搜索框自身不重渲染以保留焦点 ── */
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "kgSearchInput") {
      state.kgSearchQuery = e.target.value;
      refreshKgContentArea();
    }
  });

  /* ── 笔记按钮事件委托（点开/保存/取消） ── */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-note-key]");
    if (btn) {
      var k = btn.getAttribute("data-note-key");
      var card = btn.closest(".kp-card, .know-card");
      if (!card) return;
      // 若编辑器已展开则关闭
      var exist = card.querySelector('.note-editor[data-note-editor="' + k + '"]');
      if (exist) { exist.remove(); return; }
      // 否则展开编辑器
      card.insertAdjacentHTML("beforeend", noteEditorHtml(k.split("::")[0], k.split("::")[1], k.split("::")[2]));
      var ta = card.querySelector('.note-editor[data-note-editor="' + k + '"] textarea');
      if (ta) ta.focus();
      return;
    }
    var sv = e.target.closest("[data-note-save]");
    if (sv) {
      var key = sv.getAttribute("data-note-save");
      var editor = sv.closest(".note-editor");
      var ta = editor ? editor.querySelector("textarea") : null;
      var text = ta ? ta.value : "";
      notesAll[key] = text;
      saveAllNotes(notesAll);
      // 重渲染当前 Tab
      var card = sv.closest(".kp-card, .know-card");
      var section = card && card.classList.contains("kp-card") ? "kg" : "lc";
      if (state.page === "kaogong" || state.page === "licai") {
        if (section === "kg") renderKaogong();
        else renderLicai();
      } else {
        renderHome();
      }
      toast(text.trim() ? "✅ 笔记已保存到本设备" : "🗑️ 已清空笔记");
      return;
    }
    var cn = e.target.closest("[data-note-cancel]");
    if (cn) {
      var ed = cn.closest(".note-editor");
      if (ed) ed.remove();
      return;
    }
  });

  /* ═════════════════════════════════
     初始化
     ═════════════════════════════════ */

  /* 侧边栏 badge */
  var badgeKg = document.getElementById("badge-kg");
  badgeKg.textContent = "D" + D.kaogong.progress.day;
  badgeKg.classList.remove("empty");
  var badgeLc = document.getElementById("badge-lc");
  badgeLc.textContent = "D" + D.licai.progress.day;
  badgeLc.classList.remove("empty");

  /* 全局连续天数 */
  document.getElementById("global-streak").innerHTML = "🔥 连续 " + totalDays + " 天";

  /* 默认渲染首页 */
  renderHome();

})();
