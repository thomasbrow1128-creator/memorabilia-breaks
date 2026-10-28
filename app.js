/* Memorabilia Breaks — one page, two boards (Teams / Divisions)

   This file is self-contained: it needs only teams.js above it.
   Switching views never navigates — it swaps which board is drawn.

   One input per box: a customer username. One action: place it on that
   team or that division.

   BACKEND_ENDPOINT: leave "" to store usernames in this browser's
   localStorage only. Set it to your form endpoint to save them centrally.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";
const STORE_KEY = "memorabilia-breaks-usernames-v1";

const $ = (id) => document.getElementById(id);

let entries = [];          // { id, username, target, createdAt }
let currentView = "teams"; // "teams" | "divisions"

/* ---------- the two boards ---------- */

const TEAM_TARGETS = TEAMS.map(function (t) {
  return { id: t.abbr, abbr: t.abbr, name: t.city + " " + t.name, colors: t.colors };
});

const DIVISION_TARGETS = DIVISIONS.map(function (d) {
  return {
    id: d.name,
    abbr: d.name.replace(/[^A-Za-z]/g, "").toUpperCase(),
    name: d.name,
    colors: d.teams[0].colors
  };
});

function targetsFor(view) {
  return view === "divisions" ? DIVISION_TARGETS : TEAM_TARGETS;
}

/* ---------- labels ---------- */

function targetLabel(id) {
  const t = TEAMS.find(function (x) { return x.abbr === id; });
  if (t) return t.city + " " + t.name;
  const d = DIVISIONS.find(function (x) { return x.name === id; });
  if (d) return d.name;
  return id;
}

/* Division names contain spaces, so quote them for querySelector. */
function cssEscape(v) {
  return String(v).replace(/"/g, '\\"');
}

/* ---------- storage ---------- */

function loadEntries() {
  try {
    entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    if (!Array.isArray(entries)) entries = [];
  } catch (e) {
    entries = [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    return false;
  }
}

function usersOn(targetId) {
  return entries.filter(function (e) { return e.target === targetId; });
}

/* ---------- board ---------- */

function renderBoard() {
  const board = $("board");
  const list = targetsFor(currentView);

  board.className = "board " + (currentView === "divisions" ? "board-div" : "board-team");
  board.setAttribute(
    "aria-label",
    currentView === "divisions" ? "NFL division board" : "NFL team board"
  );
  board.innerHTML = "";

  list.forEach(function (t) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.target = t.id;
    tile.dataset.search = (t.name + " " + t.abbr).toLowerCase();

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.display = "none";
    tile.appendChild(badge);

    const eb = document.createElement("div");
    eb.className = "eb";
    eb.style.background = t.colors[0];
    const abbr = document.createElement("span");
    abbr.textContent = t.abbr;
    eb.appendChild(abbr);
    tile.appendChild(eb);

    const name = document.createElement("span");
    name.className = "name";
    name.style.background = t.colors[1];
    name.textContent = t.name;
    tile.appendChild(name);

    const roster = document.createElement("div");
    roster.className = "roster";
    roster.dataset.roster = t.id;
    tile.appendChild(roster);

    const bar = document.createElement("form");
    bar.className = "addbar";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "username";
    input.setAttribute("aria-label", "Customer username for " + t.name);
    input.autocomplete = "off";
    input.spellcheck = false;
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "+";
    btn.title = "Add username to " + t.name;
    bar.appendChild(input);
    bar.appendChild(btn);
    bar.addEventListener("submit", function (ev) {
      ev.preventDefault();
      addUser(t.id, input.value);
      input.value = "";
      input.focus();
    });
    tile.appendChild(bar);

    board.appendChild(tile);
  });
}

function refreshBoard() {
  targetsFor(currentView).forEach(function (t) {
    const roster = document.querySelector('[data-roster="' + cssEscape(t.id) + '"]');
    const tile = document.querySelector('.tile[data-target="' + cssEscape(t.id) + '"]');
    if (!roster || !tile) return;

    roster.innerHTML = "";
    const list = usersOn(t.id);
    list.forEach(function (e) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = e.username;
      chip.title = e.username;
      roster.appendChild(chip);
    });

    const badge = tile.querySelector(".badge");
    badge.textContent = list.length;
    badge.style.display = list.length ? "" : "none";
  });
}

/* ---------- view switching ---------- */

