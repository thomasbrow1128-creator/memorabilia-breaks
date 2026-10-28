# Memorabilia Breaks — 32-Team Entry Board

A single-page controller for a memorabilia breaking business. One board of all 32 NFL teams;
**click a team** and the entry form below it opens pre-filled with that team so you can type a
customer's entry by hand. Entries get a per-team count badge on the board, and the whole list
exports to CSV.

Live site: `https://thomasbrow1128-creator.github.io/memorabilia-breaks/`

## Files

| File | What it is |
|---|---|
| `index.html` | Page structure and styling |
| `teams.js` | The 32 teams — abbreviations, names, division, panel colors |
| `app.js` | Board rendering, selection, form handling, storage, CSV export |
| `board.png` | The 32-team board image |

## Using it

1. Open the live URL.
2. Click the team's tile on the board (or pick from the dropdown) — the form opens.
3. Type the customer name, product/set, spots, amount, date, status and notes.
4. **Add entry.** The tile's badge increments and the entry appears in the list.
5. **Download CSV** to export everything.

## Where entries are stored — read this

This is a static site, so entries are saved in the browser's `localStorage`. They persist on
that one device and that one browser, and they are **not** sent anywhere. Clearing browser data
wipes them.

To collect entries centrally, set a backend endpoint:

```js
// app.js, near the top
const BACKEND_ENDPOINT = "https://formspree.io/f/xxxxxxxx";
```

The submit path already posts JSON to whatever URL you put there, with these fields:
`customer`, `email`, `team`, `product`, `spots`, `amount`, `date`, `status`, `notes`, `createdAt`.

Options that need no server of your own:

- **Formspree** — free tier, posts straight to your email.
- **Netlify Forms** — if you later host on Netlify instead of GitHub Pages.
- **Google Apps Script** — deploy a web app that appends to a Google Sheet.
- **Supabase / Firebase** — a real database if you want a dashboard and multiple staff logins.

If a backend is set and the request fails, the entry is not saved and the form says so.

## The board image

`board.png` is an original image: 32 color panels with generic helmet silhouettes and a bar
under each. No NFL logos, wordmarks or other trademarked marks are included, so the repo stays
clear of the league's brand assets. If you want the real logos on the board, you'll need to
supply the image files yourself and swap `board.png` — that's a licensing call, not a
technical one.

## Editing the teams

All 32 live in `teams.js`, grouped by division. To change a team's colors, edit its
`colors: ["#panel", "#bar"]` pair. To add or remove a team, edit the `DIVISIONS` array — the
board, the dropdown and the badges all read from it.

## Deploying

GitHub Pages serves the `main` branch root. To update the site, commit the changed file and
Pages rebuilds in about a minute.

## A note on customer data

If you point this at a real backend and collect real customer names, emails and payment
amounts, keep in mind that the repo is public and the page is public. The data lives in your
backend, not in the repo — but anyone can see the form itself. Don't put anything private
(API keys, a spreadsheet URL, customer lists) into `app.js` or any file in this repo, because
it's all readable by anyone who visits.
