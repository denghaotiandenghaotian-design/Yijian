/* =====================================================================
 * 一级建造师 · 全能备考系统  —  应用引擎与核心模块
 * 纯前端 / 纯浏览器全局数据，无需服务器，file:// 直接打开即可运行。
 * ===================================================================== */
(function () {
  "use strict";

  /* ----------------------------- 常量 ----------------------------- */
  var SUBJECT_KEYS = ["economy", "law", "management", "practice"];
  var LS_KEY = "yj_state_v1";

  /* ----------------------------- 工具 ----------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function todayStr(d) {
    d = d || new Date();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function expl(q) { return (q.explanation || q.analysis || "（暂无解析）"); }

  /* 数据归一化：兼容不同字段命名（stem/content、answer 数组或字符串） */
  function normalizeData() {
    SUBJECT_KEYS.forEach(function (k) {
      var s = YJ_DATA[k]; if (!s || !s.questions) return;
      s.questions.forEach(function (q) {
        if (!q.stem && q.content) q.stem = q.content;
        if (!q.stem && q.question) q.stem = q.question;
        if (typeof q.answer === "string") q.answer = [q.answer];
        else if (Array.isArray(q.answer) && q.answer.length === 1 && q.answer[0].length > 1 && q.answer[0].indexOf(",") >= 0) {
          q.answer = q.answer[0].split(","); // 兜底：防止 "A,B" 误存
        }
        if (q.type === "case" && q.subQuestions) {
          q.subQuestions.forEach(function (sq) {
            if (sq.a == null && sq.answer != null) sq.a = sq.answer;
          });
        }
      });
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtMin(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }
  function cap(v, max) { return Math.max(0, Math.min(100, Math.round((v / max) * 100))); }

  /* ----------------------------- 状态 ----------------------------- */
  var state = loadState();
  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { attempts: {}, wrong: {}, stats: {}, mock: [], achievements: {}, streak: 0, lastActive: "" };
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function todayStat() {
    var t = todayStr();
    if (!state.stats[t]) state.stats[t] = { practice: 0, correct: 0, minutes: 0, recitation: 0, exam: 0 };
    return state.stats[t];
  }
  function touchStreak() {
    var t = todayStr();
    if (state.lastActive === t) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yStr = todayStr(y);
    if (state.lastActive === yStr) state.streak = (state.streak || 0) + 1;
    else state.streak = 1;
    state.lastActive = t;
    saveState();
  }

  /* --------------------------- 数据访问 --------------------------- */
  function subj(key) { return YJ_DATA[key]; }
  function subjList() { return SUBJECT_KEYS.map(subj); }
  function qOf(key) { return (YJ_DATA[key] && YJ_DATA[key].questions) || []; }
  function curKey() { return $("#subjectFilter").value; }
  function activeSubjects() {
    var k = curKey();
    return k === "all" ? SUBJECT_KEYS.slice() : [k];
  }
  function activeQuestions() {
    var out = [];
    activeSubjects().forEach(function (k) { out = out.concat(qOf(k)); });
    return out;
  }
  function subjKeyOfQ(q) {
    for (var i = 0; i < SUBJECT_KEYS.length; i++) {
      if (YJ_DATA[SUBJECT_KEYS[i]].questions.indexOf(q) >= 0) return SUBJECT_KEYS[i];
    }
    return "economy";
  }

  /* --------------------------- 答题判定 --------------------------- */
  function isCorrect(q, selected) {
    if (!q.answer || !selected || !selected.length) return false;
    if (q.type === "multiple") {
      var a = q.answer.slice().sort().join(",");
      var s = selected.slice().sort().join(",");
      return a === s;
    }
    return q.answer[0] === selected[0];
  }
  // 多选计分（官方规则）
  function multiScore(q, selected) {
    if (!selected || !selected.length) return 0;
    var ans = q.answer;
    var hasWrong = selected.some(function (x) { return ans.indexOf(x) < 0; });
    if (hasWrong) return 0;
    var right = selected.filter(function (x) { return ans.indexOf(x) >= 0; }).length;
    return Math.round(right * 0.5 * 10) / 10; // 每正确项 0.5 分
  }

  /* --------------------------- 记录行为 --------------------------- */
  function recordAttempt(q, correct) {
    var id = q.id;
    if (!state.attempts[id]) state.attempts[id] = { right: 0, wrong: 0 };
    if (correct) state.attempts[id].right++; else state.attempts[id].wrong++;
    var st = todayStat();
    st.practice++;
    if (correct) st.correct++;
    if (!correct) {
      if (!state.wrong[id]) state.wrong[id] = { count: 0, last: "", mastered: false, fav: false };
      state.wrong[id].count++;
      state.wrong[id].last = todayStr();
    }
    saveState();
  }
  function markMastered(qid) {
    if (state.wrong[qid]) { state.wrong[qid].mastered = true; }
    saveState();
  }
  function toggleFav(qid) {
    if (!state.wrong[qid]) state.wrong[qid] = { count: 0, last: "", mastered: false, fav: false };
    state.wrong[qid].fav = !state.wrong[qid].fav;
    saveState();
  }

  /* ====================================================================
   *  渲染调度
   * ==================================================================== */
  var view = "dashboard";
  function render() {
    touchStreak();
    updateStreakBox();
    var c = $("#content");
    c.innerHTML = "";
    if (view === "dashboard") renderDashboard(c);
    else if (view === "practice") renderPracticeHome(c);
    else if (view === "review") renderReview(c);
    else if (view === "wrongbook") renderWrongbook(c);
    else if (view === "exam") renderExamHome(c);
    else if (view === "progress") renderProgress(c);
    else if (view === "knowledge") renderKnowledge(c);
    else if (view === "lectures") renderLectures(c);
    else if (view === "mindmap") renderMindmap(c);
    else if (view === "papers") renderPapers(c);
    else if (view === "forecast") renderForecast(c);
    window.scrollTo(0, 0);
  }
  function updateStreakBox() {
    $("#streakBox").textContent = "🔥 连续学习 " + (state.streak || 0) + " 天";
  }

  var TITLES = {
    dashboard: "学习概览", practice: "题库练习", review: "章节复习",
    wrongbook: "错题收藏", exam: "模拟考试", progress: "进度跟踪",
    knowledge: "考点知识库", lectures: "名师讲课",
    mindmap: "考点思维导图", papers: "试卷库",
    forecast: "2027考试预测"
  };

  /* ====================================================================
   *  视图 1：学习概览（Dashboard）
   * ==================================================================== */
  function renderDashboard(c) {
    $("#viewTitle").textContent = TITLES.dashboard;
    var st = todayStat();
    var totalQ = SUBJECT_KEYS.reduce(function (n, k) { return n + qOf(k).length; }, 0);
    var attempted = Object.keys(state.attempts).length;
    var wrongCount = Object.keys(state.wrong).filter(function (id) { return !state.wrong[id].mastered; }).length;
    var force = computeForce();

    var grid = el("div", "grid grid-4");
    grid.appendChild(statCard(st.practice, "今日刷题", "题"));
    grid.appendChild(statCard(st.correct > 0 && st.practice > 0 ? Math.round(st.correct / st.practice * 100) : 0, "今日正确率", "%"));
    grid.appendChild(statCard(st.minutes, "今日学习", "分钟"));
    grid.appendChild(statCard(wrongCount, "待攻克错题", "道"));
    c.appendChild(grid);

    var row = el("div", "grid", "");
    row.style.gridTemplateColumns = "320px 1fr";
    row.style.marginTop = "18px";

    // 学习力指数
    var fcard = el("div", "card");
    fcard.appendChild(sectionTitle("⚡ 今日学习力指数"));
    var ring = el("div", "force-ring");
    ring.style.setProperty("--p", force.total);
    ring.innerHTML = '<div class="inner"><div class="v">' + force.total + '</div><div class="t">' +
      (force.total >= 80 ? "学霸模式" : force.total >= 60 ? "稳步提升" : force.total >= 40 ? "尚需努力" : "起步阶段") + "</div></div>";
    fcard.appendChild(ring);
    var comp = el("div"); comp.style.marginTop = "14px";
    [["学习时长", force.time, st.minutes + "/120分"], ["刷题量", force.practice, st.practice + "/50题"],
     ["正确率", force.acc, st.practice ? Math.round(st.correct / st.practice * 100) + "%" : "—"],
     ["背诵打卡", force.recite, st.recitation + "/10条"], ["连续性", force.streak, (state.streak || 0) + "天"]].forEach(function (r) {
      var b = el("div"); b.style.marginTop = "10px";
      b.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-dim)"><span>' + r[0] + '</span><span>' + r[2] + '</span></div>';
      b.appendChild(bar(r[1]));
      comp.appendChild(b);
    });
    fcard.appendChild(comp);
    row.appendChild(fcard);

    // 科目进度 + 快捷入口
    var rcard = el("div", "card");
    rcard.appendChild(sectionTitle("📘 四科掌握进度"));
    SUBJECT_KEYS.forEach(function (k) {
      var s = subj(k);
      var qs = qOf(k);
      var att = qs.filter(function (q) { return state.attempts[q.id]; }).length;
      var right = qs.reduce(function (n, q) { return n + (state.attempts[q.id] ? state.attempts[q.id].right : 0); }, 0);
      var acc = att ? Math.round(right / (right + qs.reduce(function (n, q) { return n + (state.attempts[q.id] ? state.attempts[q.id].wrong : 0); }, 0)) * 100) : 0;
      var pct = att ? Math.round(att / qs.length * 100) : 0;
      var item = el("div"); item.style.marginBottom = "14px";
      item.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px"><span>' + s.name + '</span><span class="muted">已练 ' + att + "/" + qs.length + " · 正确率 " + (att ? acc : 0) + "%</span></div>";
      item.appendChild(bar(pct));
      rcard.appendChild(item);
    });
    rcard.appendChild(el("div", "", '<div class="muted" style="margin-top:8px">题库总量 <b class="hl">' + totalQ + '</b> 题 · 已录入错题 <b class="hl">' + wrongCount + '</b> 道 · 模考 <b class="hl">' + state.mock.length + '</b> 次</div>'));
    row.appendChild(rcard);
    c.appendChild(row);

    // 快捷入口 + 最近成就
    var acts = el("div", "grid grid-3");
    acts.style.marginTop = "18px";
    [["📝 开始刷题", "practice"], ["🏛️ 全真模考", "exam"], ["📕 复习错题", "wrongbook"]].forEach(function (a) {
      var b = el("div", "card", '<div style="font-size:15px;font-weight:700">' + a[0] + '</div><div class="muted" style="margin-top:6px">点击进入对应模块</div>');
      b.style.cursor = "pointer"; b.onclick = function () { goto(a[1]); };
      acts.appendChild(b);
    });
    c.appendChild(acts);

    c.appendChild(renderAchievements(false));
  }
  function statCard(num, lbl, unit) {
    var d = el("div", "card stat-big");
    d.innerHTML = '<div class="num">' + num + '<span style="font-size:14px;color:var(--text-mute)"> ' + unit + '</span></div><div class="lbl">' + lbl + '</div>';
    return d;
  }
  function bar(pct) {
    var b = el("div", "bar"); var i = el("i"); i.style.width = Math.max(0, Math.min(100, pct)) + "%"; b.appendChild(i); return b;
  }
  function sectionTitle(t) { return el("div", "section-title", t); }

  function computeForce() {
    var st = todayStat();
    var time = cap(st.minutes, 120);
    var practice = cap(st.practice, 50);
    var acc = st.practice ? Math.round(st.correct / st.practice * 100) : 0;
    var recite = cap(st.recitation, 10);
    var streak = cap(state.streak || 0, 14);
    var total = Math.round(time * 0.25 + practice * 0.25 + acc * 0.20 + recite * 0.15 + streak * 0.15);
    return { total: total, time: time, practice: practice, acc: acc, recite: recite, streak: streak };
  }

  /* ====================================================================
   *  成就系统
   * ==================================================================== */
  var ACHIEVEMENTS = [
    { id: "bronze", ico: "🥉", name: "青铜学习者", desc: "连续学习 7 天", check: function () { return (state.streak || 0) >= 7; } },
    { id: "silver", ico: "🥈", name: "白银自律者", desc: "连续学习 30 天", check: function () { return (state.streak || 0) >= 30; } },
    { id: "500q", ico: "📝", name: "五百题斩", desc: "累计刷题 500 题", check: function () { return totalAttempts() >= 500; } },
    { id: "1000q", ico: "⚔️", name: "千题斩", desc: "累计刷题 1000 题", check: function () { return totalAttempts() >= 1000; } },
    { id: "pass", ico: "🎓", name: "准一建人", desc: "任一科模考达及格线", check: function () { return state.mock.some(function (m) { return m.pass; }); } },
    { id: "clear10", ico: "🧹", name: "错题清道夫", desc: "消灭 10 道错题", check: function () { return Object.keys(state.wrong).filter(function (id) { return state.wrong[id].mastered; }).length >= 10; } },
    { id: "perfect", ico: "💯", name: "全对王", desc: "单次练习满分收官", check: function () { return state.flags && state.flags.perfect; } }
  ];
  function totalAttempts() {
    return Object.keys(state.attempts).reduce(function (n, id) { return n + state.attempts[id].right + state.attempts[id].wrong; }, 0);
  }
  function checkAchievements() {
    ACHIEVEMENTS.forEach(function (a) {
      if (!state.achievements[a.id] && a.check()) {
        state.achievements[a.id] = todayStr();
      }
    });
    saveState();
  }
  function renderAchievements(full) {
    var wrap = el("div", "card");
    wrap.style.marginTop = "18px";
    wrap.appendChild(sectionTitle("🏆 成就里程碑"));
    var grid = el("div", "grid grid-4");
    ACHIEVEMENTS.forEach(function (a) {
      var got = !!state.achievements[a.id];
      var b = el("div", "badge" + (got ? "" : " locked"));
      b.innerHTML = '<div class="ico">' + a.ico + '</div><div><div class="bt">' + a.name + (got ? " ✓" : "") + '</div><div class="bd">' + a.desc + (got ? " · " + state.achievements[a.id] : "") + '</div></div>';
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  /* ====================================================================
   *  视图 2：题库练习
   * ==================================================================== */
  var session = null;
  function renderPracticeHome(c) {
    $("#viewTitle").textContent = TITLES.practice;
    var card = el("div", "card");
    card.style.maxWidth = "720px";
    card.appendChild(sectionTitle("🎯 组卷设置"));

    var subjSel = selectFrom(activeSubjects().map(function (k) { return { v: k, t: subj(k).name }; }), curKey());
    var typeSel = selectFrom([{ v: "all", t: "全部题型" }, { v: "single", t: "单选题" }, { v: "multiple", t: "多选题" }, { v: "case", t: "实务案例" }], "all");
    var countSel = selectFrom([10, 15, 20, 30].map(function (n) { return { v: n, t: n + " 题" }; }), 10);
    var modeSel = selectFrom([{ v: "random", t: "随机练习" }, { v: "weak", t: "薄弱错题优先" }], "random");

    var f = el("div");
    f.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px";
    f.appendChild(field("科目", subjSel));
    f.appendChild(field("题型", typeSel));
    f.appendChild(field("题量", countSel));
    f.appendChild(field("模式", modeSel));
    card.appendChild(f);

    var note = el("div", "muted", "说明：练习即时判分并显示解析；错题自动进入「错题收藏」。多选规则——全对 2 分 / 少选每对 0.5 分 / 错选 0 分。");
    note.style.marginBottom = "16px";
    card.appendChild(note);

    var btn = el("button", "btn btn-primary", "▶ 开始练习");
    btn.onclick = function () {
      startSession({
        subjects: activeSubjects(),
        type: typeSel.value,
        count: parseInt(countSel.value, 10),
        mode: modeSel.value
      });
    };
    card.appendChild(btn);
    c.appendChild(card);
  }
  function field(label, control) {
    var d = el("div");
    d.appendChild(el("div", "muted", label));
    control.style.marginTop = "6px"; control.style.width = "100%";
    d.appendChild(control);
    return d;
  }
  function selectFrom(items, def) {
    var s = el("select", "select");
    items.forEach(function (it) {
      var o = el("option"); o.value = it.v; o.textContent = it.t;
      if (it.v == def) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  function startSession(cfg) {
    var pool = [];
    cfg.subjects.forEach(function (k) {
      qOf(k).forEach(function (q) {
        if (cfg.type === "all" || q.type === cfg.type) pool.push(q);
      });
    });
    if (cfg.mode === "weak") {
      var wrongIds = Object.keys(state.wrong).filter(function (id) { return !state.wrong[id].mastered; });
      var weak = pool.filter(function (q) { return wrongIds.indexOf(q.id) >= 0; });
      pool = weak.concat(pool.filter(function (q) { return wrongIds.indexOf(q.id) < 0; }));
    }
    pool = shuffle(pool).slice(0, cfg.count);
    if (!pool.length) { alert("当前筛选条件下没有可用题目，请调整设置。"); return; }
    session = { list: pool, idx: 0, correct: 0, results: [], answered: false, selected: [] };
    renderSession();
  }
  function renderSession() {
    var c = $("#content"); c.innerHTML = "";
    $("#viewTitle").textContent = "练习 · 第 " + (session.idx + 1) + "/" + session.list.length + " 题";
    var q = session.list[session.idx];
    var card = el("div", "card"); card.style.maxWidth = "820px"; card.style.margin = "0 auto";

    var head = el("div", "q-head");
    head.innerHTML = '<div><span class="chip chip-gold">' + subj(subjKeyOfQ(q)).name + '</span> ' +
      '<span class="chip chip-blue">' + typeName(q.type) + '</span> ' +
      '<span class="chip chip-gray">难度 ' + stars(q.difficulty) + '</span> ' +
      '<span class="chip chip-gray">章节 ' + q.chapter + '</span></div>' +
      '<div class="muted">进度 ' + (session.idx + 1) + ' / ' + session.list.length + '</div>';
    card.appendChild(head);

    if (q.type === "case") { renderCaseInSession(card, q); c.appendChild(card); return; }

    card.appendChild(el("div", "q-stem", escapeHtml(q.stem)));
    var optWrap = el("div");
    session.selected = [];
    session.answered = false;
    q.options.forEach(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      var ob = el("button", "option", escapeHtml(opt));
      ob.onclick = function () { onSelectOption(ob, letter, q, optWrap); };
      optWrap.appendChild(ob);
    });
    card.appendChild(optWrap);

    var actions = el("div"); actions.style.marginTop = "16px"; actions.style.display = "flex"; actions.style.gap = "10px";
    var submit = el("button", "btn btn-primary", "提交答案");
    submit.onclick = function () { submitSessionAnswer(q, optWrap, submit, actions); };
    actions.appendChild(submit);
    card.appendChild(actions);
    c.appendChild(card);
  }
  function onSelectOption(btn, letter, q, wrap) {
    if (session.answered) return;
    if (q.type === "single") {
      $all(".option", wrap).forEach(function (o) { o.classList.remove("sel"); });
      btn.classList.add("sel");
      session.selected = [letter];
    } else {
      btn.classList.toggle("sel");
      if (btn.classList.contains("sel")) session.selected.push(letter);
      else session.selected = session.selected.filter(function (x) { return x !== letter; });
    }
  }
  function submitSessionAnswer(q, wrap, submitBtn, actions) {
    if (!session.selected.length) { alert("请先选择答案。"); return; }
    session.answered = true;
    var correct = isCorrect(q, session.selected);
    if (correct) session.correct++;
    // 高亮
    $all(".option", wrap).forEach(function (ob, i) {
      var letter = String.fromCharCode(65 + i);
      ob.onclick = null;
      if (q.answer.indexOf(letter) >= 0) ob.classList.add("correct");
      else if (session.selected.indexOf(letter) >= 0) ob.classList.add("wrong");
    });
    var fb = el("div", correct ? "explain ok" : "explain no",
      (correct ? "✅ 回答正确！答案：" + q.answer.join("、") : "❌ 回答错误。正确答案：" + q.answer.join("、")));
    fb.style.background = correct ? "rgba(62,201,138,.1)" : "rgba(232,96,76,.1)";
    fb.style.borderColor = correct ? "rgba(62,201,138,.4)" : "rgba(232,96,76,.4)";
    wrap.parentNode.insertBefore(fb, actions);
    var ex = el("div", "explain", "<b>解析：</b>" + escapeHtml(expl(q)));
    wrap.parentNode.insertBefore(ex, actions);
    recordAttempt(q, correct);
    checkAchievements();

    submitBtn.remove();
    var next = el("button", "btn btn-primary", session.idx + 1 < session.list.length ? "下一题 →" : "查看结果 🏁");
    next.onclick = function () {
      session.idx++;
      if (session.idx < session.list.length) renderSession();
      else renderSessionResult();
    };
    actions.appendChild(next);
  }
  function renderCaseInSession(card, q) {
    card.appendChild(el("div", "q-stem", escapeHtml(q.stem)));
    var list = el("div");
    q.subQuestions.forEach(function (sq, i) {
      var item = el("div", "card"); item.style.marginBottom = "12px"; item.style.padding = "14px";
      item.innerHTML = '<div style="font-weight:600;margin-bottom:8px">' + escapeHtml(sq.q) + '</div>';
      var reveal = el("button", "btn btn-ghost btn-sm", "显示标准答案");
      var ansBox = el("div", "explain", "<b>标准采分点：</b>" + escapeHtml(sq.a));
      ansBox.style.display = "none"; ansBox.style.marginTop = "10px";
      reveal.onclick = function () { ansBox.style.display = "block"; reveal.style.display = "none"; recordRecite(); };
      item.appendChild(reveal); item.appendChild(ansBox);
      list.appendChild(item);
    });
    card.appendChild(list);
    var back = el("button", "btn btn-primary", "完成并返回");
    back.style.marginTop = "8px";
    back.onclick = function () { goto("practice"); };
    card.appendChild(back);
  }
  function recordRecite() { var st = todayStat(); st.recitation++; saveState(); }

  function renderSessionResult() {
    var c = $("#content"); c.innerHTML = "";
    $("#viewTitle").textContent = "练习结果";
    var total = session.list.length;
    var pct = Math.round(session.correct / total * 100);
    // 薄弱章节
    var weakMap = {};
    session.list.forEach(function (q, i) {
      if (session.results && session.results[i] === false) weakMap[q.chapter] = (weakMap[q.chapter] || 0) + 1;
    });
    // 重新统计：results 可能未填充（用 correct 计数），改为基于 wrong 记录
    var wrongChapters = {};
    session.list.forEach(function (q) {
      if (state.wrong[q.id] && state.wrong[q.id].count) wrongChapters[q.chapter] = (wrongChapters[q.chapter] || 0) + 1;
    });
    var card = el("div", "card"); card.style.maxWidth = "700px"; card.style.margin = "0 auto"; card.style.textAlign = "center";
    card.appendChild(el("div", "", '<div style="font-size:46px;font-weight:800;color:var(--gold-soft)">' + session.correct + '/' + total + '</div>'));
    card.appendChild(el("div", "muted", "正确率 " + pct + "% · 本次练习已完成"));
    var weakHtml = Object.keys(wrongChapters).length
      ? '<div class="chip chip-red" style="margin:4px">' + Object.keys(wrongChapters).map(function (k) { return k + " ×" + wrongChapters[k]; }).join("</div><div class='chip chip-red' style='margin:4px'>") + "</div>"
      : '<span class="chip chip-green">本次无错题 🎉</span>';
    var wbox = el("div", "", '<div class="section-title" style="justify-content:center;margin-top:18px">🔴 建议重点复习章节</div>' + weakHtml);
    card.appendChild(wbox);
    var acts = el("div"); acts.style.marginTop = "20px";
    var again = el("button", "btn btn-primary", "再来一组");
    again.onclick = function () { goto("practice"); };
    var home = el("button", "btn btn-ghost", "返回首页");
    home.onclick = function () { goto("dashboard"); };
    acts.appendChild(again); acts.appendChild(home);
    card.appendChild(acts);
    c.appendChild(card);
  }

  function typeName(t) { return t === "single" ? "单选题" : t === "multiple" ? "多选题" : t === "case" ? "案例题" : "题"; }
  function stars(n) { n = n || 0; var s = ""; for (var i = 0; i < 5; i++) s += i < n ? "★" : "☆"; return s; }

  /* ====================================================================
   *  视图 3：章节复习
   * ==================================================================== */
  function renderReview(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.review;
    var k = curKey();
    if (k === "all") {
      var wrap = el("div", "grid grid-2");
      wrap.style.maxWidth = "860px";
      SUBJECT_KEYS.forEach(function (sk) {
        var s = subj(sk);
        var card = el("div", "card");
        card.innerHTML = '<div style="font-size:16px;font-weight:700;color:var(--gold-soft)">' + s.name + '</div>' +
          '<div class="muted" style="margin:6px 0 12px">共 ' + s.chapters.length + ' 章 · 点击展开考点</div>';
        var btn = el("button", "btn btn-primary btn-sm", "浏览章节");
        btn.onclick = function () { $("#subjectFilter").value = sk; renderReview(c); };
        card.appendChild(btn);
        wrap.appendChild(card);
      });
      c.appendChild(wrap);
      return;
    }
    var s = subj(k);
    var intro = el("div", "card");
    intro.style.marginBottom = "16px";
    intro.innerHTML = '<div style="font-size:15px;font-weight:700">' + s.name + ' · 章节考点速查</div>' +
      '<div class="muted" style="margin-top:6px">满分 ' + s.fullScore + ' 分 · 及格 ' + s.passScore + ' 分 · 考试时长 ' + s.examMinutes + ' 分钟</div>';
    c.appendChild(intro);

    var tree = el("div");
    s.chapters.forEach(function (ch) {
      var item = el("div", "chapter");
      var head = el("div", "ch-head");
      head.innerHTML = '<span class="code">' + ch.code + '</span><span>' + ch.name + '</span><span class="cnt">' + (ch.knowledge ? ch.knowledge.length : 0) + ' 考点</span>';
      var body = el("div", "kp-list"); body.style.display = "none";
      (ch.knowledge || []).forEach(function (kp) { body.appendChild(el("div", "kp", escapeHtml(kp))); });
      head.onclick = function () { item.classList.toggle("open"); body.style.display = item.classList.contains("open") ? "block" : "none"; };
      item.appendChild(head); item.appendChild(body);
      tree.appendChild(item);
    });
    c.appendChild(tree);

    // 速记卡（轻量背诵）
    var fc = el("div", "card"); fc.style.marginTop = "18px";
    fc.appendChild(sectionTitle("🃏 本章考点速记卡"));
    var allKp = [];
    s.chapters.forEach(function (ch) { (ch.knowledge || []).forEach(function (kp) { allKp.push({ ch: ch.code, text: kp }); }); });
    if (!allKp.length) { fc.appendChild(el("div", "muted", "暂无速记内容。")); }
    else {
      var idx = Math.floor(Math.random() * allKp.length);
      var card = el("div", "card"); card.style.textAlign = "center"; card.style.background = "var(--panel-2)";
      card.innerHTML = '<div class="muted">' + allKp[idx].ch + '</div><div style="font-size:15px;margin:10px 0;line-height:1.6">' + escapeHtml(allKp[idx].text) + '</div>';
      var next = el("button", "btn btn-ghost btn-sm", "换一张 ↻");
      next.onclick = function () { renderReview(c); };
      card.appendChild(next);
      fc.appendChild(card);
    }
    c.appendChild(fc);
  }

  /* ====================================================================
   *  视图 4：错题收藏
   * ==================================================================== */
  function renderWrongbook(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.wrongbook;
    var tabs = el("div"); tabs.style.display = "flex"; tabs.style.gap = "10px"; tabs.style.marginBottom = "16px";
    var active = wrongTab || "wrong";
    [["wrong", "错题本"], ["fav", "我的收藏"], ["redo", "错题重做"]].forEach(function (t) {
      var b = el("button", "btn btn-sm " + (active === t[0] ? "btn-primary" : "btn-ghost"), t[1]);
      b.onclick = function () { wrongTab = t[0]; renderWrongbook(c); };
      tabs.appendChild(b);
    });
    c.appendChild(tabs);

    if (active === "redo") { renderRedo(c); return; }

    var ids = Object.keys(state.wrong).filter(function (id) {
      var w = state.wrong[id];
      if (active === "fav") return w.fav;
      return !w.mastered;
    });
    if (!ids.length) {
      c.appendChild(el("div", "empty", active === "fav" ? "还没有收藏的题目，点击题目旁的 ★ 即可收藏。" : "🎉 当前没有待复习的错题，继续保持！"));
      return;
    }
    var total = ids.length, mastered = ids.filter(function (id) { return state.wrong[id].mastered; }).length;
    var stats = el("div", "muted", "共 " + total + " 道" + (active === "fav" ? "收藏" : "错题") + " · 已消灭 " + mastered + " 道");
    stats.style.marginBottom = "12px"; c.appendChild(stats);

    ids.sort(function (a, b) { return (state.wrong[b].count || 0) - (state.wrong[a].count || 0); });
    ids.forEach(function (id) {
      var q = findQ(id); if (!q) return;
      var row = el("div", "row");
      var info = el("div", "main-flex");
      info.innerHTML = '<div class="ttl">' + escapeHtml(q.stem.length > 60 ? q.stem.slice(0, 60) + "…" : q.stem) + '</div>' +
        '<div class="sub">' + subj(subjKeyOfQ(q)).name + ' · ' + typeName(q.type) + ' · 错 ' + (state.wrong[id].count || 0) + ' 次 · 最近 ' + (state.wrong[id].last || "—") + '</div>';
      var star = el("button", "star-btn" + (state.wrong[id].fav ? " on" : ""), "★");
      star.onclick = function () { toggleFav(id); renderWrongbook(c); };
      var master = el("button", "btn btn-sm btn-ghost", "标记掌握");
      master.onclick = function () { markMastered(id); renderWrongbook(c); };
      var show = el("button", "btn btn-sm btn-primary", "查看");
      show.onclick = function () { showQuestionModal(q); };
      row.appendChild(info); row.appendChild(star); row.appendChild(master); row.appendChild(show);
      c.appendChild(row);
    });
  }
  var wrongTab = "wrong";
  function renderRedo(c) {
    if (!redoList || !redoList.length) {
      var ids = Object.keys(state.wrong).filter(function (id) { return !state.wrong[id].mastered; });
      // 顽固优先
      ids.sort(function (a, b) { return (state.wrong[b].count || 0) - (state.wrong[a].count || 0); });
      redoList = ids.slice(0, 20).map(findQ).filter(Boolean);
      redoIdx = 0;
    }
    if (!redoList.length) { c.appendChild(el("div", "empty", "没有可重做的错题。")); return; }
    if (redoIdx >= redoList.length) {
      c.appendChild(el("div", "empty", "🎯 本轮重做完成！"));
      var reset = el("button", "btn btn-primary", "再来一轮");
      reset.onclick = function () { redoList = null; renderWrongbook(c); };
      c.appendChild(reset); return;
    }
    var q = redoList[redoIdx];
    var card = el("div", "card"); card.style.maxWidth = "820px"; card.style.margin = "0 auto";
    card.appendChild(el("div", "progress-line", "<span>错题重做 · 第 " + (redoIdx + 1) + "/" + redoList.length + " 题（历史错 " + (state.wrong[q.id] ? state.wrong[q.id].count : 0) + " 次）</span><span class='chip chip-red'>不显示答案</span>"));
    card.appendChild(el("div", "q-stem", escapeHtml(q.stem)));
    var wrap = el("div"); var sel = [];
    q.options.forEach(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      var ob = el("button", "option", escapeHtml(opt));
      ob.onclick = function () {
        if (q.type === "single") { $all(".option", wrap).forEach(function (o) { o.classList.remove("sel"); }); ob.classList.add("sel"); sel = [letter]; }
        else { ob.classList.toggle("sel"); if (ob.classList.contains("sel")) sel.push(letter); else sel = sel.filter(function (x) { return x !== letter; }); }
      };
      wrap.appendChild(ob);
    });
    card.appendChild(wrap);
    var submit = el("button", "btn btn-primary", "提交");
    submit.onclick = function () {
      if (!sel.length) { alert("请作答。"); return; }
      var correct = isCorrect(q, sel);
      $all(".option", wrap).forEach(function (ob, i) {
        var letter = String.fromCharCode(65 + i); ob.onclick = null;
        if (q.answer.indexOf(letter) >= 0) ob.classList.add("correct");
        else if (sel.indexOf(letter) >= 0) ob.classList.add("wrong");
      });
      var fb = el("div", correct ? "explain ok" : "explain no", correct ? "✅ 答对了！" : "❌ 仍答错，需加强。正确答案：" + q.answer.join("、"));
      fb.style.background = correct ? "rgba(62,201,138,.1)" : "rgba(232,96,76,.1)";
      card.appendChild(fb);
      card.appendChild(el("div", "explain", "<b>解析：</b>" + escapeHtml(expl(q))));
      if (correct) { var st = state.wrong[q.id]; if (st && st.pending) { st.mastered = true; delete st.pending; } else if (st) { st.pending = true; } saveState(); }
      else recordAttempt(q, false);
      submit.remove();
      var nx = el("button", "btn btn-primary", redoIdx + 1 < redoList.length ? "下一题 →" : "完成");
      nx.onclick = function () { redoIdx++; renderWrongbook(c); };
      card.appendChild(nx);
    };
    card.appendChild(submit);
    c.appendChild(card);
  }
  var redoList = null, redoIdx = 0;
  function findQ(id) {
    for (var i = 0; i < SUBJECT_KEYS.length; i++) {
      var found = qOf(SUBJECT_KEYS[i]).filter(function (q) { return q.id === id; })[0];
      if (found) return found;
    }
    return null;
  }
  function showQuestionModal(q) {
    var mask = el("div", "modal-mask show");
    var m = el("div", "modal");
    m.innerHTML = '<h3>' + subj(subjKeyOfQ(q)).name + ' · ' + typeName(q.type) + ' · ' + q.chapter + '</h3>' +
      '<div class="q-stem">' + escapeHtml(q.stem) + '</div>';
    if (q.type === "case") {
      q.subQuestions.forEach(function (sq) {
        m.appendChild(el("div", "explain", "<b>" + escapeHtml(sq.q) + "</b><br>" + escapeHtml(sq.a)));
      });
    } else {
      var ol = el("div");
      q.options.forEach(function (opt, i) {
        var letter = String.fromCharCode(65 + i);
        var ob = el("div", "option" + (q.answer.indexOf(letter) >= 0 ? " correct" : ""), escapeHtml(opt) + (q.answer.indexOf(letter) >= 0 ? ' <span class="tag">✓ 正确</span>' : ""));
        ol.appendChild(ob);
      });
      m.appendChild(ol);
      m.appendChild(el("div", "explain", "<b>解析：</b>" + escapeHtml(expl(q))));
    }
    var close = el("button", "btn btn-ghost", "关闭");
    close.onclick = function () { mask.remove(); };
    m.appendChild(close);
    mask.appendChild(m);
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  /* ====================================================================
   *  视图 5：模拟考试
   * ==================================================================== */
  var exam = null;
  function renderExamHome(c) {
    $("#viewTitle").textContent = TITLES.exam;
    var card = el("div", "card"); card.style.maxWidth = "720px";
    card.appendChild(sectionTitle("🏛️ 全真模拟考试"));
    var subjSel = selectFrom(SUBJECT_KEYS.map(function (k) { return { v: k, t: subj(k).name }; }), curKey() === "all" ? "economy" : curKey());
    var modeSel = selectFrom([{ v: "timed", t: "全真限时（按真实时长倒计时）" }, { v: "free", t: "练习不限时" }], "timed");
    var row = el("div"); row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px";
    row.appendChild(field("科目", subjSel)); row.appendChild(field("模式", modeSel));
    card.appendChild(row);
    var note = el("div", "muted", "提示：试卷依据真实题型/分值/评分规则组卷（基于现有题库，题量按比例精简）。交卷后给出分题型、分章节成绩报告。");
    note.style.marginBottom = "16px"; card.appendChild(note);
    var btn = el("button", "btn btn-primary", "▶ 开始模考");
    btn.onclick = function () { startExam(subjSel.value, modeSel.value); };
    card.appendChild(btn);
    c.appendChild(card);

    if (state.mock.length) {
      c.appendChild(renderMockHistory());
    }
  }
  function renderMockHistory() {
    var card = el("div", "card"); card.style.marginTop = "18px";
    card.appendChild(sectionTitle("📜 模考记录"));
    var tbl = '<table class="tbl"><tr><th>日期</th><th>科目</th><th>得分</th><th>及格线</th><th>结果</th></tr>';
    state.mock.slice().reverse().slice(0, 10).forEach(function (m) {
      tbl += "<tr><td>" + m.date + "</td><td>" + subj(m.subject).name + "</td><td>" + m.score + "/" + m.total + "</td><td>" + m.passScore + "</td><td class='" + (m.pass ? "ok" : "no") + "'>" + (m.pass ? "及格 ✓" : "未及格") + "</td></tr>";
    });
    tbl += "</table>";
    card.innerHTML += tbl;
    return card;
  }
  function startExam(key, mode) {
    var s = subj(key);
    var singles = qOf(key).filter(function (q) { return q.type === "single"; });
    var multis = qOf(key).filter(function (q) { return q.type === "multiple"; });
    var cases = qOf(key).filter(function (q) { return q.type === "case"; });
    exam = {
      key: key, mode: mode,
      single: shuffle(singles), multiple: shuffle(multis), case: shuffle(cases),
      answers: {}, caseGrade: {}, cur: 0, total: singles.length + multis.length + cases.length,
      seconds: mode === "timed" ? s.examMinutes * 60 : 0, timer: null, finished: false
    };
    exam.questions = exam.single.concat(exam.multiple).concat(exam.case);
    renderExam();
    if (mode === "timed") {
      exam.timer = setInterval(function () {
        exam.seconds--;
        var t = $(".timer"); if (t) t.textContent = fmtMin(Math.max(0, exam.seconds));
        if (exam.seconds <= 0) { clearInterval(exam.timer); submitExam(); }
      }, 1000);
    }
  }
  function renderExam() {
    var c = $("#content"); c.innerHTML = "";
    var s = subj(exam.key);
    $("#viewTitle").textContent = "模考 · " + s.name;
    var q = exam.questions[exam.cur];
    var card = el("div", "card"); card.style.maxWidth = "860px"; card.style.margin = "0 auto";

    var bar2 = el("div", "exam-bar");
    var left = el("div");
    left.innerHTML = '<span class="chip chip-gold">' + s.name + '</span> <span class="muted">第 ' + (exam.cur + 1) + "/" + exam.total + " 题 · " + typeName(q.type) + "</span>";
    var right = el("div");
    if (exam.mode === "timed") right.innerHTML = '<span class="timer">' + fmtMin(exam.seconds) + "</span> ⏱";
    else right.innerHTML = '<span class="chip chip-gray">不限时</span>';
    bar2.appendChild(left); bar2.appendChild(right);
    card.appendChild(bar2);

    // 答题卡
    var pal = el("div", "palette");
    exam.questions.forEach(function (qq, i) {
      var pc = el("div", "pc" + (exam.answers[i] || (exam.caseGrade[i] != null) ? " done" : "") + (i === exam.cur ? " cur" : ""), String(i + 1));
      pc.onclick = function () { exam.cur = i; renderExam(); };
      pal.appendChild(pc);
    });
    card.appendChild(pal);

    if (q.type === "case") renderCaseInExam(card, q, exam.cur);
    else {
      card.appendChild(el("div", "q-stem", escapeHtml(q.stem)));
      var wrap = el("div");
      if (!exam.answers[exam.cur]) exam.answers[exam.cur] = [];
      var cur = exam.answers[exam.cur];
      q.options.forEach(function (opt, i) {
        var letter = String.fromCharCode(65 + i);
        var ob = el("button", "option" + (cur.indexOf(letter) >= 0 ? " sel" : ""), escapeHtml(opt));
        ob.onclick = function () {
          if (q.type === "single") { cur = [letter]; exam.answers[exam.cur] = cur; }
          else { if (cur.indexOf(letter) >= 0) cur = cur.filter(function (x) { return x !== letter; }); else cur.push(letter); exam.answers[exam.cur] = cur; }
          $all(".option", wrap).forEach(function (o, j) { o.classList.toggle("sel", exam.answers[exam.cur].indexOf(String.fromCharCode(65 + j)) >= 0); });
        };
        wrap.appendChild(ob);
      });
      card.appendChild(wrap);
    }

    var acts = el("div"); acts.style.marginTop = "16px"; acts.style.display = "flex"; acts.style.gap = "10px"; acts.style.justifyContent = "space-between";
    var prev = el("button", "btn btn-ghost", "← 上一题");
    prev.disabled = exam.cur === 0; prev.onclick = function () { if (exam.cur > 0) { exam.cur--; renderExam(); } };
    var submit = el("button", "btn btn-primary", exam.cur + 1 < exam.total ? "下一题 →" : "🏁 交卷");
    submit.onclick = function () {
      if (exam.cur + 1 < exam.total) { exam.cur++; renderExam(); }
      else submitExam();
    };
    acts.appendChild(prev); acts.appendChild(submit);
    card.appendChild(acts);
    c.appendChild(card);
  }
  function renderCaseInExam(card, q, idx) {
    card.appendChild(el("div", "q-stem", escapeHtml(q.stem)));
    var list = el("div");
    q.subQuestions.forEach(function (sq, si) {
      var item = el("div", "card"); item.style.marginBottom = "12px"; item.style.padding = "14px";
      item.innerHTML = '<div style="font-weight:600;margin-bottom:8px">' + escapeHtml(sq.q) + '</div>';
      var gradeKey = idx + "_" + si;
      if (exam.caseGrade[gradeKey] == null) {
        var btns = el("div"); btns.style.cssText = "display:flex;gap:8px;margin-top:6px";
        [["满分", 1], ["半分", 0.5], ["0分", 0]].forEach(function (g) {
          var b = el("button", "btn btn-sm btn-ghost", g[0]);
          b.onclick = function () { exam.caseGrade[gradeKey] = g[1]; renderExam(); };
          btns.appendChild(b);
        });
        item.appendChild(btns);
      } else {
        item.appendChild(el("div", "explain", "<b>标准采分点：</b>" + escapeHtml(sq.a) + '<div class="muted" style="margin-top:6px">自评：' + (exam.caseGrade[gradeKey] === 1 ? "满分" : exam.caseGrade[gradeKey] === 0.5 ? "半分" : "0分") + "</div>"));
      }
      list.appendChild(item);
    });
    card.appendChild(list);
  }
  function submitExam() {
    if (exam.timer) clearInterval(exam.timer);
    if (exam.finished) return; exam.finished = true;
    var s = subj(exam.key);
    var singleScore = 0, multiSum = 0, caseScore = 0, singleRight = 0, multiRight = 0;
    var chapterStat = {};
    // 单选
    exam.single.forEach(function (q, i) {
      var gi = exam.questions.indexOf(q);
      var sel = exam.answers[gi] || [];
      var ok = isCorrect(q, sel);
      if (ok) { singleScore += s.paper.singleScore; singleRight++; }
      chapterStat[q.chapter] = chapterStat[q.chapter] || { total: 0, right: 0 };
      chapterStat[q.chapter].total++; if (ok) chapterStat[q.chapter].right++;
    });
    // 多选
    exam.multiple.forEach(function (q, i) {
      var gi = exam.questions.indexOf(q);
      var sel = exam.answers[gi] || [];
      var sc = multiScore(q, sel);
      multiSum += sc;
      if (sc >= s.paper.multipleScore) multiRight++;
      chapterStat[q.chapter] = chapterStat[q.chapter] || { total: 0, right: 0 };
      chapterStat[q.chapter].total++; if (sc >= s.paper.multipleScore) chapterStat[q.chapter].right++;
    });
    // 案例
    var caseMax = 0;
    exam.case.forEach(function (q) {
      var gi = exam.questions.indexOf(q);
      q.subQuestions.forEach(function (sq, si) {
        caseMax += sq.score;
        var g = exam.caseGrade[gi + "_" + si];
        if (g != null) caseScore += sq.score * g;
      });
    });
    var totalScore = Math.round((singleScore + multiSum + caseScore) * 10) / 10;
    var totalMax = exam.single.length * s.paper.singleScore + exam.multiple.length * s.paper.multipleScore + caseMax;
    var pass = totalScore >= s.passScore;

    // 记录
    var rec = { date: todayStr(), subject: exam.key, score: totalScore, total: Math.round(totalMax * 10) / 10, passScore: s.passScore, pass: pass };
    state.mock.push(rec);
    var st = todayStat(); st.exam++;
    if (pass) { state.flags = state.flags || {}; state.flags.pass = true; }
    saveState(); checkAchievements();

    renderExamReport({ s: s, singleScore: singleScore, multiScore: multiSum, caseScore: Math.round(caseScore * 10) / 10, singleRight: singleRight, multiRight: multiRight, chapterStat: chapterStat, totalScore: totalScore, totalMax: Math.round(totalMax * 10) / 10, pass: pass });
  }
  function renderExamReport(r) {
    var c = $("#content"); c.innerHTML = "";
    $("#viewTitle").textContent = "模考成绩报告";
    var card = el("div", "card"); card.style.maxWidth = "760px"; card.style.margin = "0 auto"; card.style.textAlign = "center";
    card.appendChild(el("div", "", '<div style="font-size:44px;font-weight:800;color:' + (r.pass ? "var(--green)" : "var(--red)") + '">' + r.totalScore + '</div><div class="muted">总分 ' + r.totalMax + ' · 及格线 ' + r.s.passScore + ' · ' + (r.pass ? "🎉 已及格" : "未达及格线") + '</div>'));
    var line = el("div", "grid grid-3"); line.style.marginTop = "16px";
    line.appendChild(statCard(r.singleScore, "单选", "分"));
    line.appendChild(statCard(r.multiScore, "多选", "分"));
    if (r.s.key === "practice") line.appendChild(statCard(r.caseScore, "案例", "分"));
    else line.appendChild(statCard(r.singleRight + r.multiRight, "答对题数", "题"));
    card.appendChild(line);

    var ch = el("div", "section-title", "📂 分章节正确率"); ch.style.justifyContent = "center"; ch.style.marginTop = "18px";
    card.appendChild(ch);
    var tbl = '<table class="tbl"><tr><th>章节</th><th>正确</th><th>正确率</th></tr>';
    Object.keys(r.chapterStat).forEach(function (ch2) {
      var o = r.chapterStat[ch2];
      var pct = Math.round(o.right / o.total * 100);
      tbl += "<tr><td>" + ch2 + "</td><td>" + o.right + "/" + o.total + "</td><td class='" + (pct >= 60 ? "ok" : "no") + "'>" + pct + "%</td></tr>";
    });
    tbl += "</table>";
    var t = el("div", ""); t.innerHTML = tbl; t.style.marginTop = "8px"; t.style.textAlign = "left";
    card.appendChild(t);

    var adv = el("div", "explain"); adv.style.marginTop = "14px"; adv.style.textAlign = "left";
    adv.innerHTML = "<b>提升建议：</b>" + (r.pass ? "已跨过及格线，重点放在巩固高频考点与提速。" : "主攻多选策略（宁可少选不错选）与薄弱章节，目标突破 " + r.s.passScore + " 分。");
    card.appendChild(adv);

    var acts = el("div"); acts.style.marginTop = "20px"; acts.style.display = "flex"; acts.style.gap = "10px"; acts.style.flexWrap = "wrap";
    var again = el("button", "btn btn-primary", "再考一次");
    again.onclick = function () { goto("exam"); };
    var home = el("button", "btn btn-ghost", "返回首页");
    home.onclick = function () { goto("dashboard"); };
    var pdf = el("button", "btn btn-ghost", "🖨️ 导出本卷 PDF");
    pdf.onclick = function () { exportExamPDF(); };
    acts.appendChild(again); acts.appendChild(pdf); acts.appendChild(home);
    card.appendChild(acts);
    c.appendChild(card);
  }

  /* ====================================================================
   *  视图 6：进度跟踪
   * ==================================================================== */
  function renderProgress(c) {
    $("#viewTitle").textContent = TITLES.progress;
    var dates = Object.keys(state.stats).sort();
    if (!dates.length && !state.mock.length) {
      c.appendChild(el("div", "empty", "还没有学习数据。去刷几道题或做一套模考，这里会画出你的成长曲线 📈"));
      return;
    }
    // 学习力趋势
    var card = el("div", "card");
    card.appendChild(sectionTitle("⚡ 每日学习力趋势（近 14 天）"));
    var recent = dates.slice(-14);
    var series = recent.map(function (d) {
      var st = state.stats[d];
      var time = cap(st.minutes, 120), prac = cap(st.practice, 50);
      var acc = st.practice ? Math.round(st.correct / st.practice * 100) : 0;
      var rec = cap(st.recitation, 10), strk = cap(state.streak || 0, 14);
      return Math.round(time * 0.25 + prac * 0.25 + acc * 0.20 + rec * 0.15 + strk * 0.15);
    });
    card.appendChild(barChart(recent, series, "学习力"));
    c.appendChild(card);

    // 刷题量 + 正确率
    var card2 = el("div", "card"); card2.style.marginTop = "18px";
    card2.appendChild(sectionTitle("📊 每日刷题量 vs 正确率"));
    var pracArr = recent.map(function (d) { return state.stats[d].practice; });
    var accArr = recent.map(function (d) { var st = state.stats[d]; return st.practice ? Math.round(st.correct / st.practice * 100) : 0; });
    card2.appendChild(groupedBar(recent, pracArr, accArr));
    c.appendChild(card2);

    // 四科掌握度
    var card3 = el("div", "card"); card3.style.marginTop = "18px";
    card3.appendChild(sectionTitle("📘 四科掌握度（基于已练题）"));
    var g = el("div", "grid grid-2");
    SUBJECT_KEYS.forEach(function (k) {
      var s = subj(k); var qs = qOf(k);
      var right = 0, wrong = 0, att = 0;
      qs.forEach(function (q) { if (state.attempts[q.id]) { att++; right += state.attempts[q.id].right; wrong += state.attempts[q.id].wrong; } });
      var acc = att ? Math.round(right / (right + wrong) * 100) : 0;
      var cov = Math.round(att / qs.length * 100);
      var item = el("div", "card"); item.style.background = "var(--panel-2)";
      item.innerHTML = '<div style="font-weight:700;margin-bottom:8px">' + s.name + '</div>';
      item.appendChild(bar(cov));
      item.appendChild(el("div", "muted", "覆盖率 " + cov + "% · 正确率 " + acc + "%"));
      g.appendChild(item);
    });
    card3.appendChild(g);
    c.appendChild(card3);

    c.appendChild(renderAchievements(false));
  }

  /* --------------------------- SVG 图表 --------------------------- */
  function barChart(labels, values, name) {
    var w = 760, h = 220, pad = 30;
    var max = Math.max(100, Math.max.apply(null, values));
    var step = (w - pad * 2) / labels.length;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:' + w + 'px">';
    // 网格
    for (var g = 0; g <= 4; g++) {
      var yy = pad + (h - pad * 2) * g / 4;
      svg += '<line x1="' + pad + '" y1="' + yy + '" x2="' + (w - pad) + '" y2="' + yy + '" stroke="#2c3e66" stroke-width="1"/>';
      svg += '<text x="' + (pad - 6) + '" y="' + (yy + 4) + '" fill="#6b7da3" font-size="10" text-anchor="end">' + Math.round(max * (1 - g / 4)) + '</text>';
    }
    values.forEach(function (v, i) {
      var bh = (h - pad * 2) * v / max;
      var x = pad + step * i + step / 2 - 10;
      var y = h - pad - bh;
      var col = v >= 80 ? "#3ec98a" : v >= 60 ? "#e2a252" : v >= 40 ? "#f0c98a" : "#e8604c";
      svg += '<rect x="' + x + '" y="' + y + '" width="20" height="' + bh + '" rx="3" fill="' + col + '"/>';
      svg += '<text x="' + (x + 10) + '" y="' + (y - 4) + '" fill="#e8eefc" font-size="10" text-anchor="middle">' + v + '</text>';
      svg += '<text x="' + (x + 10) + '" y="' + (h - pad + 14) + '" fill="#6b7da3" font-size="9" text-anchor="middle">' + labels[i].slice(5) + '</text>';
    });
    svg += '</svg>';
    return el("div", "chart-wrap", svg);
  }
  function groupedBar(labels, v1, v2) {
    var w = 760, h = 220, pad = 30;
    var max = Math.max(50, Math.max.apply(null, v1.concat([50])), Math.max.apply(null, v2));
    var step = (w - pad * 2) / labels.length;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="max-width:' + w + 'px">';
    for (var g = 0; g <= 4; g++) {
      var yy = pad + (h - pad * 2) * g / 4;
      svg += '<line x1="' + pad + '" y1="' + yy + '" x2="' + (w - pad) + '" y2="' + yy + '" stroke="#2c3e66" stroke-width="1"/>';
    }
    labels.forEach(function (lb, i) {
      var x = pad + step * i + step / 2;
      var bh1 = (h - pad * 2) * v1[i] / max, bh2 = (h - pad * 2) * v2[i] / max;
      svg += '<rect x="' + (x - 16) + '" y="' + (h - pad - bh1) + '" width="14" height="' + bh1 + '" rx="2" fill="#5b8def"/>';
      svg += '<rect x="' + (x + 2) + '" y="' + (h - pad - bh2) + '" width="14" height="' + bh2 + '" rx="2" fill="#e2a252"/>';
      svg += '<text x="' + x + '" y="' + (h - pad + 14) + '" fill="#6b7da3" font-size="9" text-anchor="middle">' + lb.slice(5) + '</text>';
    });
    svg += '<g transform="translate(' + (w - 150) + ',10)"><rect x="0" y="0" width="12" height="12" fill="#5b8def"/><text x="18" y="10" fill="#9fb0d0" font-size="11">刷题量</text><rect x="70" y="0" width="12" height="12" fill="#e2a252"/><text x="88" y="10" fill="#9fb0d0" font-size="11">正确率%</text></g>';
    svg += '</svg>';
    return el("div", "chart-wrap", svg);
  }

  /* ====================================================================
   *  视图 7：考点知识库（YJ_KNOWLEDGE + YJ_DATA 章节考点）
   *  交互：分类列表 → 点击条目进入「独立详情页」（kbDetail），页面独立、可返回
   * ==================================================================== */
  var kbMode = "points";
  var kbDetail = null;
  function kbOpen(cat, item) { kbDetail = { cat: cat, item: item }; render(); }
  function kbBack() { kbDetail = null; render(); }

  function renderKnowledge(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.knowledge;
    if (typeof YJ_KNOWLEDGE === "undefined") { c.appendChild(el("div", "empty", "知识库数据未加载（data_knowledge.js）。")); return; }
    var K = YJ_KNOWLEDGE;
    if (kbDetail) { renderKbDetail(c, K); return; }
    var tabs = el("div", "seg");
    [["points", "章节考点"], ["core", "高频速记"], ["hot", "热点话题"], ["policy", "最新政策"]].forEach(function (t) {
      var b = el("button", "seg-btn" + (kbMode === t[0] ? " active" : ""), t[1]);
      b.onclick = function () { kbMode = t[0]; renderKnowledge(c); };
      tabs.appendChild(b);
    });
    c.appendChild(tabs);
    c.appendChild(el("div", "muted", "资料更新：" + K.meta.updated + " · 来源：" + K.meta.source + " · 点击任意条目查看独立详情页"));

    if (kbMode === "points") renderKbPoints(c, K);
    else if (kbMode === "core") renderKbCore(c, K);
    else if (kbMode === "hot") renderKbHot(c, K);
    else if (kbMode === "policy") renderKbPolicy(c, K);
  }
  function kbCard(titleHtml, metaHtml, onclick) {
    var card = el("div", "card kb-card");
    card.appendChild(el("div", "kb-card-h", titleHtml));
    if (metaHtml) card.appendChild(el("div", "kb-card-m", metaHtml));
    card.appendChild(el("div", "kb-card-go", "查看详情 ›"));
    card.onclick = onclick;
    return card;
  }
  function renderKbPoints(c, K) {
    var keys = curKey() === "all" ? SUBJECT_KEYS : [curKey()];
    keys.forEach(function (k) {
      var s = YJ_DATA[k]; if (!s) return;
      c.appendChild(el("div", "section-title", s.name));
      var grid = el("div", "grid grid-2");
      s.chapters.forEach(function (ch) {
        var n = (ch.knowledge || []).length;
        grid.appendChild(kbCard(
          '<span class="code">' + ch.code + '</span> ' + ch.name,
          n ? ("共 " + n + " 个提炼要点") : "（暂无提炼要点）",
          function () { kbOpen("章节考点", ch); }
        ));
      });
      c.appendChild(grid);
    });
  }
  function renderKbCore(c, K) {
    var keys = curKey() === "all" ? SUBJECT_KEYS : [curKey()];
    keys.forEach(function (k) {
      var s = YJ_DATA[k]; if (!s || !K.core[k]) return;
      c.appendChild(el("div", "section-title", s.name + " · 高频核心考点速记"));
      var grid = el("div", "grid grid-2");
      grid.appendChild(kbCard(
        s.name + " 高频速记",
        "共 " + K.core[k].length + " 条核心要点",
        function () { kbOpen("高频速记", { subject: s.name, points: K.core[k] }); }
      ));
      c.appendChild(grid);
    });
  }
  function renderKbHot(c, K) {
    var grid = el("div", "grid grid-2");
    K.hot.forEach(function (h) {
      grid.appendChild(kbCard(
        h.title,
        '<span class="chip chip-gold">' + h.tag + '</span> <span class="chip chip-blue">' + h.subject + '</span>',
        function () { kbOpen("热点话题", h); }
      ));
    });
    c.appendChild(grid);
  }
  function renderKbPolicy(c, K) {
    var grid = el("div", "grid grid-2");
    K.policy.forEach(function (p) {
      grid.appendChild(kbCard(
        p.title,
        '<span class="chip chip-gray">' + p.tag + '</span> <span class="muted">· ' + p.date + '</span>',
        function () { kbOpen("最新政策", p); }
      ));
    });
    c.appendChild(grid);
  }
  function renderKbDetail(c, K) {
    var back = el("button", "btn btn-ghost", "← 返回知识库");
    back.onclick = kbBack;
    c.appendChild(back);
    var d = kbDetail, item = d.item;
    var card = el("div", "card kb-detail"); card.style.maxWidth = "860px"; card.style.margin = "14px auto 0";
    card.appendChild(el("div", "kb-detail-cat", d.cat));
    if (d.cat === "章节考点") {
      card.appendChild(el("div", "kb-detail-title", '<span class="code">' + item.code + '</span> ' + item.name));
      var ul = el("div", "kb-kp");
      (item.knowledge || []).forEach(function (p) { ul.appendChild(el("div", "kp", p)); });
      if (!(item.knowledge || []).length) ul.appendChild(el("div", "muted", "（本章暂无提炼要点）"));
      card.appendChild(ul);
    } else if (d.cat === "高频速记") {
      card.appendChild(el("div", "kb-detail-title", item.subject));
      var ul2 = el("div", "kb-kp");
      (item.points || []).forEach(function (p) { ul2.appendChild(el("div", "kp", p)); });
      card.appendChild(ul2);
    } else if (d.cat === "热点话题") {
      card.appendChild(el("div", "kb-detail-title", item.title));
      var meta = el("div", "q-meta");
      meta.appendChild(el("span", "chip chip-gold", item.tag));
      meta.appendChild(el("span", "chip chip-blue", item.subject));
      card.appendChild(meta);
      card.appendChild(el("div", "kb-detail-body", item.desc));
    } else if (d.cat === "最新政策") {
      card.appendChild(el("div", "kb-detail-title", item.title));
      var meta2 = el("div", "q-meta");
      meta2.appendChild(el("span", "chip chip-gray", item.tag));
      meta2.appendChild(el("span", "muted", " · " + item.date));
      card.appendChild(meta2);
      card.appendChild(el("div", "kb-detail-body", item.desc));
    }
    c.appendChild(card);
  }

  /* ====================================================================
   *  视图 8：名师讲课（YJ_LECTURES）
   * ==================================================================== */
  function renderLectures(c) {
    $("#viewTitle").textContent = TITLES.lectures;
    if (typeof YJ_LECTURES === "undefined") { c.appendChild(el("div", "empty", "名师课程数据未加载（data_lectures.js）。")); return; }
    var keys = curKey() === "all" ? SUBJECT_KEYS : [curKey()];
    var total = 0;
    keys.forEach(function (k) {
      var list = YJ_LECTURES[k]; if (!list) return;
      var s = YJ_DATA[k];
      c.appendChild(el("div", "section-title", (s ? s.name : k) + " · 收录 " + list.length + " 节"));
      var grid = el("div", "grid grid-2");
      list.forEach(function (v) {
        total++;
        var card = el("div", "card lec-card");
        var top = el("div", "lec-top");
        top.appendChild(el("div", "lec-ava", v.teacher.charAt(0)));
        var info = el("div", "lec-info");
        info.appendChild(el("div", "lec-title", v.title));
        info.appendChild(el("div", "lec-by", v.teacher + " · " + v.org + " · " + v.level));
        top.appendChild(info);
        card.appendChild(top);
        card.appendChild(el("div", "lec-intro", v.intro));
        var acts = el("div", "lec-acts");
        var link = el("a", "btn btn-primary btn-sm", "▶ 观看入口");
        link.href = "https://search.bilibili.com/all?keyword=" + encodeURIComponent(v.kw);
        link.target = "_blank"; link.rel = "noopener";
        acts.appendChild(link);
        acts.appendChild(el("span", "muted", "平台：" + v.platform));
        card.appendChild(acts);
        grid.appendChild(card);
      });
      c.appendChild(grid);
    });
    c.appendChild(el("div", "muted", "共收录 " + total + " 节课 · 观看入口指向 B 站检索页，输入即看；建议同步支持正版机构课程。"));
  }

  /* ====================================================================
   *  模拟考试 PDF 导出（交卷后一键生成试卷 PDF）
   * ==================================================================== */
  function findPoint(q) {
    for (var i = 0; i < SUBJECT_KEYS.length; i++) {
      var s = YJ_DATA[SUBJECT_KEYS[i]];
      if (!s || !s.chapters) continue;
      for (var j = 0; j < s.chapters.length; j++) {
        if (s.chapters[j].code === q.chapter) {
          var kp = (s.chapters[j].knowledge || []).join("；");
          return kp ? kp : "（该章节暂无提炼要点）";
        }
      }
    }
    return "（未匹配到章节考点）";
  }
  function answerText(q) {
    if (q.type === "multiple") return (q.answer || []).join("、");
    return (q.answer && q.answer[0]) || "";
  }
  function ensurePrintArea() {
    var pa = document.getElementById("printArea");
    if (!pa) { pa = document.createElement("div"); pa.id = "printArea"; document.body.appendChild(pa); }
    return pa;
  }
  function exportExamPDF() {
    if (!exam) { alert("没有可导出的考试。"); return; }
    var s = subj(exam.key);
    var html = "";
    html += '<div class="print-head"><h1>一级建造师 · 模拟考试卷</h1>';
    html += '<div class="print-meta">科目：' + s.name + ' ｜ 模式：' + (exam.mode === "timed" ? "全真限时" : "练习不限时") + ' ｜ 题量：' + exam.total + ' 题 ｜ 生成日期：' + todayStr() + '</div>';
    html += '<div class="print-note">本卷由「全能备考系统」生成，含题目与对应考点，并附答案、你的作答与解析，便于下载打印复盘。</div></div>';
    exam.questions.forEach(function (q, i) {
      html += '<div class="print-q">';
      var tn = q.type === "single" ? "【单选】" : q.type === "multiple" ? "【多选】" : q.type === "case" ? "【案例】" : "";
      html += '<div class="pq-h">第 ' + (i + 1) + ' 题 ' + tn + ' <span class="pq-ch">' + (q.chapter || "") + '</span></div>';
      html += '<div class="pq-stem">' + escapeHtml(q.stem) + '</div>';
      if (q.type === "case") {
        (q.subQuestions || []).forEach(function (sq) { html += '<div class="pq-sub">（' + sq.score + '分）' + escapeHtml(sq.q) + '</div>'; });
      } else {
        (q.options || []).forEach(function (o) { html += '<div class="pq-opt">' + escapeHtml(o) + '</div>'; });
      }
      html += '<div class="pq-point"><b>对应考点：</b>' + escapeHtml(findPoint(q)) + '</div>';
      html += '</div>';
    });
    html += '<div class="print-ans"><h2>答案 · 你的作答 · 解析</h2><ol>';
    exam.questions.forEach(function (q, i) {
      if (q.type === "case") {
        var subs = (q.subQuestions || []).map(function (sq) { return "（" + sq.score + "分）参考答案：" + escapeHtml(sq.a || sq.answer || ""); }).join("<br>");
        html += '<li><b>【案例】</b><br>' + subs + '</li>';
      } else {
        var correct = answerText(q);
        var mine = (exam.answers[i] || []).join("、");
        html += '<li><b>【答案】</b>' + escapeHtml(correct) + ' ｜ <b>我的作答：</b>' + escapeHtml(mine || "（未作答）") + '<br>' + escapeHtml(expl(q)) + '</li>';
      }
    });
    html += '</ol></div>';
    ensurePrintArea().innerHTML = html;
    setTimeout(function () { window.print(); }, 60);
  }

  /* ====================================================================
   *  视图 9：考点思维导图（YJ_MINDMAP · 纵向 · 概念+公式 · 一键PDF）
   * ==================================================================== */
  var mmSubject = "economy";
  function renderMindmap(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.mindmap;
    if (typeof YJ_MINDMAP === "undefined") { c.appendChild(el("div", "empty", "思维导图数据未加载（data_mindmap.js）。")); return; }
    if (!YJ_MINDMAP[mmSubject]) mmSubject = "economy";
    var M = YJ_MINDMAP[mmSubject];

    var tabs = el("div", "seg");
    SUBJECT_KEYS.forEach(function (k) {
      var b = el("button", "seg-btn" + (mmSubject === k ? " active" : ""), YJ_MINDMAP[k].name);
      b.onclick = function () { mmSubject = k; render(); };
      tabs.appendChild(b);
    });
    c.appendChild(tabs);
    c.appendChild(el("div", "muted", "资料更新：" + YJ_MINDMAP.meta.updated + " · " + YJ_MINDMAP.meta.desc));

    var root = el("div", "mm-root");
    var subjRoot = el("div", "mm-subj-root");
    subjRoot.innerHTML = '<div class="t">' + M.name + '</div><div class="s">共 ' + M.chapters.length + ' 章 · 概念 ' + mmCounts(M).c + ' 条 · 公式 ' + mmCounts(M).f + ' 个 · 纵向展开：科目 → 章节 → 概念 / 公式</div>';
    root.appendChild(subjRoot);

    var branch = el("div", "mm-branch");
    var row = el("div", "mm-ch-row");
    M.chapters.forEach(function (ch) { row.appendChild(mmChapterCard(ch)); });
    branch.appendChild(row);
    root.appendChild(branch);
    c.appendChild(root);

    var acts = el("div", "paper-acts"); acts.style.marginTop = "18px";
    var pdf = el("button", "btn btn-primary", "🖨️ 一键导出本科目导图 PDF");
    pdf.onclick = function () { exportMindmapPDF(mmSubject); };
    acts.appendChild(pdf);
    c.appendChild(acts);
    c.appendChild(el("div", "muted", "提示：导图纵向展开「科目 → 章节 → 概念 / 公式」，概念为考点归纳、公式含表达式与使用说明；导出 PDF 为白底排版，便于打印背诵。"));
  }
  function mmCounts(M) {
    var c = 0, f = 0;
    M.chapters.forEach(function (ch) { c += (ch.concepts || []).length; f += (ch.formulas || []).length; });
    return { c: c, f: f };
  }
  function mmChapterCard(ch) {
    var card = el("div", "mm-ch");
    card.appendChild(el("div", "mm-ch-head", '<span class="code">' + ch.code + '</span><span class="name">' + ch.name + '</span>'));
    var cats = el("div");
    (ch.concepts || []).forEach(function (x) { cats.appendChild(el("div", "mm-cat", escapeHtml(x))); });
    if (!(ch.concepts || []).length) cats.appendChild(el("div", "mm-none", "本章以公式记忆为主"));
    card.appendChild(cats);
    (ch.formulas || []).forEach(function (f) {
      var fm = el("div", "mm-fml");
      fm.innerHTML = '<div class="mm-fml-n">' + escapeHtml(f.n) + '</div><span class="mm-fml-f">' + escapeHtml(f.f) + '</span><div class="mm-fml-d">' + escapeHtml(f.d || "") + '</div>';
      card.appendChild(fm);
    });
    if (!(ch.formulas || []).length) card.appendChild(el("div", "mm-none", "本章无公式（以概念与数字要点记忆为主）"));
    return card;
  }
  function exportMindmapPDF(subjectKey) {
    var M = YJ_MINDMAP[subjectKey];
    if (!M) { alert("数据缺失。"); return; }
    var html = '<div class="print-head"><h1>一级建造师 · 考点思维导图</h1>';
    html += '<div class="print-meta">科目：' + M.name + ' ｜ 章节 ' + M.chapters.length + ' ｜ 概念 ' + mmCounts(M).c + ' ｜ 公式 ' + mmCounts(M).f + ' ｜ 生成日期：' + todayStr() + '</div></div>';
    M.chapters.forEach(function (ch) {
      html += '<div class="print-mm-ch"><div class="print-mm-ch-h">' + ch.code + '　' + ch.name + '</div>';
      (ch.concepts || []).forEach(function (x) { html += '<div class="print-mm-cat">· ' + escapeHtml(x) + '</div>'; });
      (ch.formulas || []).forEach(function (f) {
        html += '<div class="print-mm-fml"><b>' + escapeHtml(f.n) + '：</b><span class="ff">' + escapeHtml(f.f) + '</span> <span class="fd">' + escapeHtml(f.d || "") + '</span></div>';
      });
      html += '</div>';
    });
    ensurePrintArea().innerHTML = html;
    setTimeout(function () { window.print(); }, 60);
  }

  /* ====================================================================
   *  视图 10：试卷库（10 套模拟卷 + 近 5 年真题 · 标准答案 · 一键PDF）
   * ==================================================================== */
  var paperTab = "sim";
  var paperDetail = null;
  function renderPapers(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.papers;
    if (paperDetail) { renderPaperDetail(c, paperDetail); return; }
    var tabs = el("div", "seg");
    [["sim", "模拟试卷（10套）"], ["zt", "历年真题（近5年）"]].forEach(function (t) {
      var b = el("button", "seg-btn" + (paperTab === t[0] ? " active" : ""), t[1]);
      b.onclick = function () { paperTab = t[0]; render(); };
      tabs.appendChild(b);
    });
    c.appendChild(tabs);
    c.appendChild(el("div", "muted", paperTab === "sim"
      ? "10 套全真模拟卷（经济2 / 法规2 / 管理3 / 实务3），附标准答案与解析，支持一键导出 PDF。"
      : "2021-2025 年四科真题精编（按真题高频考点还原），附标准答案与解析，支持一键导出 PDF。"));

    if (paperTab === "sim") {
      var list = (typeof YJ_EXAMS !== "undefined" ? YJ_EXAMS : []);
      var grid = el("div", "grid grid-2");
      list.forEach(function (p) { grid.appendChild(paperCard(p)); });
      c.appendChild(grid);
      c.appendChild(el("div", "muted", "共 " + list.length + " 套模拟卷 · 点击任意一套进入浏览，可逐题展开标准答案与解析。"));
    } else {
      var years = Object.keys((typeof YJ_ZHENTI !== "undefined" ? YJ_ZHENTI : {})).sort();
      years.forEach(function (y) {
        var Y = YJ_ZHENTI[y];
        c.appendChild(el("div", "section-title", "📅 " + y + " 年真题（四科）"));
        var g2 = el("div", "grid grid-2");
        SUBJECT_KEYS.forEach(function (k) { if (Y && Y[k]) g2.appendChild(paperCard(Y[k])); });
        c.appendChild(g2);
      });
      if (!years.length) c.appendChild(el("div", "empty", "真题数据未加载（data_zhenti_*.js）。"));
    }
  }
  function paperCard(p) {
    var card = el("div", "paper-card");
    card.appendChild(el("div", "paper-card-h", '<span class="code">' + (p.kind || "") + (p.year ? " · " + p.year : "") + '</span>' + p.name));
    card.appendChild(el("div", "paper-card-m", p.note || ""));
    card.appendChild(el("div", "paper-card-m", paperStats(p)));
    card.appendChild(el("div", "paper-card-go", "浏览本卷 · 查看标准答案 ›"));
    card.onclick = function () { paperDetail = p; render(); };
    return card;
  }
  function paperStats(p) {
    var single = 0, multi = 0, caseN = 0, score = 0;
    (p.parts || []).forEach(function (part) {
      var qs = part.questions || [];
      if (part.type === "single") { single = qs.length; score += qs.length * (part.per || 1); }
      else if (part.type === "multiple") { multi = qs.length; score += qs.length * (part.per || 2); }
      else if (part.type === "case") {
        caseN = qs.length;
        qs.forEach(function (q) { score += (q.subQuestions || []).reduce(function (s, sq) { return s + (sq.score || 0); }, 0); });
      }
    });
    var s = "";
    if (single) s += "单选 " + single + " 题";
    if (multi) s += (s ? " · " : "") + "多选 " + multi + " 题";
    if (caseN) s += (s ? " · " : "") + "案例 " + caseN + " 题";
    s += " · 满分 " + score + " 分" + (p.minutes ? " · " + p.minutes + " 分钟" : "");
    return s;
  }
  function renderPaperDetail(c, p) {
    $("#viewTitle").textContent = "试卷 · " + (p.name || "");
    var back = el("button", "btn btn-ghost", "← 返回试卷库");
    back.onclick = function () { paperDetail = null; render(); };
    c.appendChild(back);
    var head = el("div", "paper-detail-head");
    var info = el("div");
    info.appendChild(el("div", "t", p.name));
    info.appendChild(el("div", "m", paperStats(p) + (p.note ? " ｜ " + p.note : "")));
    head.appendChild(info);
    var acts = el("div", "paper-acts");
    var pdf = el("button", "btn btn-primary", "🖨️ 一键导出本卷 PDF（含标准答案）");
    pdf.onclick = function () { exportPaperPDF(p); };
    acts.appendChild(pdf);
    head.appendChild(acts);
    c.appendChild(head);

    var idx = 0;
    (p.parts || []).forEach(function (part) {
      c.appendChild(el("div", "paper-part", part.title + "（共 " + (part.questions || []).length + " 题）"));
      (part.questions || []).forEach(function (q) {
        idx++;
        var card = el("div", "paper-q");
        card.appendChild(el("div", "paper-q-n", "第 " + idx + " 题" + (q.chapter ? " · " + q.chapter : "")));
        card.appendChild(el("div", "paper-q-stem", escapeHtml(q.stem)));
        if (q.type === "case" || (q.subQuestions && q.subQuestions.length)) {
          var sub = el("div", "paper-sub");
          (q.subQuestions || []).forEach(function (sq) {
            sub.appendChild(el("div", "paper-sub-q", "（" + (sq.score || 0) + "分）" + escapeHtml(sq.q)));
            var a = el("div", "paper-sub-a", "<b>参考答案：</b>" + escapeHtml(sq.a || ""));
            a.style.display = "none";
            sub.appendChild(a);
          });
          card.appendChild(sub);
          var rev2 = el("button", "btn btn-sm btn-ghost", "显示答案");
          rev2.onclick = function () { $all(".paper-sub-a", card).forEach(function (x) { x.style.display = "block"; }); rev2.style.display = "none"; };
          card.appendChild(rev2);
        } else {
          var ol = el("div");
          q.options.forEach(function (opt, i) {
            var letter = String.fromCharCode(65 + i);
            var isAns = (q.answer || []).indexOf(letter) >= 0;
            ol.appendChild(el("div", "paper-opt" + (isAns ? " correct" : ""), escapeHtml(opt) + (isAns ? ' <span class="tag">✓ 正确</span>' : "")));
          });
          card.appendChild(ol);
          var ans = el("div", "paper-ans");
          ans.innerHTML = "<b>标准答案：</b>" + escapeHtml((q.answer || []).join("、")) + '<div class="exp"><b>解析：</b>' + escapeHtml(expl(q)) + "</div>";
          card.appendChild(ans);
          var rev = el("button", "btn btn-sm btn-ghost", "显示答案");
          rev.onclick = function () { ans.style.display = "block"; rev.style.display = "none"; };
          card.appendChild(rev);
        }
        c.appendChild(card);
      });
    });
    c.appendChild(el("div", "muted", "· 本卷为标准答案版：正确选项已标绿，答案与解析可逐题展开；导出 PDF 时题目与答案、解析一并排版。"));
  }
  function exportPaperPDF(p) {
    if (!p) { alert("没有可导出的试卷。"); return; }
    var html = '<div class="print-paper-head"><h1>' + escapeHtml(p.name) + '</h1>';
    html += '<div class="print-paper-meta">' + escapeHtml(paperStats(p)) + ' ｜ 生成日期：' + todayStr() + (p.note ? ' ｜ ' + escapeHtml(p.note) : "") + '</div></div>';
    var idx = 0;
    (p.parts || []).forEach(function (part) {
      html += '<div class="print-paper-part">' + escapeHtml(part.title) + '</div>';
      (part.questions || []).forEach(function (q) {
        idx++;
        html += '<div class="print-paper-q">';
        html += '<div class="pq-h">第 ' + idx + ' 题 ' + (q.type === "single" ? "【单选】" : q.type === "multiple" ? "【多选】" : "【案例】") + '</div>';
        html += '<div class="pq-stem">' + escapeHtml(q.stem) + '</div>';
        if (q.type === "case" || (q.subQuestions && q.subQuestions.length)) {
          (q.subQuestions || []).forEach(function (sq) { html += '<div class="pq-sub">（' + (sq.score || 0) + '分）' + escapeHtml(sq.q) + '</div>'; });
          html += '<div class="print-paper-ans">';
          (q.subQuestions || []).forEach(function (sq) { html += '<div><b>参考答案：</b>' + escapeHtml(sq.a || "") + '</div>'; });
          html += "</div>";
        } else {
          (q.options || []).forEach(function (o) { html += '<div class="pq-opt">' + escapeHtml(o) + '</div>'; });
          html += '<div class="print-paper-ans"><b>标准答案：</b>' + escapeHtml((q.answer || []).join("、")) + '<div class="e">解析：' + escapeHtml(expl(q)) + "</div></div>";
        }
        html += "</div>";
      });
    });
    ensurePrintArea().innerHTML = html;
    setTimeout(function () { window.print(); }, 60);
  }

  /* ----------------------------- 试卷库数据合并 ----------------------------- */
  function mergePapers() {
    try {
      if (typeof window.YJ_EXAMS === "undefined") window.YJ_EXAMS = [];
      ["YJ_EXAMS_ECONOMY", "YJ_EXAMS_LAW", "YJ_EXAMS_MANAGEMENT", "YJ_EXAMS_PRACTICE"].forEach(function (g) {
        if (typeof window[g] !== "undefined") window.YJ_EXAMS = window.YJ_EXAMS.concat(window[g]);
      });
      if (typeof window.YJ_ZHENTI === "undefined") window.YJ_ZHENTI = {};
      [2021, 2022, 2023, 2024, 2025].forEach(function (y) {
        var g = "YJ_ZHENTI_" + y;
        if (typeof window[g] !== "undefined") window.YJ_ZHENTI[y] = window[g];
      });
      window.YJ_EXAMS.concat(Object.keys(window.YJ_ZHENTI).map(function (y) { return window.YJ_ZHENTI[y]; })).forEach(function (p) {
        (p.parts || []).forEach(function (part) {
          (part.questions || []).forEach(function (q) {
            if (!q.type && part.type) q.type = part.type;
            if (!q.stem && q.content) q.stem = q.content;
          });
        });
      });
    } catch (e) {}
  }

  /* ====================================================================
   *  视图 11：2027 考试预测（YJ_FORECAST + 3 套预测卷）
   * ==================================================================== */
  var forecastTab = "kp";
  function renderForecast(c) {
    c.innerHTML = "";
    $("#viewTitle").textContent = TITLES.forecast;
    if (paperDetail) { renderPaperDetail(c, paperDetail); return; }
    if (typeof YJ_FORECAST === "undefined") { c.appendChild(el("div", "empty", "预测数据未加载（data_forecast_2027.js）。")); return; }

    var tabs = el("div", "seg");
    [["kp", "📌 知识点预测"], ["hot", "🔥 热点考点预测"], ["q", "🎯 题目预测"], ["paper", "📝 预测模拟卷(3套)"]].forEach(function (t) {
      var b = el("button", "seg-btn" + (forecastTab === t[0] ? " active" : ""), t[1]);
      b.onclick = function () { forecastTab = t[0]; render(); };
      tabs.appendChild(b);
    });
    c.appendChild(tabs);
    c.appendChild(el("div", "muted", "2027 考试预测 · " + YJ_FORECAST.meta.basis));
    c.appendChild(el("div", "muted", "⚠️ " + YJ_FORECAST.meta.warn));

    var acts = el("div", "paper-acts");
    var pdf = el("button", "btn btn-primary", "🖨️ 一键导出本板块 PDF");
    pdf.onclick = function () { exportForecastPDF(); };
    acts.appendChild(pdf);
    c.appendChild(acts);

    if (forecastTab === "kp") renderForecastKp(c);
    else if (forecastTab === "hot") renderForecastHot(c);
    else if (forecastTab === "q") renderForecastQ(c);
    else if (forecastTab === "paper") renderForecastPaper(c);
  }

  /* ---- 知识点预测 ---- */
  function renderForecastKp(c) {
    var K = YJ_FORECAST.knowledge;
    var grid = el("div", "grid grid-2");
    Object.keys(K).forEach(function (k) {
      var item = K[k];
      var card = el("div", "kb-card");
      card.appendChild(el("div", "kb-card-h", item.name));
      var core = el("div");
      core.appendChild(el("div", "section-title", "高频核心考点"));
      item.core.forEach(function (x) { core.appendChild(el("div", "mm-cat", x)); });
      card.appendChild(core);
      var add = el("div");
      add.appendChild(el("div", "section-title", "2027 新增 / 强化考点"));
      item.added.forEach(function (x) { add.appendChild(el("div", "mm-fml", escapeHtml(x))); });
      card.appendChild(add);
      grid.appendChild(card);
    });
    c.appendChild(grid);
  }

  /* ---- 热点考点预测 ---- */
  function renderForecastHot(c) {
    var grid = el("div", "grid grid-2");
    YJ_FORECAST.hot.forEach(function (h) {
      var card = el("div", "hot-card kb-card");
      card.appendChild(el("div", "hot-h", h.icon + " " + escapeHtml(h.title) + ' <span class="chip chip-gold">' + escapeHtml(h.tag) + "</span>"));
      card.appendChild(el("div", "hot-d", escapeHtml(h.detail)));
      var pts = el("div"); pts.style.marginTop = "10px";
      h.points.forEach(function (p) { pts.appendChild(el("div", "mm-cat", p)); });
      card.appendChild(pts);
      grid.appendChild(card);
    });
    c.appendChild(grid);
  }

  /* ---- 题目预测 ---- */
  function renderForecastQ(c) {
    var grid = el("div", "grid grid-2");
    YJ_FORECAST.questions.forEach(function (q) {
      var card = el("div", "paper-q");
      card.appendChild(el("div", "paper-q-n", q.icon + " " + escapeHtml(q.topic)));
      card.appendChild(el("div", "paper-q-stem", "<b>预测题型与考查方式：</b>" + escapeHtml(q.predict)));
      var ex = el("div", "mm-fml");
      ex.innerHTML = "<b>示例：</b>" + escapeHtml(q.example);
      card.appendChild(ex);
      card.appendChild(el("div", "mm-cat", "<b>应对要点：</b>" + escapeHtml(q.tip)));
      grid.appendChild(card);
    });
    c.appendChild(grid);
  }

  /* ---- 预测模拟卷（3 套）---- */
  function renderForecastPaper(c) {
    var list = (typeof YJ_PREDICT !== "undefined" ? YJ_PREDICT : []);
    if (!list.length) { c.appendChild(el("div", "empty", "预测卷数据未加载（data_predict_*.js）。")); return; }
    c.appendChild(el("div", "muted", "3 套独立编制的完整预测模拟卷（四科合一：经济/法规/管理/实务，含标准答案与详细解析），难度与真题相当，覆盖上述预测全部重点。"));
    var grid = el("div", "grid grid-2");
    list.forEach(function (p) { grid.appendChild(paperCard(p)); });
    c.appendChild(grid);
  }

  /* ---- 预测板块整体 PDF ---- */
  function exportForecastPDF() {
    var F = YJ_FORECAST;
    if (!F) { alert("数据缺失。"); return; }
    var html = '<div class="print-head"><h1>一级建造师 · 2027 年考试预测</h1>';
    html += '<div class="print-meta">' + escapeHtml(F.meta.basis) + ' ｜ 生成日期：' + todayStr() + '</div>';
    html += '<div class="print-note">⚠️ 以下内容为备考方向预测，非官方押题；命题以当年新版教材与官方考试大纲为准。</div>';

    // 一、知识点预测
    html += '<h2 style="font-size:16px;color:#8a5a00;margin:14px 0 8px">一、知识点预测</h2>';
    Object.keys(F.knowledge).forEach(function (k) {
      var item = F.knowledge[k];
      html += '<div class="print-mm-ch"><div class="print-mm-ch-h">' + item.name + ' · 高频核心考点</div>';
      item.core.forEach(function (x) { html += '<div class="print-mm-cat">· ' + escapeHtml(x) + '</div>'; });
      html += '<div class="print-mm-ch-h" style="margin-top:6px">' + item.name + ' · 2027 新增/强化</div>';
      item.added.forEach(function (x) { html += '<div class="print-mm-cat">· ' + escapeHtml(x) + '</div>'; });
      html += '</div>';
    });

    // 二、热点考点预测
    html += '<h2 style="font-size:16px;color:#8a5a00;margin:14px 0 8px">二、热点考点预测</h2>';
    F.hot.forEach(function (h) {
      html += '<div class="print-mm-ch"><div class="print-mm-ch-h">' + escapeHtml(h.title) + '</div>';
      html += '<div class="print-mm-cat">' + escapeHtml(h.detail) + '</div>';
      h.points.forEach(function (p) { html += '<div class="print-mm-fml">→ ' + escapeHtml(p) + '</div>'; });
      html += '</div>';
    });

    // 三、题目预测
    html += '<h2 style="font-size:16px;color:#8a5a00;margin:14px 0 8px">三、可能的题目预测</h2>';
    F.questions.forEach(function (q) {
      html += '<div class="print-mm-ch"><div class="print-mm-ch-h">' + escapeHtml(q.topic) + '</div>';
      html += '<div class="print-mm-cat"><b>预测：</b>' + escapeHtml(q.predict) + '</div>';
      html += '<div class="print-mm-cat"><b>示例：</b>' + escapeHtml(q.example) + '</div>';
      html += '<div class="print-mm-cat"><b>应对：</b>' + escapeHtml(q.tip) + '</div>';
      html += '</div>';
    });
    ensurePrintArea().innerHTML = html;
    setTimeout(function () { window.print(); }, 60);
  }

  /* ----------------------------- 预测卷数据合并 ----------------------------- */
  function mergePredict() {
    try {
      if (typeof window.YJ_PREDICT === "undefined") window.YJ_PREDICT = [];
      ["YJ_PREDICT_01", "YJ_PREDICT_02", "YJ_PREDICT_03"].forEach(function (g) {
        if (typeof window[g] !== "undefined") window.YJ_PREDICT = window.YJ_PREDICT.concat(window[g]);
      });
      window.YJ_PREDICT.forEach(function (p) {
        (p.parts || []).forEach(function (part) {
          (part.questions || []).forEach(function (q) {
            if (!q.type && part.type) q.type = part.type;
            if (!q.stem && q.content) q.stem = q.content;
          });
        });
      });
    } catch (e) {}
  }

  /* ====================================================================
   *  导航 & 全局事件
   * ==================================================================== */
  function goto(v) { view = v; session = null; exam = null; kbDetail = null; paperDetail = null; render(); }
  function bindNav() {
    $all(".nav-item").forEach(function (b) {
      b.onclick = function () {
        $all(".nav-item").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        document.body.classList.remove("nav-open");
        goto(b.getAttribute("data-view"));
      };
    });
    var mb = $("#menuBtn");
    if (mb) mb.onclick = function () { document.body.classList.toggle("nav-open"); };
    $("#subjectFilter").onchange = function () { render(); };
    $("#resetBtn").onclick = function () {
      if (confirm("确定清空所有本地学习数据（练习记录、错题、进度、成就）吗？此操作不可恢复。")) {
        localStorage.removeItem(LS_KEY);
        state = loadState();
        alert("已重置。"); render();
      }
    };
  }

  /* ----------------------------- 扩展题库合并 ----------------------------- */
  // 将 data_*_*.js 中的扩展题数组合并进对应科目 questions（每科达到100+题）
  function mergeExtra() {
    if (typeof YJ_DATA === "undefined") return;
    var map = {
      economy: ["economy_s", "economy_m"],
      law: ["law_s", "law_m"],
      management: ["management_s", "management_m"],
      practice: ["practice_s", "practice_mc"]
    };
    Object.keys(map).forEach(function (k) {
      var s = YJ_DATA[k];
      if (!s || !s.questions) return;
      map[k].forEach(function (ek) {
        if (YJ_DATA[ek] && YJ_DATA[ek].length) {
          s.questions = s.questions.concat(YJ_DATA[ek]);
        }
      });
    });
  }

  /* ----------------------------- 启动 ----------------------------- */
  function boot() {
    if (typeof YJ_DATA === "undefined") { $("#content").innerHTML = '<div class="empty">数据未加载，请确认 assets/js/data_*.js 文件存在。</div>'; return; }
    mergeExtra();
    mergePapers();
    mergePredict();
    normalizeData();
    bindNav();
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
