# Bling

A free, self-hosted personal finance command centre — your one app for net worth, budgets, upcoming bills, and what's actually safe to spend. Runs entirely on infrastructure you already control (Google Sheets + Apps Script + GitHub Pages), with no build toolchain and no recurring cost.

**Design language:** "Ledger" — a warm, editorial, typeset-statement aesthetic. Light-first with a warm-charcoal dark mode. Phone renders as an editorial statement; desktop recomposes into a broadsheet ("The Bling Ledger"). Same data, two layouts.

## Run it

It's plain HTML/CSS/JS — no build step.

- **Locally:** open `index.html` (or serve the folder with any static server).
- **GitHub Pages:** Settings → Pages → deploy from `main` / root. Lives at `https://imeabhi.github.io/Bling/`.

The app ships with demo data so it works immediately. To connect your own data, open **You → Your Sheet** and paste your Apps Script Web App URL + device token (they stay on your device).

## Files

| File | What it is |
|------|-----------|
| `index.html` | App shell |
| `styles.css` | The "Ledger" design system (light + dark tokens, both compositions) |
| `app.js` | The app — renders every screen from one data object, so live Sheet data swaps in without UI changes |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | PWA (installable, offline shell) |

## Status

Frontend v1, running on demo data. Backend (Apps Script `Code.gs` — hashed-token `doPost`, Gmail/SMS sync, budget engine) is in progress.

## Privacy

No analytics, no trackers, no shared server. Each user runs their own instance against their own Sheet behind their own token. See the Security section of `BLING.md` for honest limitations.
