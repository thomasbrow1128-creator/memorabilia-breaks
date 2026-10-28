/* Memorabilia Breaks — one page, any number of boards.

   REQUIRES: teams.js, then boards.js, then this file.
   The boards themselves live in boards.js — THIS FILE NEVER CHANGES
   when you add a board. Add a board in boards.js and the tab, the
   grid, the headings, the counter and the Reset button all follow.

   Each tile is a chrome plate: an emblem on top (an image when the box
   supplies one, otherwise the team initials), then a PURCHASER plate in
   gold, and a red strip at the foot listing the names entered.

   One input per box: a customer username. One action: place it on that
   box. Once a box has at least one username it dims and closes.

   Editing: every name is clickable — on the gold plate or in the red
   strip — to rename it or delete just that name. Removing the last name
   un-dims the box.

   Resetting: every board carries its own Reset, which clears only the
   boxes on that board. Every reset offers Undo.

   BACKEND_ENDPOINT: leave "" to store usernames in this browser's
   localStorage only. Set it to your form endpoint to save them centrally.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";
const STORE_KEY = "memorabilia-breaks-usernames-v1";

/* Tabs with more than one board get the tightened layout so everything
   fits on screen without scrolling. */
const COMPACT_TABS = { pairs: true };

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

/* How many names sit on one whole board. */
function countOnBoard(boardId) {
  const board = boardById(boardId);
  if (!board) return 0;
  const names = {};
  board.boxes.forEach(function (b) { names[b.name] = true; });
  return entries.filter(function (e) { return names[e.target]; }).length;
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

  /* --- the emblem plate --- */
  const eb = document.createElement("div");
  eb.className = "eb";
  eb.style.background = t.colors[0];

  const initials = document.createElement("span");
  initials.className = "initials";
  initials.textContent = t.abbr;
  eb.appendChild(initials);

  if (t.image) {
    const img = document.createElement("img");
    img.alt = t.name;
    img.decoding = "async";
    img.loading = "lazy";
    img.addEventListener("load", function () {
      if (initials.parentNode) initials.parentNode.removeChild(initials);
    });
    img.addEventListener("error", function () {
      img.style.display = "none";
    });
    img.src = t.image;
    eb.appendChild(img);
  }
  tile.appendChild(eb);

  /* --- the PURCHASER plate --- */
  const buyer = document.createElement("div");
  buyer.className = "buyer";
  const buylbl = document.createElement("span");
  buylbl.className = "buylbl";
  buylbl.textContent = "Purchaser";
  buyer.appendChild(buylbl);
  const names = document.createElement("span");
  names.className = "buynames";
  names.dataset.names = t.id;
  buyer.appendChild(names);
  tile.appendChild(buyer);

  /* the roster is kept for editing, sitting under the plate */
  const roster = document.createElement("div");
  roster.className = "roster";
  roster.dataset.roster = t.id;
  tile.appendChild(roster);

  /* --- the add-a-name row --- */
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

  /* --- the closed strip: the names themselves, not a count --- */
  const filledbar = document.createElement("div");
  filledbar.className = "filledbar";

  const filledNames = document.createElement("span");
  filledNames.className = "fillednames";
  filledNames.dataset.fillednames = t.id;
  filledbar.appendChild(filledNames);

  const unlock = document.createElement("button");
  unlock.type = "button";
  unlock.className = "unlock";
  unlock.textContent = "+";
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

/* Every board on a stacked tab gets a header row carrying its own
   Reset button. On a single-board tab the toolbar Reset covers it
   (same handler, same board). */
function buildBoardHeader(b) {
  const head = document.createElement("div");
  head.className = "sectionhead";

  const h = document.createElement("h3");
  h.textContent = b.label;
  head.appendChild(h);

  const n = document.createElement("span");
  n.className = "sectioncount";
  n.dataset.countFor = b.id;
  head.appendChild(n);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "boardreset";
  reset.dataset.resetFor = b.id;
  reset.textContent = "Reset " + b.label;
  reset.title = "Remove every username from the " + b.label + " boxes";
  reset.addEventListener("click", function () { resetBoard(b.id); });
  head.appendChild(reset);

  return head;
}

function renderBoards() {
  const host = $("boards");
  const boards = boardsOnTab(currentTab);
  const stacked = boards.length > 1;

  host.innerHTML = "";

  boards.forEach(function (b) {
    if (stacked) host.appendChild(buildBoardHeader(b));

    const grid = document.createElement("div");
    grid.className = "board board-" + b.size;
    grid.setAttribute("aria-label", (b.label || b.id) + " board");
    b.boxes.forEach(function (box) {
      const t = targetByName(box.name);
      if (t) grid.appendChild(buildTile(t));
    });
    host.appendChild(grid);
  });

  const primary = boards[0];
  const toolbarReset = $("resetBoard");
  if (primary) {
    toolbarReset.dataset.resetFor = primary.id;
    toolbarReset.textContent = stacked ? "Reset " + primary.label : "Reset board";
    toolbarReset.title = "Remove every username from the " + primary.label + " boxes";
  }
}

function refreshBoardCounts() {
  document.querySelectorAll("[data-count-for]").forEach(function (el) {
    const id = el.dataset.countFor;
    const board = boardById(id);
    if (!board) return;
    const n = countOnBoard(id);
    el.textContent = board.boxes.length + (board.boxes.length === 1 ? " box" : " boxes") +
      (n ? " \u00b7 " + n + (n === 1 ? " name" : " names") : "");
  });

  document.querySelectorAll("[data-reset-for]").forEach(function (el) {
    const n = countOnBoard(el.dataset.resetFor);
    el.disabled = n === 0;
    el.classList.toggle("hasnames", n > 0);
  });
}

/* Paint the gold plate. One line per name, or OPEN when the box is free. */
function paintBuyerPlate(tile, list) {
  const host = tile.querySelector("[data-names]");
  if (!host) return;
  host.innerHTML = "";

  if (!list.length) {
    const open = document.createElement("span");
    open.className = "buyname buyopen";
    open.textContent = "Open";
    host.appendChild(open);
    return;
  }

  list.forEach(function (e) {
    const line = document.createElement("button");
    line.type = "button";
    line.className = "buyname buyname-btn";
    line.textContent = e.username;
    line.title = "Edit or remove @" + e.username;
    line.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openEditor(e.id);
    });
    host.appendChild(line);
  });
}

