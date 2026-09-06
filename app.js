/* ============================================================
   Bling — app.js
   Vanilla, zero-build. Renders from a data object so live Sheet
   data (via Apps Script) can swap in later without UI changes.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- persistence keys ---------- */
  var THEME_KEY = "bling.theme";
  var CONN_KEY = "bling.connection";
  var SNAP_KEY = "bling.snapshot";

  /* ---------- formatting ---------- */
  var inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  function inr(n) { return inrFmt.format(Math.round(n)); }
  function shortInr(n) {
    var a = Math.abs(n);
    if (a >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + "Cr";
    if (a >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + "L";
    if (a >= 1e3) return "₹" + Math.round(n / 1e3) + "k";
    return inr(n);
  }
  function signed(n) { return (n >= 0 ? "+" : "−") + inr(Math.abs(n)).replace("₹", "₹"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---------- demo snapshot (shape mirrors the future Sheet payload) ---------- */
  var DEMO = {
    generatedAt: "Sun 7 Sep",
    stale: "Figures updated 3 hours ago — tap to reconnect",
    netWorth: 1482340, deltaMonth: 23410, deltaPct: 1.6,
    liquid: 180240, invested: 2141900, owed: 690100,
    answers: { safeToday: 4200, debtFree: "Jan 2031", debtFreeNote: "52 months · avalanche", runway: "12.2 mo", runwayNote: "₹1.82L ÷ essentials", cardBill: 162600 },
    allocation: [
      { name: "Equity · MF", pct: 45, color: "var(--accent)" },
      { name: "PPF · FD", pct: 27, color: "var(--ink-soft)" },
      { name: "Gold", pct: 18, color: "var(--gold)" },
      { name: "Cash", pct: 10, color: "var(--ink-faint)" }
    ],
    emergency: { have: 182000, pct: 51, short: 178000 },
    upcoming: [
      { date: "03 Sep", name: "Rent", acct: "HDFC · auto", amt: -28000 },
      { date: "06 Sep", name: "Atlas card bill", acct: "from HDFC", amt: -14480 },
      { date: "10 Sep", name: "SIP · Nifty 50", acct: "Zerodha", amt: -15000 },
      { date: "15 Sep", name: "Home-loan EMI", acct: "SBI", amt: -42300 },
      { date: "28 Sep", name: "Netflix + Spotify", acct: "Atlas", amt: -1148 }
    ],
    today: { spent: 1384, safe: 4200, entries: [
      { time: "2:40p", name: "Rapido", cat: "SMS+Gmail merged", amt: -142 },
      { time: "1:10p", name: "Blinkit", cat: "Groceries", amt: -1240 },
      { time: "9:02a", name: "Chai Point", cat: "Eating out", amt: -2 }
    ] },
    week: { total: 12480, vs: 22, days: [40, 25, 70, 30, 100, 55, 20], labels: ["M", "T", "W", "T", "F", "S", "S"], note: "Friday was your heaviest — ₹4,100, mostly dining." },
    month: {
      spent: 58940, budget: 72000, left: 13060, daysLeft: 23, projected: 71200, avgDay: 2563,
      cats: [
        { name: "Eating out", spent: 6240, cap: 5000 },
        { name: "Groceries", spent: 9180, cap: 12000 },
        { name: "Transport", spent: 3410, cap: 6000 },
        { name: "Bills & rent", spent: 40110, cap: 49000 }
      ],
      alert: "Eating out is ₹1,240 over — mostly weekends. At this rate you'll finish ₹2,100 over."
    },
    year: { total: 684200, avgMo: 76022, months: [60, 52, 95, 70, 58, 64, 72, 88, 66, 8, 8, 8], labels: "JFMAMJJASOND".split(""), hi: 2, top: [
      { name: "Rent & bills", amt: 361000 }, { name: "Groceries", amt: 98400 }, { name: "Eating out", amt: 61200, note: "↑ 34% vs 2025" }
    ] },
    fixed: [
      { name: "Rent", acct: "HDFC · ~3rd · matched ₹17,000 on 3 Sep", amt: 17000, status: "ok", tip: "" },
      { name: "Atlas card bill", acct: "HDFC → Axis · matched 6 Sep", amt: 14480, status: "ok", tip: "" },
      { name: "Home-loan EMI", acct: "SBI · due 15th · fingerprint ₹42,300 ±2% / ±3 days", amt: 42300, status: "up", day: 15 },
      { name: "Netflix + Spotify", acct: "Atlas · due 28th · subscription", amt: 1148, status: "up", day: 28 }
    ],
    detects: [
      { text: 'A payment of <b>₹17,000</b> to <span class="raw">RAZORP*LANDLRD</span> has left HDFC around the <b>3rd</b> for <b>4 months</b> running. Mark it as fixed?', pick: "Rent", yes: "Mark" },
      { text: '<b>₹499</b> to <span class="raw">Spotify</span> every month — track as a subscription?', pick: "Subscription", yes: "Track" }
    ],
    suggest: [
      { name: "Food & eating out", note: "avg ₹9,050/mo · range 7.2k–11k", rec: 9500 },
      { name: "Transport", note: "avg ₹3,410/mo · steady", rec: 4000 },
      { name: "Groceries", note: "avg ₹9,800/mo", rec: 11000 }
    ],
    splurge: { takehome: 145000, fixed: 60448, caps: 24500, buffer: 20000, sip: 15000, free: 25052 },
    invest: {
      value: 2141900, gain: 114200, xirr: 14.2, cagr: 12.8, invested: 1860000, returns: 350000, fyGain: 114200,
      holdings: [
        { name: "Equity · Mutual funds", ret: "↑ 16.1%", retCls: "pos", val: 964000 },
        { name: "PPF · Fixed deposits", ret: "7.1% fixed", retCls: "", val: 578000 },
        { name: "Gold", ret: "↑ 9.4%", retCls: "pos", val: 385000 },
        { name: "EPF · NPS", ret: "manual · 12 Aug", retCls: "", val: 215000 }
      ],
      concentration: "Equity is 45% of net worth — above your 40% comfort line. Consider rebalancing ₹74k."
    },
    recent: [
      { date: "7 Sep", name: "Rapido", acct: "SMS + Gmail merged", amt: -142 },
      { date: "7 Sep", name: "Blinkit", acct: "Groceries", amt: -1240 },
      { date: "5 Sep", name: "Swiggy", acct: "Eating out", amt: -640 },
      { date: "1 Sep", name: "Salary", acct: "HDFC", amt: 145000 }
    ],
    predict: {
      brief: { head: "Three big dues land in the same week.", body: "Rent, the Atlas card bill and your home-loan EMI all fall between the 3rd and 15th — <b>₹84,780</b> before your salary clears on the 1st. Move ₹20,000 from Rainy-day now and you stay above buffer." },
      nextMonth: 134000, cardBill: 162600, cashflowBefore: 84780, cashflowBuffer: 20000
    },
    sync: [
      { name: "Gmail", sub: "bank & card alerts", st: "last ok 3h ago →", cls: "warn" },
      { name: "SMS webhook", sub: "Tasker → Bling", st: "live · 2 min ago", cls: "pos" },
      { name: "Manual entry", sub: "always available", st: "on", cls: "" }
    ]
  };

  /* ---------- state ---------- */
  var conn = JSON.parse(localStorage.getItem(CONN_KEY) || '{"endpoint":"","token":""}');
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(SNAP_KEY) || "null"); } catch (e) {}
  var state = {
    screen: "home", spendMode: "track", period: "month", wboard: "overview",
    theme: localStorage.getItem(THEME_KEY) || "light",
    blurred: false,
    connection: conn,
    data: (conn.endpoint && conn.token && cached) ? cached : DEMO
  };

  /* ---------- backend (Apps Script) ---------- */
  function api(action, payload) {
    var c = state.connection;
    return fetch(c.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
      body: JSON.stringify({ action: action, token: c.token, payload: payload || {} }),
      redirect: "follow"
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "backend error");
      return j.data;
    });
  }

  function loadLive(announce) {
    if (!state.connection.endpoint || !state.connection.token) return;
    api("bootstrap").then(function (d) {
      state.data = d;
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(d)); } catch (e) {}
      render();
      if (announce) toast("Synced with your Sheet");
    }).catch(function (err) {
      state.data.stale = "Couldn't sync — showing last data · tap to retry";
      render();
      toast("Sync failed: " + err.message);
    });
  }

  /* ---------- small template helpers ---------- */
  function moneyLines(items) {
    return items.map(function (x) {
      return '<div class="li"><span class="dt num">' + esc(x.date || x.time) + '</span><span class="nm">' + esc(x.name) +
        '<div class="ac">' + esc(x.acct || x.cat || "") + '</div></span><span class="amt num ' + (x.amt >= 0 ? "pos" : "neg") + '">' +
        (x.amt >= 0 ? "+" : "−") + inr(Math.abs(x.amt)) + '</span></div>';
    }).join("");
  }
  function allocBars(a) {
    return a.map(function (x) {
      return '<div class="ab"><span class="nm">' + esc(x.name) + '</span><span class="track"><i style="width:' + x.pct + '%;background:' + x.color + '"></i></span><span class="pc num">' + x.pct + '%</span></div>';
    }).join("");
  }

  /* ---------- phone screens ---------- */
  function scHome(d) {
    return '<section class="screen" data-s="home">' +
      '<div class="hero"><div class="eyebrow"><span class="tab">Net Worth · Total Position</span>' +
      '<button class="eye" data-act="blur" aria-label="Hide balances">' + icon("eye") + '</button></div>' +
      '<div class="nw serif num' + (state.blurred ? " blur" : "") + '">' + inr(d.netWorth) + '</div>' +
      '<div class="delta pos num"><span class="serif">↑</span> ' + inr(d.deltaMonth) + ' this month · +' + d.deltaPct + '%</div>' +
      '<div class="trio"><div><span class="tab">Liquid</span><div class="v serif num">' + shortInr(d.liquid) + '</div></div>' +
      '<div><span class="tab">Invested</span><div class="v serif num pos">' + shortInr(d.invested) + '</div></div>' +
      '<div><span class="tab">Owed</span><div class="v serif num neg">' + shortInr(d.owed) + '</div></div></div>' +
      (d.stale ? '<div class="ribbon" style="margin-top:14px"><span class="d"></span>' + esc(d.stale) + '</div>' : "") + '</div>' +
      '<div class="sec"><span class="tab">Your questions, answered</span></div>' +
      ansLine("Safe to spend today", "After bills, caps & next card bill", inr(d.answers.safeToday)) +
      ansLine("Debt-free by", d.answers.debtFreeNote, d.answers.debtFree) +
      ansLine("If income stopped, you'd last", d.answers.runwayNote, d.answers.runway) +
      '<div class="callout"><div class="h"><span class="tab" style="color:var(--ink)">Emergency Fund</span><span class="tagw">VULNERABLE</span></div>' +
      '<div class="big serif num">' + inr(d.emergency.have) + '</div><div class="track"><i style="width:' + d.emergency.pct + '%"></i></div>' +
      '<div class="s">' + d.emergency.pct + '% of a 6× buffer — <b style="color:var(--ink)">' + shortInr(d.emergency.short) + '</b> short of secure.</div></div>' +
      '</section>';
  }
  function ansLine(t, s, k) {
    return '<div class="ans"><div class="l"><div class="t">' + esc(t) + '</div><div class="s">' + esc(s) + '</div></div><div class="dotlead"></div><div class="k serif num">' + esc(k) + '</div></div>';
  }

  function scSpend(d) {
    var m = d.month;
    var catBars = m.cats.map(function (c) {
      var over = c.spent > c.cap, pctFill = Math.min(100, Math.round(c.spent / c.cap * 100));
      var rem = c.cap - c.spent;
      return '<div class="ab"><span class="nm">' + esc(c.name) + '<br><span class="tab" style="letter-spacing:.05em">' + inr(c.spent).replace("₹", "₹") + " / " + inr(c.cap) + '</span></span>' +
        '<span class="track"><i style="width:' + pctFill + '%;background:' + (over ? "var(--neg)" : "var(--accent)") + '"></i></span>' +
        '<span class="pc num ' + (over ? "neg" : "pos") + '">' + (over ? "−" + inr(Math.abs(rem)) : inr(rem)) + '</span></div>';
    }).join("");
    var yb = d.year.months.map(function (h, i) {
      return '<div class="col' + (i === d.year.hi ? " hi" : "") + (h < 12 ? '" style="opacity:.35"' : '"') + '><i style="height:' + h + '%"></i><span>' + d.year.labels[i] + '</span></div>';
    }).join("");
    var wb = d.week.days.map(function (h, i) {
      return '<div class="col' + (h === 100 ? " hi" : "") + '"><i style="height:' + h + '%"></i><span>' + d.week.labels[i] + '</span></div>';
    }).join("");
    return '<section class="screen" data-s="spend">' +
      '<div class="h1">Spend</div><div class="psub">Track spending, or plan your budget</div>' +
      '<div class="seg"><button class="' + (state.spendMode === "track" ? "on" : "") + '" data-mode="track">Track spending</button><button class="' + (state.spendMode === "plan" ? "on" : "") + '" data-mode="plan">Fixed & budgets</button></div>' +
      /* TRACK */
      '<div class="mv' + (state.spendMode === "track" ? " on" : "") + '" data-m="track">' +
      '<div class="period">' + ["today", "week", "month", "year"].map(function (p) {
        return '<button class="' + (state.period === p ? "on" : "") + '" data-period="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</button>';
      }).join("") + '</div>' +
      /* today */
      '<div class="pv' + (state.period === "today" ? " on" : "") + '" data-p="today"><div class="big-stat serif num">' + inr(d.today.spent) + '</div>' +
      '<div class="psub">spent today · <span class="pos">' + inr(d.today.safe) + ' still safe to spend</span></div>' +
      '<div class="sec"><span class="tab">Today\'s entries</span></div>' + moneyLines(d.today.entries) + '</div>' +
      /* week */
      '<div class="pv' + (state.period === "week" ? " on" : "") + '" data-p="week"><div class="big-stat serif num">' + inr(d.week.total) + '</div>' +
      '<div class="psub">this week · <span class="neg">↑ ' + d.week.vs + '% vs your typical week</span></div>' +
      '<div class="sec"><span class="tab">Mon → Sun</span></div><div class="ybars" style="height:80px">' + wb + '</div>' +
      '<div class="psub" style="padding-top:10px">' + esc(d.week.note) + '</div></div>' +
      /* month */
      '<div class="pv' + (state.period === "month" ? " on" : "") + '" data-p="month">' +
      '<div class="bsum"><div><span class="tab">Spent</span><div class="v serif num">' + inr(m.spent) + '</div></div>' +
      '<div><span class="tab">Left</span><div class="v serif num pos">' + inr(m.left) + '</div></div>' +
      '<div><span class="tab">Days left</span><div class="v serif num">' + m.daysLeft + '</div></div></div>' +
      '<div class="projbar"><i style="width:' + Math.round(m.spent / m.budget * 100) + '%"></i><span class="mark" style="left:100%"></span></div>' +
      '<div class="psub" style="padding-top:10px">Projected month-end <b class="serif num" style="color:var(--ink)">' + inr(m.projected) + '</b> of ' + inr(m.budget) + ' budget · <span class="pos">on track</span> · avg ' + inr(m.avgDay) + '/day</div>' +
      '<div class="sec"><span class="tab">Category budgets</span><span class="more">Edit caps</span></div>' + catBars +
      '<div class="callout" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Over cap</span><div class="s" style="margin-top:8px;color:var(--ink)">' + esc(m.alert) + '</div></div></div>' +
      /* year */
      '<div class="pv' + (state.period === "year" ? " on" : "") + '" data-p="year"><div class="big-stat serif num">' + inr(d.year.total) + '</div>' +
      '<div class="psub">spent in 2026 so far · avg <b class="num">' + inr(d.year.avgMo) + '</b>/mo</div>' +
      '<div class="ybars">' + yb + '</div><div class="sec"><span class="tab">Top categories · year</span></div>' +
      d.year.top.map(function (t) { return ansLine(t.name, t.note || "", shortInr(t.amt)); }).join("") + '</div>' +
      '</div>' +
      /* PLAN */
      '<div class="mv' + (state.spendMode === "plan" ? " on" : "") + '" data-m="plan">' + planHtml(d) + '</div>' +
      '</section>';
  }

  function planHtml(d) {
    var fixedTotal = d.fixed.reduce(function (s, f) { return s + f.amt; }, 0);
    var fx = d.fixed.map(function (f) {
      var mk = f.status === "ok" ? '<span class="mk ok">' + icon("check") + '</span>' : '<span class="mk up">' + f.day + '</span>';
      var st = f.status === "ok" ? '<span class="st ok">Settled</span>' : '<span class="st up">Upcoming</span>';
      return '<div class="fx">' + mk + '<div class="bd"><div class="t">' + esc(f.name) + '</div><div class="s">' + esc(f.acct) + '</div></div><div class="amt num">' + inr(f.amt) + st + '</div></div>';
    }).join("");
    var det = d.detects.map(function (x, i) {
      return '<div class="detect"><div class="kick">✦ Recurring detected</div><p>' + x.text + '</p><div class="actions">' +
        '<button class="pick">' + esc(x.pick) + ' ' + icon("chev") + '</button><button class="yes" data-act="mark" data-idx="' + i + '">' + esc(x.yes) + '</button><button class="no" data-act="toast" data-msg="Ignored">Ignore</button></div></div>';
    }).join("");
    var sg = d.suggest.map(function (s, i) {
      return '<div class="sg"><div class="bd"><div class="t">' + esc(s.name) + '</div><div class="s">' + esc(s.note) + '</div></div>' +
        '<div class="rec"><div class="k num serif">' + inr(s.rec) + '</div><div class="l">Suggested</div></div><button class="use" data-act="usecap" data-idx="' + i + '">Use</button></div>';
    }).join("");
    var sp = d.splurge;
    return '<div class="sec"><span class="tab">Fixed this month</span><span class="more">' + inr(fixedTotal) + ' total</span></div>' + fx +
      '<button class="addbtn" data-act="toast" data-msg="Add fixed expense (demo)">' + icon("plus") + 'Add a fixed expense</button>' +
      '<div class="flow" style="margin-top:4px">A match tags the expense and marks it settled. Tolerance is tunable, and you can re-tag any auto-match if Bling gets it wrong — needs ~3 months of history before it detects patterns on its own.</div>' +
      '<div class="sec"><span class="tab">Bling spotted a pattern</span></div>' + det +
      '<div class="sec"><span class="tab">Suggested budgets</span><span class="more">from last 3 months</span></div>' + sg +
      '<div class="splurge"><span class="tab" style="color:var(--ink)">What\'s left to splurge</span>' +
      splurgeRow("Take-home this month", sp.takehome) + splurgeRow("− Fixed & recurring", sp.fixed) +
      splurgeRow("− Variable caps", sp.caps) + splurgeRow("− Safety buffer", sp.buffer) + splurgeRow("− Invested (SIP)", sp.sip) +
      '<div class="tot"><span class="l">Free to splurge</span><span class="k num pos">' + inr(sp.free) + '</span></div>' +
      '<div class="flow">Updates live as fixed expenses match off and variable spend logs in. This is the number behind "Safe to spend today."</div></div>';
  }
  function splurgeRow(l, v) { return '<div class="row"><span>' + esc(l) + '</span><b class="num">' + inr(v) + '</b></div>'; }

  function scInvest(d) {
    var iv = d.invest;
    var hold = iv.holdings.map(function (h) {
      return '<div class="ans"><div class="l"><div class="t">' + esc(h.name) + '</div><div class="s ' + h.retCls + '">' + esc(h.ret) + '</div></div><div class="dotlead"></div><div class="k serif num">' + shortInr(h.val) + '</div></div>';
    }).join("");
    return '<section class="screen" data-s="invest"><div class="h1">Invest</div><div class="psub">Across 5 asset classes</div>' +
      '<div class="hero" style="padding-top:16px"><span class="tab">Portfolio Value</span><div class="nw sm serif num">' + inr(iv.value) + '</div>' +
      '<div class="delta pos num"><span class="serif">↑</span> ' + inr(iv.gain) + ' · XIRR ' + iv.xirr + '%</div></div>' +
      '<div class="sec"><span class="tab">Holdings</span></div>' + hold +
      '<div class="callout" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Concentration</span><div class="s" style="margin-top:8px;color:var(--ink)">' + esc(iv.concentration) + '</div></div></section>';
  }

  function scPredict(d) {
    var p = d.predict;
    return '<section class="screen" data-s="predict"><div class="h1">Predict</div><div class="psub">Forecasts from your live numbers</div>' +
      '<div class="brief"><div class="kick">Intelligence Briefing</div><h3>' + esc(p.brief.head) + '</h3><p>' + p.brief.body + '</p>' +
      '<button class="go" data-act="toast" data-msg="Briefing needs your Gemini key (Settings)">✦ Generate full briefing</button></div>' +
      '<div class="sec"><span class="tab">Forecast</span></div>' +
      ansLine("Next month's spend", "from commitments · ±8%", shortInr(p.nextMonth)) +
      '<div class="ans"><div class="l"><div class="t">This cycle\'s card bill</div><div class="s">spend + EMIs to hit</div></div><div class="dotlead"></div><div class="k serif num neg">' + inr(p.cardBill) + '</div></div>' +
      '<div class="sec"><span class="tab">Coming up · 14 days</span><span class="more">All</span></div>' + moneyLines(d.upcoming.slice(0, 4)) + '</section>';
  }

  function scYou(d) {
    var c = state.connection, connected = c.endpoint && c.token;
    var sync = d.sync.map(function (s) {
      return '<div class="li"><span class="nm">' + esc(s.name) + '<div class="ac">' + esc(s.sub) + '</div></span><span class="' + s.cls + '" style="font-size:11px">' + esc(s.st) + '</span></div>';
    }).join("");
    return '<section class="screen" data-s="you"><div class="h1">You</div><div class="psub">Connections & settings</div>' +
      '<div class="sec"><span class="tab">Your Sheet</span><span class="more">' + (connected ? "Connected" : "Demo data") + '</span></div>' +
      '<div class="psub" style="padding:4px 0 0">Paste your Apps Script Web App URL and device token. They stay on this device; Bling never sees your Google password.</div>' +
      '<form data-form="conn">' +
      '<label class="field"><span>Apps Script URL</span><input name="endpoint" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(c.endpoint) + '"></label>' +
      '<label class="field"><span>Device token</span><input name="token" type="password" placeholder="fos_••••••••" value="' + esc(c.token) + '"></label>' +
      '<button class="btn" type="submit">' + (connected ? "Update connection" : "Connect") + '</button>' +
      (connected ? ' <button class="btn ghost" type="button" data-act="disconnect">Disconnect</button>' : "") +
      '</form>' +
      '<div class="sec"><span class="tab">Sync health</span></div>' + sync +
      '<div class="sec"><span class="tab">Subscriptions</span></div>' +
      '<div class="empty"><span class="tab">Nothing tracked yet</span><p>Let Bling scan Gmail for recurring charges you might have forgotten.</p><button data-act="scan">Scan Gmail for subscriptions</button></div>' +
      '<div class="sec"><span class="tab">Appearance</span></div>' +
      '<div class="seg" style="border:0"><button class="' + (state.theme === "light" ? "on" : "") + '" data-theme-set="light">Paper</button><button class="' + (state.theme === "dark" ? "on" : "") + '" data-theme-set="dark">Charcoal</button></div>' +
      '</section>';
  }

  /* ---------- web boards (broadsheet) ---------- */
  function webShell(d) {
    return '<div class="web"><header class="w-mast"><div class="title"><span class="m"></span>The Bling Ledger</div>' +
      '<div class="edition">Personal Edition · ' + esc(d.generatedAt) + ' · No. 09</div></header>' +
      '<div class="w-navbar"><nav>' + ["overview", "spend", "invest", "predict"].map(function (b) {
        return '<a class="' + (state.wboard === b ? "on" : "") + '" data-wgo="' + b + '">' + b.charAt(0).toUpperCase() + b.slice(1) + '</a>';
      }).join("") + '</nav><div style="display:flex;align-items:center;gap:16px"><span class="ribbon"><span class="d"></span>Updated 3h ago · reconnect</span>' +
      '<button class="ttoggle" data-act="theme" aria-label="Toggle theme">' + icon("moon") + '</button></div></div>' +
      wbOverview(d) + wbSpend(d) + wbInvest(d) + wbPredict(d) + '</div>';
  }
  function ansWeb(t, s, k, cls) { return '<div class="ans-web"><div><div class="t">' + esc(t) + '</div>' + (s ? '<div class="s">' + esc(s) + '</div>' : "") + '</div><div class="k num ' + (cls || "") + '">' + esc(k) + '</div></div>'; }
  function wbOverview(d) {
    return '<div class="wboard' + (state.wboard === "overview" ? " on" : "") + '" data-b="overview"><div class="w-grid">' +
      '<div class="w-col lead"><div class="lede-lbl">Net Worth · Total Position</div><div class="w-nw serif num">' + inr(d.netWorth) + '</div>' +
      '<div class="w-delta pos num"><span class="serif">↑</span> ' + inr(d.deltaMonth) + ' this month · +' + d.deltaPct + '% · trailing 12-mo high</div>' +
      '<div class="w-trio"><div><span class="tab">Liquid</span><div class="v serif num">' + inr(d.liquid) + '</div></div><div><span class="tab">Invested</span><div class="v serif num pos">' + inr(d.invested) + '</div></div><div><span class="tab">Owed</span><div class="v serif num neg">' + inr(d.owed) + '</div></div></div>' +
      '<div class="colhead">Your questions, answered</div>' +
      ansWeb("Safe to spend today", "After bills, caps & next card bill", inr(d.answers.safeToday)) +
      ansWeb("Debt-free by", d.answers.debtFreeNote, d.answers.debtFree) +
      ansWeb("Jobless runway", d.answers.runwayNote, d.answers.runway) +
      ansWeb("This cycle's card bill", "spend so far + EMIs to hit", inr(d.answers.cardBill), "neg") + '</div>' +
      '<div class="w-col"><div class="colhead">Allocation <span class="more">Rebalance</span></div>' + allocBars(d.allocation) +
      '<div class="w-call"><div style="display:flex;justify-content:space-between;align-items:center"><span class="tab" style="color:var(--ink)">Emergency Fund</span><span class="tagw">VULNERABLE</span></div><div class="big num">' + inr(d.emergency.have) + '</div><div class="track"><i style="width:' + d.emergency.pct + '%"></i></div><div class="s" style="font-size:11.5px;color:var(--ink-soft);margin-top:8px">' + d.emergency.pct + '% of a 6× buffer — ' + shortInr(d.emergency.short) + ' short.</div></div></div>' +
      '<div class="w-col last"><div class="colhead">Coming up · 14 days <span class="more">All</span></div><div class="w-tbl">' +
      d.upcoming.slice(0, 4).map(function (u) { return '<div class="tr"><span class="dt num">' + esc(u.date) + '</span><span class="nm">' + esc(u.name) + ' · ' + esc(u.acct.split(" ")[0]) + '</span><span class="amt neg num">−' + inr(Math.abs(u.amt)) + '</span></div>'; }).join("") +
      '</div><div class="colhead" style="margin-top:22px">Intelligence</div><p style="font-family:\'Fraunces\',serif;font-size:16px;font-weight:500;line-height:1.3;margin-bottom:8px">' + esc(d.predict.brief.head) + '</p><p style="font-size:12.5px;color:var(--ink-soft);line-height:1.55">' + d.predict.brief.body.replace(/<[^>]+>/g, "") + '</p></div>' +
      '</div></div>';
  }
  function wbSpend(d) {
    var m = d.month;
    var caps = m.cats.map(function (c) { var over = c.spent > c.cap, rem = c.cap - c.spent; return '<div class="ab"><span class="nm" style="width:150px">' + esc(c.name) + ' <span class="tab" style="letter-spacing:.04em">' + Math.round(c.spent / 1000) + 'k/' + Math.round(c.cap / 1000) + 'k</span></span><span class="track"><i style="width:' + Math.min(100, Math.round(c.spent / c.cap * 100)) + '%;background:' + (over ? "var(--neg)" : "var(--accent)") + '"></i></span><span class="pc num ' + (over ? "neg" : "pos") + '">' + (over ? "−" + inr(Math.abs(rem)) : inr(rem)) + '</span></div>'; }).join("");
    return '<div class="wboard' + (state.wboard === "spend" ? " on" : "") + '" data-b="spend"><div class="lede-lbl" style="padding-top:18px">Spending & Budget · Month</div>' +
      '<div class="w-trio" style="margin:14px 0"><div><span class="tab">Spent</span><div class="v serif num">' + inr(m.spent) + '</div></div><div><span class="tab">Left</span><div class="v serif num pos">' + inr(m.left) + '</div></div><div><span class="tab">Projected</span><div class="v serif num">' + inr(m.projected) + '</div></div><div><span class="tab">Avg/day</span><div class="v serif num">' + inr(m.avgDay) + '</div></div></div>' +
      '<div class="w-grid" style="grid-template-columns:1.3fr 1fr"><div class="w-col lead"><div class="colhead">Category budgets <span class="more">Edit caps</span></div>' + caps + '</div>' +
      '<div class="w-col"><div class="colhead">Recent</div><div class="w-tbl">' + d.recent.map(function (r) { return '<div class="tr"><span class="dt num">' + esc(r.date) + '</span><span class="nm">' + esc(r.name) + '</span><span class="amt num ' + (r.amt >= 0 ? "pos" : "neg") + '">' + (r.amt >= 0 ? "+" : "−") + inr(Math.abs(r.amt)) + '</span></div>'; }).join("") + '</div>' +
      '<div class="w-call" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Over cap</span><div class="s" style="font-size:12px;color:var(--ink);margin-top:6px">' + esc(m.alert) + '</div></div></div></div></div>';
  }
  function wbInvest(d) {
    var iv = d.invest;
    return '<div class="wboard' + (state.wboard === "invest" ? " on" : "") + '" data-b="invest"><div class="w-grid">' +
      '<div class="w-col lead"><div class="lede-lbl">Portfolio · Total Value</div><div class="w-nw sm serif num">' + inr(iv.value) + '</div><div class="w-delta pos num"><span class="serif">↑</span> ' + inr(iv.gain) + ' all-time · XIRR ' + iv.xirr + '% · CAGR ' + iv.cagr + '%</div>' +
      '<div class="colhead" style="margin-top:22px">Holdings</div><div class="w-tbl">' + iv.holdings.map(function (h) { return '<div class="tr"><span class="nm">' + esc(h.name) + '</span><span style="width:80px" class="' + h.retCls + ' num">' + esc(h.ret) + '</span><span class="amt num" style="width:90px;text-align:right">' + shortInr(h.val) + '</span></div>'; }).join("") + '</div></div>' +
      '<div class="w-col"><div class="colhead">Allocation</div>' + allocBars(d.allocation) + '<div class="w-call" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Concentration</span><div class="s" style="font-size:12px;color:var(--ink);margin-top:6px">' + esc(iv.concentration) + '</div></div></div>' +
      '<div class="w-col last"><div class="colhead">Performance</div>' + ansWeb("Invested", "", shortInr(iv.invested)) + ansWeb("Returns", "since 2021", shortInr(iv.returns), "pos") + ansWeb("This FY gain", "", shortInr(iv.fyGain), "pos") + '</div>' +
      '</div></div>';
  }
  function wbPredict(d) {
    var p = d.predict;
    return '<div class="wboard' + (state.wboard === "predict" ? " on" : "") + '" data-b="predict"><div class="w-grid">' +
      '<div class="w-col lead"><div class="lede-lbl">Intelligence Briefing</div><div style="font-family:\'Fraunces\',serif;font-size:38px;font-weight:600;line-height:1.05;margin:14px 0 14px;letter-spacing:-.02em">' + esc(p.brief.head) + '</div>' +
      '<p style="font-size:14px;color:var(--ink-soft);line-height:1.6;max-width:46ch">' + p.brief.body + '</p>' +
      '<button class="go" style="margin-top:16px;width:auto;padding:10px 18px" data-act="toast" data-msg="Needs your Gemini key">✦ Generate full briefing</button>' +
      '<div class="colhead" style="margin-top:26px">Forecast</div>' + ansWeb("Next month's spend", "±8%", shortInr(p.nextMonth)) + ansWeb("This cycle's card bill", "spend + EMIs", inr(p.cardBill), "neg") + ansWeb("Debt-free by", "avalanche", d.answers.debtFree) + '</div>' +
      '<div class="w-col"><div class="colhead">Cash-flow radar</div><p style="font-size:12.5px;color:var(--ink-soft);line-height:1.5;margin-bottom:12px">Dues vs your next salary (1 Oct).</p>' +
      '<div class="ab"><span class="nm">Before salary</span><span class="track"><i style="width:88%;background:var(--neg)"></i></span><span class="pc num neg">' + shortInr(p.cashflowBefore) + '</span></div>' +
      '<div class="ab"><span class="nm">Buffer</span><span class="track"><i style="width:20%;background:var(--warn)"></i></span><span class="pc num">' + shortInr(p.cashflowBuffer) + '</span></div>' +
      '<div class="w-call"><span class="tab" style="color:var(--ink)">Debt-free countdown</span><div class="big num">' + d.answers.debtFree + '</div><div class="s" style="font-size:11.5px;color:var(--ink-soft)">52 months · +₹5k/mo prepay saves 8 months</div></div></div>' +
      '<div class="w-col last"><div class="colhead">Coming up · 30 days <span class="more">All</span></div><div class="w-tbl">' + d.upcoming.map(function (u) { return '<div class="tr"><span class="dt num">' + esc(u.date) + '</span><span class="nm">' + esc(u.name) + '</span><span class="amt neg num">−' + inr(Math.abs(u.amt)) + '</span></div>'; }).join("") + '</div></div>' +
      '</div></div>';
  }

  /* ---------- icons ---------- */
  function icon(n) {
    var i = {
      eye: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
      moon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
      check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>',
      chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
      plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      home: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
      spend: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
      invest: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
      predict: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.4 5 5.6.6-4 4 1 5.4-5-2.8-5 2.8 1-5.4-4-4 5.6-.6z"/></svg>',
      you: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>'
    };
    return i[n] || "";
  }

  /* ---------- render ---------- */
  function phoneShell(d) {
    var screens = { home: scHome, spend: scSpend, invest: scInvest, predict: scPredict, you: scYou };
    // render only the active screen; mark it .on for the reveal animation
    var body = screens[state.screen](d).replace('class="screen"', 'class="screen on"');
    var nav = ["home", "spend", "invest", "predict", "you"].map(function (n) {
      return '<button class="' + (state.screen === n ? "on" : "") + '" data-go="' + n + '"><span class="u"></span>' + icon(n) + n.charAt(0).toUpperCase() + n.slice(1) + '</button>';
    }).join("");
    return '<div class="phone"><header class="mast"><div class="brand"><span class="m"></span>BLING</div>' +
      '<div class="right"><span class="meta serif ital">No. 09 · ' + esc(d.generatedAt) + '</span>' +
      '<button class="ttoggle" data-act="theme" aria-label="Toggle theme">' + icon("moon") + '</button></div></header>' +
      body + '<nav class="nav">' + nav + '</nav></div>';
  }

  function render() {
    document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "");
    document.body.setAttribute("data-theme", state.theme === "dark" ? "dark" : "");
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute("content", state.theme === "dark" ? "#17150F" : "#F6F2E9");
    var app = document.getElementById("app");
    app.innerHTML = phoneShell(state.data) + webShell(state.data);
  }

  /* ---------- interactions ---------- */
  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:11px 18px;border-radius:6px;font-size:13px;font-weight:600;z-index:99;box-shadow:0 6px 24px rgba(0,0,0,.2)";
    if (state.theme === "dark") t.style.color = "#0d1712";
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 300); }, 1600);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-act],[data-mode],[data-period],[data-wgo],[data-theme-set]");
    if (!t) return;
    if (t.dataset.go) { state.screen = t.dataset.go; render(); }
    else if (t.dataset.wgo) { state.wboard = t.dataset.wgo; render(); }
    else if (t.dataset.mode) { state.spendMode = t.dataset.mode; render(); }
    else if (t.dataset.period) { state.period = t.dataset.period; render(); }
    else if (t.dataset.themeSet) { setTheme(t.dataset.themeSet); }
    else if (t.dataset.act === "theme") { setTheme(state.theme === "dark" ? "light" : "dark"); }
    else if (t.dataset.act === "blur") { state.blurred = !state.blurred; render(); }
    else if (t.dataset.act === "toast") { toast(t.dataset.msg || "Demo"); }
    else if (t.dataset.act === "disconnect") { state.connection = { endpoint: "", token: "" }; localStorage.removeItem(CONN_KEY); render(); toast("Disconnected — showing demo data"); }
    else if (t.dataset.act === "mark") { doMark(Number(t.dataset.idx)); }
    else if (t.dataset.act === "usecap") { doUseCap(Number(t.dataset.idx)); }
    else if (t.dataset.act === "scan") { doScan(); }
  });

  function connected() { return state.connection.endpoint && state.connection.token; }
  function needSheet() { toast("Connect your Sheet first (You → Your Sheet)"); }
  function doMark(i) {
    var x = state.data.detects[i]; if (!x) return;
    if (!connected()) { return needSheet(); }
    toast("Marking…");
    api("confirm_recurring", { recurring: x.recurring }).then(function () { loadLive(false); toast("Marked as recurring ✓"); }).catch(function (e) { toast("Failed: " + e.message); });
  }
  function doUseCap(i) {
    var s = state.data.suggest[i]; if (!s) return;
    if (!connected()) { return needSheet(); }
    toast("Setting cap…");
    api("set_budget_cap", { name: s.name, cap: s.rec }).then(function () { loadLive(false); toast("Budget cap set ✓"); }).catch(function (e) { toast("Failed: " + e.message); });
  }
  function doScan() {
    if (!connected()) { return needSheet(); }
    toast("Scanning Gmail…");
    api("scan_gmail").then(function (r) { loadLive(false); toast("Scanned: " + (r.staged || 0) + " new, " + (r.skipped || 0) + " known"); }).catch(function (e) { toast("Failed: " + e.message); });
  }

  document.addEventListener("submit", function (e) {
    var f = e.target.closest('form[data-form=conn]');
    if (!f) return;
    e.preventDefault();
    var fd = new FormData(f);
    state.connection = { endpoint: String(fd.get("endpoint") || "").trim(), token: String(fd.get("token") || "").trim() };
    localStorage.setItem(CONN_KEY, JSON.stringify(state.connection));
    render();
    if (state.connection.endpoint && state.connection.token) { toast("Connecting…"); loadLive(true); }
    else toast("Cleared — showing demo data");
  });

  function setTheme(mode) {
    state.theme = mode;
    localStorage.setItem(THEME_KEY, mode);
    render();
  }

  /* ---------- boot ---------- */
  render();
  loadLive(false); // reconcile with the Sheet in the background if connected
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
  }
})();
