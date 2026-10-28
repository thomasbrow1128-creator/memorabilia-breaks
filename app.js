/* Memorabilia Breaks — one page, three boards (Teams / Divisions / Pairs)

   This file is self-contained: it needs only teams.js above it.
   Switching views never navigates — it swaps which board is drawn.

   One input per box: a customer username. One action: place it on that
   team, division, or pair. Once a box has at least one username it greys
   out and closes.

   Editing: every chip on a box is clickable — click one to rename it or
   delete just that name. Removing the last name on a box un-greys it.
   Hide all asks first and offers Undo.

   BACKEND_ENDPOINT: leave "" to store usernames in this browser's
   localStorage only. Set it to your form endpoint to save them centrally.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";
const STORE_KEY = "memorabilia-breaks-usernames-v1";

const $ = (id) => document.getElementById(id);

let entries = [];          // { id, username, target, createdAt }
let currentView = "teams"; // "teams" | "divisions" | "pairs"

/* ---------- the three boards ---------- */

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

/* The 16 pairs exactly as listed on the board. */
const PAIRS = [
  ["Cowboys", "Jags"],
  ["Chiefs", "Cardinals"],
  ["Broncos", "Saints"],
  ["Eagles", "Panthers"],
  ["Vikings", "Titans"],
  ["Packers", "Falcons"],
  ["Seahawks", "Chargers"],
  ["Bucs", "Commanders"],
  ["Ravens", "Rams"],
  ["Patriots", "Browns"],
  ["49ers", "Bears"],
  ["Lions", "Raiders"],
  ["Bengals", "Colts"],
  ["Bills", "Jets"],
  ["Steelers", "Texans"],
  ["Dolphins", "Giants"]
];

function colorsForNickname(nick) {
  const t = TEAMS.find(function (x) {
    return x.name.toLowerCase() === String(nick).toLowerCase();
  });
  return t ? t.colors : ["#2b303c", "#e8ecf3"];
}

const PAIR_TARGETS = PAIRS.map(function (p) {
  const label = p[0] + ", " + p[1];
  return {
    id: label,
    abbr: p[0].slice(0, 3).toUpperCase() + ", " + p[1].slice(0, 3).toUpperCase(),
    name: label,
    colors: colorsForNickname(p[0])
  };
});

function targetsFor(view) {
  if (view === "divisions") return DIVISION_TARGETS;
  if (view === "pairs") return PAIR_TARGETS;
  return TEAM_TARGETS;
}

/* ---------- labels ---------- */

function targetLabel(id) {
  const t = TEAMS.find(function (x) { return x.abbr === id; });
  if (t) return t.city + " " + t.name;
  const d = DIVISIONS.find(function (x) { return x.name === id; });
  if (d) return d.name;
  const p = PAIR_TARGETS.find(function (x) { return x.id === id; });
  if (p) return p.name;
  return id;
}

/* Names contain spaces and commas, so quote them for querySelector. */
function cssEscape(v) {
  return String(v).replace(/"/g, '\\"');
}

function normalizeName(raw) {
  return (raw || "").trim().replace(/^@/, "");
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
  const cls =
    currentView === "divisions" ? "board-div" :
    currentView === "pairs" ? "board-pair" : "board-team";

  board.className = "board " + cls;
  board.setAttribute(
    "aria-label",
    currentView === "divisions" ? "NFL division board" :
    currentView === "pairs" ? "NFL pair board" : "NFL team board"
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

    const filledbar = document.createElement("div");
    filledbar.className = "filledbar";
    const filledText = document.createElement("span");
    filledText.className = "filledtext";
    filledbar.appendChild(filledText);
    const unlock = document.createElement("button");
    unlock.type = "button";
    unlock.className = "unlock";
    unlock.textContent = "Add another";
    unlock.title = "Reopen this box to add another username";
    unlock.addEventListener("click", function (ev) {
      ev.stopPropagation();
      tile.classList.add("force-open");
      refreshBoard();
      const i = tile.querySelector(".addbar input");
      if (i) i.focus();
    });
    filledbar.appendChild(unlock);
    tile.appendChild(filledbar);

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
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = e.username;
      chip.title = "Edit or remove @" + e.username;
      chip.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openEditor(e.id);
      });
      roster.appendChild(chip);
    });

    const badge = tile.querySelector(".badge");
    badge.textContent = list.length;
    badge.style.display = list.length ? "" : "none";

    const isFilled = list.length > 0;
    const forcedOpen = tile.classList.contains("force-open");
    const editing = tile.querySelector(".chipeditor") !== null;
    tile.classList.toggle("filled", isFilled && !forcedOpen && !editing);

    const filledText = tile.querySelector(".filledtext");
    if (filledText) {
      filledText.textContent = isFilled ? list.length + " entered" : "";
    }
    if (!isFilled) tile.classList.remove("force-open");
  });
}

/* ---------- inline chip editor ---------- */

