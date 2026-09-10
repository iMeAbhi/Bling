# Bling v2 — Feature & UX Specification

*Supersedes `BLING.md`. This rewrite is driven by an honest teardown against Money Lover (daily craft) and Walnut (effortless auto-capture), and a critique of Bling's own information architecture. It fixes the two things that actually block Bling from replacing your bank apps: **numbers you can't trust** and **a core feature (auto-capture) that ships off**, plus the IA that makes features feel "scattered."*

---

## 1. Honest positioning

Bling is **not "best" at anything today.** Its only real trophy is visual design ("Ledger"). Everything daily-useful — auto-capture, fast entry, budgets, reports, reminders, onboarding, reliability — is owned by the two shipped apps. Bling's *ambition* (one trustworthy wealth view you own, free) is unique, but ambition isn't execution.

v2's job: keep the frame (unified wealth + Ledger design + your-own-Sheet ownership) and **earn the substance** — correctness first, then automation, then daily craft.

## 2. North-star: the composite "best app"

The app we're building toward, dimension by dimension:

- **Captures automatically** (Walnut) — SMS/Gmail parse spends with zero setup, working on install.
- **Fixes/adds in two taps** (Money Lover) — numeric keypad, recent merchants, remembers last category, icon category grid.
- **Reminds before bills hit** (Walnut) — push/email for dues and EMIs.
- **Shows real reports** (Money Lover) — ranges, chart types, tap-a-slice → its transactions, heatmap.
- **Rolls it into a *trustworthy* net worth** (Bling's ambition, done right) — bank + all cards + investments + loans, card utilization, debt-free date.
- **Looks like Bling, is reliable like Money Lover.**
- **Splits with people** (Walnut) — rent, trips.
- **Is yours** (Bling) — own Sheet, free, on-demand AI briefing.

## 3. Information architecture — one concept, one place

**The problem in v1:** organized by how it was built (render functions), not by what the user is doing. The "Spend" tab is a junk drawer (Track + Fixed&budgets + Trends); Budgets and Accounts have no home; safe-to-spend / upcoming / subscriptions each appear in 2–3 places.

**v2 nav — five job-based tabs:**

| Tab | Owns |
|-----|------|
| **Today** | The daily driver: today/this-week spend **feed**, one-tap **quick add**, **safe-to-spend**, a **Review** inbox badge. |
| **Money** | Net worth hero, **all accounts**, **cards + utilization**, investments, loan balances. Tap any account → its ledger. *(absorbs old Invest + the Home cards strip)* |
| **Budgets** | Category **caps** (rollover + alerts), **fixed expenses**, **loans & EMIs + debt-free**. The single home for "what's committed vs free". *(pulled out of the Spend junk-drawer)* |
| **Insights** | **Trends** + reports (ranges, drill-down, heatmap) + **forecast** + **upcoming** + **AI briefing**. *(absorbs old Predict + Trends)* |
| **You** | Connection, sync setup, AI key, appearance, data/export. |

**Cross-cutting rules:**
- **One global `+`** (the FAB) is the only manual-add path, on every tab.
- **Review is a place, not a modal** — a persistent inbox with a count badge on Today, like an email inbox for uncategorised / needs-review / detected-recurring.
- **De-duplicate:** safe-to-spend lives only on **Today**; upcoming only in **Insights** (+ a peek on Today); recurring/subscriptions only in **Budgets**.
- **Net worth** is shown on **Money** (full) with a compact echo on Today.

## 4. Screens

### 4.1 Today (daily driver)
- **Spend feed** — reverse-chronological transactions (auto + manual), grouped by day, each with category icon; tap to edit/recategorise. This is what you check daily (Walnut's insight: the home is the feed, not the balance).
- **Quick add** — the `+` opens a **numeric keypad** first (amount), then merchant (recent chips), then category (icon grid), then account. Two-second entry. Remembers last category per merchant.
- **Safe-to-spend today** — one number, with its assumptions on tap.
- **Review inbox** — "N to review" badge → the Review place (recurring groups + uncategorised). Not a modal you stumble into.
- **A peek** at the next 1–2 upcoming dues (full list in Insights).

### 4.2 Money (where you stand)
- **Net worth hero** with real month delta (income − spend, sign-aware) and trend spark.
- **Accounts list** — banks, then **cards with utilization bars** (per-card + blended, red ≥30%), then investments, then loan balances. Liquid vs total split explicit.
- **Tap an account → its ledger** (balance history + transactions). *(new; the missing drill-down)*
- Investments: holdings, current value (manual or pasted), and — when entered — real XIRR. No fake XIRR=0; show "add value" if unknown.

### 4.3 Budgets (what's committed vs free)
- **Category caps** — per category, with **rollover** (unspent carries) and a **warning threshold** (e.g. alert at 90%). Icons + colours. Tap a category → its transactions this period.
- **Fixed expenses** — rent/bills/subscriptions with fingerprints; edit amount/day/**end date**/delete. Auto-match + settle.
- **Loans & EMIs** — the single source of truth (migrate the EMI-category recurring here). Double-entry pay (bank ↓ + card/loan ↓). Outstanding, EMI, **end date → debt-free date**, "+₹X/mo prepay saves N months".
- **Splurge / what's free** — the derived free-to-spend, shown once, here (feeds Today's safe-to-spend).

### 4.4 Insights (understand + predict)
- **Trends** — month-on-month, per category, with **date-range picker**, multiple chart types, and **tap-a-bar/slice → its transactions**. A spend **calendar heatmap**.
- **Forecast** — next-month projection, cash-flow radar (dues vs next salary), debt-free countdown.
- **Upcoming** — the full chronological dues list (the only place it lives).
- **AI briefing** — on-demand Gemini read (needs user key), shown inline.

### 4.5 You (settings)
- Connection (URL + token), sync setup (Gmail label + install + scan, SMS webhook token), AI key, appearance (Paper/Charcoal), data export/restore.

## 5. Cross-cutting UX requirements

- **Fast entry** — keypad, recents, remember-last-category. (Money Lover's daily win; Bling's biggest daily-use gap.)
- **Category icons + colours + a small hierarchy.** No raw UPI strings as categories in the UI.
- **Reminders** — email digest for dues/EMIs first (already scoped), push later. A finance app without reminders is missing table stakes.
- **Four states everywhere** — empty (CTA), loading (skeleton), stale ("Updated Nh ago", never assert live over cache), error (inline + retry). Already a principle; enforce on every new surface.
- **Motion** — press feedback, spring sheets, `prefers-reduced-motion`. Keep the calm Ledger register.
- **Accessibility** — ≥44px targets, focus rings, contrast ≥4.5:1 (watch small Fraunces), color never the only signal.

## 6. Correctness & data integrity — existential, do first

The app currently shows wrong numbers unless hand-cleaned. Non-negotiable for v2:
- **Account types** — recognise `credit_card`, `wallet`, all invest subtypes (done, verify). Net worth must reconcile.
- **One source of truth for loans** — EMIs live in Loans, not duplicated in Recurring. Migrate/merge.
- **No phantom data** — a "clean up seeded demo" action; don't let `seedDemo` pollute real instances (namespace or a one-click purge).
- **Real month delta**, real card utilization, honest investment values (no XIRR=0 façade).
- **Derived, reconcilable balances** — a visible "recompute" and a balance-vs-reported check.
- **Stale/ended obligations drop off** automatically (end dates; done, verify).

## 7. Auto-capture — make it work on install

Walnut's entire reason to exist; Bling ships it disabled. v2:
- **Ship 3–4 enabled, tested parser rules** for the common Indian bank SMS/Gmail formats (HDFC, SBI, ICICI, Axis, Kotak) so a new user sees auto-tracked spends day one.
- **Guided sync onboarding** — "label these emails / point Tasker here", with a working default.
- Keep the review queue + dedup so auto-import never silently corrupts balances.

## 8. Reliability & code health

- The one-file string-concat renderer with a hand-maintained click-delegation list has caused repeated dead-button bugs. v2 should move to **small, shared view functions used by both phone and web** (kill the parity class of bugs) and a **single event-delegation registry** derived from the DOM, not a hand-typed selector string.
- Add a **smoke-test pass** (load, switch every tab/mode, open every modal, assert no console errors) before each deploy.

## 9. What we keep from v1

- **Ledger design system** (the real trophy) — tokens, Fraunces numerals, paper/charcoal.
- **Sheet + Apps Script backend** and the token-auth model, double-entry ledger, category rules, recurring detection, trends aggregates, loans double-entry.
- **Ownership / free / privacy** posture.

## 10. Build order (ruthless, by leverage)

1. **Correctness** (§6) — types, one loan source, purge phantom data, honest deltas/values. *Until numbers are trustworthy, nothing else matters.*
2. **Auto-capture on install** (§7) — real parser rules + guided sync. *Or Bling isn't in the category.*
3. **Reminders** — email digest.
4. **Fast entry** — keypad + recents + remember-category.
5. **IA refactor** (§3) — the 5-tab job map; kill duplicates; Review as a place.
6. **Report depth + budget rollover** (§4.3–4.4).
7. **Split expenses** (biggest, last).

Design is done. Stop polishing the skin; earn the substance in this order.
