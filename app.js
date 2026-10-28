/* Memorabilia Breaks — one page, any number of boards.

   REQUIRES: teams.js, then boards.js, then this file.
   The boards themselves live in boards.js — THIS FILE NEVER CHANGES
   when you add a board. Add a board in boards.js and the tab, the
   grid, the headings and the counter all follow automatically.

   One input per box: a customer username. One action: place it on that
   box. Once a box has at least one username it greys out and closes.

   Editing: every chip on a box is clickable — click one to rename it or
   delete just that name. Removing the last name on a box un-greys it.
   Hide all asks first and offers Undo.

   BACKEND_ENDPOINT: leave "" to store usernames in this browser's
   localStorage only. Set it to your form endpoint to save them centrally.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";
const STORE_KEY = "memorabilia-breaks-usernames-v1";

const $ = (id) => document.getElementById(id);

let entries = [];            // { id, username, target, createdAt }
let currentTab = "teams";    // a board id from BOARDS

/* ---------- element lookup, without CSS selectors ----------
   Box names contain commas and spaces, so a CSS selector built from a
   name would break. Walk the tiles and compare data attributes instead. */

function tileFor(targetId) {
  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].dataset.target === targetId) return tiles[i];
  }
  return null;
}

function rosterFor(targetId) {
  const tile = tileFor(targetId);
  return tile ? tile.querySelector(".roster") : null;
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

/* ---------- tabs ----------
   Built from BOARDS, so a new board gets a tab automatically. */

function buildTabs() {
  const nav = $("tabs");
  nav.innerHTML = "";

  BOARDS.forEach(function (b) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.viewBtn = b.id;
    btn.setAttribute("role", "tab");
    btn.textContent = b.tab || b.label;
    btn.addEventListener("click", function () { setTab(b.id); });
    nav.appendChild(btn);
  });
}

/* ---------- board construction ---------- */

function buildTile(t) {
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
    refreshBoards();
    const i = tile.querySelector(".addbar input");
    if (i) i.focus();
  });
  filledbar.appendChild(unlock);
  tile.appendChild(filledbar);

  return tile;
}

function renderBoards() {
  const host = $("boards");
  const boards = boardsOnTab(currentTab);

  host.innerHTML = "";

  boards.forEach(function (b) {
    if (boards.length > 1) {
      const head = document.createElement("div");
      head.className = "sectionhead";
      const h = document.createElement("h3");
      h.textContent = b.label;
      head.appendChild(h);
      const n = document.createElement("span");
      n.textContent = b.boxes.length + (b.boxes.length === 1 ? " box" : " boxes");
      head.appendChild(n);
      host.appendChild(head);
    }

    const grid = document.createElement("div");
    grid.className = "board board-" + b.size;
    grid.setAttribute("aria-label", (b.label || b.id) + " board");
    b.boxes.forEach(function (box) {
      const t = targetByName(box.name);
      if (t) grid.appendChild(buildTile(t));
    });
    host.appendChild(grid);
  });
}

