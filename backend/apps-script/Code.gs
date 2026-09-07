/**
 * Bling — Apps Script backend (v1)
 *
 * Turns a bound Google Sheet into Bling's private data source.
 *
 * Setup (once):
 *   1. Extensions → Apps Script in your Sheet, paste this file.
 *   2. Run  setupBling()  (authorise when asked — it's your own script).
 *   3. Run  createDeviceToken()  → copy the token it shows.
 *   4. Deploy → New deployment → Web app → Execute as: Me,
 *      Who has access: Anyone. Copy the /exec URL.
 *   5. In Bling → You → Your Sheet, paste the /exec URL + token.
 *
 * Security: the token is stored only as a SHA-256 hash. "Anyone" access is
 * required for cross-origin fetch from GitHub Pages; the device token is the
 * real gate. Never paste a token into a URL or commit it anywhere.
 */

var SCHEMA_VERSION = 1;
var CURRENCY = "INR";

var TABLES = {
  Config: ["key", "value", "note"],
  Accounts: ["id", "name", "institution", "type", "last4", "opening_balance", "balance", "limit", "active", "updated_at"],
  Transactions: ["id", "date", "merchant", "note", "category", "amount", "account_id", "kind", "source", "status", "source_event_id", "created_at", "updated_at", "deleted_at"],
  Budgets: ["id", "name", "cap", "group", "created_at", "updated_at"],
  CategoryRules: ["id", "keywords", "category", "priority", "active", "updated_at"],
  Recurring: ["id", "name", "category", "amount", "account_id", "due_day", "cadence", "status", "tolerance_pct", "settled_month", "active", "updated_at"],
  ParserRules: ["id", "bank", "source", "sender_pattern", "subject_pattern", "body_regex", "field_map_json", "direction", "enabled", "quarantined", "version", "updated_at"],
  IngestEvents: ["id", "source", "source_event_id", "received_at", "raw_hash", "parser_rule_id", "status", "transaction_id", "dedup_of", "error", "excerpt"],
  DeviceTokens: ["id", "name", "token_hash", "created_at", "last_used_at", "revoked_at"]
};

/* account types → how they roll up into net worth */
var LIQUID_TYPES = { bank: true, cash: true };
var INVEST_TYPES = { investment: true, mf: true, equity: true, gold: true, fd: true, ppf: true, epf: true, nps: true };
var OWED_TYPES = { credit: true, loan: true };

/* ---------------- menu ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Bling")
    .addItem("Set up / repair", "setupBling")
    .addItem("Create device token", "createDeviceToken")
    .addItem("Show SMS webhook token", "showSmsToken")
    .addSeparator()
    .addItem("Install 15-min Gmail sync", "installGmailSync")
    .addItem("Sync Gmail now", "syncGmailAlerts")
    .addSeparator()
    .addItem("Auto-categorise transactions", "autoCategorize")
    .addSeparator()
    .addItem("Seed demo data", "seedDemo")
    .addItem("Recalculate balances", "recalcBalances")
    .addItem("System health", "showHealth")
    .addToUi();
}

/* ---------------- setup ---------------- */
function setupBling() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(TABLES).forEach(function (name) { ensureTable_(ss, name, TABLES[name]); });
    setConfig_("schema_version", String(SCHEMA_VERSION));
    if (!getConfig_("base_currency")) setConfig_("base_currency", CURRENCY);
    if (!getConfig_("monthly_budget")) setConfig_("monthly_budget", "72000");
    if (!getConfig_("takehome")) setConfig_("takehome", "145000");
    if (!getConfig_("safety_buffer")) setConfig_("safety_buffer", "20000");
    if (!getConfig_("gmail_query")) setConfig_("gmail_query", "label:Bling newer_than:7d");
    if (!getConfig_("sms_webhook_token")) setConfig_("sms_webhook_token", "sms_" + Utilities.getUuid().replace(/-/g, "").slice(0, 24));
    if (!getConfig_("fuzzy_minutes")) setConfig_("fuzzy_minutes", "10");
    seedParserTemplates_();
    seedCategoryRules_();
    ss.toast("Bling is set up. Run createDeviceToken() next.", "Bling", 6);
  } finally {
    lock.releaseLock();
  }
}

function createDeviceToken() {
  ensureInstalled_();
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt("Create device token", "Name this device (e.g. 'My Android'):", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = "fos_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  appendObject_("DeviceTokens", {
    id: id_("dev"), name: res.getResponseText().trim() || "Device",
    token_hash: sha256_(token), created_at: nowIso_(), last_used_at: "", revoked_at: ""
  });
  ui.alert("Copy this token now", token + "\n\nPaste it into Bling → You → Your Sheet.\nIt cannot be shown again. Revoke by adding a date to revoked_at in DeviceTokens.", ui.ButtonSet.OK);
}

/* ---------------- web app ---------------- */
function doGet() {
  return json_({ ok: true, service: "Bling", schema: SCHEMA_VERSION, message: "POST with a device token." });
}

