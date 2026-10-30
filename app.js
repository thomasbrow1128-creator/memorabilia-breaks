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

   THE GIVEAWAY BOARD. A spin wheel, one wedge per entry:

     Teams board  - every name entered earns ONE giveaway entry.
     Pairs board  - EVERY TWO SEPARATE PAIRS earn ONE entry.
     Divisions    - feeds nothing at all.

   A name can also be typed straight onto the giveaway board for an
   extra entry, and Reset giveaway takes those back out.

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

   Every tile is one chance in the draw.

     Teams board  - every name entered earns ONE giveaway entry.
     Pairs board  - EVERY TWO SEPARATE PAIRS earn ONE entry, so 2 boxes
                    earn one, 4 earn two, 6 earn three, and a single box
                    earns NOTHING.

   The Divisions board feeds nothing at all. A name there never enters
   the draw.

   WHICH BOARD A ROW BELONGS TO IS DECIDED BY ITS NAME, looked up in the
   two explicit name sets in boards.js. That is what stops a Divisions
   row leaking in, and what stops a single Pairs box being miscounted as
   a team - which would have handed out one entry for one pair. */

function giveawayEntries() {
  const perPerson = {};
  entries.forEach(function (e) {
    const name = buyerOnly(e.username);
    if (!name) return;

    if (isGiveawayTarget(e.target)) {
      /* a manual entry: one entry per row, however many times it is typed */
      if (!perPerson[name]) perPerson[name] = { teams: 0, pairs: 0, manual: 0 };
      perPerson[name].manual += 1;
      return;
    }

    const boardId = giveawayBoardOf(e.target);
    if (!boardId) return;                      /* divisions, or unknown */
    if (!perPerson[name]) perPerson[name] = { teams: 0, pairs: 0, manual: 0 };
    perPerson[name][boardId] += 1;
  });

  /* Turn those counts into tiles, one per entry.

     An entry earned from Teams or Pairs carries no id: it lives and dies
     with the name on that board. A hand-typed entry carries its row id,
     so it can be taken back out from the tile itself. */
  const out = [];
  Object.keys(perPerson).forEach(function (name) {
    const c = perPerson[name];
    const earned = giveawayRate("teams", c.teams) + giveawayRate("pairs", c.pairs);
    for (let i = 0; i < earned; i++) {
      out.push({ name: name, manualId: null });
    }
  });

  /* hand-typed rows last, so their Remove buttons line up with the rows */
  entries.forEach(function (e) {
    if (!isGiveawayTarget(e.target)) return;
    const name = buyerOnly(e.username);
    if (!name) return;
    out.push({ name: name, manualId: e.id });
  });

  out.forEach(function (entry, i) { entry.index = i; });
  return out;
}

/* One giveaway tile: a name, and a Remove button on the manual ones.

   `manualId` is the row id when this entry was typed by hand, so it can
   be taken back out. An entry earned from Teams or Pairs has no id of
   its own - it disappears when the name comes off that board - so it
   gets no Remove button. */
function buildGiveawayTile(name, index, manualId) {
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
  eb.style.background = manualId ? "#3a2f16" : "#2b303c";
  const initials = document.createElement("span");
  initials.className = "initials";
  initials.textContent = String(name).slice(0, 2).toUpperCase();
  eb.appendChild(initials);
  tile.appendChild(eb);

  const buyer = document.createElement("div");
  buyer.className = "buyer";
  const buylbl = document.createElement("span");
  buylbl.className = "buylbl";
  buylbl.textContent = manualId ? "In the draw (added)" : "In the draw";
  buyer.appendChild(buylbl);
  const names = document.createElement("span");
  names.className = "buynames";
  const line = document.createElement("span");
  line.className = "buyname";
  line.textContent = name;
  names.appendChild(line);
  buyer.appendChild(names);
  tile.appendChild(buyer);

  /* only a hand-typed entry can be taken back from here */
  if (manualId) {
    const bar = document.createElement("div");
    bar.className = "addbar givemanual";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "cedel givedel";
    del.textContent = "Remove";
    del.title = "Take this hand-typed entry back out";
    del.addEventListener("click", async function (ev) {
      ev.stopPropagation();
      try {
        await sbRemoveEntry(manualId);
      } catch (err) {
        $("saved").textContent = "Could not remove that entry: " + err.message;
        return;
      }
      entries = entries.filter(function (x) { return x.id !== manualId; });
      renderBoards();
      renderEntries();
      $("saved").textContent = "Removed the manual entry for " + name + ".";
    });
    bar.appendChild(del);
    tile.appendChild(bar);
  }

  return tile;
}

