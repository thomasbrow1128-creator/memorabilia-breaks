/* Memorabilia Breaks - one page, any number of boards.

   REQUIRES: teams.js, then boards.js, then sb-client.js, this file,
   then winners.js.

   THE BOARD IS SHARED. Who is on which box lives in the database, not
   in this browser, so a name typed on your phone appears on your laptop
   and on every screen looking at the board.

   ONE PERSON PER BOX. The database holds a unique index on the box
   name, so two people tapping the same box at the same moment cannot
   both win it.

   THE GREY IS ONLY VISUAL. A filled box stays fully usable: click it
   anywhere and the edit panel opens, so the name can be renamed or
   removed.

   WINNERS. A name entered as  buyer$item  logs a win, on EVERY board -
   teams, divisions, and picks. The part before the $ is the username,
   the part after is the item won, and the box itself shows only the
   buyer.

   THE $ SPLIT AND THE WIN WRITE LIVE IN THIS FILE, and the box you type
   into is the box that saves. Both of those were bugs:

     - the write used to reach across two other files, so three files
       had to load with nothing stale in the cache, and a missing one
       skipped the win in silence;
     - the save used to re-find its tile by NAME, and the Pairs tab
       draws two grids at once, so a lookup could land on the other
       board's tile and the win never fired.

   Now the tile is passed straight through from the box you typed in.

   A FAILED WIN LOG IS NEVER SILENT. If the name saves but the win does
   not record, the message line says so, with the reason.

   THE GIVEAWAY BOARD. A spin-wheel board whose tiles are worked out,
   not stored, and nobody types on it:

     Teams board  - every name entered earns ONE giveaway entry.
     Pairs board  - every TWO names entered earn ONE giveaway entry.
     Divisions    - feeds nothing at all.

   One tile per entry, so three entries means three chances in the draw.

   The winners log is append-only from here. Nothing on any board can
   remove a line from it. Only its own Clear winners button does.
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";
const OLD_STORE_KEY = "memorabilia-breaks-usernames-v1";

/* Compact mode squashes a tab so every box fits one screen. Only for
   boards whose cards are already small. Pairs is NOT compact. */
const COMPACT_TABS = {};

const $ = (id) => document.getElementById(id);

let entries = [];
let currentTab = "teams";
let liveMath = false;
let undoSnapshot = null;
let undoTimer = null;

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

/* ---------- THE $ SPLIT, AND THE WIN WRITE ----------

   These two live HERE rather than in winners.js and sb-client.js on
   purpose. The board used to reach across three files to log a win:

       addUser -> recordWin (winners.js) -> sbAddWin (sb-client.js)

   Three files had to load, in order, with nothing stale in the cache.
   When any one of them failed to arrive the win was silently skipped,
   which is exactly what a broken $ command looks like.

   Now the board splits the entry and writes the win itself, over plain
   fetch, needing nothing from any other file. The winners page still
   reads the same table, so the log fills up exactly as before. */

const SB_WIN_URL = "https://bzvrslhfyaetmwzbnldt.supabase.co";
const SB_WIN_KEY = "sb_publishable_pM8hQ1cP77AXANXCkAS0qA_jfC9ibYq";

/* Split one entry into the buyer and the item.

   "alex$jersey"  -> { username: "alex", item: "jersey" }
   "alex"         -> { username: "alex", item: "" }       no item
   "alex$"        -> { username: "alex", item: "" }       no item
   "$jersey"      -> { username: "",     item: "jersey" } no buyer

   Only the FIRST $ splits, so an item may itself contain one. */
function boardSplit(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/^@/, "");
  const at = text.indexOf("$");
  if (at === -1) return { username: text, item: "" };
  return {
    username: text.slice(0, at).trim(),
    item: text.slice(at + 1).trim()
  };
}

/* Write one win straight to the database. Returns the saved row, or
   throws with a readable reason. */