function doPost(e) {
  try {
    ensureInstalled_();
    var req = parseRequest_(e);
    var action = String(req.action || "");
    var payload = req.payload || {};

    // SMS webhook (Tasker/MacroDroid) authenticates with the SMS webhook token, not a device token.
    if (action === "ingest_sms") {
      if (String(req.token) !== getConfig_("sms_webhook_token") || !getConfig_("sms_webhook_token")) throw new Error("Bad SMS token");
      var lk = LockService.getScriptLock(); lk.waitLock(30000);
      try { return json_({ ok: true, data: ingestSms_(payload) }); } finally { lk.releaseLock(); }
    }

    var device = authenticate_(req.token);
    if (action === "bootstrap") return json_({ ok: true, data: buildSnapshot_(), device: device.name });
    if (action === "health") return json_({ ok: true, data: health_() });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      switch (action) {
        case "upsert_transaction": return json_({ ok: true, data: upsertTransaction_(payload) });
        case "delete_transaction": return json_({ ok: true, data: deleteTransaction_(payload.id) });
        case "upsert_account": return json_({ ok: true, data: upsertAccount_(payload) });
        case "upsert_budget": return json_({ ok: true, data: upsertObject_("Budgets", "id", withStamp_(payload, payload.id ? "upd" : "new", "bud")) });
        case "upsert_recurring": return json_({ ok: true, data: upsertObject_("Recurring", "id", withStamp_(payload, payload.id ? "upd" : "new", "rec")) });
        case "confirm_recurring": return json_({ ok: true, data: confirmRecurring_(payload) });
        case "set_budget_cap": return json_({ ok: true, data: setBudgetCap_(payload) });
        case "settle_recurring": return json_({ ok: true, data: settleRecurring_(payload.id) });
        case "confirm_transaction": return json_({ ok: true, data: confirmTransaction_(payload.id) });
        case "scan_gmail": return json_({ ok: true, data: syncGmailAlerts_() });
        case "auto_categorize": return json_({ ok: true, data: autoCategorize_() });
        case "set_txn_category": return json_({ ok: true, data: setTxnCategory_(payload) });
        case "add_category_rule": return json_({ ok: true, data: addCategoryRule_(payload) });
        default: throw new Error("Unknown action: " + action);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

/* ---------------- snapshot (the shape app.js renders) ---------------- */
function buildSnapshot_() {
  var accounts = readObjects_("Accounts").filter(function (a) { return truthy_(a.active) && !a.deleted_at; });
  var txns = readObjects_("Transactions").filter(function (t) { return !t.deleted_at; });
  var budgets = readObjects_("Budgets");
  var recurring = readObjects_("Recurring").filter(function (r) { return truthy_(r.active); });

  // resolve category at read-time via keyword rules (so budgets/patterns work
  // even before a write-back pass); does not touch the sheet.
  var catRules = readObjects_("CategoryRules");
  txns.forEach(function (t) { t.category = effectiveCat_(t, catRules); });

  var liquid = 0, invested = 0, owed = 0;
  var allocMap = {};
  accounts.forEach(function (a) {
    var bal = num_(a.balance);
    if (LIQUID_TYPES[a.type]) liquid += bal;
    else if (INVEST_TYPES[a.type]) { invested += bal; allocMap[allocLabel_(a.type)] = (allocMap[allocLabel_(a.type)] || 0) + bal; }
    else if (OWED_TYPES[a.type]) owed += Math.abs(bal);
  });
  if (liquid) allocMap["Cash"] = (allocMap["Cash"] || 0) + liquid;
  var netWorth = liquid + invested - owed;

  var allocTotal = Object.keys(allocMap).reduce(function (s, k) { return s + allocMap[k]; }, 0) || 1;
  var palette = { "Equity · MF": "var(--accent)", "PPF · FD": "var(--ink-soft)", "Gold": "var(--gold)", "Cash": "var(--ink-faint)" };
  var allocation = Object.keys(allocMap).sort(function (a, b) { return allocMap[b] - allocMap[a]; }).map(function (k) {
    return { name: k, pct: Math.round(allocMap[k] / allocTotal * 100), color: palette[k] || "var(--ink-soft)" };
  });

  var tz = Session.getScriptTimeZone();
  var monthKey = Utilities.formatDate(new Date(), tz, "yyyy-MM");
  var todayKey = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  function spentIn(pred) {
    return Math.abs(txns.filter(pred).reduce(function (s, t) { return s + Math.min(0, num_(t.amount)); }, 0));
  }
  var monthSpent = spentIn(function (t) { return t.kind !== "transfer" && dateKey_(t.date, tz, "yyyy-MM") === monthKey; });
  var todaySpent = spentIn(function (t) { return t.kind !== "transfer" && dateKey_(t.date, tz, "yyyy-MM-dd") === todayKey; });

  var budget = num_(getConfig_("monthly_budget")) || 72000;
  var daysLeft = daysLeftInMonth_(tz);
  var dayOfMonth = Number(Utilities.formatDate(new Date(), tz, "d"));
  var projected = dayOfMonth > 0 ? Math.round(monthSpent / dayOfMonth * daysInMonth_(tz)) : monthSpent;

  var cats = budgets.map(function (b) {
    var spent = Math.abs(txns.filter(function (t) {
      return t.kind !== "transfer" && String(t.category) === String(b.name) && dateKey_(t.date, tz, "yyyy-MM") === monthKey;
    }).reduce(function (s, t) { return s + Math.min(0, num_(t.amount)); }, 0));
    return { name: b.name, spent: spent, cap: num_(b.cap) };
  });
  var capsTotal = cats.reduce(function (s, c) { return s + c.cap; }, 0);

  var sorted = txns.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var recent = sorted.slice(0, 8).map(function (t) {
    return { date: shortDate_(t.date, tz), name: t.merchant || t.category || "—", acct: acctName_(accounts, t.account_id) || t.source || "", amt: num_(t.amount) };
  });
  // full list (capped) so the app can show recent transactions and filter client-side
  var allTxns = sorted.slice(0, 1500).map(function (t) {
    return { id: String(t.id), iso: new Date(t.date).toISOString(), date: shortDate_(t.date, tz), name: t.merchant || t.category || "—", cat: String(t.category || ""), acct: acctName_(accounts, t.account_id) || t.source || "", accId: String(t.account_id || ""), amt: num_(t.amount) };
  });
  // per-month aggregates over ALL transactions (so month/year figures stay correct
  // even for history older than the raw list cap — UPI users blow past 1500 fast)
  var monthly = {};
  txns.forEach(function (t) {
    if (t.kind === "transfer") return;
    var k = dateKey_(t.date, tz, "yyyy-MM"); if (!k) return;
    var m = monthly[k] || (monthly[k] = { spent: 0, count: 0, cats: {} });
    var neg = Math.min(0, num_(t.amount));
    m.count += 1;
    if (neg < 0) { m.spent += -neg; var c = String(t.category || "Uncategorized"); m.cats[c] = (m.cats[c] || 0) + (-neg); }
  });
  var todayEntries = txns.filter(function (t) { return dateKey_(t.date, tz, "yyyy-MM-dd") === todayKey; })
    .map(function (t) { return { time: Utilities.formatDate(new Date(t.date), tz, "h:mma").toLowerCase(), name: t.merchant || t.category, cat: t.category || t.source, amt: num_(t.amount) }; });

  /* recurring → fixed list + upcoming (settled = fingerprint matched this month) */
  var fixed = recurring.map(function (r) {
    var settled = String(r.settled_month) === monthKey;
    return {
      name: r.name, amt: num_(r.amount),
      acct: (acctName_(accounts, r.account_id) || "") + " · due " + ordinal_(r.due_day) + (settled ? " · matched" : " · ±" + (num_(r.tolerance_pct) || 2) + "%"),
      status: settled ? "ok" : "up", day: Number(r.due_day) || ""
    };
  });
  var fixedTotal = fixed.reduce(function (s, f) { return s + f.amt; }, 0);
  var upcoming = recurring.filter(function (r) { return String(r.settled_month) !== monthKey; })
    .sort(function (a, b) { return Number(a.due_day) - Number(b.due_day); })
    .map(function (r) {
      return { date: ordinal_(r.due_day) + " " + Utilities.formatDate(new Date(), tz, "MMM"), name: r.name, acct: acctName_(accounts, r.account_id) || "", amt: -Math.abs(num_(r.amount)) };
    });

  /* splurge / safe-to-spend */
  var takehome = num_(getConfig_("takehome")) || 0;
  var buffer = num_(getConfig_("safety_buffer")) || 0;
  var sip = recurring.filter(function (r) { return /sip|invest/i.test(r.category || ""); }).reduce(function (s, r) { return s + num_(r.amount); }, 0);
  var free = Math.max(0, takehome - fixedTotal - capsTotal - buffer - sip);
  var safeToday = daysLeft > 0 ? Math.round((budget - monthSpent) / daysLeft) : Math.max(0, budget - monthSpent);

  return {
    generatedAt: Utilities.formatDate(new Date(), tz, "EEE d MMM"),
    stale: "",
    netWorth: netWorth, deltaMonth: 0, deltaPct: 0,
    liquid: liquid, invested: invested, owed: owed,
    answers: { safeToday: Math.max(0, safeToday), debtFree: getConfig_("debt_free") || "—", debtFreeNote: "", runway: runway_(liquid, monthSpent), runwayNote: "liquid ÷ monthly spend", cardBill: cardBill_(accounts) },
    allocation: allocation,
    emergency: emergency_(liquid, monthSpent, getConfig_),
    upcoming: upcoming,
    today: { spent: todaySpent, safe: Math.max(0, safeToday), entries: todayEntries },
    week: { total: 0, vs: 0, days: [0, 0, 0, 0, 0, 0, 0], labels: ["M", "T", "W", "T", "F", "S", "S"], note: "" },
    month: { spent: monthSpent, budget: budget, left: Math.max(0, budget - monthSpent), daysLeft: daysLeft, projected: projected, avgDay: dayOfMonth ? Math.round(monthSpent / dayOfMonth) : 0, cats: cats, alert: overCapAlert_(cats) },
    year: yearSummary_(txns, tz),
    caps: budgets.map(function (b) { return { name: String(b.name), cap: num_(b.cap) }; }),
    fixed: fixed,
    detects: detectPatterns_(txns, recurring, accounts, tz),
    suggest: suggestBudgets_(txns, budgets, tz),
    splurge: { takehome: takehome, fixed: fixedTotal, caps: capsTotal, buffer: buffer, sip: sip, free: free },
    invest: investSummary_(accounts, allocation),
    recent: recent,
    allTxns: allTxns,
    monthly: monthly,
    accountsList: accounts.map(function (a) { return { id: String(a.id), name: String(a.name), type: String(a.type) }; }),
    predict: { brief: { head: "", body: "" }, nextMonth: fixedTotal + capsTotal, cardBill: cardBill_(accounts), cashflowBefore: fixedTotal, cashflowBuffer: buffer },
    sync: syncHealth_()
  };
}

/* ---------------- snapshot helpers ---------------- */
function allocLabel_(type) {
  if (type === "gold") return "Gold";
  if (type === "fd" || type === "ppf") return "PPF · FD";
  return "Equity · MF";
}
function acctName_(accounts, id) { for (var i = 0; i < accounts.length; i++) if (String(accounts[i].id) === String(id)) return accounts[i].name; return ""; }
function cardBill_(accounts) { return Math.abs(accounts.filter(function (a) { return a.type === "credit"; }).reduce(function (s, a) { return s + num_(a.balance); }, 0)); }
function runway_(liquid, monthSpend) { if (!monthSpend) return "—"; return (liquid / monthSpend).toFixed(1) + " mo"; }
function emergency_(liquid, monthSpend, cfg) {
  var target = monthSpend * 6 || 1;
  var pct = Math.min(100, Math.round(liquid / target * 100));
  return { have: liquid, pct: pct, short: Math.max(0, Math.round(target - liquid)) };
}
function overCapAlert_(cats) {
  var over = cats.filter(function (c) { return c.spent > c.cap; });
  if (!over.length) return "";
  var c = over[0];
  return c.name + " is " + inrPlain_(c.spent - c.cap) + " over cap.";
}
function yearSummary_(txns, tz) {
  var year = Utilities.formatDate(new Date(), tz, "yyyy");
  var months = [], labels = "JFMAMJJASOND".split(""), total = 0, byMonth = new Array(12).fill(0);
  txns.forEach(function (t) {
    if (t.kind === "transfer") return;
    if (dateKey_(t.date, tz, "yyyy") !== year) return;
    var m = Number(dateKey_(t.date, tz, "MM")) - 1;
    var neg = Math.min(0, num_(t.amount));
    byMonth[m] += Math.abs(neg); total += Math.abs(neg);
  });
  var max = Math.max.apply(null, byMonth) || 1, hi = byMonth.indexOf(max);
  months = byMonth.map(function (v) { return Math.max(6, Math.round(v / max * 100)); });
  var monthsElapsed = Number(Utilities.formatDate(new Date(), tz, "M"));
  return { total: total, avgMo: Math.round(total / (monthsElapsed || 1)), months: months, labels: labels, hi: hi, top: [] };
}
function investSummary_(accounts, allocation) {
  var value = accounts.filter(function (a) { return INVEST_TYPES[a.type]; }).reduce(function (s, a) { return s + num_(a.balance); }, 0);
  var holdings = accounts.filter(function (a) { return INVEST_TYPES[a.type]; }).map(function (a) {
    return { name: a.name, ret: "", retCls: "", val: num_(a.balance) };
  });
  return { value: value, gain: 0, xirr: 0, cagr: 0, invested: value, returns: 0, fyGain: 0, holdings: holdings, concentration: allocation.length && allocation[0].pct > 40 ? allocation[0].name + " is " + allocation[0].pct + "% of net worth — above 40%." : "" };
}
function syncHealth_() {
  var out = [];
  var gmailOn = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "syncGmailAlerts"; });
  var gLast = getConfig_("gmail_last_run"), gErr = getConfig_("gmail_last_error");
  out.push({ name: "Gmail", sub: "bank & card alerts", st: gmailOn ? (gErr ? "error: " + gErr.slice(0, 40) : (gLast ? "ok · " + agoShort_(gLast) : "installed")) : "not installed", cls: gmailOn && !gErr ? "pos" : (gErr ? "neg" : "warn") });
  var sLast = getConfig_("sms_last_run");
  out.push({ name: "SMS webhook", sub: "Tasker → Bling", st: sLast ? "live · " + agoShort_(sLast) : "no messages yet", cls: sLast ? "pos" : "" });
  out.push({ name: "Manual entry", sub: "always available", st: "on", cls: "" });
  return out;
}
function agoShort_(iso) {
  var ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "just now";
  var m = Math.floor(ms / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago";
  var h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago";
}

/* =================================================================
   Pattern detection — surfaces "you keep paying X, mark it?"
   ================================================================= */
/* Extract the payee name from a UPI/bank narration.
   "WDL TFR UPI/DR/642815416869/SHIVAM/SBIN/8249085323/Paid" -> "Shivam"
   "...DR/624575596173/ZOMATO/HDFC/payzomato@/UPI"          -> "Zomato"
   "DEBIT ACHDr YESB00709000028661 ZERODHA BROKIN"           -> "Zerodha" */
var NARR_NOISE = /^(WDL|TFR|UPI|DR|CR|ACH|ACHD|ACHDR|NEFT|IMPS|RTGS|DEBIT|CREDIT|PAID|RENT|BANK|LTD|PVT|INDIA|SBIN|HDFC|ICIC|YESB|UTIB|AXIS|KKBK|PYTM|BROKIN|CLEARIN|PAYMENT|TRANSFER)$/i;
function payeeOf_(name) {
  var s = String(name || "");
  var m = s.match(/\b\d{6,}\b[\/ ]+([A-Za-z][A-Za-z]{2,20})/);   // token right after the long reference number
  if (m && !NARR_NOISE.test(m[1])) return m[1];
  var toks = s.split(/[^A-Za-z]+/).filter(function (t) { return t.length >= 4 && !NARR_NOISE.test(t); });
  toks.sort(function (a, b) { return b.length - a.length; });
  return toks[0] || (s.slice(0, 16) || "payment");
}
function median_(arr) { if (!arr.length) return 0; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
function detectPatterns_(txns, recurring, accounts, tz) {
  // skip amounts already covered by a Recurring fingerprint
  function covered(a) { return recurring.some(function (r) { var tol = (num_(r.tolerance_pct) || 2) / 100, e = num_(r.amount); return e && Math.abs(a - e) <= e * tol; }); }
  // group by (amount rounded to ₹10 + account): the strong signal for rent/EMI is the
  // fixed amount recurring monthly, even when the payee text varies each time.
  var groups = {};
  txns.forEach(function (t) {
    var amt = num_(t.amount); if (amt >= 0 || t.kind === "transfer") return;
    var a = Math.abs(amt); if (a < 300) return;
    if (covered(a)) return;
    var key = (Math.round(a / 10) * 10) + "|" + t.account_id;
    var g = groups[key] || (groups[key] = { amt: a, acct: t.account_id, months: {}, days: [], payees: {} });
    g.months[dateKey_(t.date, tz, "yyyy-MM")] = true;
    g.days.push(Number(dateKey_(t.date, tz, "d")));
    var p = payeeOf_(t.merchant || t.category); g.payees[p] = (g.payees[p] || 0) + 1;
  });
  var out = [];
  Object.keys(groups).forEach(function (k) {
    var g = groups[k], n = Object.keys(g.months).length;
    if (n < 3 || out.length >= 6) return;
    var payee = Object.keys(g.payees).sort(function (a, b) { return g.payees[b] - g.payees[a]; })[0] || "payment";
    payee = titleCase_(payee.toLowerCase());
    var day = median_(g.days) || 1, isSub = g.amt < 2000;
    out.push({
      pick: isSub ? "Subscription" : payee,
      yes: isSub ? "Track" : "Mark",
      recurring: { name: payee, amount: g.amt, account_id: g.acct, due_day: day, category: isSub ? "Subscription" : "Fixed", tolerance_pct: 1 },
      text: "A payment of <b>" + inrPlain_(g.amt) + "</b> to <span class=\"raw\">" + esc_(payee) + "</span> has recurred <b>" + n + " months</b> (around the " + ordinal_(day) + "). " + (isSub ? "Track as a subscription?" : "Mark it as a fixed expense?")
    });
  });
  // most-recurring first
  return out.sort(function (a, b) { return b.recurring.amount - a.recurring.amount; });
}
function normMerchant_(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 14); }
function titleCase_(s) { return String(s || "").replace(/^\w/, function (c) { return c.toUpperCase(); }); }
function esc_(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

/* =================================================================
   Suggested budgets — trailing 3-month average per category
   ================================================================= */
function suggestBudgets_(txns, budgets, tz) {
  var capped = {}; budgets.forEach(function (b) { capped[String(b.name)] = true; });
  var now = new Date();
  var win = {};
  for (var i = 0; i < 3; i++) win[Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - i, 1), tz, "yyyy-MM")] = true;
  var byCat = {};
  txns.forEach(function (t) {
    var amt = num_(t.amount); if (amt >= 0 || t.kind === "transfer") return;
    if (!win[dateKey_(t.date, tz, "yyyy-MM")]) return;
    var c = String(t.category || "Uncategorized");
    (byCat[c] = byCat[c] || { total: 0, months: {} }).total += Math.abs(amt);
    byCat[c].months[dateKey_(t.date, tz, "yyyy-MM")] = true;
  });
  return Object.keys(byCat).map(function (c) {
    var g = byCat[c], months = Object.keys(g.months).length || 1, avg = g.total / months;
    return { name: c, note: "avg " + inrPlain_(avg) + "/mo", rec: Math.ceil(avg * 1.08 / 100) * 100, avg: avg, capped: !!capped[c] };
  }).filter(function (s) { return s.avg > 300; }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 4)
    .map(function (s) { return { name: s.name, note: s.note + (s.capped ? " · has cap" : ""), rec: s.rec }; });
}

/* =================================================================
   Gmail sync — parse bank/card alert emails into staged transactions
   ================================================================= */
function installGmailSync() {
  ensureInstalled_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "syncGmailAlerts") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncGmailAlerts").timeBased().everyMinutes(15).create();
  SpreadsheetApp.getActiveSpreadsheet().toast("Gmail sync installed (every 15 min).", "Bling", 5);
}
function syncGmailAlerts() { ensureInstalled_(); var lk = LockService.getScriptLock(); lk.waitLock(30000); try { return syncGmailAlerts_(); } finally { lk.releaseLock(); } }
function syncGmailAlerts_() {
  var query = getConfig_("gmail_query") || "label:Bling newer_than:7d";
  var rules = readObjects_("ParserRules").filter(function (r) { return truthy_(r.enabled) && !truthy_(r.quarantined) && r.source === "gmail"; });
  var result = { scanned: 0, staged: 0, skipped: 0, failed: 0 };
  try {
    if (!rules.length) { setConfig_("gmail_last_error", "No enabled parser rules"); setConfig_("gmail_last_run", nowIso_()); return result; }
    var known = {}; readObjects_("IngestEvents").forEach(function (ev) { known[String(ev.source_event_id)] = true; });
    var msgs = [];
    GmailApp.search(query, 0, 50).forEach(function (th) { th.getMessages().forEach(function (m) { msgs.push(m); }); });
    msgs.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });
    msgs.forEach(function (m) {
      var sid = m.getId(); if (known[sid]) { result.skipped++; return; }
      result.scanned++;
      var subject = m.getSubject() || "", sender = m.getFrom() || "", body = m.getPlainBody() || "";
      var rule = null, err = "";
      try {
        rule = rules.find(function (r) { return safeTest_(r.sender_pattern, sender) && safeTest_(r.subject_pattern, subject) && safeTest_(r.body_regex, body); });
        if (!rule) throw new Error("no rule matched");
        var parsed = applyRule_(rule, body);
        var acc = findAccountByLast4_(parsed.last4);
        if (!acc) throw new Error("no account for last4 " + (parsed.last4 || "?"));
        var amount = rule.direction === "credit" ? Math.abs(parsed.amount) : -Math.abs(parsed.amount);
        stageTransaction_({ date: m.getDate().toISOString(), merchant: parsed.merchant || subject.slice(0, 60), category: parsed.category || "Uncategorized", amount: amount, accountId: acc.id, source: "gmail", sourceEventId: sid, last4: parsed.last4 }, "gmail", rule.id, body);
        result.staged++;
      } catch (x) {
        err = x && x.message ? x.message : String(x);
        appendObject_("IngestEvents", { id: id_("ing"), source: "gmail", source_event_id: sid, received_at: m.getDate().toISOString(), raw_hash: "", parser_rule_id: rule ? rule.id : "", status: "failed", transaction_id: "", dedup_of: "", error: err, excerpt: redact_(body) });
        result.failed++;
      }
    });
    setConfig_("gmail_last_error", "");
  } catch (fatal) {
    setConfig_("gmail_last_error", fatal && fatal.message ? fatal.message : String(fatal));
  }
  setConfig_("gmail_last_run", nowIso_());
  return result;
}
function applyRule_(rule, body) {
  var re = new RegExp(String(rule.body_regex), "i");
  var mm = String(body).match(re);
  if (!mm) throw new Error("rule stopped matching");
  var map; try { map = JSON.parse(String(rule.field_map_json)); } catch (x) { throw new Error("bad field_map_json"); }
  var amt = Number(String(mm[num_(map.amount)] || "").replace(/[^0-9.]/g, ""));
  if (!isFinite(amt) || amt <= 0) throw new Error("no valid amount");
  return { amount: amt, merchant: clean_(mm[num_(map.merchant)] || "", 120), last4: clean_(mm[num_(map.last4)] || "", 4), category: clean_(map.category || "Uncategorized", 60) };
}

