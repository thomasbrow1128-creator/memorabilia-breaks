/* Memorabilia Breaks - one page, any number of boards.

   REQUIRES: teams.js, then boards.js, then sb-client.js, this file,
   then winners.js.

   THE BOARD IS SHARED. Who is on which box lives in the database, not
   in this browser, so a name typed on your phone appears on your laptop
   and on every screen looking at the board - about a second later, with
   nothing to reload.

   ONE PERSON PER BOX. The database holds a unique index on the box
   name, so two people tapping the same box at the same moment cannot
   both win it. The second one is refused and told so.

   THE GREY IS ONLY VISUAL. A filled box stays fully usable: click it
   anywhere and the edit panel opens, so the name can be renamed or
   removed. Removing it clears the grey and frees the box.

   WINNERS. A name entered as  buyer$item  logs a win on the winners
   page: the part before the $ is the username, the part after is the
   item won, and the box itself shows only the buyer.

   The winners log is append-only from here. Nothing on any board can
   remove a line from it. Only its own Clear winners button does.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";

/* the old browser store, read once to carry names into the database */
const OLD_STORE_KEY = "memorabilia-breaks-usernames-v1";

/* Compact mode squashes a tab so every box fits one screen. Only for
   boards whose cards are already small. Pairs is NOT compact: its cards
   need their own room, so it uses the normal .board-small card layout. */
const COMPACT_TABS = {};

const $ = (id) => document.getElementById(id);

let entries = [];
let currentTab = "teams";
let liveMath = false;

function tileFor(targetId) {
  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].dataset.target === targetId) return tiles[i];
  }
  return null;
}

function normalizeName(raw) {
  return (raw || "").trim().replace(/^@/, "");
}

function usersOn(targetId) {
  return entries.filter(function (e) { return e.target === targetId; });
}

function countOnBoard(boardId) {
  const board = boardById(boardId);
  if (!board) return 0;
  const names = {};
  board.boxes.forEach(function (b) { names[b.name] = true; });
  return entries.filter(function (e) { return names[e.target]; }).length;
}

function closeAllPanels(except) {
  document.querySelectorAll(".tile").forEach(function (el) {
    if (el === except) return;
    el.classList.remove("editing");
    const p = el.querySelector(".chipeditor");
    if (p) p.hidden = true;
  });
}

/* ---------- reading the shared board ---------- */

async function loadEntries() {
  try {
    entries = await sbListEntries();
    liveMath = true;
  } catch (e) {
    liveMath = false;
    /* keep whatever we already have rather than blanking the board */
  }
  refreshBoards();
  renderEntries();
}

/* ---------- tabs ---------- */

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
      board.boxes.length + " boxes on this screen - " + board.label + " on top, " + rest +
      " underneath. Each has its own Reset.";
  } else {
    $("boardSub").textContent =
      board.boxes.length + " boxes. Type a username into a box to put them on it.";
  }
  $("filter").placeholder = "Filter " + board.label.toLowerCase();

  renderBoards();
  refreshBoards();
  applyFilter($("filter").value);
  $("saved").textContent = "";
}