/* The bar at the foot of the giveaway board: type a name, press +, and
   that person gets one extra entry in the draw.

   Hand-typed entries are stored as ordinary rows so they survive a
   reload and reach every device, under a target that names this board
   and nothing else. They add to whatever the person already earned on
   Teams and Pairs. */
function buildGiveawayAddBar() {
  const bar = document.createElement("form");
  bar.className = "givadd";

  const label = document.createElement("span");
  label.className = "givaddlbl";
  label.textContent = "Add an entry by hand";
  bar.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "username";
  input.setAttribute("aria-label", "Name to add to the giveaway");
  input.autocomplete = "off";
  input.spellcheck = false;
  bar.appendChild(input);

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = "+";
  btn.title = "Add one giveaway entry for this name";
  bar.appendChild(btn);

  bar.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const name = buyerOnly(input.value);
    const note = $("saved");

    if (!name) { input.focus(); return; }

    note.textContent = "Adding...";
    try {
      const saved = await sbAddEntry(name, giveawayTargetFor(name));
      if (saved) entries.push(saved);
    } catch (err) {
      note.textContent = "Could not add that entry: " + err.message;
      return;
    }

    input.value = "";
    renderBoards();
    renderEntries();
    note.textContent = "Added one giveaway entry for @" + name + ".";
    input.focus();
  });

  return bar;
}

/* Take every hand-typed entry out of the giveaway.

   It removes the manual rows ONLY. Entries earned on Teams or Pairs are
   untouched, because those live on those boards - and no win, no name,
   and no other board is touched either. */
async function resetGiveaway() {
  const note = $("saved");
  const manual = entries.filter(function (e) { return isGiveawayTarget(e.target); });

  if (!manual.length) {
    note.textContent = "Nothing added by hand. Entries earned on Teams and Pairs " +
      "are cleared on those boards.";
    return;
  }

  const line1 = "Remove all " + manual.length + " hand-typed entries?";
  const line2 = "Entries earned on the Teams and Pairs boards are kept." +
    String.fromCharCode(10) +
    "No name, no win and no other board is touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoSnapshot = manual.slice();

  try {
    for (let i = 0; i < manual.length; i++) {
      await sbRemoveEntry(manual[i].id);
    }
  } catch (err) {
    note.textContent = "Could not remove every entry: " + err.message;
    await loadEntries();
    return;
  }

  entries = entries.filter(function (e) { return !isGiveawayTarget(e.target); });
  renderBoards();
  renderEntries();
  showUndo("Took out " + manual.length + " hand-typed entries - the boards are unchanged.");
}

/* ---------- THE SPIN WHEEL ----------

   A real wheel, drawn on a canvas. One wedge per entry in the draw, so
   somebody with three entries holds three wedges and three times the
   odds. It reads the SAME list the tiles are built from, so the wheel
   and the board can never disagree about who is in the draw.

   The pointer sits at the top. The wheel spins, slows, and stops under
   it; the winner is the name whose wedge landed there. */

const WHEEL_COLOURS = [
  "#c9a227", "#2f6fa8", "#a7412f", "#3f7d54",
  "#6d4a9e", "#b0703a", "#2a7d84", "#8c2f57"
];