/* =================================================================
   SMS webhook ingest (Tasker/MacroDroid posts {text, sender})
   ================================================================= */
function ingestSms_(payload) {
  var text = String(payload.text || ""), sender = String(payload.sender || "");
  if (!text) throw new Error("empty sms");
  setConfig_("sms_last_run", nowIso_());
  var rules = readObjects_("ParserRules").filter(function (r) { return truthy_(r.enabled) && !truthy_(r.quarantined) && r.source === "sms"; });
  var sid = "sms_" + sha256_(text).slice(0, 20);
  if (readObjects_("IngestEvents").some(function (ev) { return String(ev.source_event_id) === sid; })) return { skipped: true };
  var rule = rules.find(function (r) { return safeTest_(r.sender_pattern, sender) && safeTest_(r.body_regex, text); });
  if (!rule) { appendObject_("IngestEvents", { id: id_("ing"), source: "sms", source_event_id: sid, received_at: nowIso_(), raw_hash: "", parser_rule_id: "", status: "failed", transaction_id: "", dedup_of: "", error: "no rule", excerpt: redact_(text) }); return { staged: false, error: "no rule matched" }; }
  var parsed = applyRule_(rule, text);
  var acc = findAccountByLast4_(parsed.last4);
  if (!acc) return { staged: false, error: "no account for last4" };
  var amount = rule.direction === "credit" ? Math.abs(parsed.amount) : -Math.abs(parsed.amount);
  var r = stageTransaction_({ date: nowIso_(), merchant: parsed.merchant || "SMS debit", category: parsed.category || "Uncategorized", amount: amount, accountId: acc.id, source: "sms", sourceEventId: sid, last4: parsed.last4 }, "sms", rule.id, text);
  return { staged: true, transaction: r.id, duplicate: r.duplicate };
}

