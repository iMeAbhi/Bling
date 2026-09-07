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
    accountsList: [{ id: "acc_hdfc", name: "Salary account", type: "bank" }, { id: "acc_cash", name: "Cash", type: "cash" }],
    monthly: {
      "2026-04": { spent: 61200, count: 210, cats: { "Eating out": 8200, "Groceries": 9100, "Transport": 4200, "Rent": 17910 } },
      "2026-05": { spent: 58400, count: 198, cats: { "Eating out": 6400, "Groceries": 9800, "Transport": 3800, "Rent": 17910 } },
      "2026-06": { spent: 64800, count: 224, cats: { "Eating out": 9600, "Groceries": 10200, "Transport": 5100, "Rent": 17910 } },
      "2026-07": { spent: 71200, count: 240, cats: { "Eating out": 11200, "Groceries": 9400, "Transport": 4600, "Rent": 17910 } },
      "2026-08": { spent: 66100, count: 231, cats: { "Eating out": 7800, "Groceries": 11000, "Transport": 4900, "Rent": 17910 } },
      "2026-09": { spent: 33371, count: 118, cats: { "Eating out": 4200, "Groceries": 5300, "Transport": 2100, "Rent": 17910 } }
    },
    allTxns: [
      { iso: new Date().toISOString(), date: "7 Sep", name: "Rapido", cat: "Transport", acct: "HDFC", amt: -142 },
      { iso: new Date().toISOString(), date: "7 Sep", name: "Blinkit", cat: "Groceries", acct: "HDFC", amt: -1240 },
      { iso: new Date(Date.now() - 2 * 864e5).toISOString(), date: "5 Sep", name: "Swiggy", cat: "Eating out", acct: "HDFC", amt: -640 },
      { iso: new Date(Date.now() - 6 * 864e5).toISOString(), date: "1 Sep", name: "Salary", cat: "Income", acct: "HDFC", amt: 145000 },
      { id: "demo_u1", iso: new Date().toISOString(), date: "7 Sep", name: "WDL TFR UPI/DR/6367/MOKOBAR", cat: "Uncategorized", acct: "HDFC", accId: "acc_hdfc", amt: -420 },
      { id: "demo_r1", iso: new Date(Date.now() - 5 * 864e5).toISOString(), date: "2 Sep", name: "WDL TFR UPI/DR/639912491459/SHIVAM/SBIN/Paid", cat: "Uncategorized", acct: "HDFC", accId: "acc_hdfc", amt: -17910 },
      { id: "demo_r2", iso: new Date(Date.now() - 35 * 864e5).toISOString(), date: "3 Aug", name: "WDL TFR UPI/DR/658029466737/SHIVAMA/HDFC/Paid", cat: "Uncategorized", acct: "HDFC", accId: "acc_hdfc", amt: -17910 },
      { id: "demo_r3", iso: new Date(Date.now() - 66 * 864e5).toISOString(), date: "3 Jul", name: "WDL TFR UPI/DR/645322523888/SHIVAMK/SBIN/rent", cat: "Uncategorized", acct: "HDFC", accId: "acc_hdfc", amt: -17910 }
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
    screen: "home", spendMode: "track", period: "month", wperiod: "month", wboard: "overview", monthOffset: 0,
    reviewing: false, makeRules: true, doneIds: {}, adding: false, editId: null, txnQuery: "", _focusSearch: false, groupBy: "amount", trendCat: "All",
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
  var CATS = ["Rent", "EMI / Loan", "Bills & utilities", "Subscriptions", "Eating out", "Groceries", "Transport", "Shopping", "Entertainment", "Health", "Investments", "Income", "Transfer", "Other"];
  function uncatList() { return (state.data.allTxns || []).filter(function (t) { var c = String(t.cat || "").toLowerCase(); return !c || c === "uncategorized"; }); }
  var KW_NOISE = /^(wdl|tfr|upi|dr|cr|ach|neft|imps|rtgs|debit|credit|paid|rent|bank|ltd|pvt|india|sbin|hdfc|icic|yesb|utib|axis|kkbk|pytm|brokin|clearin|payment|transfer)$/;
  function keywordFrom(name) {
    var s = String(name || "");
    var m = s.match(/\d{6,}[\/ ]+([A-Za-z]{3,20})/);                 // payee after the reference number
    if (m && !KW_NOISE.test(m[1].toLowerCase())) return m[1].toLowerCase();
    var toks = s.toLowerCase().split(/[^a-z]+/).filter(function (t) { return t.length >= 4 && !KW_NOISE.test(t); });
    toks.sort(function (a, b) { return b.length - a.length; });
    return toks[0] || "";
  }
  function isUncat(t) { var c = String(t.cat || "").toLowerCase(); return !c || c === "uncategorized"; }
  function payeeSimilar(a, b) {
    a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
    if (!a || !b) return false;
    if (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
    var n = Math.min(a.length, b.length, 5);
    return n >= 4 && a.slice(0, n) === b.slice(0, n);
  }
  function sameAmountUncat(amt) { return (state.data.allTxns || []).filter(function (t) { return isUncat(t) && Math.abs(Math.abs(t.amt) - amt) <= 1; }); }
  function similarUncat(amt, name) { var kw = keywordFrom(name); return sameAmountUncat(amt).filter(function (t) { return payeeSimilar(kw, keywordFrom(t.name)); }); }
  function medianJs(a) { if (!a.length) return 1; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
  function ordinalJs(n) { n = Number(n) || 0; var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  var FIXED_CATS = { "Rent": 1, "EMI / Loan": 1, "Bills & utilities": 1, "Subscriptions": 1 };
  function makeGroup(items) {
    var months = {}; items.forEach(function (t) { months[String(t.iso || "").slice(0, 7)] = true; });
    var amts = items.map(function (t) { return Math.abs(t.amt); });
    var minA = Math.min.apply(null, amts), maxA = Math.max.apply(null, amts);
    var fixed = (maxA - minA) <= Math.max(50, minA * 0.05);
    var days = items.map(function (t) { return new Date(t.iso).getDate(); });
    return {
      payee: titleCaseJs(keywordFrom(items[0].name) || "payment"), count: items.length, months: Object.keys(months).length,
      fixed: fixed, amt: fixed ? medianJs(amts) : 0, minA: minA, maxA: maxA,
      total: amts.reduce(function (s, x) { return s + x; }, 0), day: medianJs(days),
      sample: items[0], ids: items.map(function (x) { return x.id; })
    };
  }
  // Two grouping modes:
  //  amount (default) — same amount (±₹10) + similar payee, 3+ months. Isolates
  //    rent (₹17,910 to Shivam) from Shivam-groceries at other amounts.
  //  payee — same payee, any amount, 3+ times, with a spread guard so a common
  //    name across unrelated payments (your own name, an aggregator) is skipped.
  function recurringGroups() {
    var mode = state.groupBy || "amount";
    var list = uncatList(), groups = [];
    if (mode === "amount") {
      var byAmt = {};
      list.forEach(function (t) { var a = Math.round(Math.abs(t.amt) / 10) * 10; (byAmt[a] = byAmt[a] || []).push(t); });
      Object.keys(byAmt).forEach(function (a) {
        var items = byAmt[a], used = [];
        for (var i = 0; i < items.length; i++) {
          if (used[i]) continue;
          var cl = [items[i]]; used[i] = true; var ki = keywordFrom(items[i].name);
          for (var j = i + 1; j < items.length; j++) { if (used[j]) continue; if (payeeSimilar(ki, keywordFrom(items[j].name))) { cl.push(items[j]); used[j] = true; } }
          var mo = {}; cl.forEach(function (t) { mo[String(t.iso || "").slice(0, 7)] = true; });
          if (Object.keys(mo).length >= 3) groups.push(makeGroup(cl));
        }
      });
    } else {
      var byP = {};
      list.forEach(function (t) { var p = keywordFrom(t.name); if (!p || p.length < 5) return; var key = null; for (var k in byP) { if (payeeSimilar(k, p)) { key = k; break; } } (byP[key || p] = byP[key || p] || []).push(t); });
      Object.keys(byP).forEach(function (p) {
        var items = byP[p]; if (items.length < 3) return;
        var amts = items.map(function (t) { return Math.abs(t.amt); });
        if (Math.max.apply(null, amts) > Math.min.apply(null, amts) * 20) return;   // spread guard
        groups.push(makeGroup(items));
      });
    }
    groups.sort(function (x, y) { return y.total - x.total; });
    return groups;
  }
  function markDone(id, cat) {
    var t = (state.data.allTxns || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (t) t.cat = cat;
    state.doneIds[id] = cat;
    var row = document.querySelector('.ureview[data-row="' + cssEsc(id) + '"]');
    if (row) { row.classList.add("done"); var ch = row.querySelector(".chips"); if (ch) ch.remove(); if (!row.querySelector(".set")) { var s = document.createElement("div"); s.className = "set"; s.textContent = "✓ " + cat; row.appendChild(s); } }
  }
  // filter the full transaction list to a period, client-side
  function txnsFor(period) {
    var list = state.data.allTxns || [];
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    return list.filter(function (t) {
      var d = new Date(t.iso || t.date); if (isNaN(d.getTime())) return false;
      if (period === "today") return d.toDateString() === now.toDateString();
      if (period === "week") return (now - d) <= 7 * 864e5 && d <= now;
      if (period === "month") return d.getFullYear() === y && d.getMonth() === m;
      if (period === "year") return d.getFullYear() === y;
      return true;
    });
  }
  // compute a month's figures client-side from the full list, for any offset (0 = current)
  function monthData(offset) {
    var d = state.data, now = new Date();
    var dd = new Date(now.getFullYear(), now.getMonth() + offset, 1), y = dd.getFullYear(), mo = dd.getMonth();
    var key = y + "-" + String(mo + 1).padStart(2, "0");
    var rec = (d.monthly || {})[key];                                  // server aggregate over ALL txns
    var list = (d.allTxns || []).filter(function (t) { var x = new Date(t.iso || t.date); return x.getFullYear() === y && x.getMonth() === mo; });
    var listSpent = Math.abs(list.reduce(function (s, t) { return s + Math.min(0, t.amt); }, 0));
    var spent = rec ? rec.spent : listSpent;
    var count = rec ? rec.count : list.length;
    var caps = d.caps || (d.month.cats || []).map(function (c) { return { name: c.name, cap: c.cap }; });
    var cats = caps.map(function (c) {
      var cs = rec ? (rec.cats[c.name] || 0) : Math.abs(list.filter(function (t) { return String(t.cat) === String(c.name); }).reduce(function (s, t) { return s + Math.min(0, t.amt); }, 0));
      return { name: c.name, spent: cs, cap: c.cap };
    });
    var budget = d.month.budget || 0, isCur = offset === 0;
    var over = cats.filter(function (c) { return c.spent > c.cap; });
    return {
      label: dd.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      spent: spent, budget: budget, left: Math.max(0, budget - spent), count: count,
      daysLeft: isCur ? d.month.daysLeft : 0, projected: isCur ? d.month.projected : spent, avgDay: isCur ? d.month.avgDay : Math.round(spent / 30),
      cats: cats, alert: over.length ? over[0].name + " is " + inr(over[0].spent - over[0].cap) + " over cap." : "", list: list, isCur: isCur
    };
  }
  function applyQuery(items) {
    var q = (state.txnQuery || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(function (t) { return (t.name + " " + (t.cat || "") + " " + Math.abs(t.amt)).toLowerCase().indexOf(q) !== -1; });
  }
  function searchBox() {
    return '<input class="txnsearch" type="search" placeholder="Search transactions (merchant, amount, category)…" value="' + esc(state.txnQuery) + '">';
  }
  function txnList(items, limit) {
    items = applyQuery(items);
    var lim = (state.txnQuery || "").trim() ? 400 : (limit || 60);
    if (!items.length) return '<div class="psub" style="padding:14px 0">' + (state.txnQuery ? "No matches." : "No transactions in this period.") + '</div>';
    return items.slice(0, lim).map(function (t) {
      var editable = t.id ? ' data-tedit="' + esc(t.id) + '" style="cursor:pointer"' : "";
      return '<div class="li"' + editable + '><span class="dt num">' + esc(t.date) + '</span><span class="nm">' + esc(t.name) +
        '<div class="ac">' + esc(t.cat || t.acct || "") + '</div></span><span class="amt num ' + (t.amt >= 0 ? "pos" : "neg") + '">' +
        (t.amt >= 0 ? "+" : "−") + inr(Math.abs(t.amt)) + '</span></div>';
    }).join("") + (items.length > lim ? '<div class="psub" style="padding:10px 0">+ ' + (items.length - lim) + ' more</div>' : "");
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
    var m = monthData(state.monthOffset);
    var catBars = (m.cats.length ? m.cats : []).map(function (c) {
      var over = c.spent > c.cap, pctFill = c.cap ? Math.min(100, Math.round(c.spent / c.cap * 100)) : 0;
      var rem = c.cap - c.spent;
      return '<div class="ab"><span class="nm">' + esc(c.name) + '<br><span class="tab" style="letter-spacing:.05em">' + inr(c.spent) + " / " + inr(c.cap) + '</span></span>' +
        '<span class="track"><i style="width:' + pctFill + '%;background:' + (over ? "var(--neg)" : "var(--accent)") + '"></i></span>' +
        '<span class="pc num ' + (over ? "neg" : "pos") + '">' + (over ? "−" + inr(Math.abs(rem)) : inr(rem)) + '</span></div>';
    }).join("") || '<div class="psub" style="padding:12px 0">No category caps yet. Set them in Fixed & budgets.</div>';
    var yb = d.year.months.map(function (h, i) {
      return '<div class="col' + (i === d.year.hi ? " hi" : "") + (h < 12 ? '" style="opacity:.35"' : '"') + '><i style="height:' + h + '%"></i><span>' + d.year.labels[i] + '</span></div>';
    }).join("");
    var wb = d.week.days.map(function (h, i) {
      return '<div class="col' + (h === 100 ? " hi" : "") + '"><i style="height:' + h + '%"></i><span>' + d.week.labels[i] + '</span></div>';
    }).join("");
    return '<section class="screen" data-s="spend">' +
      '<div class="h1">Spend</div><div class="psub">Track spending, or plan your budget</div>' +
      '<div class="seg"><button class="' + (state.spendMode === "track" ? "on" : "") + '" data-mode="track">Track</button><button class="' + (state.spendMode === "plan" ? "on" : "") + '" data-mode="plan">Fixed & budgets</button><button class="' + (state.spendMode === "trends" ? "on" : "") + '" data-mode="trends">Trends</button></div>' +
      /* TRACK */
      '<div class="mv' + (state.spendMode === "track" ? " on" : "") + '" data-m="track">' +
      (uncatList().length ? '<div class="reviewbar"><div><div class="t">' + uncatList().length + ' uncategorised</div><div class="s">Assign them so budgets & patterns work</div></div><button data-act="review">Review</button></div>' : "") +
      searchBox() +
      '<div class="period">' + ["today", "week", "month", "year"].map(function (p) {
        return '<button class="' + (state.period === p ? "on" : "") + '" data-period="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</button>';
      }).join("") + '</div>' +
      /* today */
      '<div class="pv' + (state.period === "today" ? " on" : "") + '" data-p="today"><div class="big-stat serif num">' + inr(d.today.spent) + '</div>' +
      '<div class="psub">spent today · <span class="pos">' + inr(d.today.safe) + ' still safe to spend</span></div>' +
      '<div class="sec"><span class="tab">Today\'s transactions</span></div>' + txnList(txnsFor("today")) + '</div>' +
      /* week */
      '<div class="pv' + (state.period === "week" ? " on" : "") + '" data-p="week"><div class="big-stat serif num">' + inr(d.week.total) + '</div>' +
      '<div class="psub">this week · <span class="neg">↑ ' + d.week.vs + '% vs your typical week</span></div>' +
      '<div class="sec"><span class="tab">This week\'s transactions</span></div>' + txnList(txnsFor("week")) + '</div>' +
      /* month */
      '<div class="pv' + (state.period === "month" ? " on" : "") + '" data-p="month">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 2px">' +
      '<button data-act="monthPrev" aria-label="Previous month" style="font-size:20px;color:var(--ink-soft);padding:4px 10px">‹</button>' +
      '<span class="serif" style="font-size:16px;font-weight:600">' + esc(m.label) + '</span>' +
      '<button data-act="monthNext" aria-label="Next month" style="font-size:20px;color:' + (state.monthOffset >= 0 ? "var(--rule)" : "var(--ink-soft)") + ';padding:4px 10px">›</button></div>' +
      '<div class="bsum"><div><span class="tab">Spent</span><div class="v serif num">' + inr(m.spent) + '</div></div>' +
      '<div><span class="tab">Left</span><div class="v serif num pos">' + inr(m.left) + '</div></div>' +
      '<div><span class="tab">' + (m.isCur ? "Days left" : "Txns") + '</span><div class="v serif num">' + (m.isCur ? m.daysLeft : m.list.length) + '</div></div></div>' +
      '<div class="projbar"><i style="width:' + (m.budget ? Math.min(100, Math.round(m.spent / m.budget * 100)) : 0) + '%"></i><span class="mark" style="left:100%"></span></div>' +
      (m.isCur ? '<div class="psub" style="padding-top:10px">Projected month-end <b class="serif num" style="color:var(--ink)">' + inr(m.projected) + '</b> of ' + inr(m.budget) + ' budget · avg ' + inr(m.avgDay) + '/day</div>' : '<div class="psub" style="padding-top:10px">' + inr(m.spent) + ' of ' + inr(m.budget) + ' budget</div>') +
      '<div class="sec"><span class="tab">Category budgets</span><span class="more">Edit caps</span></div>' + catBars +
      (m.alert ? '<div class="callout" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Over cap</span><div class="s" style="margin-top:8px;color:var(--ink)">' + esc(m.alert) + '</div></div>' : "") +
      '<div class="sec"><span class="tab">Transactions · ' + esc(m.label) + '</span>' + (m.count > m.list.length ? '<span class="more" style="color:var(--ink-faint)">' + m.list.length + ' of ' + m.count + '</span>' : "") + '</div>' + txnList(m.list, 200) +
      (m.count > m.list.length ? '<div class="flow">Totals above cover all ' + m.count + ' transactions; the list shows the most recent ' + m.list.length + '. Open the Sheet for the full ledger.</div>' : "") + '</div>' +
      /* year */
      '<div class="pv' + (state.period === "year" ? " on" : "") + '" data-p="year"><div class="big-stat serif num">' + inr(d.year.total) + '</div>' +
      '<div class="psub">spent in 2026 so far · avg <b class="num">' + inr(d.year.avgMo) + '</b>/mo</div>' +
      '<div class="ybars">' + yb + '</div>' +
      (d.year.top.length ? '<div class="sec"><span class="tab">Top categories · year</span></div>' + d.year.top.map(function (t) { return ansLine(t.name, t.note || "", shortInr(t.amt)); }).join("") : "") +
      '<div class="sec"><span class="tab">Transactions this year</span></div>' + txnList(txnsFor("year"), 80) + '</div>' +
      '</div>' +
      /* PLAN */
      '<div class="mv' + (state.spendMode === "plan" ? " on" : "") + '" data-m="plan">' + planHtml(d) + '</div>' +
      /* TRENDS */
      '<div class="mv' + (state.spendMode === "trends" ? " on" : "") + '" data-m="trends">' + trendView(d) + '</div>' +
      '</section>';
  }

  function monthKeyLabel(k, full) {
    var p = String(k).split("-"), d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return d.toLocaleString("en-IN", full ? { month: "short", year: "numeric" } : { month: "short" });
  }
  function trendView(d) {
    var monthly = d.monthly || {};
    var keys = Object.keys(monthly).sort().slice(-12);
    var catTotals = {};
    keys.forEach(function (k) { var c = monthly[k].cats || {}; Object.keys(c).forEach(function (cat) { catTotals[cat] = (catTotals[cat] || 0) + c[cat]; }); });
    var cats = ["All"].concat(Object.keys(catTotals).sort(function (a, b) { return catTotals[b] - catTotals[a]; }).slice(0, 8));
    var sel = state.trendCat || "All";
    var vals = keys.map(function (k) { return sel === "All" ? (monthly[k].spent || 0) : ((monthly[k].cats || {})[sel] || 0); });
    var max = Math.max.apply(null, vals.concat([1]));
    var bars = keys.map(function (k, i) { var h = Math.max(3, Math.round(vals[i] / max * 100)); return '<div class="col' + (vals[i] === max ? " hi" : "") + '"><i style="height:' + h + '%"></i><span>' + monthKeyLabel(k).charAt(0) + '</span></div>'; }).join("");
    var total = vals.reduce(function (s, x) { return s + x; }, 0), avg = Math.round(total / (vals.length || 1));
    var last = vals[vals.length - 1] || 0, prev = vals[vals.length - 2] || 0;
    var mom = prev ? Math.round((last - prev) / prev * 100) : 0;
    var chips = cats.map(function (c) { return '<button class="' + (sel === c ? "on" : "") + '" data-trend="' + esc(c) + '">' + esc(c) + '</button>'; }).join("");
    var rows = keys.slice().reverse().map(function (k) { var v = sel === "All" ? (monthly[k].spent || 0) : ((monthly[k].cats || {})[sel] || 0); return ansLine(monthKeyLabel(k, true), (monthly[k].count || 0) + " transactions", inr(v)); }).join("");
    var body = keys.length
      ? '<div class="tchips">' + chips + '</div>' +
        '<div class="big-stat serif num" style="margin-top:14px">' + inr(last) + '</div>' +
        '<div class="psub">' + (sel === "All" ? "total" : sel) + ' this month · ' + (mom >= 0 ? '<span class="neg">↑ ' + mom + '%</span>' : '<span class="pos">↓ ' + Math.abs(mom) + '%</span>') + ' vs last month</div>' +
        '<div class="ybars" style="height:130px;margin-top:16px">' + bars + '</div>' +
        '<div class="bsum" style="margin-top:16px"><div><span class="tab">Average / mo</span><div class="v serif num">' + inr(avg) + '</div></div><div><span class="tab">Months</span><div class="v serif num">' + keys.length + '</div></div></div>' +
        '<div class="sec"><span class="tab">Month by month</span></div>' + rows
      : '<div class="psub" style="padding:16px 0">Not enough history yet — trends build up as months pass.</div>';
    return body;
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
      '<div class="w-navbar"><nav>' + [["overview", "Overview"], ["spend", "Spend"], ["invest", "Invest"], ["predict", "Predict"], ["you", "Account"]].map(function (b) {
        return '<a class="' + (state.wboard === b[0] ? "on" : "") + '" data-wgo="' + b[0] + '">' + b[1] + '</a>';
      }).join("") + '</nav><div style="display:flex;align-items:center;gap:16px">' + (d.stale ? '<span class="ribbon"><span class="d"></span>' + esc(d.stale) + '</span>' : "") +
      '<button class="ttoggle" data-act="theme" aria-label="Toggle theme">' + icon("moon") + '</button></div></div>' +
      wbOverview(d) + wbSpend(d) + wbInvest(d) + wbPredict(d) + wbYou(d) + '</div>';
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
    var m = d.month, p = state.wperiod;
    var list = txnsFor(p);
    var periodSpent = list.reduce(function (s, t) { return s + Math.min(0, t.amt); }, 0);
    var pill = ["today", "week", "month", "year", "trends"].map(function (x) {
      return '<button data-wperiod="' + x + '" style="padding:6px 16px;font-size:12px;font-weight:600;border-radius:2px;' + (p === x ? "background:var(--ink);color:var(--paper)" : "color:var(--ink-soft)") + '">' + x.charAt(0).toUpperCase() + x.slice(1) + '</button>';
    }).join("");
    var strip = p === "month"
      ? '<div><span class="tab">Spent</span><div class="v serif num">' + inr(m.spent) + '</div></div><div><span class="tab">Left</span><div class="v serif num pos">' + inr(m.left) + '</div></div><div><span class="tab">Projected</span><div class="v serif num">' + inr(m.projected) + '</div></div><div><span class="tab">Avg/day</span><div class="v serif num">' + inr(m.avgDay) + '</div></div>'
      : '<div><span class="tab">Spent (' + p + ')</span><div class="v serif num">' + inr(Math.abs(periodSpent)) + '</div></div><div><span class="tab">Transactions</span><div class="v serif num">' + list.length + '</div></div>';
    var caps = m.cats.map(function (c) { var over = c.spent > c.cap, rem = c.cap - c.spent; return '<div class="ab"><span class="nm" style="width:170px">' + esc(c.name) + ' <span class="tab" style="letter-spacing:.03em">' + shortInr(c.spent) + '/' + shortInr(c.cap) + '</span></span><span class="track"><i style="width:' + (c.cap ? Math.min(100, Math.round(c.spent / c.cap * 100)) : 0) + '%;background:' + (over ? "var(--neg)" : "var(--accent)") + '"></i></span><span class="pc num ' + (over ? "neg" : "pos") + '">' + (over ? "−" + inr(Math.abs(rem)) : inr(rem)) + '</span></div>'; }).join("");
    var flist = applyQuery(list);
    var rows = flist.slice(0, state.txnQuery ? 400 : 100).map(function (t) { return '<div class="tr" data-tedit="' + esc(t.id) + '" style="cursor:pointer"><span class="dt num">' + esc(t.date) + '</span><span class="nm">' + esc(t.name) + '<div class="s" style="font-size:10px;color:var(--ink-faint)">' + esc(t.cat || t.acct || "") + '</div></span><span class="amt num ' + (t.amt >= 0 ? "pos" : "neg") + '">' + (t.amt >= 0 ? "+" : "−") + inr(Math.abs(t.amt)) + '</span></div>'; }).join("") || '<div class="s" style="padding:12px 0;color:var(--ink-soft)">' + (state.txnQuery ? "No matches." : "No transactions in this period.") + '</div>';
    return '<div class="wboard' + (state.wboard === "spend" ? " on" : "") + '" data-b="spend">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:18px 0 0"><div class="lede-lbl">Spending & Budget</div>' +
      '<div style="display:flex;gap:6px;background:var(--paper-2);border:1px solid var(--rule);padding:4px;border-radius:3px">' + pill + '</div></div>' +
      (uncatList().length ? '<div class="reviewbar"><div><div class="t">' + uncatList().length + ' uncategorised</div><div class="s">Assign them so budgets & patterns work</div></div><button data-act="review">Review</button></div>' : "") +
      (p === "trends"
        ? '<div style="padding-top:16px;max-width:760px">' + trendView(d) + '</div>'
        : '<div class="w-trio" style="margin:14px 0">' + strip + '</div>' +
          '<div class="w-grid" style="grid-template-columns:1fr 1.2fr">' +
          '<div class="w-col lead"><div class="colhead">Category budgets <span class="more">' + (p === "month" ? "Edit caps" : "month") + '</span></div>' + (caps || '<div class="s" style="padding:12px 0;color:var(--ink-soft)">No caps set yet.</div>') +
          (p === "month" && m.alert ? '<div class="w-call" style="border-left-color:var(--neg)"><span class="tab" style="color:var(--ink)">Over cap</span><div class="s" style="font-size:12px;color:var(--ink);margin-top:6px">' + esc(m.alert) + '</div></div>' : "") + '</div>' +
          '<div class="w-col"><div class="colhead">Transactions · ' + p + ' <span class="more">' + flist.length + '</span></div>' + searchBox() + '<div class="w-tbl">' + rows + '</div></div>' +
          '</div>') +
      '</div>';
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

  function wbYou(d) {
    var c = state.connection, connected = c.endpoint && c.token;
    var sync = d.sync.map(function (s) {
      return '<div class="ans-web"><div><div class="t">' + esc(s.name) + '</div><div class="s">' + esc(s.sub) + '</div></div><div class="k num ' + (s.cls || "") + '" style="font-size:13px">' + esc(s.st) + '</div></div>';
    }).join("");
    return '<div class="wboard' + (state.wboard === "you" ? " on" : "") + '" data-b="you"><div class="w-grid" style="grid-template-columns:1.2fr 1fr">' +
      '<div class="w-col lead"><div class="colhead">Your Sheet <span class="more">' + (connected ? "Connected" : "Demo data") + '</span></div>' +
      '<p style="font-size:12.5px;color:var(--ink-soft);line-height:1.5;margin-bottom:8px">Paste your Apps Script Web App URL and device token. They stay on this device; Bling never sees your Google password.</p>' +
      '<form data-form="conn">' +
      '<label class="field"><span>Apps Script URL</span><input name="endpoint" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(c.endpoint) + '"></label>' +
      '<label class="field"><span>Device token</span><input name="token" type="password" placeholder="fos_••••••••" value="' + esc(c.token) + '"></label>' +
      '<button class="btn" type="submit">' + (connected ? "Update connection" : "Connect") + '</button>' +
      (connected ? ' <button class="btn ghost" type="button" data-act="disconnect">Disconnect</button>' : "") +
      '</form></div>' +
      '<div class="w-col"><div class="colhead">Sync health</div>' + sync +
      '<div class="colhead" style="margin-top:22px">Appearance</div>' +
      '<div style="display:flex;gap:22px"><button class="' + (state.theme === "light" ? "on" : "") + '" data-theme-set="light" style="padding:6px 0;font-size:13px;font-weight:600;' + (state.theme === "light" ? "border-bottom:2px solid var(--accent)" : "color:var(--ink-soft)") + '">Paper</button>' +
      '<button class="' + (state.theme === "dark" ? "on" : "") + '" data-theme-set="dark" style="padding:6px 0;font-size:13px;font-weight:600;' + (state.theme === "dark" ? "border-bottom:2px solid var(--accent)" : "color:var(--ink-soft)") + '">Charcoal</button></div>' +
      '</div></div></div>';
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
    app.innerHTML = phoneShell(state.data) + webShell(state.data) +
      '<button class="fab" data-act="add" aria-label="Add entry">+</button>' +
      (state.reviewing ? reviewModal() : "") + (state.adding ? addModal() : "") + (state.editId ? editModal() : "");
    if (state._focusSearch) {
      var pool = document.querySelector(".modal") ? document.querySelectorAll(".modal .txnsearch") : document.querySelectorAll(".txnsearch");
      var s = [].slice.call(pool).filter(function (i) { return i.offsetParent; })[0];
      if (s) { s.focus(); var v = s.value; try { s.setSelectionRange(v.length, v.length); } catch (e) {} }
      state._focusSearch = false;
    }
  }

  function editModal() {
    var t = (state.data.allTxns || []).filter(function (x) { return String(x.id) === String(state.editId); })[0];
    if (!t) return "";
    var isExp = t.amt < 0;
    var cats = CATS.slice();
    if (t.cat && cats.indexOf(t.cat) === -1) cats.unshift(t.cat);
    var catOpts = cats.map(function (c) { return '<option' + (c === t.cat ? " selected" : "") + '>' + esc(c) + '</option>'; }).join("");
    return '<div class="modal"><button class="backdrop" data-act="closeEdit" aria-label="Close"></button><div class="sheet">' +
      '<div class="mhead"><h2>Edit transaction</h2><button class="x" data-act="closeEdit" aria-label="Close">✕</button></div>' +
      '<div class="psub" style="padding:6px 0 2px">' + esc(t.name) + ' · ' + esc(t.date) + '</div>' +
      '<form data-form="edit">' +
      '<div class="kindtoggle"><label><input type="radio" name="kind" value="expense"' + (isExp ? " checked" : "") + '> Expense</label><label><input type="radio" name="kind" value="income"' + (isExp ? "" : " checked") + '> Income</label></div>' +
      '<label class="field"><span>Amount (₹)</span><input name="amount" type="number" inputmode="decimal" step="1" min="0" value="' + Math.abs(t.amt) + '"></label>' +
      '<label class="field"><span>Category</span><select name="category">' + catOpts + '</select></label>' +
      '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn" type="submit">Save</button>' +
      '<button class="btn ghost" type="button" data-act="deleteTxn" style="border-color:var(--neg);color:var(--neg)">Delete</button></div>' +
      '</form></div></div>';
  }

  function addModal() {
    var accs = state.data.accountsList || [];
    var accOpts = accs.length ? accs.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join("") : '<option value="">(connect your Sheet)</option>';
    var catOpts = CATS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("");
    return '<div class="modal"><button class="backdrop" data-act="closeAdd" aria-label="Close"></button><div class="sheet">' +
      '<div class="mhead"><h2>Add entry</h2><button class="x" data-act="closeAdd" aria-label="Close">✕</button></div>' +
      '<form data-form="entry">' +
      '<div class="kindtoggle"><label><input type="radio" name="kind" value="expense" checked> Expense</label><label><input type="radio" name="kind" value="income"> Income</label></div>' +
      '<label class="field"><span>Amount (₹)</span><input name="amount" type="number" inputmode="decimal" step="1" min="0" required autofocus placeholder="0"></label>' +
      '<label class="field"><span>What for</span><input name="merchant" type="text" placeholder="e.g. Auto, Chai, Gift"></label>' +
      '<label class="field"><span>Category</span><select name="category">' + catOpts + '</select></label>' +
      '<label class="field"><span>Account</span><select name="account">' + accOpts + '</select></label>' +
      '<label class="field"><span>Date</span><input name="date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<button class="btn" type="submit" style="margin-top:18px">Add entry</button>' +
      '</form></div></div>';
  }

  function reviewModal() {
    var groups = recurringGroups(); state._groups = groups;
    var q = (state.txnQuery || "").trim().toLowerCase();
    var shown = q ? groups.filter(function (g) { return (g.payee + " " + g.amt + " " + (g.sample.name || "")).toLowerCase().indexOf(q) !== -1; }) : groups;
    var oneoffs = uncatList().length;
    var rows = shown.map(function (g, i) {
      var idx = groups.indexOf(g);
      var chips = CATS.map(function (c) { return '<button data-cat="' + esc(c) + '" data-gid="' + idx + '">' + esc(c) + '</button>'; }).join("");
      var amtLabel = g.fixed ? "−" + inr(g.amt) : "−" + inr(g.total);
      var meta = g.fixed
        ? (g.months + " months · ~" + inr(g.amt) + " · around the " + ordinalJs(g.day))
        : (g.count + "× · " + inr(g.minA) + "–" + inr(g.maxA) + " · total " + inr(g.total));
      return '<div class="ureview" data-grow="g' + idx + '"><div class="top"><span class="n">' + esc(g.payee) + ' · ' + g.count + ' payments</span><span class="a num neg">' + amtLabel + '</span></div>' +
        '<div class="s" style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + meta + ' · ' + esc(String(g.sample.name).slice(0, 38)) + '</div>' +
        '<div class="chips">' + chips + '</div></div>';
    }).join("");
    return '<div class="modal"><button class="backdrop" data-act="closeReview" aria-label="Close"></button><div class="sheet">' +
      '<div class="mhead"><h2>Recurring <span class="tab" style="margin-left:6px">' + groups.length + ' found</span></h2><button class="x" data-act="closeReview" aria-label="Close">✕</button></div>' +
      '<div class="psub" style="padding:2px 0 8px">Payments that repeat. Tag one to tag them all — fixed ones (rent, EMI, bills, subscriptions) also become obligations.</div>' +
      '<div class="tchips" style="margin-top:0"><span class="tab" style="align-self:center;margin-right:4px">Group by</span>' +
      '<button class="' + ((state.groupBy || "amount") === "amount" ? "on" : "") + '" data-groupby="amount">Amount</button>' +
      '<button class="' + (state.groupBy === "payee" ? "on" : "") + '" data-groupby="payee">Payee</button></div>' +
      searchBox() +
      (shown.length ? rows : '<div class="psub" style="padding:16px 0">' + (q ? "No matches." : "No recurring patterns found yet — need 3+ months of history.") + '</div>') +
      '<div class="flow" style="margin-top:14px">' + oneoffs + ' uncategorised in total. One-off payments aren\'t shown here — tag those from the transaction list (tap any row).</div>' +
      '</div></div>';
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
    var t = e.target.closest("[data-go],[data-act],[data-mode],[data-period],[data-wperiod],[data-wgo],[data-theme-set],[data-cat],[data-tedit],[data-trend],[data-groupby]");
    if (!t) return;
    if (t.dataset.go) { state.screen = t.dataset.go; render(); }
    else if (t.dataset.wgo) { state.wboard = t.dataset.wgo; render(); }
    else if (t.dataset.mode) { state.spendMode = t.dataset.mode; render(); }
    else if (t.dataset.period) { state.period = t.dataset.period; render(); }
    else if (t.dataset.wperiod) { state.wperiod = t.dataset.wperiod; render(); }
    else if (t.dataset.trend) { state.trendCat = t.dataset.trend; render(); }
    else if (t.dataset.groupby) { state.groupBy = t.dataset.groupby; state._focusSearch = false; render(); }
    else if (t.dataset.themeSet) { setTheme(t.dataset.themeSet); }
    else if (t.dataset.act === "theme") { setTheme(state.theme === "dark" ? "light" : "dark"); }
    else if (t.dataset.act === "blur") { state.blurred = !state.blurred; render(); }
    else if (t.dataset.act === "toast") { toast(t.dataset.msg || "Demo"); }
    else if (t.dataset.act === "disconnect") { state.connection = { endpoint: "", token: "" }; localStorage.removeItem(CONN_KEY); render(); toast("Disconnected — showing demo data"); }
    else if (t.dataset.act === "mark") { doMark(Number(t.dataset.idx)); }
    else if (t.dataset.act === "usecap") { doUseCap(Number(t.dataset.idx)); }
    else if (t.dataset.act === "scan") { doScan(); }
    else if (t.dataset.act === "monthPrev") { state.monthOffset -= 1; render(); }
    else if (t.dataset.act === "monthNext") { if (state.monthOffset < 0) { state.monthOffset += 1; render(); } }
    else if (t.dataset.act === "review") { state.reviewing = true; state.txnQuery = ""; render(); }
    else if (t.dataset.act === "closeReview") { state.reviewing = false; state.txnQuery = ""; render(); }
    else if (t.dataset.act === "toggleRules") { state.makeRules = !state.makeRules; }
    else if (t.dataset.cat && t.dataset.gid) { doCategorizeGroup(Number(t.dataset.gid), t.dataset.cat); }
    else if (t.dataset.cat && t.dataset.tid) { doCategorize(t.dataset.tid, t.dataset.cat); }
    else if (t.dataset.act === "add") { state.adding = true; render(); var a = document.querySelector('[name=amount]'); if (a) a.focus(); }
    else if (t.dataset.act === "closeAdd") { state.adding = false; render(); }
    else if (t.dataset.tedit) { state.editId = t.dataset.tedit; render(); }
    else if (t.dataset.act === "closeEdit") { state.editId = null; render(); }
    else if (t.dataset.act === "deleteTxn") { deleteTxn(); }
  });

  document.addEventListener("input", function (e) {
    var s = e.target.closest(".txnsearch");
    if (!s) return;
    state.txnQuery = s.value;
    state._focusSearch = true;
    render();
  });

  function deleteTxn() {
    var id = state.editId; if (!id) return;
    state.editId = null;
    if (!connected()) { render(); toast("Deleted (demo)"); return; }
    render(); toast("Deleting…");
    api("delete_transaction", { id: id }).then(function () { loadLive(true); }).catch(function (e) { toast("Failed: " + e.message); });
  }

  function doCategorize(id, cat) {
    var txn = (state.data.allTxns || []).filter(function (x) { return String(x.id) === String(id); })[0];
    var amt = txn ? Math.abs(txn.amt) : 0;
    markDone(id, cat);
    if (!connected()) { toast("Categorised (demo — connect to save)"); return; }
    api("set_txn_category", { id: id, category: cat }).then(function () {
      if (!state.makeRules || !txn) return;
      var kw = keywordFrom(txn.name);
      var sims = similarUncat(amt, txn.name);        // same amount AND similar payee
      var chain = Promise.resolve();
      if (sims.length) {
        chain = chain.then(function () {
          return api("categorize_amount", { amount: amt, name: txn.name, category: cat }).then(function (r) {
            sims.forEach(function (x) { markDone(x.id, cat); });
            toast("Tagged " + (r ? r.categorised : sims.length + 1) + " × " + inr(amt) + " to " + (kw ? titleCaseJs(kw) : "same payee") + " as " + cat);
          });
        });
      }
      if (kw) chain = chain.then(function () { return api("add_category_rule", { keyword: kw, category: cat }).then(function (r) { if (r && r.applied) toast("Rule '" + kw + "' → " + cat + " applied to " + r.applied + " more"); }); });
      return chain;
    }).catch(function (e) { toast("Save failed: " + e.message); });
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  function titleCaseJs(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function doCategorizeGroup(i, cat) {
    var g = (state._groups || [])[i]; if (!g) return;
    // mark the group row done in place
    var row = document.querySelector('[data-grow="g' + i + '"]');
    if (row) { row.classList.add("done"); var ch = row.querySelector(".chips"); if (ch) ch.remove(); if (!row.querySelector(".set")) { var s = document.createElement("div"); s.className = "set"; s.textContent = "✓ " + cat + " · " + g.count + " tagged" + (FIXED_CATS[cat] ? " · added to Fixed" : ""); row.appendChild(s); } }
    g.ids.forEach(function (id) { var x = (state.data.allTxns || []).filter(function (y) { return String(y.id) === String(id); })[0]; if (x) x.cat = cat; state.doneIds[id] = cat; });
    if (!connected()) { toast("Categorised (demo)"); return; }
    var kw = keywordFrom(g.sample.name);
    var chain;
    if (g.fixed) {
      // fixed amount + payee → tag by amount, and register as an obligation if fixed-type
      chain = api("categorize_amount", { amount: g.amt, name: g.sample.name, category: cat }).then(function (r) {
        toast("Tagged " + (r ? r.categorised : g.count) + " × " + inr(g.amt) + " as " + cat);
        if (FIXED_CATS[cat]) return api("confirm_recurring", { recurring: { name: g.payee, amount: g.amt, account_id: g.sample.accId, due_day: g.day, category: cat, tolerance_pct: 1 } }).then(function () { toast(g.payee + " added to Fixed expenses"); });
      });
    } else {
      // variable amount, same payee → keyword rule tags all past + future
      chain = api("add_category_rule", { keyword: kw, category: cat }).then(function (r) { toast("'" + kw + "' → " + cat + " · tagged " + (r ? r.applied : g.count)); });
    }
    chain.then(function () { loadLive(false); }).catch(function (e) { toast("Failed: " + e.message); });
  }
  function saveEdit(f) {
    var id = state.editId; var t = (state.data.allTxns || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!t) return;
    var fd = new FormData(f);
    var amt = Number(fd.get("amount") || 0); if (!amt || amt <= 0) { toast("Enter an amount"); return; }
    var kind = String(fd.get("kind") || "expense");
    var payload = { id: id, amount: kind === "income" ? Math.abs(amt) : -Math.abs(amt), category: String(fd.get("category")), merchant: t.name, accountId: t.accId || undefined, kind: kind, source: t.source || "manual" };
    state.editId = null;
    if (!connected()) { render(); toast("Saved (demo — connect to persist)"); return; }
    render(); toast("Saving…");
    api("upsert_transaction", payload).then(function () { loadLive(true); }).catch(function (e) { toast("Failed: " + e.message); });
  }
  function addEntry(f) {
    var fd = new FormData(f);
    var amt = Number(fd.get("amount") || 0);
    if (!amt || amt <= 0) { toast("Enter an amount"); return; }
    var kind = String(fd.get("kind") || "expense");
    var payload = {
      amount: kind === "income" ? Math.abs(amt) : -Math.abs(amt),
      merchant: String(fd.get("merchant") || "").trim() || String(fd.get("category")),
      category: String(fd.get("category")), accountId: String(fd.get("account") || ""),
      date: String(fd.get("date") || ""), kind: kind, source: "manual"
    };
    state.adding = false;
    if (!connected()) { render(); toast("Added (demo — connect your Sheet to save)"); return; }
    if (!payload.accountId) { render(); toast("Add an account in your Sheet first"); return; }
    toast("Adding…");
    api("upsert_transaction", payload).then(function () { loadLive(true); }).catch(function (e) { toast("Failed: " + e.message); render(); });
  }

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
    var ef = e.target.closest('form[data-form=entry]');
    if (ef) { e.preventDefault(); addEntry(ef); return; }
    var edf = e.target.closest('form[data-form=edit]');
    if (edf) { e.preventDefault(); saveEdit(edf); return; }
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