async function boardLogWin(target, username, item) {
  const res = await fetch(SB_WIN_URL + "/rest/v1/wins", {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      username: username || "(no name)",
      item: item,
      team: target,
      tracking: ""
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not log the win (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  return rows[0] || null;
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
    /* keep what we have rather than blanking the board */
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
    /* pass the tile itself, not just its name. tileFor() returns the
       FIRST element matching a name, and the Pairs tab draws two grids
       at once, so a lookup by name can land on the wrong board's tile. */
    addUser(t.id, input.value, tile);
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

/* ---------- THE GIVEAWAY BOARD ----------

   Nobody types on this board. Every tile is one chance in the draw, and
   the names come from the two boards that feed it, worked out fresh from
   the live board data whenever the page draws.

     Teams board  - every name entered earns ONE giveaway entry.
     Pairs board  - every TWO names entered earn ONE giveaway entry
                    (4 on that board = 2 entries, 5 = 2, 6 = 3).

   The Divisions board feeds nothing at all. A name there never enters
   the draw.

   Because the tiles are derived, renaming or removing somebody on the
   Teams or Pairs board updates this board by itself. There is no second
   list to keep in step. */

function giveawayEntries() {
  /* box name -> board id, so we know which board each name came from */
  const whereBoard = {};
  GIVEAWAY_SOURCES.forEach(function (id) {
    const b = boardById(id);
    if (!b) return;
    b.boxes.forEach(function (box) { whereBoard[box.name] = id; });
  });

  /* count how many boxes each person holds, per board */
  const perPerson = {};
  entries.forEach(function (e) {
    const boardId = whereBoard[e.target];
    if (!boardId) return;                      /* divisions, or unknown */
    const name = buyerOnly(e.username);
    if (!name) return;
    if (!perPerson[name]) perPerson[name] = { teams: 0, pairs: 0 };
    perPerson[name][boardId] += 1;
  });

  /* turn those counts into entries, one tile each */
  const out = [];
  Object.keys(perPerson).forEach(function (name) {
    const c = perPerson[name];
    const total = giveawayRate("teams", c.teams) + giveawayRate("pairs", c.pairs);
    for (let i = 0; i < total; i++) out.push(name);
  });
  return out;
}

/* One giveaway tile: a name, and nothing to type into. */
function buildGiveawayTile(name, index) {
  const tile = document.createElement("div");
  tile.className = "tile givetile";
  tile.dataset.target = "giveaway:" + name + ":" + index;
  tile.dataset.search = String(name).toLowerCase();

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = index + 1;
  tile.appendChild(badge);

  const eb = document.createElement("div");
  eb.className = "eb";
  eb.style.background = "#2b303c";
  const initials = document.createElement("span");
  initials.className = "initials";
  initials.textContent = String(name).slice(0, 2).toUpperCase();
  eb.appendChild(initials);
  tile.appendChild(eb);

  const buyer = document.createElement("div");
  buyer.className = "buyer";
  const buylbl = document.createElement("span");
  buylbl.className = "buylbl";
  buylbl.textContent = "In the draw";
  buyer.appendChild(buylbl);
  const names = document.createElement("span");
  names.className = "buynames";
  const line = document.createElement("span");
  line.className = "buyname";
  line.textContent = name;
  names.appendChild(line);
  buyer.appendChild(names);
  tile.appendChild(buyer);

  return tile;
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
    grid.dataset.board = b.id;
    grid.setAttribute("aria-label", (b.label || b.id) + " board");

    if (b.derived) {
      /* a generated board: one tile per entry, no input, no editing */
      const drawn = giveawayEntries();
      grid.className = "board board-" + b.size + " givetiles";
      drawn.forEach(function (name, i) {
        grid.appendChild(buildGiveawayTile(name, i));
      });
      if (!drawn.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "Nobody in the draw yet. Names entered on the Teams and Pairs " +
          "boards appear here by themselves.";
        grid.appendChild(p);
      }
    } else {
      b.boxes.forEach(function (box) {
        const t = targetByName(box.name);
        if (t) grid.appendChild(buildTile(t));
      });
    }
    host.appendChild(grid);
  });

  /* a derived board has nothing to reset, so the toolbar takes it away */
  const primary = boards[0];
  const toolbarReset = $("resetBoard");
  const toolbarCsv = $("exportCsv");
  const toolbarClear = $("clearAll");
  const derivedOnly = !!primary && primary.derived;

  if (primary) {
    toolbarReset.dataset.resetFor = primary.id;
    toolbarReset.textContent = stacked ? "Reset " + primary.label : "Reset board";
    toolbarReset.title = "Remove every username from the " + primary.label + " boxes";
    toolbarReset.disabled = derivedOnly;
    toolbarReset.style.display = derivedOnly ? "none" : "";
  }
  /* Hide all and Download CSV mean nothing on a generated board either */
  if (toolbarClear) toolbarClear.style.display = derivedOnly ? "none" : "";
  if (toolbarCsv) toolbarCsv.style.display = derivedOnly ? "none" : "";

  /* the heading line, so the giveaway explains its own numbers */
  if (derivedOnly) {
    const drawn = giveawayEntries();
    const people = {};
    drawn.forEach(function (n) { people[n] = (people[n] || 0) + 1; });
    const howMany = Object.keys(people).length;
    $("boardSub").textContent = drawn.length
      ? drawn.length + (drawn.length === 1 ? " entry" : " entries") +
        " from " + howMany + (howMany === 1 ? " person" : " people") +
        " - one tile per entry."
      : "No entries yet.";
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
  const parts = boardSplit(raw);
  return parts.username || raw;
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

/* Add a name to a box.

   THE TILE IS PASSED IN, not looked up by name. Every board calls this
   the same way, so the $ command behaves identically on teams,
   divisions and picks. */
async function addUser(targetId, rawName, fromTile) {
  const username = normalizeName(rawName);
  /* the tile we were handed wins; the lookup is only a fallback */
  const tile = fromTile || tileFor(targetId);
  const input = tile ? tile.querySelector(".addbar input") : null;
  const note = $("saved");

  if (!username) {
    if (input) input.focus();
    return;
  }

  if (usersOn(targetId).length) {
    note.textContent = targetId + " is already taken. Remove that name first.";
    return;
  }

  note.textContent = "Saving...";

  let saved = null;
  try {
    saved = await sbAddEntry(username, targetId);
  } catch (err) {
    note.textContent = err.message;
    return;
  }
  if (!saved) {
    note.textContent = "That name did not save. Try again.";
    return;
  }

  entries.push(saved);

  /* an entry naming an item with a "$" is logged on the winners page.

     boardSplit and boardLogWin live in THIS file, so the win records
     whether or not winners.js or sb-client.js loaded. */
  const parts = boardSplit(username);

  let logged = null;
  let logError = "";

  if (parts.item) {
    try {
      logged = await boardLogWin(targetId, parts.username, parts.item);
    } catch (err) {
      logError = err && err.message ? err.message : "unknown error";
    }
  }

  refreshBoards();
  renderEntries();
  if (typeof renderWinners === "function") renderWinners();

  if (logged) {
    note.textContent = "Added @" + logged.username + " to " + targetId +
      " - win logged: " + logged.item;
  } else if (parts.item && logError) {
    /* the name is on the box, the win did NOT record - say so */
    note.textContent = "Added @" + buyerOnly(username) + " to " + targetId +
      " BUT the win did not log: " + logError;
  } else {
    note.textContent = "Added @" + buyerOnly(username) + " to " + targetId;
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

  closeAllPanels(null);
  await loadEntries();
  if (typeof renderWinners === "function") renderWinners();
  showUndo("Cleared " + doomed.length + " from " + board.label +
    " - the winners log is unchanged.");
}

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
    const parts = boardSplit(e.username);
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

/* ---------- carrying names over from the old browser store ---------- */

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

  loadEntries().then(function () {
    return importLocalEntries();
  }).then(function (moved) {
    if (moved) {
      $("saved").textContent = "Brought " + moved +
        (moved === 1 ? " name" : " names") + " across from this browser.";
    }
  });

  sbWatchEntries(function () { loadEntries(); });
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

    try {
      await sbClearAllEntries();
    } catch (err) {
      $("saved").textContent = "Could not clear the boards: " + err.message;
      return;
    }

    closeAllPanels(null);
    await loadEntries();
    showUndo("Hid all " + undoSnapshot.length + " names - the winners log is unchanged.");
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