/* =================================================================
   Stage a synced transaction: dedup, then commit + fingerprint-tag
   ================================================================= */
function stageTransaction_(p, source, ruleId, raw) {
  var dupId = findDuplicate_(p);
  var evId = id_("ing");
  if (dupId) {
    appendObject_("IngestEvents", { id: evId, source: source, source_event_id: p.sourceEventId, received_at: nowIso_(), raw_hash: dedupHash_(p), parser_rule_id: ruleId || "", status: "duplicate", transaction_id: dupId, dedup_of: dupId, error: "", excerpt: redact_(raw) });
    return { id: dupId, duplicate: true };
  }
  var cat = effectiveCat_({ category: p.category, merchant: p.merchant, note: "" }, readObjects_("CategoryRules"));
  var txn = upsertTransaction_({ date: p.date, merchant: p.merchant, category: cat, amount: p.amount, accountId: p.accountId, source: source, status: "needs_review", sourceEventId: p.sourceEventId });
  fingerprintTag_(txn);
  appendObject_("IngestEvents", { id: evId, source: source, source_event_id: p.sourceEventId, received_at: nowIso_(), raw_hash: dedupHash_(p), parser_rule_id: ruleId || "", status: "staged", transaction_id: txn.id, dedup_of: "", error: "", excerpt: redact_(raw) });
  return { id: txn.id, duplicate: false };
}
function dedupHash_(p) { return sha256_(String(p.date).slice(0, 10) + "|" + Math.abs(num_(p.amount)) + "|" + (p.last4 || "")); }
function findDuplicate_(p) {
  var tz = Session.getScriptTimeZone(), fuzzMs = (num_(getConfig_("fuzzy_minutes")) || 10) * 60000;
  var target = new Date(p.date).getTime(), amt = Math.abs(num_(p.amount));
  var txns = readObjects_("Transactions").filter(function (t) { return !t.deleted_at; });
  // exact hash (date+amount+last4)
  var hash = dedupHash_(p);
  var hashHit = readObjects_("IngestEvents").find(function (ev) { return ev.raw_hash === hash && ev.transaction_id; });
  if (hashHit) return String(hashHit.transaction_id);
  // fuzzy: same account + amount within window, only when one side lacks a merchant ref
  var f = txns.find(function (t) {
    return String(t.account_id) === String(p.accountId) && Math.abs(num_(t.amount) - p.amount) < 0.5 &&
      Math.abs(new Date(t.date).getTime() - target) <= fuzzMs && (!t.merchant || !p.merchant);
  });
  return f ? String(f.id) : "";
}