function refreshBoards() {
  targetsOnTab(currentTab).forEach(function (t) {
    const roster = rosterFor(t.id);
    const tile = tileFor(t.id);
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

  const tile = tileFor(entry.target);
  if (!tile) return;

  closeEditor();
  tile.classList.add("force-open");
  refreshBoards();

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
    refreshBoards();
    renderEntries();
    $("saved").textContent = "Renamed to @" + next + " on " + entry.target;
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); closeEditor(); refreshBoards(); }
  });
  del.addEventListener("click", function () {
    const name = entry.username;
    const where = entry.target;
    closeEditor();
    removeUser(entryId);
    $("saved").textContent = "Removed @" + name + " from " + where;
  });
  cancel.addEventListener("click", function () {
    closeEditor();
    refreshBoards();
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

/* ---------- tab switching ---------- */

function setTab(tabId) {
  currentTab = boardById(tabId) ? tabId : BOARDS[0].id;
  const board = boardById(currentTab);
  const stack = boardsOnTab(currentTab);

  document.querySelectorAll("[data-view-btn]").forEach(function (b) {
    const on = b.dataset.viewBtn === currentTab;
    b.className = on ? "on" : "";
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  $("boardTitle").textContent = board.label;
  if (stack.length > 1) {
    const others = stack.slice(1).map(function (b) { return b.label; }).join(" and ");
    $("boardSub").textContent =
      "Sixteen pairs on top, with " + others + " underneath. Type a username into any box.";
  } else {
    $("boardSub").textContent =
      board.boxes.length + " boxes. Type a username into a box to put them on it.";
  }
  $("filter").placeholder = "Filter " + board.label.toLowerCase() + "…";

  renderBoards();
  refreshBoards();
  applyFilter($("filter").value);
  $("saved").textContent = "";
}

/* ---------- add / remove ---------- */

async function addUser(targetId, rawName) {
  const username = normalizeName(rawName);
  const tile = tileFor(targetId);
  const input = tile ? tile.querySelector(".addbar input") : null;
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

    const t = tileFor(targetId);
    if (t) t.classList.remove("force-open");

    refreshBoards();
    renderEntries();
    $("saved").textContent = "Added @" + username + " to " + targetId;
  } catch (err) {
    $("saved").textContent = "Could not save: " + err.message;
  }
}

function removeUser(id) {
  entries = entries.filter(function (e) { return e.id !== id; });
  persist();
  refreshBoards();
  renderEntries();
}

/* ---------- the list under the boards ---------- */

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
    if (a.target !== b.target) return a.target.localeCompare(b.target);
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
    tdWhere.textContent = e.target;
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
    refreshBoards();
    renderEntries();
    $("saved").textContent = "Renamed to @" + next + " on " + entry.target;
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

/* ---------- export ----------
   Built with character codes throughout: this is the exact spot where a
   stray backslash inside a quoted string once stopped the whole script. */

function csvEscape(v) {
  const QUOTE = String.fromCharCode(34);
  const COMMA = String.fromCharCode(44);
  const NEWLINE = String.fromCharCode(10);
  const s = String(v == null ? "" : v);

  if (s.indexOf(QUOTE) !== -1 || s.indexOf(COMMA) !== -1 || s.indexOf(NEWLINE) !== -1) {
    return QUOTE + s.split(QUOTE).join(QUOTE + QUOTE) + QUOTE;
  }
  return s;
}

function downloadCsv() {
  if (!entries.length) {
    $("saved").textContent = "Nothing to export yet.";
    return;
  }

  const NEWLINE = String.fromCharCode(10);
  const rows = ["username,placed_on,added"];
  const sorted = entries.slice().sort(function (a, b) {
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  sorted.forEach(function (e) {
    rows.push(csvEscape(e.username) + "," + csvEscape(e.target) + "," + csvEscape(e.createdAt));
  });

  const blob = new Blob([rows.join(NEWLINE)], { type: "text/csv;charset=utf-8" });
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
  document.querySelectorAll("#boards .tile").forEach(function (el) {
    const match = !needle || el.dataset.search.includes(needle);
    el.style.display = match ? "" : "none";
    if (match) shown++;
  });
  const total = targetsOnTab(currentTab).length;
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
  const problems = typeof checkBoards === "function" ? checkBoards() : [];
  if (problems.length) {
    const bar = document.createElement("div");
    bar.style.cssText =
      "background:#3a1d1d;border:1px solid #ff6b6b;border-radius:9px;padding:12px 14px;" +
      "margin-bottom:16px;font-size:13px;color:#ffd4d4";
    bar.textContent = "Board setup problem (details in the browser console): " + problems.join(" | ");
    const wrap = document.querySelector(".wrap");
    if (wrap) wrap.insertBefore(bar, wrap.firstChild);
  }

  buildTabs();
  loadEntries();
  setTab(BOARDS[0].id);

  $("filter").addEventListener("input", function (e) { applyFilter(e.target.value); });
  $("exportCsv").addEventListener("click", downloadCsv);

  $("clearAll").addEventListener("click", function () {
    if (!entries.length) return;
    if (!confirm("Hide all " + entries.length + " names? You can put them straight back with Undo.")) return;
    undoSnapshot = entries.slice();
    entries = [];
    persist();
    refreshBoards();
    renderEntries();
    showUndo("Hid " + undoSnapshot.length + " names.");
  });

  $("undobtn").addEventListener("click", function () {
    if (!undoSnapshot) return;
    entries = undoSnapshot;
    undoSnapshot = null;
    persist();
    refreshBoards();
    renderEntries();
    hideUndo();
    $("saved").textContent = "Restored.";
  });
  $("undoclose").addEventListener("click", hideUndo);

  document.addEventListener("click", function () {
    if (document.querySelector(".chipeditor")) {
      closeEditor();
      refreshBoards();
    }
  });
});