/* ---------- the tiles ---------- */

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

  const initials = document.createElement("span");
  initials.className = "initials";
  initials.textContent = t.abbr;
  eb.appendChild(initials);
  tile.appendChild(eb);

  eb.title = "Click to enter a username for " + t.name;

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

  const bar = document.createElement("form");
  bar.className = "addbar";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "username or name$item";
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
  });
  tile.appendChild(bar);

  const panel = document.createElement("div");
  panel.className = "chipeditor";
  panel.hidden = true;

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.setAttribute("aria-label", "Edit name on " + t.name);
  editInput.autocomplete = "off";
  editInput.spellcheck = false;

  const editSave = document.createElement("button");
  editSave.type = "button";
  editSave.className = "cesave";
  editSave.textContent = "Save";

  const editDel = document.createElement("button");
  editDel.type = "button";
  editDel.className = "cedel";
  editDel.textContent = "Remove";

  const editCancel = document.createElement("button");
  editCancel.type = "button";
  editCancel.className = "cecancel";
  editCancel.textContent = "Cancel";

  panel.appendChild(editInput);
  panel.appendChild(editSave);
  panel.appendChild(editDel);
  panel.appendChild(editCancel);
  tile.appendChild(panel);

  function holder() {
    return usersOn(t.id)[0] || null;
  }

  function openPanel() {
    const e = holder();
    if (!e) return;
    closeAllPanels(tile);
    editInput.value = e.username;
    panel.hidden = false;
    tile.classList.add("editing");
    editInput.focus();
    editInput.select();
  }

  function closePanel() {
    panel.hidden = true;
    tile.classList.remove("editing");
  }

  async function commitEdit() {
    const e = holder();
    if (!e) { closePanel(); return; }
    const next = normalizeName(editInput.value);
    if (!next) { editInput.focus(); return; }

    try {
      const saved = await sbRenameEntry(e.id, next);
      if (saved) e.username = saved.username;
    } catch (err) {
      $("saved").textContent = "Could not rename: " + err.message;
      closePanel();
      return;
    }

    /* a rename updates that box's winner line in place; it never
       DELETES a line - from the boards, the log is append-only */
    if (typeof updateWinFor === "function") updateWinFor(e.target, next);

    closePanel();
    refreshBoards();
    renderEntries();
    if (typeof renderWinners === "function") renderWinners();
    $("saved").textContent = "Renamed to @" + buyerOnly(next) + " on " + e.target;
  }

  editSave.addEventListener("click", function (ev) {
    ev.stopPropagation();
    commitEdit();
  });
  editInput.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commitEdit(); }
    if (ev.key === "Escape") { ev.preventDefault(); closePanel(); }
  });
  editDel.addEventListener("click", async function (ev) {
    ev.stopPropagation();
    const e = holder();
    if (!e) { closePanel(); return; }
    const name = e.username;
    const where = e.target;
    closePanel();
    try {
      await sbRemoveEntry(e.id);
    } catch (err) {
      $("saved").textContent = "Could not clear that box: " + err.message;
      return;
    }
    entries = entries.filter(function (x) { return x.id !== e.id; });
    refreshBoards();
    renderEntries();
    if (typeof renderWinners === "function") renderWinners();
    $("saved").textContent = "Removed @" + name + " from " + where +
      " - that box is free again. The winners log is unchanged.";
  });
  editCancel.addEventListener("click", function (ev) {
    ev.stopPropagation();
    closePanel();
  });

  tile.addEventListener("click", function (ev) {
    if (!panel.hidden) return;
    if (ev.target.closest && ev.target.closest(".addbar")) return;
    if (usersOn(t.id).length) openPanel();
  });

  return tile;
}

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
      (n ? " - " + n + (n === 1 ? " name" : " names") : "");
  });

  document.querySelectorAll("[data-reset-for]").forEach(function (el) {
    const n = countOnBoard(el.dataset.resetFor);
    el.disabled = n === 0;
    el.classList.toggle("hasnames", n > 0);
  });
}

/* Fill the gold PURCHASER plate with the buyer's name only. An item
   entered after a "$" is logged on the winners page, not shown here. */
function buyerOnly(raw) {
  if (typeof splitEntry === "function") {
    const parts = splitEntry(raw);
    return parts.username || raw;
  }
  const at = String(raw || "").indexOf("$");
  return at === -1 ? raw : String(raw).slice(0, at).trim();
}

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
    const line = document.createElement("span");
    line.className = "buyname";
    line.textContent = buyerOnly(e.username);
    host.appendChild(line);
  });
}

function refreshBoards() {
  targetsOnTab(currentTab).forEach(function (t) {
    const tile = tileFor(t.id);
    if (!tile) return;

    const list = usersOn(t.id);
    paintBuyerPlate(tile, list);

    const badge = tile.querySelector(".badge");
    badge.textContent = list.length;
    badge.style.display = list.length ? "" : "none";

    const taken = list.length > 0;
    tile.classList.toggle("taken", taken);

    const input = tile.querySelector(".addbar input");
    const btn = tile.querySelector(".addbar button");
    if (input) {
      input.disabled = taken;
      input.placeholder = taken ? "taken" : "username or name$item";
    }
    if (btn) btn.disabled = taken;

    if (!taken) {
      const p = tile.querySelector(".chipeditor");
      if (p) p.hidden = true;
      tile.classList.remove("editing");
    }
  });

  refreshBoardCounts();
}