/* fingerprint: match a staged txn to a Recurring → auto-tag + settle this month */
function fingerprintTag_(txn) {
  var tz = Session.getScriptTimeZone(), monthKey = dateKey_(txn.date, tz, "yyyy-MM");
  var recs = readObjects_("Recurring").filter(function (r) { return truthy_(r.active); });
  var amt = Math.abs(num_(txn.amount));
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i], tol = (num_(r.tolerance_pct) || 2) / 100, exp = num_(r.amount);
    var accountOk = !r.account_id || String(r.account_id) === String(txn.account_id);
    var dayOk = !r.due_day || Math.abs(Number(dateKey_(txn.date, tz, "d")) - Number(r.due_day)) <= 3;
    if (accountOk && dayOk && Math.abs(amt - exp) <= exp * tol) {
      var f = findObject_("Transactions", "id", txn.id);
      writeObjectAt_("Transactions", f.rowIndex, Object.assign({}, f.object, { category: r.category || r.name, note: "auto-tagged: " + r.name, status: "confirmed", updated_at: nowIso_() }));
      var rf = findObject_("Recurring", "id", r.id);
      writeObjectAt_("Recurring", rf.rowIndex, Object.assign({}, rf.object, { settled_month: monthKey, updated_at: nowIso_() }));
      return true;
    }
  }
  return false;
}

/* =================================================================
   App-driven confirmations
   ================================================================= */
