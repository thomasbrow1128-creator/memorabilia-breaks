/* ============================================================
   MEMORABILIA BREAKS - the customer ledger page.

   A customer types their username and sees the items they won, plus a
   tracking number once the order ships. It updates by itself: a win
   entered on the board reaches this page in about a second.

   THIS PAGE CANNOT WRITE. It never signs in, so every request it makes
   carries only the publishable key, and the database's own rules refuse
   a write from that key. Read-only is enforced by the database, not by
   a promise this page makes.
   ============================================================ */

let allWins = [];
let who = "";

const L = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

function setLive(on) {
  const b = L("liveBadge");
  if (!b) return;
  b.textContent = on ? "Live" : "Reconnecting";
  b.classList.toggle("off", !on);
}

function td(text) {
  const el = document.createElement("td");
  el.textContent = text;
  return el;
}

/* the customer's own rows, newest first */
function mine() {
  const needle = who.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return [];
  return allWins.filter(function (w) {
    return String(w.username || "").toLowerCase().replace(/^@/, "") === needle;
  });
}

function render() {
  const host = L("ledger");
  const youBox = L("youBox");
  const label = L("searchedFor");
  host.innerHTML = "";

  const n = who.trim();

  if (!n) {
    youBox.style.display = "none";
    label.style.display = "none";
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Enter your username above to see your items.";
    host.appendChild(p);
    return;
  }

  const rows = mine();

  youBox.style.display = "";
  youBox.className = "you";
  youBox.innerHTML = "Showing orders for <b>@" + esc(n) + "</b>" +
    '<a id="clearWho">Not you? Clear</a>';
  L("clearWho").addEventListener("click", function () {
    L("who").value = "";
    who = "";
    try { sessionStorage.removeItem("mb-ledger-who"); } catch (e) {}
    render();
  });

  label.style.display = "";
  label.textContent = rows.length
    ? rows.length + (rows.length === 1 ? " item" : " items") + " found"
    : "no items found";

  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing found for @" + n + ". Check the spelling, or ask the " +
      "breaker if you used a different name.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  table.className = "winnersTable";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Date</th><th>Item won</th><th>Team</th>" +
    "<th>Tracking number</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach(function (w) {
    const tr = document.createElement("tr");
    tr.appendChild(td(when(w.won_at)));
    tr.appendChild(td(w.item));
    tr.appendChild(td(w.team));

    const tdTrk = document.createElement("td");
    tdTrk.className = "trk";
    if (w.tracking) {
      const b = document.createElement("b");
      b.textContent = w.tracking;
      tdTrk.appendChild(b);
    } else {
      const s = document.createElement("span");
      s.textContent = "not shipped yet";
      tdTrk.appendChild(s);
    }
    tr.appendChild(tdTrk);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  host.appendChild(table);
}

function count() {
  const c = L("ledgerCount");
  if (!c) return;
  c.textContent = allWins.length
    ? "(" + allWins.length + (allWins.length === 1 ? " item" : " items") + " on record)"
    : "";
}

async function load(showError) {
  try {
    allWins = await sbListWins();
    count();
    render();
    setLive(true);
  } catch (e) {
    setLive(false);
    if (showError) {
      const host = L("ledger");
      host.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Could not reach the ledger. " + e.message;
      host.appendChild(p);
    }
  }
}

function csvEscape(v) {
  const Q = String.fromCharCode(34), C = String.fromCharCode(44), N = String.fromCharCode(10);
  const s = String(v == null ? "" : v);
  if (s.indexOf(Q) !== -1 || s.indexOf(C) !== -1 || s.indexOf(N) !== -1) {
    return Q + s.split(Q).join(Q + Q) + Q;
  }
  return s;
}

function downloadMine() {
  const rows = who.trim() ? mine() : allWins;
  if (!rows.length) return;
  const N = String.fromCharCode(10);
  const out = ["date,item_won,team,tracking_number"];
  rows.forEach(function (w) {
    out.push([
      csvEscape(w.won_at), csvEscape(w.item), csvEscape(w.team), csvEscape(w.tracking || "")
    ].join(","));
  });
  const blob = new Blob([out.join(N)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-break-items" + (who.trim() ? "-" + who.trim() : "") + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- page ---------- */

L("searchForm").addEventListener("submit", function (ev) {
  ev.preventDefault();
  who = L("who").value.trim();
  try { sessionStorage.setItem("mb-ledger-who", who); } catch (e) {}
  render();
});

L("who").addEventListener("input", function () {
  who = L("who").value.trim();
  render();
});

L("ledgerRefresh").addEventListener("click", function () { load(true); });
L("ledgerCsv").addEventListener("click", downloadMine);

/* Remember the looked-up name for this tab only, so a refresh does not
   lose it. Nothing is shared between customers. */
try {
  const kept = sessionStorage.getItem("mb-ledger-who");
  if (kept) { L("who").value = kept; who = kept; }
} catch (e) { /* fine without it */ }

load(true);

/* Stay current: a new win, a rename, or a tracking number typed on the
   board reaches this page in about a second, with nothing to reload. */
sbWatchWins(function () { load(false); });

/* A belt-and-braces refresh, in case a network blocks websockets. */
setInterval(function () { load(false); }, 30000);