/* ---------- writing ---------- */

async function addUser(targetId, rawName) {
  const username = normalizeName(rawName);
  const tile = tileFor(targetId);
  const input = tile ? tile.querySelector(".addbar input") : null;

  if (!username) {
    if (input) input.focus();
    return;
  }

  if (usersOn(targetId).length) {
    $("saved").textContent = targetId + " is already taken. Remove that name first.";
    return;
  }

  $("saved").textContent = "Saving...";

  let saved = null;
  try {
    saved = await sbAddEntry(username, targetId);
  } catch (err) {
    $("saved").textContent = err.message;
    return;
  }
  if (!saved) {
    $("saved").textContent = "That name did not save. Try again.";
    return;
  }

  entries.push(saved);

  /* an entry naming an item with a "$" is logged on the winners page */
  let logged = null;
  if (typeof recordWin === "function") {
    try { logged = await recordWin(targetId, username); }
    catch (err) { logged = null; }
  }

  refreshBoards();
  renderEntries();

  if (logged) {
    $("saved").textContent = "Added @" + logged.username + " to " + targetId +
      " - win logged: " + logged.item;
  } else {
    $("saved").textContent = "Added @" + buyerOnly(username) + " to " + targetId;
  }
}

async function resetBoard(boardId) {
  const board = boardById(boardId);
  if (!board) return;

  const names = board.boxes.map(function (b) { return b.name; });
  const doomed = entries.filter(function (e) { return names.indexOf(e.target) !== -1; });

  if (!doomed.length) {
    $("saved").textContent = "The " + board.label + " board is already empty.";
    return;
  }

  const line1 = "Remove all " + doomed.length + " " +
    (doomed.length === 1 ? "name" : "names") + " from the " + board.label + " board?";
  const line2 = "Only that board is cleared, and the winners log is kept.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoSnapshot = doomed.slice();

  try {
    await sbClearTargets(names);
  } catch (err) {
    $("saved").textContent = "Could not clear that board: " + err.message;
    return;
  }

  /* NOTE: nothing here touches the winners log. */
  closeAllPanels(null);
  await loadEntries();
  if (typeof renderWinners === "function") renderWinners();
  showUndo("Cleared " + undone + " from " + board.label + " - the winners log is unchanged."
    .replace("undone", doomed.length));
}

let undone = 0;

/* ---------- the list of names ---------- */