function confirmRecurring_(p) {
  var r = p.recurring || p;
  return upsertObject_("Recurring", "id", {
    id: id_("rec"), name: clean_(r.name || "Recurring", 120), category: clean_(r.category || "Fixed", 60),
    amount: Math.abs(num_(r.amount)), account_id: String(r.account_id || r.accountId || ""),
    due_day: Number(r.due_day || r.dueDay || 1), cadence: "monthly", status: "upcoming", tolerance_pct: num_(r.tolerance_pct) || 3, settled_month: "", active: true, updated_at: nowIso_()
  });
}
function setBudgetCap_(p) {
  var name = clean_(p.name, 100), cap = num_(p.cap || p.rec);
  var existing = findObject_("Budgets", "name", name);
  var row = { id: existing ? existing.object.id : id_("bud"), name: name, cap: cap, group: "flex", created_at: existing ? existing.object.created_at : nowIso_(), updated_at: nowIso_() };
  return upsertObject_("Budgets", "id", row);
}
function settleRecurring_(id) { var f = requireObject_("Recurring", "id", id); writeObjectAt_("Recurring", f.rowIndex, Object.assign({}, f.object, { settled_month: dateKey_(nowIso_(), Session.getScriptTimeZone(), "yyyy-MM"), updated_at: nowIso_() })); return { id: id, settled: true }; }
function confirmTransaction_(id) { var f = requireObject_("Transactions", "id", id); writeObjectAt_("Transactions", f.rowIndex, Object.assign({}, f.object, { status: "confirmed", updated_at: nowIso_() })); return f.object; }

/* =================================================================
   Parser rule templates (disabled until you tune them)
   ================================================================= */
function seedParserTemplates_() {
  var now = nowIso_();
  [
    { id: "pr_hdfc_sms", bank: "HDFC (SMS) — edit & enable", source: "sms", sender_pattern: "HDFC", subject_pattern: "", body_regex: "(?:Rs\\.?|INR)\\s*([0-9,]+(?:\\.[0-9]{1,2})?).*?(?:at|to)\\s+([^.]+?)\\b.*?(?:card|a/?c)\\s*(?:xx|\\*+)?([0-9]{4})", field_map_json: JSON.stringify({ amount: 1, merchant: 2, last4: 3, category: "Uncategorized" }), direction: "debit", enabled: false, quarantined: false, version: 1, updated_at: now },
    { id: "pr_generic_gmail", bank: "Generic bank alert (Gmail) — edit & enable", source: "gmail", sender_pattern: "alerts@|@.*bank", subject_pattern: "debit|spent|transaction", body_regex: "(?:Rs\\.?|INR|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?).*?(?:at|to)\\s+([^\\n.]+).*?(?:ending|card|a/?c)[^0-9]*([0-9]{4})", field_map_json: JSON.stringify({ amount: 1, merchant: 2, last4: 3, category: "Uncategorized" }), direction: "debit", enabled: false, quarantined: false, version: 1, updated_at: now }
  ].forEach(function (t) { if (!findObject_("ParserRules", "id", t.id)) appendObject_("ParserRules", t); });
}
/* =================================================================
   Keyword auto-categorisation
   ================================================================= */
function effectiveCat_(t, rules) {
  var c = String(t.category || "");
  if (c && c.toLowerCase() !== "uncategorized") return c;               // keep manual/known categories
  var hay = ((t.merchant || "") + " " + (t.note || "")).toLowerCase();
  var best = null;
  for (var i = 0; i < rules.length; i++) {
    if (!truthy_(rules[i].active)) continue;
    var kws = String(rules[i].keywords || "").toLowerCase().split(",");
    for (var j = 0; j < kws.length; j++) {
      var k = kws[j].trim();
      if (k && hay.indexOf(k) !== -1) {
        if (!best || num_(rules[i].priority) > num_(best.priority)) best = rules[i];
        break;
      }
    }
  }
  return best ? String(best.category) : (c || "Uncategorized");
}
function seedCategoryRules_() {
  var now = nowIso_();
  [
    { id: "cat_food", keywords: "zomato,swiggy,mcdonald,dominos,kfc,starbucks,chaayos,chai point,eatfit,faasos,box8", category: "Eating out", priority: 10, active: true, updated_at: now },
    { id: "cat_groc", keywords: "blinkit,zepto,bigbasket,grofers,dmart,jiomart,instamart,dunzo,milk,kirana", category: "Groceries", priority: 10, active: true, updated_at: now },
    { id: "cat_trans", keywords: "rapido,uber,ola,irctc,redbus,namma,metro,petrol,fuel,indian oil,hpcl,bpcl,fastag", category: "Transport", priority: 10, active: true, updated_at: now },
    { id: "cat_shop", keywords: "amazon,flipkart,myntra,ajio,nykaa,meesho,tatacliq,decathlon", category: "Shopping", priority: 8, active: true, updated_at: now },
    { id: "cat_bills", keywords: "electricity,bescom,water,gas,broadband,airtel,jio,vodafone,vi ,bsnl,recharge,dth,tata power", category: "Bills & utilities", priority: 9, active: true, updated_at: now },
    { id: "cat_ent", keywords: "netflix,spotify,hotstar,prime,youtube,jiocinema,bookmyshow,pvr,inox", category: "Entertainment", priority: 8, active: true, updated_at: now },
    { id: "cat_health", keywords: "pharmeasy,1mg,apollo,netmeds,practo,cult,healthify,hospital,clinic", category: "Health", priority: 8, active: true, updated_at: now },
    { id: "cat_invest", keywords: "zerodha,groww,coin,mutual,sip,indmoney,kuvera,smallcase", category: "Investments", priority: 7, active: true, updated_at: now }
  ].forEach(function (r) { if (!findObject_("CategoryRules", "id", r.id)) appendObject_("CategoryRules", r); });
}
/* app: set one transaction's category (from the review UI) */
function setTxnCategory_(p) {
  var f = requireObject_("Transactions", "id", p.id);
  var cat = clean_(p.category, 100);
  if (!cat) throw new Error("category required");
  writeObjectAt_("Transactions", f.rowIndex, Object.assign({}, f.object, { category: cat, status: "confirmed", updated_at: nowIso_() }));
  return { id: p.id, category: cat };
}
/* app: add a keyword rule (merged into that category), then apply it everywhere */
function addCategoryRule_(p) {
  var kw = clean_(String(p.keyword || "").toLowerCase(), 80), cat = clean_(p.category, 60);
  if (!kw || !cat) throw new Error("keyword and category required");
  var rules = readObjects_("CategoryRules");
  var same = null;
  for (var i = 0; i < rules.length; i++) if (String(rules[i].category).toLowerCase() === cat.toLowerCase()) { same = rules[i]; break; }
  if (same) {
    var f = findObject_("CategoryRules", "id", same.id);
    var kws = String(f.object.keywords || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (kws.indexOf(kw) === -1) kws.push(kw);
    writeObjectAt_("CategoryRules", f.rowIndex, Object.assign({}, f.object, { keywords: kws.join(","), updated_at: nowIso_() }));
  } else {
    appendObject_("CategoryRules", { id: id_("cat"), keywords: kw, category: cat, priority: 10, active: true, updated_at: nowIso_() });
  }
  var applied = autoCategorize_();
  return { keyword: kw, category: cat, applied: applied.categorised };
}
/* menu: write categories onto every Uncategorized transaction that matches a rule */
function autoCategorize() {
  ensureInstalled_();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var r = autoCategorize_();
    SpreadsheetApp.getActiveSpreadsheet().toast(r.categorised + " transactions categorised.", "Bling", 5);
    return r;
  } finally { lock.releaseLock(); }
}
function autoCategorize_() {
  var rules = readObjects_("CategoryRules");
  var rows = readObjects_("Transactions");
  var changed = 0;
  rows.forEach(function (t, i) {
    if (t.deleted_at) return;
    var cur = String(t.category || "");
    if (cur && cur.toLowerCase() !== "uncategorized") return;
    var cat = effectiveCat_(t, rules);
    if (cat && cat !== cur) { writeObjectAt_("Transactions", i + 2, Object.assign({}, t, { category: cat, updated_at: nowIso_() })); changed++; }
  });
  return { categorised: changed };
}
function findAccountByLast4_(last4) { if (!last4) return null; return readObjects_("Accounts").find(function (a) { return truthy_(a.active) && String(a.last4) === String(last4); }) || null; }
function safeTest_(pattern, value) { if (!pattern) return true; if (String(pattern).length > 1000) throw new Error("pattern too long"); return new RegExp(String(pattern), "i").test(String(value)); }
function redact_(s) { return clean_(String(s).replace(/\b\d{6}\b/g, "[OTP]").replace(/\b\d{9,19}\b/g, "[NUM]").slice(0, 400), 400); }
function showSmsToken() { ensureInstalled_(); SpreadsheetApp.getUi().alert("SMS webhook token", getConfig_("sms_webhook_token") + "\n\nUse in your Tasker/MacroDroid POST body as the \"token\" field with action \"ingest_sms\".", SpreadsheetApp.getUi().ButtonSet.OK); }