function openEditor(entryId) {
  const entry = entries.find(function (e) { return e.id === entryId; });
  if (!entry) return;

  const tile = document.querySelector('.tile[data-target="' + cssEscape(entry.target) + '"]');
  if (!tile) return;

  closeEditor();
  tile.classList.add("force-open");
  refreshBoard();

  const host = tile.querySelector(".roster");
  if (!host) return;

  const box = document.createElement("div");
  box.className = "chipeditor";
  box.addEventListener("click", function (ev) { ev.stopPropagation(); });

  const input = document.createElement("input");
  input.type = "text";
  input.value = entry.username;
  input.setAttribute("aria-label", "Edit username");
  input.autocomplete = "off";
  input.spellcheck = false;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "cesave";
  save.textContent = "Save";

  const del = document.createElement("button");
  del.type = "button";
  del.className = "cedel";
  del.textContent = "Remove";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cecancel";
  cancel.textContent = "Cancel";

  box.appendChild(input);
  box.appendChild(save);
  box.appendChild(del);
  box.appendChild(cancel);

  function commit() {
    const next = normalizeName(input.value);
    if (!next) { input.focus(); return; }
    entry.username = next;
    persist();
    closeEditor();
    refreshBoard();
    renderEntries();
    $("saved").textContent = "Renamed to @" + next + " on " + targetLabel(entry.target);
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); closeEditor(); refreshBoard(); }
  });
  del.addEventListener("click", function () {
    const name = entry.username;
    const where = targetLabel(entry.target);
    closeEditor();
    removeUser(entryId);
    $("saved").textContent = "Removed @" + name + " from " + where;
  });
  cancel.addEventListener("click", function () {
    closeEditor();
    refreshBoard();
  });

  host.appendChild(box);
  tile.classList.remove("filled");
  input.focus();
  input.select();
}

function closeEditor() {
  document.querySelectorAll(".chipeditor").forEach(function (el) {
    el.parentNode.removeChild(el);
  });
}

/* ---------- view switching ---------- */

const VIEW_INFO = {
  teams: {
    title: "Teams",
    sub: "Thirty-two teams. Type a username into a team's box to put them on it.",
    placeholder: "Filter teams…"
  },
  divisions: {
    title: "Divisions",
    sub: "Eight divisions. Type a username into a division's box to put them on it.",
    placeholder: "Filter divisions…"
  },
  pairs: {
    title: "Pick your Pairs",
    sub: "Sixteen pairs. Type a username into a pair's box to put them on it.",
    placeholder: "Filter pairs…"
  }
};

function setView(view) {
  currentView = VIEW_INFO[view] ? view : "teams";
  const info = VIEW_INFO[currentView];

  document.querySelectorAll("[data-view-btn]").forEach(function (b) {
    const on = b.dataset.viewBtn === currentView;
    b.className = on ? "on" : "";
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  $("boardTitle").textContent = info.title;
  $("boardSub").textContent = info.sub;
  $("filter").placeholder = info.placeholder;

  renderBoard();
  refreshBoard();
  applyFilter($("filter").value);
  $("saved").textContent = "";
}

/* ---------- add / remove ---------- */

async function addUser(targetId, rawName) {
  const username = normalizeName(rawName);
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

    const tile = document.querySelector('.tile[data-target="' + cssEscape(targetId) + '"]');
    if (tile) tile.classList.remove("force-open");

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
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "nameedit";
    nameBtn.textContent = "@" + e.username;
    nameBtn.title = "Click to rename";
    nameBtn.addEventListener("click", function () { startRowEdit(tr, e); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

    const tdWhere = document.createElement("td");
    tdWhere.textContent = targetLabel(e.target);
    tr.appendChild(tdWhere);

    const when = new Date(e.createdAt);
    tr.appendChild(textCell(isNaN(when) ? "—" : when.toLocaleString()));

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Remove only this name";
    del.addEventListener("click", function () { removeUser(e.id); });
    td.appendChild(del);
    tr.appendChild(td);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
}

function startRowEdit(tr, entry) {
  if (tr.dataset.editing === "1") return;
  tr.dataset.editing = "1";

  const tdUser = tr.children[0];
  tdUser.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.value = entry.username;
  input.className = "roweditinput";
  input.setAttribute("aria-label", "Edit username");
  input.autocomplete = "off";
  input.spellcheck = false;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "cesave";
  save.textContent = "Save";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cecancel";
  cancel.textContent = "Cancel";

  tdUser.appendChild(input);
  tdUser.appendChild(save);
  tdUser.appendChild(cancel);

  function commit() {
    const next = normalizeName(input.value);
    if (!next) { input.focus(); return; }
    entry.username = next;
    persist();
    refreshBoard();
    renderEntries();
    $("saved").textContent = "Renamed to @" + next + " on " + targetLabel(entry.target);
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); renderEntries(); }
  });
  cancel.addEventListener("click", function () { renderEntries(); });

  input.focus();
  input.select();
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

let undoSnapshot = null;
let undoTimer = null;

function showUndo(message) {
  $("undotext").textContent = message;
  $("undobar").classList.add("show");
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 12000);
}

function hideUndo() {
  $("undobar").classList.remove("show");
  undoSnapshot = null;
}

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
    if (!confirm("Hide all " + entries.length + " names? You can put them straight back with Undo.")) return;
    undoSnapshot = entries.slice();
    entries = [];
    persist();
    refreshBoard();
    renderEntries();
    showUndo("Hid " + undoSnapshot.length + " names.");
  });

  $("undobtn").addEventListener("click", function () {
    if (!undoSnapshot) return;
    entries = undoSnapshot;
    undoSnapshot = null;
    persist();
    refreshBoard();
    renderEntries();
    hideUndo();
    $("saved").textContent = "Restored.";
  });
  $("undoclose").addEventListener("click", hideUndo);

  document.addEventListener("click", function () {
    if (document.querySelector(".chipeditor")) {
      closeEditor();
      refreshBoard();
    }
  });
});
