# Bling backend — Google Apps Script

Turns a Google Sheet into Bling's private data source. One Sheet + one script = your own instance. No server, no cost.

## Setup (once, ~5 minutes)

1. Create a new Google Sheet (this holds your data).
2. **Extensions → Apps Script.** Delete the placeholder, paste the contents of `apps-script/Code.gs`, save.
3. Run **`setupBling`** (pick it in the toolbar dropdown → Run). Authorise when prompted — it's your own script accessing your own Sheet.
4. Run **`createDeviceToken`**. Copy the token it shows (starts with `fos_`) — it's shown only once.
5. *(Optional)* Run **`seedDemo`** to fill the Sheet with sample data so you can see the app working before entering your own.
6. **Deploy → New deployment → Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then copy the **Web app URL** (ends in `/exec`).
7. Open Bling → **You → Your Sheet**, paste the **/exec URL** and the **token**. Done — the app now reads your Sheet.

### Optional: automatic sync

- **Gmail:** label your bank/card alert emails `Bling` (a Gmail filter can auto-label them), open the `ParserRules` tab, tune one rule for your bank's email format and set `enabled = TRUE`, then run **Bling → Install 15-min Gmail sync**. New alerts are parsed into transactions, de-duplicated, and fixed expenses (rent, EMIs) are auto-tagged when they match a `Recurring` fingerprint.
- **SMS (Android):** run **Bling → Show SMS webhook token**. In Tasker/MacroDroid, on incoming bank SMS, POST to the `/exec` URL with body `{"action":"ingest_sms","token":"<sms token>","payload":{"text":"<sms body>","sender":"<sender>"}}`. Tune an `sms` rule in `ParserRules` (one template is provided).

Both flows stage transactions the app shows for review; nothing silently corrupts your balances.

## Why "Anyone" access is safe here

"Anyone" is required so the app (served from GitHub Pages, a different origin) can call the script. Access is still gated: every request must carry your device **token**, and the script only stores a **SHA-256 hash** of it. No token → no data. Revoke a device by putting a date in the `revoked_at` cell of the `DeviceTokens` tab.

**Never** paste a token into a URL, screenshot, or commit. Rotate by creating a new token and revoking the old.

## Categorising imported transactions

Bank imports have raw UPI narration, not clean categories — so budgets read ₹0 until transactions are categorised. The `CategoryRules` tab maps keywords → a category (e.g. `zomato,swiggy → Eating out`), seeded with sensible India defaults. Edit it to fit your merchants. Rules apply automatically when the app reads your data (so budgets/patterns light up), and **Bling → Auto-categorise transactions** writes the categories permanently onto any still-uncategorised rows.

## What the sheet tabs are

`Config` (settings), `Accounts`, `Transactions`, `Budgets`, `Recurring`, `CategoryRules`, `ParserRules`, `IngestEvents`, `DeviceTokens`. Headers are created for you; you can edit rows directly for bulk changes, or let the app write them.

## Actions the app calls

`bootstrap` (read everything as one snapshot), `upsert_transaction`, `delete_transaction`, `upsert_account`, `upsert_budget`, `upsert_recurring`, `health`. All mutations are serialised with `LockService`.

## Status

v1: manual entry + live snapshot. Gmail/SMS auto-sync and the pattern/budget engine are the next additions (see `../BLING.md`).