/* ---------------- mutations ---------------- */
function upsertTransaction_(p) {
  if (!p.merchant && !p.category) throw new Error("merchant or category required");
  if (!isFinite(Number(p.amount))) throw new Error("amount invalid");
  var id = safeId_(p.id || id_("txn"));
  var existing = findObject_("Transactions", "id", id);
  var accId = p.accountId || p.account_id || (existing ? existing.object.account_id : "");   // keep account on edit
  if (!accId) throw new Error("account required");
  requireObject_("Accounts", "id", accId);
  var now = nowIso_();
  var row = {
    id: id, date: p.date ? new Date(p.date).toISOString() : now,
    merchant: clean_(p.merchant || "", 180), note: clean_(p.note || "", 400),
    category: clean_(p.category || "Uncategorized", 100), amount: num_(p.amount),
    account_id: String(accId), kind: String(p.kind || (num_(p.amount) >= 0 ? "income" : "expense")),
    source: String(p.source || "manual"), status: String(p.status || "confirmed"),
    source_event_id: String(p.sourceEventId || p.source_event_id || ""),
    created_at: existing ? existing.object.created_at : now, updated_at: now, deleted_at: ""
  };
  upsertObject_("Transactions", "id", row);
  recalcBalances_();
  return row;
}
function deleteTransaction_(id) {
  var f = requireObject_("Transactions", "id", id);
  writeObjectAt_("Transactions", f.rowIndex, Object.assign({}, f.object, { deleted_at: nowIso_(), updated_at: nowIso_() }));
  recalcBalances_();
  return { id: id, deleted: true };
}
function upsertAccount_(p) {
  var id = safeId_(p.id || id_("acc"));
  var existing = findObject_("Accounts", "id", id);
  var row = {
    id: id, name: clean_(p.name || "Account", 120), institution: clean_(p.institution || "", 120),
    type: String(p.type || "bank"), last4: clean_(p.last4 || "", 4),
    opening_balance: num_(p.openingBalance || p.opening_balance || 0),
    balance: existing ? num_(existing.object.balance) : num_(p.openingBalance || 0),
    limit: p.limit == null ? "" : num_(p.limit), active: true, updated_at: nowIso_()
  };
  upsertObject_("Accounts", "id", row);
  recalcBalances_();
  return row;
}

/* balances = opening + sum(transactions) per account */
function recalcBalances() { ensureInstalled_(); recalcBalances_(); SpreadsheetApp.getActiveSpreadsheet().toast("Balances recalculated.", "Bling", 4); }
function recalcBalances_() {
  var txns = readObjects_("Transactions").filter(function (t) { return !t.deleted_at; });
  var sums = {};
  txns.forEach(function (t) { sums[String(t.account_id)] = (sums[String(t.account_id)] || 0) + num_(t.amount); });
  var accounts = readObjects_("Accounts");
  accounts.forEach(function (a, i) {
    var bal = num_(a.opening_balance) + (sums[String(a.id)] || 0);
    if (Math.abs(num_(a.balance) - bal) > 0.005) writeObjectAt_("Accounts", i + 2, Object.assign({}, a, { balance: bal, updated_at: nowIso_() }));
  });
}

/* ---------------- demo seed ---------------- */
function seedDemo() {
  ensureInstalled_();
  var now = nowIso_();
  [
    { id: "acc_hdfc", name: "Salary account", institution: "HDFC", type: "bank", last4: "4821", opening_balance: 180240, balance: 180240, limit: "", active: true, updated_at: now },
    { id: "acc_mf", name: "Mutual funds", institution: "Zerodha", type: "mf", last4: "", opening_balance: 964000, balance: 964000, limit: "", active: true, updated_at: now },
    { id: "acc_fd", name: "PPF + FD", institution: "SBI", type: "fd", last4: "", opening_balance: 578000, balance: 578000, limit: "", active: true, updated_at: now },
    { id: "acc_gold", name: "Gold", institution: "—", type: "gold", last4: "", opening_balance: 385000, balance: 385000, limit: "", active: true, updated_at: now },
    { id: "acc_card", name: "Atlas", institution: "Axis", type: "credit", last4: "7739", opening_balance: -14480, balance: -14480, limit: 250000, active: true, updated_at: now }
  ].forEach(function (a) { upsertObject_("Accounts", "id", a); });
  [
    { id: "bud_food", name: "Eating out", cap: 5000, group: "flex", created_at: now, updated_at: now },
    { id: "bud_groc", name: "Groceries", cap: 12000, group: "flex", created_at: now, updated_at: now },
    { id: "bud_trans", name: "Transport", cap: 6000, group: "flex", created_at: now, updated_at: now }
  ].forEach(function (b) { upsertObject_("Budgets", "id", b); });
  [
    { id: "rec_rent", name: "Rent", category: "Rent", amount: 17000, account_id: "acc_hdfc", due_day: 3, cadence: "monthly", status: "upcoming", tolerance_pct: 2, settled_month: "", active: true, updated_at: now },
    { id: "rec_emi", name: "Home-loan EMI", category: "EMI", amount: 42300, account_id: "acc_hdfc", due_day: 15, cadence: "monthly", status: "upcoming", tolerance_pct: 2, settled_month: "", active: true, updated_at: now },
    { id: "rec_sip", name: "SIP · Nifty 50", category: "SIP", amount: 15000, account_id: "acc_hdfc", due_day: 10, cadence: "monthly", status: "upcoming", tolerance_pct: 0, settled_month: "", active: true, updated_at: now }
  ].forEach(function (r) { upsertObject_("Recurring", "id", r); });

  // transactions across this + 2 prior months, so detection/suggestions have history
  var tz = Session.getScriptTimeZone(), d = new Date();
  function dt(monthsAgo, day, h) { var x = new Date(d.getFullYear(), d.getMonth() - monthsAgo, day, h || 12, 0, 0); return x.toISOString(); }
  var seedTxns = [];
  for (var mo = 0; mo < 3; mo++) {
    seedTxns.push({ date: dt(mo, 3, 9), merchant: "RAZORP*LANDLRD", category: "Uncategorized", amount: -17000, accountId: "acc_hdfc", kind: "expense" });   // → detect as Rent
    seedTxns.push({ date: dt(mo, 18, 20), merchant: "Spotify", category: "Uncategorized", amount: -499, accountId: "acc_hdfc", kind: "expense" });            // → detect as subscription
    seedTxns.push({ date: dt(mo, 6, 13), merchant: "Blinkit", category: "Groceries", amount: -(2200 + mo * 300), accountId: "acc_hdfc", kind: "expense" });
    seedTxns.push({ date: dt(mo, 12, 21), merchant: "Swiggy", category: "Eating out", amount: -(1800 + mo * 200), accountId: "acc_hdfc", kind: "expense" });
    seedTxns.push({ date: dt(mo, 8, 19), merchant: "Zomato", category: "Eating out", amount: -(1400 + mo * 150), accountId: "acc_hdfc", kind: "expense" });
    seedTxns.push({ date: dt(mo, 5, 8), merchant: "Rapido", category: "Transport", amount: -(900 + mo * 100), accountId: "acc_hdfc", kind: "expense" });
    seedTxns.push({ date: dt(mo, 1, 10), merchant: "Salary", category: "Income", amount: 145000, accountId: "acc_hdfc", kind: "income" });
  }
  seedTxns.forEach(function (t) { upsertTransaction_(t); });
  recalcBalances_();
  SpreadsheetApp.getActiveSpreadsheet().toast("Demo data seeded (accounts, budgets, 3 months of transactions).", "Bling", 5);
}