function refreshBoards() {
  targetsOnTab(currentTab).forEach(function (t) {
    const roster = rosterFor(t.id);
    const tile = tileFor(t.id);
    if (!roster || !tile) return;

    const list = usersOn(t.id);

    /* the gold plate is the primary readout */
    paintBuyerPlate(tile, list);

    /* the roster holds the small chips, used as the edit surface */
    roster.innerHTML = "";
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

    /* the red strip lists the names themselves — no counts, no label */
    const filledNames = tile.querySelector("[data-fillednames]");
    if (filledNames) {
      filledNames.innerHTML = "";
      list.forEach(function (e) {
        const span = document.createElement("span");
        span.className = "filledname";
        span.textContent = e.username;
        span.title = "Edit or remove @" + e.username;
        span.addEventListener("click", function (ev) {
          ev.stopPropagation();
          openEditor(e.id);
        });
        filledNames.appendChild(span);
      });
    }
    if (!isFilled) tile.classList.remove("force-open");
  });

  refreshBoardCounts();
}

/* ---------- resetting one board ---------- */

function resetBoard(boardId) {
  const board = boardById(boardId);
  if (!board) return;

  const names = {};
  board.boxes.forEach(function (b) { names[b.name] = true; });

  const doomed = entries.filter(function (e) { return names[e.target]; });
  if (!doomed.length) {
    $("saved").textContent = "The " + board.label + " board is already empty.";
    return;
  }

  const line1 = "Remove all " + doomed.length + " " +
    (doomed.length === 1 ? "name" : "names") + " from the " + board.label + " board?";
  const line2 = "Only that board is cleared. You can put them back with Undo.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoSnapshot = entries.slice();
  entries = entries.filter(function (e) { return !names[e.target]; });
  persist();
  closeEditor();
  refreshBoards();
  renderEntries();
  showUndo("Cleared " + doomed.length + " from " + board.label + ".");
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

function setCompact(on) {
  const wrap = document.querySelector(".wrap");
  if (wrap) wrap.classList.toggle("compact", !!on);
  const head = document.querySelector("header");
  if (head) head.classList.toggle("compact", !!on);
}

function setTab(tabId) {
  currentTab = boardById(tabId) ? tabId : BOARDS[0].id;
  const board = boardById(currentTab);
  const stack = boardsOnTab(currentTab);

  setCompact(COMPACT_TABS[currentTab]);

  document.querySelectorAll("[data-view-btn]").forEach(function (b) {
    const on = b.dataset.viewBtn === currentTab;
    b.className = on ? "on" : "";
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  $("boardTitle").textContent = board.label;
  if (stack.length > 1) {
    const rest = stack.slice(1).map(function (b) { return b.label; }).join(" and ");
    $("boardSub").textContent =
      "Both boards on this screen \u2014 " + board.label + " on top, " + rest +
      " underneath. Each has its own Reset.";
  } else {
    $("boardSub").textContent =
      board.boxes.length + " boxes. Type a username into a box to put them on it.";
  }
  $("filter").placeholder = "Filter " + board.label.toLowerCase() + "\u2026";

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
    tr.appendChild(textCell(isNaN(when) ? "\u2014" : when.toLocaleString()));

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
  undoTimer = setTimeout(hideUndo, 14000);
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

  $("resetBoard").addEventListener("click", function () {
    resetBoard(this.dataset.resetFor || currentTab);
  });

  $("clearAll").addEventListener("click", function () {
    if (!entries.length) return;
    const line1 = "Hide all " + entries.length + " names from every board?";
    const line2 = "You can put them straight back with Undo.";
    if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;
    undoSnapshot = entries.slice();
    entries = [];
    persist();
    closeEditor();
    refreshBoards();
    renderEntries();
    showUndo("Hid all " + undoSnapshot.length + " names.");
  });

  $("undobtn").addEventListener("click", function () {
    if (!undoSnapshot) return;
    const restored = undoSnapshot.length;
    entries = undoSnapshot;
    undoSnapshot = null;
    persist();
    refreshBoards();
    renderEntries();
    hideUndo();
    $("saved").textContent = "Restored " + restored + " names.";
  });
  $("undoclose").addEventListener("click", hideUndo);

  document.addEventListener("click", function () {
    if (document.querySelector(".chipeditor")) {
      closeEditor();
      refreshBoards();
    }
  });
});
