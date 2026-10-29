/* ============================================================
   MEMORABILIA BREAKS - the customer ledger page.

   Shows every winner, newest first: the date, the winner's name, the
   item won, the team box it came from, and a tracking number once the
   order ships. It updates by itself - a win entered on the board
   reaches this page in about a second.

   WIDE SCREEN: a five-column table.
   NARROW SCREEN: each winner becomes its own card instead, because five
   columns cannot fit a phone. The classes below are what the mobile
   stylesheet in ledger.html hooks onto, so each value has a name.

   THIS PAGE CANNOT WRITE. It never signs in, so every request it makes
   carries only the publishable key, and the database's own rules refuse
   a write from that key. Read-only is enforced by the database, not by
   a promise this page makes.
   ============================================================ */

let allWins = [];

const L = (id) => document.getElementById(id);

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

function td(text, cls) {
  const el = document.createElement("td");
  if (cls) el.className = cls;
  el.textContent = text;
  return el;
}

function render() {
  const host = L("ledger");
  host.innerHTML = "";

  if (!allWins.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No winners recorded yet. Check back once the break has started.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  table.className = "winnersTable";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Date</th><th>Winner</th><th>Item won</th>"
    + "<th>Team</th><th>Tracking number</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  allWins.forEach(function (w) {
    const tr = document.createElement("tr");

    /* on a phone this row shows the winner and item first, then the
       date, team and tracking beneath as labelled lines */
    tr.appendChild(td(when(w.won_at), "meta"));
    tr.appendChild(td("@" + w.username, "who"));
    tr.appendChild(td(w.item, "item"));
    tr.appendChild(td(w.team, "team"));

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
    ? "(" + allWins.length + (allWins.length === 1 ? " winner" : " winners") + ")"
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

function downloadAll() {
  if (!allWins.length) return;
  const N = String.fromCharCode(10);
  const out = ["date,winner,item_won,team,tracking_number"];
  allWins.forEach(function (w) {
    out.push([
      csvEscape(w.won_at), csvEscape(w.username), csvEscape(w.item),
      csvEscape(w.team), csvEscape(w.tracking || "")
    ].join(","));
  });
  const blob = new Blob([out.join(N)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "break-winners.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- page ---------- */

L("ledgerRefresh").addEventListener("click", function () { load(true); });
L("ledgerCsv").addEventListener("click", downloadAll);

load(true);

/* Stay current: a new win, a rename, or a tracking number typed on the
   board reaches this page in about a second, with nothing to reload. */
sbWatchWins(function () { load(false); });

/* A belt-and-braces refresh, in case a network blocks websockets. */
setInterval(function () { load(false); }, 30000);