function renderEntries() {
  const host = $("entries");
  host.innerHTML = "";
  $("entryCount").textContent = entries.length ? "(" + entries.length + ")" : "";

  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = liveMath
      ? "Nothing entered yet. Type a username into any box above."
      : "Could not reach the board. Check the connection, then reload.";
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
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  sorted.forEach(function (e) {
    const tr = document.createElement("tr");

    const tdUser = document.createElement("td");
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "nameedit";
    nameBtn.textContent = "@" + buyerOnly(e.username);
    nameBtn.title = "Click to rename";
    nameBtn.addEventListener("click", function () { startRowEdit(tr, e); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

    tr.appendChild(textCell(e.target));

    const when = new Date(e.created_at);
    tr.appendChild(textCell(isNaN(when) ? "-" : when.toLocaleString()));

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Remove only this name";
    del.addEventListener("click", async function () {
      try { await sbRemoveEntry(e.id); } catch (err) { return; }
      entries = entries.filter(function (x) { return x.id !== e.id; });
      refreshBoards();
      renderEntries();
    });
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

  async function commit() {
    const next = normalizeName(input.value);
    if (!next) { input.focus(); return; }

    try {
      const saved = await sbRenameEntry(entry.id, next);
      if (saved) entry.username = saved.username;
    } catch (err) {
      $("saved").textContent = "Could not rename: " + err.message;
      renderEntries();
      return;
    }

    /* same rule: update the line, never delete it */
    if (typeof updateWinFor === "function") updateWinFor(entry.target, next);

    refreshBoards();
    renderEntries();
    if (typeof renderWinners === "function") renderWinners();
    $("saved").textContent = "Renamed to @" + buyerOnly(next) + " on " + entry.target;
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

/* ---------- export and filter ---------- */

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
  const rows = ["username,item_won,placed_on,added"];
  const sorted = entries.slice().sort(function (a, b) {
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  sorted.forEach(function (e) {
    const parts = typeof splitEntry === "function"
      ? splitEntry(e.username)
      : { username: e.username, item: "" };
    rows.push(
      csvEscape(parts.username) + "," +
      csvEscape(parts.item) + "," +
      csvEscape(e.target) + "," +
      csvEscape(e.created_at)
    );
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

/* ---------- carrying names over from the old browser store ----------

   The previous version kept the board in localStorage. Anything still
   there is pushed up to the shared database once, then the local copy
   is cleared so it never doubles up. Skips anything already in the
   database, so it is safe to run more than once. */
async function importLocalEntries() {
  let pending = [];
  try {
    const raw = localStorage.getItem(OLD_STORE_KEY);
    if (raw) {
      const old = JSON.parse(raw);
      if (Array.isArray(old)) pending = old;
    }
  } catch (e) {
    return 0;
  }

  if (!pending.length) return 0;

  let moved = 0;
  for (let i = 0; i < pending.length; i++) {
    const o = pending[i];
    if (!o || !o.username || !o.target) continue;

    const already = entries.some(function (e) { return e.target === o.target; });
    if (already) continue;

    try {
      const saved = await sbAddEntry(o.username, o.target);
      if (saved) { entries.push(saved); moved++; }
    } catch (e) { /* a duplicate means somebody already has that box */ }
  }

  try { localStorage.removeItem(OLD_STORE_KEY); } catch (e) {}
  refreshBoards();
  renderEntries();
  return moved;
}

/* ---------- start ---------- */

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
  setTab(BOARDS[0].id);

  /* read the shared board, then carry over anything from the old store */
  loadEntries().then(function () {
    return importLocalEntries();
  }).then(function (moved) {
    if (moved) {
      $("saved").textContent = "Brought " + moved +
        (moved === 1 ? " name" : " names") + " across from this browser.";
    }
  });

  /* follow the board: a name typed on another device lands here */
  sbWatchEntries(function () { loadEntries(); });

  /* a safety net if a network blocks websockets */
  setInterval(function () { loadEntries(); }, 30000);

  $("filter").addEventListener("input", function (e) { applyFilter(e.target.value); });
  $("exportCsv").addEventListener("click", downloadCsv);

  $("resetBoard").addEventListener("click", function () {
    resetBoard(this.dataset.resetFor || currentTab);
  });

  $("clearAll").addEventListener("click", async function () {
    if (!entries.length) return;
    const line1 = "Hide all " + entries.length + " names from every board?";
    const line2 = "The winners log is kept.";
    if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

    undoSnapshot = entries.slice();
    undone = undoSnapshot.length;

    try {
      await sbClearAllEntries();
    } catch (err) {
      $("saved").textContent = "Could not clear the boards: " + err.message;
      return;
    }

    /* NOTE: the winners log is deliberately NOT touched here either. */
    closeAllPanels(null);
    await loadEntries();
    showUndo("Hid all " + undone + " names - the winners log is unchanged.");
  });

  $("undobtn").addEventListener("click", async function () {
    if (!undoSnapshot) return;
    const back = undoSnapshot;
    undoSnapshot = null;
    hideUndo();

    let put = 0;
    for (let i = 0; i < back.length; i++) {
      try {
        const saved = await sbAddEntry(back[i].username, back[i].target);
        if (saved) put++;
      } catch (e) { /* the box may already be taken again */ }
    }
    await loadEntries();
    $("saved").textContent = "Restored " + put + " names.";
  });
  $("undoclose").addEventListener("click", hideUndo);
});