function setView(view) {
  currentView = view === "divisions" ? "divisions" : "teams";

  document.querySelectorAll("[data-view-btn]").forEach(function (b) {
    const on = b.dataset.viewBtn === currentView;
    b.className = on ? "on" : "";
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  $("boardTitle").textContent = currentView === "divisions" ? "Divisions" : "Teams";
  $("boardSub").textContent =
    currentView === "divisions"
      ? "Eight divisions. Type a username into a division's box to put them on it."
      : "Thirty-two teams. Type a username into a team's box to put them on it.";
  $("filter").placeholder =
    currentView === "divisions" ? "Filter divisions…" : "Filter teams…";

  renderBoard();
  refreshBoard();
  applyFilter($("filter").value);
  $("saved").textContent = "";
}

/* ---------- add / remove ---------- */

async function addUser(targetId, rawName) {
  const username = (rawName || "").trim().replace(/^@/, "");
  const input = document.querySelector(
    '.tile[data-target="' + cssEscape(targetId) + '"] .addbar input'
  );
  if (!username) {
    if (input) input.focus();
    return;
  }

  const entry = {
    id: "u" + Date.now() + Math.random().toString(36).slice(2, 7),
    username: username,
    target: targetId,
    createdAt: new Date().toISOString()
  };

  $("saved").textContent = "";

  try {
    if (BACKEND_ENDPOINT) {
      const res = await fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(entry)
      });
      if (!res.ok) throw new Error("Backend responded " + res.status);
    }
    entries.unshift(entry);
    if (!BACKEND_ENDPOINT && !persist()) throw new Error("Could not write to local storage");
    refreshBoard();
    renderEntries();
    $("saved").textContent = "Added @" + username + " to " + targetLabel(targetId);
  } catch (err) {
    $("saved").textContent = "Could not save: " + err.message;
  }
}

function removeUser(id) {
  entries = entries.filter(function (e) { return e.id !== id; });
  persist();
  refreshBoard();
  renderEntries();
}

/* ---------- the list under the board ---------- */

function renderEntries() {
  const host = $("entries");
  host.innerHTML = "";
  $("entryCount").textContent = entries.length ? "(" + entries.length + ")" : "";

  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing entered yet. Type a username into any box above.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Username</th><th>Placed on</th><th>Added</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const sorted = entries.slice().sort(function (a, b) {
    const A = targetLabel(a.target), B = targetLabel(b.target);
    if (A !== B) return A.localeCompare(B);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  sorted.forEach(function (e) {
    const tr = document.createElement("tr");

    const tdUser = document.createElement("td");
    tdUser.textContent = "@" + e.username;
    tr.appendChild(tdUser);

    tr.appendChild(textCell(targetLabel(e.target)));

    const when = new Date(e.createdAt);
    tr.appendChild(textCell(isNaN(when) ? "—" : when.toLocaleString()));

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", function () { removeUser(e.id); });
    td.appendChild(del);
    tr.appendChild(td);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
}

function textCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

/* ---------- export ---------- */

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv() {
  if (!entries.length) {
    $("saved").textContent = "Nothing to export yet.";
    return;
  }
  const rows = ["username,placed_on,added"];
  const sorted = entries.slice().sort(function (a, b) {
    const A = targetLabel(a.target), B = targetLabel(b.target);
    if (A !== B) return A.localeCompare(B);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  sorted.forEach(function (e) {
    rows.push(
      csvEscape(e.username) + "," +
      csvEscape(targetLabel(e.target)) + "," +
      csvEscape(e.createdAt)
    );
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-usernames.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- filter ---------- */

function applyFilter(q) {
  const needle = (q || "").trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll("#board .tile").forEach(function (el) {
    const match = !needle || el.dataset.search.includes(needle);
    el.style.display = match ? "" : "none";
    if (match) shown++;
  });
  const total = targetsFor(currentView).length;
  $("count").textContent = shown === total ? total + " shown" : shown + " of " + total + " shown";
}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", function () {
  loadEntries();
  setView("teams");

  document.querySelectorAll("[data-view-btn]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.dataset.viewBtn); });
  });

  $("filter").addEventListener("input", function (e) { applyFilter(e.target.value); });
  $("exportCsv").addEventListener("click", downloadCsv);
  $("clearAll").addEventListener("click", function () {
    if (!entries.length) return;
    if (confirm("Delete all " + entries.length + " usernames?")) {
      entries = [];
      persist();
      refreshBoard();
      renderEntries();
    }
  });
});