/* ---------------- health ---------------- */
function showHealth() { ensureInstalled_(); var h = health_(); SpreadsheetApp.getUi().alert("Bling health", JSON.stringify(h, null, 2), SpreadsheetApp.getUi().ButtonSet.OK); }
function health_() {
  return {
    schema: SCHEMA_VERSION,
    accounts: readObjects_("Accounts").filter(function (a) { return truthy_(a.active); }).length,
    transactions: readObjects_("Transactions").filter(function (t) { return !t.deleted_at; }).length,
    tokens: readObjects_("DeviceTokens").filter(function (t) { return !t.revoked_at; }).length
  };
}

/* ---------------- auth + plumbing ---------------- */
function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("Request body required");
  if (e.postData.contents.length > 100000) throw new Error("Request too large");
  try { return JSON.parse(e.postData.contents); } catch (x) { throw new Error("Body must be JSON"); }
}
function authenticate_(token) {
  if (!token || String(token).length < 32) throw new Error("Token missing or invalid");
  var hash = sha256_(String(token));
  var match = readObjects_("DeviceTokens").find(function (r) { return !r.revoked_at && String(r.token_hash) === hash; });
  if (!match) throw new Error("Token invalid or revoked");
  var f = requireObject_("DeviceTokens", "id", match.id);
  writeObjectAt_("DeviceTokens", f.rowIndex, Object.assign({}, f.object, { last_used_at: nowIso_() }));
  return { id: String(match.id), name: String(match.name || "Device") };
}
function ensureInstalled_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("Config") || !ss.getSheetByName("Accounts")) throw new Error("Not set up. Run setupBling().");
}
function ensureTable_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var cur = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
  headers.forEach(function (h, i) { if (cur[i] !== h) sh.getRange(1, i + 1).setValue(h); });
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setBackground("#173f2c").setFontColor("#fff").setFontWeight("bold");
  return sh;
}
function table_(n) { var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); if (!sh) throw new Error("Missing tab: " + n); return sh; }
function readObjects_(name) {
  var sh = table_(name), headers = TABLES[name], last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues()
    .filter(function (r) { return r.some(function (c) { return c !== ""; }); })
    .map(function (r) { var o = {}; headers.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}
function rowFrom_(name, o) { return TABLES[name].map(function (h) { return o[h] === undefined ? "" : o[h]; }); }
function appendObject_(name, o) { var sh = table_(name); sh.getRange(sh.getLastRow() + 1, 1, 1, TABLES[name].length).setValues([rowFrom_(name, o)]); }
function writeObjectAt_(name, rowIndex, o) { table_(name).getRange(rowIndex, 1, 1, TABLES[name].length).setValues([rowFrom_(name, o)]); }
function findObject_(name, key, val) {
  var objs = readObjects_(name);
  for (var i = 0; i < objs.length; i++) if (String(objs[i][key]) === String(val)) return { object: objs[i], rowIndex: i + 2 };
  return null;
}
function requireObject_(name, key, val) { var f = findObject_(name, key, val); if (!f) throw new Error(name + " not found: " + val); return f; }
function upsertObject_(name, key, o) {
  var f = findObject_(name, key, o[key]);
  if (f) writeObjectAt_(name, f.rowIndex, Object.assign({}, f.object, o)); else appendObject_(name, o);
  return o;
}
function withStamp_(p, mode, prefix) { p = Object.assign({}, p); if (!p.id) p.id = id_(prefix); p.updated_at = nowIso_(); return p; }
function getConfig_(k) { var f = findObject_("Config", "key", k); return f ? String(f.object.value) : ""; }
function setConfig_(k, v) { upsertObject_("Config", "key", { key: k, value: v, note: "" }); }

/* ---------------- utils ---------------- */
function sha256_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(function (b) { return ((b + 256) % 256).toString(16).replace(/^(.)$/, "0$1"); }).join(""); }
function id_(p) { return p + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 18); }
function safeId_(v) { var s = String(v || ""); if (!/^[A-Za-z0-9_-]{1,120}$/.test(s)) throw new Error("bad id"); return s; }
function nowIso_() { return new Date().toISOString(); }
function num_(v) { var n = Number(v || 0); return isFinite(n) ? n : 0; }
function truthy_(v) { return v === true || v === 1 || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes"; }
function clean_(v, max) { var s = String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function dateKey_(d, tz, fmt) { var dt = new Date(d); return isNaN(dt.getTime()) ? "" : Utilities.formatDate(dt, tz, fmt); }
function shortDate_(d, tz) { var dt = new Date(d); return isNaN(dt.getTime()) ? "" : Utilities.formatDate(dt, tz, "d MMM"); }
function ordinal_(n) { n = Number(n) || 0; var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function daysInMonth_(tz) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function daysLeftInMonth_(tz) { var d = new Date(); return daysInMonth_(tz) - Number(Utilities.formatDate(d, tz, "d")); }
function inrPlain_(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