function buildGiveawayWheel() {
  const wrap = document.createElement("div");
  wrap.className = "wheelwrap";

  const holder = document.createElement("div");
  holder.className = "wheelholder";

  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 560;
  canvas.className = "wheelcanvas";
  canvas.setAttribute("aria-label", "Giveaway spin wheel");
  holder.appendChild(canvas);

  const pointer = document.createElement("div");
  pointer.className = "wheelpointer";
  holder.appendChild(pointer);

  const hub = document.createElement("button");
  hub.type = "button";
  hub.className = "wheelhub";
  hub.textContent = "SPIN";
  hub.title = "Spin the wheel to pick a winner";
  holder.appendChild(hub);

  wrap.appendChild(holder);

  const result = document.createElement("div");
  result.className = "wheelresult";
  result.textContent = "Press SPIN to draw a winner.";
  wrap.appendChild(result);

  const ctx = canvas.getContext("2d");
  let angle = 0;          /* where the wheel currently sits, in radians */
  let spinning = false;

  /* The wedges, one per entry, in a stable order so the wheel does not
     reshuffle between draws. */
  function wedges() {
    const drawn = giveawayEntries();
    const n = drawn.length;
    if (!n) return [];
    const step = (Math.PI * 2) / n;
    return drawn.map(function (entry, i) {
      return {
        name: entry.name,
        start: i * step,
        end: (i + 1) * step,
        colour: WHEEL_COLOURS[i % WHEEL_COLOURS.length]
      };
    });
  }

  function draw() {
    const w = canvas.width;
    const r = w / 2;
    const list = wedges();

    ctx.clearRect(0, 0, w, w);

    /* the rim */
    ctx.beginPath();
    ctx.arc(r, r, r - 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0a1f3a";
    ctx.fill();

    if (!list.length) {
      ctx.fillStyle = "#8ea9c4";
      ctx.font = "600 20px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No entries yet", r, r);
      return;
    }

    list.forEach(function (seg) {
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 10, seg.start + angle, seg.end + angle);
      ctx.closePath();
      ctx.fillStyle = seg.colour;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.42)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    /* the names, written along each wedge */
    list.forEach(function (seg) {
      const mid = (seg.start + seg.end) / 2 + angle;
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0a1424";
      ctx.font = "700 17px Inter, system-ui, sans-serif";

      /* a wedge too thin for a name gets none, rather than a smear */
      const share = seg.end - seg.start;
      if (share > 0.14) {
        const label = seg.name.length > 13 ? seg.name.slice(0, 12) + "\u2026" : seg.name;
        ctx.fillText(label, r - 26, 0);
      }
      ctx.restore();
    });

    /* the rim again, on top, so wedges cannot spill past it */
    ctx.beginPath();
    ctx.arc(r, r, r - 8, 0, Math.PI * 2);
    ctx.strokeStyle = "#e6c24f";
    ctx.lineWidth = 7;
    ctx.stroke();
  }

  /* Which wedge is under the pointer, given where the wheel is now.

     The pointer is at the top, which is -90 degrees from zero. */
  function winnerAt(a) {
    const list = wedges();
    if (!list.length) return null;
    const TAU = Math.PI * 2;
    /* normalise the pointer angle into the wheel's own co-ordinates */
    let p = (-Math.PI / 2 - a) % TAU;
    if (p < 0) p += TAU;
    for (let i = 0; i < list.length; i++) {
      const seg = list[i];
      if (p >= seg.start && p < seg.end) return seg.name;
    }
    return list[list.length - 1].name;
  }

  function spin() {
    if (spinning) return;
    const list = wedges();
    if (!list.length) {
      result.textContent = "Nobody is in the draw yet.";
      return;
    }

    spinning = true;
    hub.disabled = true;
    result.textContent = "Spinning...";
    result.classList.remove("won");

    const TAU = Math.PI * 2;
    const turns = 6 + Math.random() * 3;              /* full turns */
    const land = Math.random() * TAU;                 /* where it stops */
    const from = angle;
    const to = from + turns * TAU + land;
    const started = performance.now();
    const howLong = 5200;                             /* milliseconds */

    function frame(now) {
      const t = Math.min((now - started) / howLong, 1);
      /* ease out: fast at first, crawling at the end */
      const eased = 1 - Math.pow(1 - t, 3);
      angle = from + (to - from) * eased;
      draw();
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      angle = to % TAU;

      const who = winnerAt(angle);
      const held = list.filter(function (s) { return s.name === who; }).length;
      result.innerHTML = "Winner: <b>" + who + "</b>" +
        (held > 1 ? " (" + held + " entries)" : " (1 entry)");
      result.classList.add("won");
      spinning = false;
      hub.disabled = false;
    }
    requestAnimationFrame(frame);
  }

  hub.addEventListener("click", spin);
  canvas.addEventListener("click", spin);

  /* draw once now, and again whenever the board is redrawn */
  draw();
  wrap.refreshWheel = draw;
  return wrap;
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
      /* a generated board: one tile per entry. Entries arrive by
         themselves from Teams and Pairs, and can also be typed here. */
      const drawn = giveawayEntries();
      grid.className = "board board-" + b.size + " givetiles";
      drawn.forEach(function (entry) {
        grid.appendChild(buildGiveawayTile(entry.name, entry.index, entry.manualId));
      });
      if (!drawn.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "Nobody in the draw yet. Names entered on the Teams and Pairs " +
          "boards appear here by themselves, and you can add one by hand below.";
        grid.appendChild(p);
      }
      host.appendChild(grid);
      host.appendChild(buildGiveawayWheel());
      host.appendChild(buildGiveawayAddBar());
      return;
    }

    b.boxes.forEach(function (box) {
      const t = targetByName(box.name);
      if (t) grid.appendChild(buildTile(t));
    });
    host.appendChild(grid);
  });

  /* The giveaway gets its own Reset, and the toolbar buttons that only
     make sense on a typed board step aside. */
  const primary = boards[0];
  const toolbarReset = $("resetBoard");
  const toolbarCsv = $("exportCsv");
  const toolbarClear = $("clearAll");
  const onGiveaway = !!primary && primary.derived;

  if (primary) {
    toolbarReset.dataset.resetFor = primary.id;
    if (onGiveaway) {
      toolbarReset.textContent = "Reset giveaway";
      toolbarReset.title = "Take every hand-typed entry back out. " +
        "Entries earned on Teams and Pairs stay, and no win is touched.";
    } else {
      toolbarReset.textContent = stacked ? "Reset " + primary.label : "Reset board";
      toolbarReset.title = "Remove every username from the " + primary.label + " boxes";
    }
    toolbarReset.disabled = false;
    toolbarReset.style.display = "";
  }
  /* Hide all and Download CSV mean nothing on a generated board */
  if (toolbarClear) toolbarClear.style.display = onGiveaway ? "none" : "";
  if (toolbarCsv) toolbarCsv.style.display = onGiveaway ? "none" : "";

  /* the heading line, so the giveaway explains its own numbers */
  if (onGiveaway) {
    const drawn = giveawayEntries();
    const people = {};
    drawn.forEach(function (e) { people[e.name] = (people[e.name] || 0) + 1; });
    const manual = entries.filter(function (e) { return isGiveawayTarget(e.target); }).length;
    const howMany = Object.keys(people).length;
    $("boardSub").textContent = drawn.length
      ? drawn.length + (drawn.length === 1 ? " entry" : " entries") +
        " from " + howMany + (howMany === 1 ? " person" : " people") +
        (manual ? " - " + manual + " added by hand." : " - one wedge per entry.")
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

    tr.appendChild(textCell(targetLabel(e.target)));

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
    $("saved").textContent = "Renamed to @" + buyerOnly(next) + " on " +
      targetLabel(entry.target);
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
      csvEscape(targetLabel(e.target)) + "," +
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
  const total = document.querySelectorAll("#boards .tile").length;
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
    const id = this.dataset.resetFor || currentTab;
    const b = boardById(id);
    /* the giveaway has its own reset: hand-typed entries only */
    if (b && b.derived) { resetGiveaway(); return; }
    resetBoard(id);
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
        /* a hand-typed giveaway row is rebuilt under its own target; a
           board row goes back onto its box */
        const saved = await sbAddEntry(back[i].username, back[i].target);
        if (saved) put++;
      } catch (e) { /* the box may already be taken again */ }
    }
    await loadEntries();
    $("saved").textContent = "Restored " + put + " names.";
  });
  $("undoclose").addEventListener("click", hideUndo);
});
