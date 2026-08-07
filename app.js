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
  function parseKaogong(md) {
    // 模块名 / 天数：优先用 progress.json（数据事实源），不再依赖 md 里的"今日模块"
    var moduleName = (D.kaogong.modules && D.kaogong.modules[D.kaogong.progress.last_module]) || "—";
    var day = D.kaogong.progress.day || 1;

    // 拆分知识点：兼容 ## 与 ###（新每日推送用三级标题 ### 知识点 N：）
    var segs = md.split(/\n[#]{2,3} 知识点 \d+：/).slice(1);

    var points = segs.map(function (seg) {
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
    return historyMd.map(function (h) {
      var parsed = parserFn(h.md || "");
      return { date: h.date, parsed: parsed };
    });
  }

  var kgHistory = parseHistory(D.kaogong.history_md, parseKaogong);
  var lcHistory = parseHistory(D.licai.history_md, parseLicai);

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
    lcTab: "lc-hot"        // 理财子 tab
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

  /* -- Tab: 知识考点 -- */
  function renderKgKnowledge() {
    var lastMod = D.kaogong.progress.last_module || 0;
    var dotsHtml = "";
    D.kaogong.modules.forEach(function (m, i) {
      var cls = i < lastMod ? "done" : (i === lastMod ? "current" : "");
      dotsHtml += '<div class="module-dot ' + cls + '">' + (i + 1) + '</div>';
    });

    var kpHtml = "";
    kg.points.forEach(function (p, idx) {
      var stem = p.qLines[0] || "";
      var opts = p.qLines.slice(1).map(function (o) { return '<div class="opt">' + esc(o) + "</div>"; }).join("");
      kpHtml +=
        '<div class="kp-card fade">' +
          '<div class="kp-title"><span class="kp-num">' + (idx+1) + '</span>' + esc(p.title) + '</div>' +
          (p.jiangjie ?
            '<div class="kp-explain">📌 ' + esc(p.jiangjie) + '</div>' : '') +
          (p.koujue ?
            '<div class="kp-mnemonic"><span class="mn-label">🧠 口诀</span>' + esc(p.koujue) + '</div>' : '') +
          '<details><summary>展开原题 / 解析</summary>' +
            '<div class="kp-q"><div class="stem">' + esc(stem) + '</div>' + opts + '</div>' +
            (p.answer ? '<div class="kp-ans">答案：<span class="ok">' + esc(p.answer) + '</span></div>' : '') +
            (p.jiexi ? '<div class="kp-exp">💡 ' + esc(p.jiexi) + '</div>' : '') +
          '</details>' +
          noteBtnHtml("kaogong", D.snapshot_date, idx) +
          noteDisplayHtml("kaogong", D.snapshot_date, idx) +
        '</div>';
    });

    document.getElementById("kg-content").innerHTML =
      '<div class="kg-card fade">' +
        '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">🗺️ 模块进度</h3>' +
        '<div class="module-ring">' + dotsHtml + '</div>' +
        '<div style="font-size:var(--fs-xs);color:var(--mist);margin-top:var(--sp-1);">' +
          '当前：<b>' + esc(kg.moduleName) + '</b> · DAY ' + kg.day +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3);">' +
        '<span style="font-size:var(--fs-md);font-weight:500;">📖 今日知识考点</span>' +
        '<span style="font-family:var(--mono);font-size:var(--fs-xs);color:var(--mist);background:var(--kg-bg);padding:2px 10px;border-radius:10px;">DAY ' + kg.day + '</span>' +
        '<span style="font-family:var(--mono);font-size:var(--fs-xs);color:var(--mist);">来自「' + D.snapshot_date + '.md」</span>' +
      '</div>' +
      kpHtml;
  }

  /* -- Tab: 薄弱项 -- */
  function renderKgWeak() {
    var review = D.kaogong.weakness;
    var mods = D.kaogong.weakness_modules || [];
    if (review && (typeof review !== "string" || review.trim())) {
      var modBadges = mods.length
        ? '<div style="margin-bottom:var(--sp-3);">' +
            mods.map(function (m) { return '<span class="sector-tag" style="background:rgba(225,109,118,.12);color:#c95b6b;">⚠ ' + esc(m) + '</span>'; }).join(" ") +
          '</div>'
        : '';
      document.getElementById("kg-content").innerHTML =
        '<div class="kg-card fade">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">🎯 本周易错提示</h3>' +
          modBadges +
          '<div class="md-rendered">' + mdToHtml(review) + '</div>' +
        '</div>';
    } else {
      document.getElementById("kg-content").innerHTML =
        '<div class="weak-empty fade">' +
          '<div class="big-emoji">🎯</div>' +
          '<p>还没有薄弱项记录哦～<br/>完成几次「周末小测」后，系统会自动分析你的薄弱模块并展示在这里。</p>' +
          '<button class="action-btn" onclick="WB.navigate(\'kaogong\');WB.switchTab(\'kg\',\'kg-quiz\')">📊 去做周测</button>' +
        '</div>';
    }
  }

  /* -- Tab: 错题本 -- */
  function renderKgWrong() {
    if (D.kaogong.wrongbook && typeof D.kaogong.wrongbook === "string" && D.kaogong.wrongbook.trim()) {
      document.getElementById("kg-content").innerHTML =
        '<div class="kg-card fade">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">📝 我的错题本</h3>' +
          '<div class="md-rendered">' + mdToHtml(D.kaogong.wrongbook) + '</div>' +
        '</div>';
    } else {
      document.getElementById("kg-content").innerHTML =
        '<div class="wrong-empty fade">' +
          '<div class="big-emoji">📝</div>' +
          '<p>错题本是空的～<br/>每次「周末小测」做错的题目都会自动收录到这里，方便你针对性复习。</p>' +
          '<button class="action-btn" onclick="WB.navigate(\'kaogong\');WB.switchTab(\'kg\',\'kg-quiz\')">📊 去做周测</button>' +
        '</div>';
    }
  }

  /* -- Tab: 周测分析 -- */
  function renderKgQuiz() {
    var quiz = D.kaogong.weekly_quiz;
    var summary = D.kaogong.weekly_summary;
    var range = D.kaogong.weekly_range;
    var rangeTag = (range && range.length === 2)
      ? '<span class="sector-tag" style="background:var(--kg-bg);color:var(--kg-accent);">' + esc(range[0]) + ' ~ ' + esc(range[1]) + '</span>'
      : '';
    if (quiz && typeof quiz === "string" && quiz.trim()) {
      document.getElementById("kg-content").innerHTML =
        '<div class="kg-card fade">' +
          '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">📊 本周真题回顾</h3>' +
          rangeTag +
          '<div class="md-rendered">' + mdToHtml(quiz) + '</div>' +
        '</div>' +
        (summary
          ? '<div class="kg-card fade" style="margin-top:var(--sp-3);">' +
              '<h3 style="font-size:var(--fs-md);color:var(--kg-accent);margin-bottom:var(--sp-2);">📚 本周知识索引</h3>' +
              '<div class="md-rendered">' + mdToHtml(summary) + '</div>' +
            '</div>'
          : '');
    } else {
      document.getElementById("kg-content").innerHTML =
        '<div class="quiz-empty fade">' +
          '<div class="big-emoji">📊</div>' +
          '<p>周测统计还在等你～<br/>每周六晚上会自动触发「周末小测」，完成后这里会展示正确率、用时、薄弱维度等分析图表。</p>' +
          '<div class="cta" style="margin-top:var(--sp-3);text-align:left;border-radius:var(--radius-sm);padding:var(--sp-4);">' +
            '<b>💡 如何开始？</b><br/>' +
            '在 WorkBuddy 对话中回复 <b>「开始小测」</b>，即可逐题作答。<br/>' +
            '收齐 10 题后当场打分、逐题解析，并自动更新薄弱项与错题本。' +
          '</div>' +
        '</div>';
    }
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
  function renderLcKnow() {
    var lvlIdx = parseInt((D.licai.progress.level || "L1").replace("L",""), 10) - 1;
    var ladderHtml = "";
    D.licai.levels.forEach(function (lv, i) {
      var cls = i < lvlIdx ? "done" : (i === lvlIdx ? "on" : "off");
      ladderHtml += '<div class="ladder-step ' + cls + '"><span class="ladder-num">' + (i+1) + '</span>' + esc(lv) + '</div>';
    });
    var coveredTags = (D.licai.progress.covered || []).map(function (c) {
      return '<span class="covered-tag">' + esc(c) + '</span>';
    }).join("");

    document.getElementById("lc-content").innerHTML =
      '<div class="lc-card fade">' +
        '<h3 style="font-size:var(--fs-md);color:var(--lc-accent);margin-bottom:var(--sp-3);">📈 认知进阶</h3>' +
        '<div class="ladder">' + ladderHtml + '</div>' +
        (coveredTags ?
          '<div style="margin-top:var(--sp-3);"><span style="font-size:var(--fs-xs);color:var(--mist);">已覆盖概念：</span>' +
          '<div class="covered-tags">' + coveredTags + '</div></div>' :
          '<p style="font-size:var(--fs-sm);color:var(--mist);margin-top:var(--sp-2);">已覆盖概念将逐日累积于此。</p>') +
      '</div>' +
      '<div class="know-card fade">' +
        '<div class="know-title">' + esc(cj.knowName) + '</div>' +
        '<div class="know-level">📊 ' + esc(cj.knowLevel) + '</div>' +
        '<ul class="know-list">' +
          '<li><b>大白话：</b>' + esc(cj.dabai) + '</li>' +
          '<li><b>生活化比喻：</b>' + esc(cj.biyu) + '</li>' +
          '<li><b>注意什么：</b>' + esc(cj.zhuyi) + '</li>' +
        '</ul>' +
        (cj.tip ? '<div class="know-tip">💡 ' + esc(cj.tip) + '</div>' : '') +
        noteBtnHtml("licai", D.snapshot_date, 0) +
        noteDisplayHtml("licai", D.snapshot_date, 0) +
      '</div>';
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
      (summary
        ? '<div class="lc-card fade" style="margin-top:var(--sp-3);">' +
            '<div class="md-rendered">' + mdToHtml(summary) + '</div>' +
          '</div>'
        : '') +
      '<div style="margin-top:var(--sp-3);font-size:var(--fs-xs);color:var(--mist);text-align:right;">' +
        '📅 想看某一天的具体内容？切到「今日知识」Tab ↓' +
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
    exportNotes: exportNotesJson
  };

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
