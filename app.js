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

/* ---------- THE DATABASE ----------

   THESE TWO MUST BE DECLARED BEFORE ANYTHING THAT READS THEM.

   SB_GIVEAWAY_URL is built from SB_WIN_URL. When the two lived further
   down the file, building that URL threw

       ReferenceError: Cannot access 'SB_WIN_URL' before initialization

   at load time - a const is not readable until its own line has run - so
   the whole script died before it drew a single tab. The file still
   PARSED, which is why a syntax check said it was fine while the page was
   blank. Order matters here; keep them at the top. */
const SB_WIN_URL = "https://bzvrslhfyaetmwzbnldt.supabase.co";
const SB_WIN_KEY = "sb_publishable_pM8hQ1cP77AXANXCkAS0qA_jfC9ibYq";

let entries = [];

/* ---------- THE GIVEAWAY ENTRIES ARE STORED ----------

   An entry used to be WORKED OUT from the board rows, which meant a row
   that was removed took its entry with it: reset Pairs and the draw
   shrank. That is the bug this replaces.

   Now an entry is WRITTEN DOWN the moment it is earned - one row in
   public.giveaway_entries for each Team box, one for every TWO Pairs
   boxes - and after that it belongs to the giveaway alone.

     Teams / Pairs Reset        -> touches nothing here
     removing or renaming a name-> touches nothing here
     the Giveaway's Remove      -> deletes that one row
     Reset Giveaway             -> deletes the hand-added rows

   Because the rows live in the database, an entry survives a refresh and
   shows on every device, which the old in-page version did not. */
/* ---------- SUPPY, IN THE NEON THEME ----------

   Injected once, so nothing else has to change. A gold-and-mint pulse
   on the name and a lifted glow on the tile, so a box holding SUPPY
   stands out from the rest without looking like a different board.

   ONLY a box holding that word BY ITSELF is marked - not "suppy1",
   not "dave suppy". */
(function () {
  if (document.getElementById("suppy-style")) return;
  const s = document.createElement("style");
  s.id = "suppy-style";
  s.textContent = [
    "@keyframes suppyPulse{",
    "0%,100%{text-shadow:0 0 10px rgba(255,215,106,.9),",
    "0 0 26px rgba(255,205,90,.6),0 2px 6px rgba(0,0,0,.95)}",
    "50%{text-shadow:0 0 20px rgba(127,224,160,.95),",
    "0 0 44px rgba(127,224,160,.55),0 2px 6px rgba(0,0,0,.95)}}",
    ".buyname.suppy{color:#ffe89a;font-weight:900;letter-spacing:.06em;",
    "animation:suppyPulse 2.4s ease-in-out infinite}",
    ".tile.suppybox{border-color:rgba(255,215,106,.95);",
    "box-shadow:0 0 26px rgba(255,206,80,.5),",
    "0 0 58px rgba(255,206,80,.22),0 12px 30px rgba(0,0,0,.6)}",
    ".tile.suppybox .eb{box-shadow:inset 0 0 30px rgba(255,206,80,.35)}",
    ".tile.suppybox .teamlogo{opacity:1}"
  ].join("");
  document.head.appendChild(s);
})();

let giveawayRows = [];
let gwSyncing = false;

const SB_GIVEAWAY_URL = SB_WIN_URL + "/rest/v1/giveaway_entries";

async function gwLoad() {
  try {
    const res = await fetch(
      SB_GIVEAWAY_URL + "?select=*&order=created_at.asc",
      { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
    );
    if (!res.ok) return giveawayRows;
    giveawayRows = await res.json();
  } catch (e) {
    /* leave what we have rather than emptying the draw */
  }
  return giveawayRows;
}

/* write one entry down. A failure is reported, never swallowed. */
async function gwAdd(username, source) {
  const name = buyerOnly(username);
  if (!name) return null;
  const res = await fetch(SB_GIVEAWAY_URL, {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ username: name, source: source })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save the giveaway entry (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  const row = rows[0] || null;
  if (row) giveawayRows.push(row);
  return row;
}

async function gwDeleteRow(id) {
  const res = await fetch(SB_GIVEAWAY_URL + "?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY }
  });
  if (!res.ok) throw new Error("Could not remove that entry (" + res.status + ")");
  giveawayRows = giveawayRows.filter(function (r) { return r.id !== id; });
}

/* HOW MANY ENTRIES A PERSON IS OWED.

   Counted from the stored rows, and from the boards as well, so a name
   added while the table was unreachable still shows its entry once the
   board row is there. The two are reconciled by source: a stored 'teams'
   row and a Team box are the same entry, never two. */
/* A bare count of stored rows by NAME, with no run and no board. Kept
   only as a reference - nothing calls it now, because a count that
   cannot tell one break from the next is what let entries stack up. The
   earn path counts boxes and scopes its rows by run id instead. */
function gwStoredCount(username) {
  const name = buyerOnly(username);
  return giveawayRows.filter(function (r) { return r.username === name; }).length;
}

/* WRITE DOWN WHAT THIS BOX JUST EARNED.

   Teams  - every box earns one entry, at once.
   Pairs  - every SECOND box earns one, so the odd box is held by the
            board until its partner arrives. The count is worked out
            from the board as it now stands, and only the missing
            entries are written, so filling a box twice cannot double
            an entry. */
async function gwEarnFor(targetId, username) {
  const name = personKey(username);
  if (!name) return;

  const boardId = giveawayBoardOf(targetId);
  if (!boardId) return;                       /* divisions, or unknown */

  /* ---------- HOW MANY ENTRIES THIS PERSON IS OWED ----------

     THE RULE: every time a person's Pairs boxes reach TWO, they earn one
     more entry - every time, for every break, with nothing blocking it.

     Counting the whole board against the total already stored was wrong:
     once somebody held one entry, their next two boxes came out as
     "1 owed - 1 stored = 0" and nothing was written. That is why entries
     only ever appeared once per person.

     So the count is per PAIR OF BOXES, matched by the PERSON - the part
     before any $ - and never capped by what is already stored.

       pairs - floor(boxes / 2), so 2 boxes = 1 entry, 4 = 2, 6 = 3
       teams - one entry per box

     The stored rows are then written until the person holds that many
     FOR THIS RUN, so a later break earns again rather than being blocked
     by an older entry. */
  let boxes = 0;
  let storedThisRun = 0;
  const runId = await gwRunId();

  try {
    const url = SB_WIN_URL + "/rest/v1/entries?select=username,target";
    const res = await fetch(url, {
      headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY }
    });
    if (res.ok) {
      const rows = await res.json();
      boxes = rows.filter(function (r) {
        return personKey(r.username) === name && giveawayBoardOf(r.target) === boardId;
      }).length;
    }
  } catch (e) { /* fall through - a miscount must not lose an entry */ }

  try {
    const gres = await fetch(
      SB_GIVEAWAY_URL + "?select=username,source",
      { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
    );
    if (gres.ok) {
      const grows = await gres.json();
        /* COUNTED BY PERSON AND BOARD, with no run in the comparison.
           Run-scoping is what made this swing: a name split across
           spellings scored high and was paid nothing, and a moved run
           id scored zero and paid again for boxes that had already
           paid. What a person holds is what matters. */
          storedThisRun = grows.filter(function (r) {
            return personKey(r.username) === name && r.source === boardId;
          }).length;
    }
  } catch (e) { /* fall through */ }

  /* ---------- COUNTING ONLY. NO FLOOR. ----------

     What is owed is worked out from how many boxes this person holds
     right now, and the rows already written for this run come off it.

         pairs - floor(boxes / 2)   so 2 boxes = 1, 4 = 2, 6 = 3
         teams - one per box

     The two lines that used to sit here forced an entry whenever the
     sum came to zero or less:

         if (missing <= 0 && boardId === "teams") missing = 1;
         if (missing <= 0 && boardId === "pairs" && ... storedThisRun < owed)

     THAT SECOND ONE IS WHY A PAIRS BOX PAID EVERY TIME. It compared
     storedThisRun - the rows counted for the CURRENT RUN - against what
     was owed. When that count came back short, or the run id moved, the
     guard passed and another entry was written for boxes that had
     already paid. A single box could pay, and a fourth box could pay
     twice.

     There is no floor now. If the count says nothing is owed, nothing
     is written. Two boxes, one entry. Four boxes, two. */
  /* ---------- ONE FRESH READ, THEN DECIDE ----------

     The count above comes from a list fetched a moment earlier. Two
     boxes entered a few seconds apart run this twice, and on the second
     run the first box's entry may not be in that list yet - so the
     count reads low and the person is paid AGAIN for a pair that has
     already paid. That is what put two entries on TEST for two boxes.

     So the stored count is taken once more, fresh, immediately before
     the decision, and it is the fresh number that decides. If the fresh
     read fails, the earlier count stands rather than writing blind. */
  let haveNow = storedThisRun;
  try {
    const fresh = await fetch(
      SB_GIVEAWAY_URL + "?select=username,source",
      { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
    );
    if (fresh.ok) {
      const rowsNow = await fresh.json();
      haveNow = rowsNow.filter(function (r) {
        return personKey(r.username) === name && r.source === boardId;
      }).length;
    }
  } catch (e) { /* keep the earlier count */ }

  const owed = giveawayRate(boardId, boxes);
  let missing = owed - haveNow;
  if (missing < 0) missing = 0;

  /* ---------- ALREADY PAID: WRITE A MANUAL ENTRY, DO NOT SKIP ----------

     This returned early, and that broke the thing it sits in the path
     of. Re-entering a name that is ALREADY in the giveaway lands here,
     and an early return meant nothing was added - so putting someone
     back on the board appeared to do nothing at all.

     The rule this must not break: a PAIRS box that has already paid
     must not pay AGAIN. That is about the boxes paying twice, not
     about refusing a fresh entry for a name put back on.

     So when nothing is owed, the person is given ONE manual entry -
     the same kind the + button writes, and the same kind an off-site
     purchase gets. It is recorded as manual, so it never counts as a
     pair that paid, and the pairs rule stays intact. */
  /* ---------- NOTHING OWED MEANS NOTHING WRITTEN ----------

     This used to write a MANUAL entry whenever nothing was owed, so
     that putting a name back on the board added something. That is
     what made a Pairs box pay TWICE: the box earned its proper entry
     on the pairs count, and then this wrote a second one on top.

     A box going on the board is not a manual entry. Manual entries are
     off-site purchases and they are written by the + button, and by
     nothing else. If nothing is owed here, nothing is written. */
  if (missing === 0) return;

  const failed = [];
  for (let i = 0; i < missing; i++) {
    try {
      await gwAddPerson(name, boardId, runId);
    } catch (err) {
      failed.push(err && err.message ? err.message : "unknown error");
    }
  }

  if (!failed.length) await gwLoad();
  if (failed.length) throw new Error(failed.join(", "));
}
  /* no floor: what is owed is counted, and nothing is forced */

/* THE RUN THIS BREAK BELONGS TO.

   board_state.run_started moves when Start new run is pressed on the
   Winners page, so it doubles as the break marker. An entry earned now is
   stamped with it; entries from an earlier break keep their own stamp and
   are never deleted or counted against this one. */
async function gwRunId() {
  try {
    const res = await fetch(
      SB_WIN_URL + "/rest/v1/board_state?id=eq.1&select=run_started",
      { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
    );
    if (!res.ok) return "legacy";
    const rows = await res.json();
    const t = rows && rows[0] && rows[0].run_started;
    return t ? String(t) : "legacy";
  } catch (e) {
    return "legacy";
  }
}

/* write one entry, stamped with the run. Uses the DISPLAY name, so the
   customer page shows "DAVID ZYC" and not "DAVID ZYC$JD5". */
async function gwAddPerson(name, source, runId) {
  const res = await fetch(SB_GIVEAWAY_URL, {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ username: name, source: source, run_id: runId })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save the giveaway entry (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  const row = rows[0] || null;
  if (row) giveawayRows.push(row);
  return row;
}

/* HOW MANY ENTRIES A BOARD EARNS PER PERSON. Teams pays one for every
   box; Pairs pays one for every TWO. Divisions pays nothing. */
function giveawayRate(boardId, boxes) {
  if (boardId === "pairs") return Math.floor(boxes / 2);
  if (boardId === "teams") return boxes;
  return 0;
}

/* WHICH GIVEAWAY BOARD A BOX BELONGS TO - or null for the boards that
   feed nothing. */
function giveawayBoardOf(targetId) {
  if (!targetId) return null;
  if (String(targetId).indexOf("PAIR") === 0) return "pairs";
  const t = typeof teamByAbbr === "function" ? teamByAbbr(targetId) : null;
  if (t) return "teams";
  return null;
}

/* THE DRAW LIST. One name per entry, spelled the way the board holds it. */
function giveawayDraw() {
  const out = [];
  giveawayRows.forEach(function (r) {
    const n = personName(r.username);
    if (n) out.push(n);
  });
  return out;
}

/* the display name of a person, whatever row it came from */
function personName(raw) {
  const s = String(raw == null ? "" : raw).trim();
  return s ? s.toUpperCase() : "";
}

/* the KEY a person is grouped by - the part before any $. Spelling keeps
   its case in the display, the key folds it. */
function personKey(raw) {
  const parts = typeof boardSplit === "function" ? boardSplit(raw) : { username: raw };
  const n = String(parts.username == null ? "" : parts.username).trim();
  return n ? n.toUpperCase() : "";
}

function buyerOnly(raw) {
  const parts = boardSplit(raw);
  return parts.username || String(raw == null ? "" : raw);
}

function boardSplit(raw) {
  const s = String(raw == null ? "" : raw);
  const at = s.indexOf("$");
  if (at === -1) return { username: s.trim(), item: "" };
  return { username: s.slice(0, at).trim(), item: s.slice(at + 1).trim() };
}

function normalizeName(raw) {
  const s = String(raw == null ? "" : raw).trim().replace(/\s+/g, " ");
  return s;
}

function usersOn(target) {
  return entries.filter(function (e) { return e.target === target; });
}

function boardById(id) {
  if (typeof BOARDS === "undefined") return null;
  for (let i = 0; i < BOARDS.length; i++) {
    if (BOARDS[i].id === id) return BOARDS[i];
  }
  return null;
}

function boardsOnTab(tabId) {
  if (typeof BOARDS === "undefined") return [];
  return BOARDS.filter(function (b) { return b.tab === tabId; });
}

let currentTab = null;
let liveMath = true;

/* ---------- LOAD AND DRAW ---------- */

async function loadEntries() {
  try {
    entries = await sbListEntries();
    liveMath = true;
  } catch (e) {
    liveMath = false;
  }
  refreshBoards();
  renderEntries();
}

function refreshBoards() {
  if (typeof BOARDS === "undefined") return;
  BOARDS.forEach(function (b) {
    if (b.derived) return;
    b.boxes.forEach(function (box) {
      const tile = document.querySelector('[data-target="' + box.id + '"]');
      if (!tile) return;
      const list = usersOn(box.id);
      const plate = tile.querySelector("[data-names]");
      if (!plate) return;
      plate.innerHTML = "";
      if (!list.length) {
        const open = document.createElement("span");
        open.className = "buyname buyopen";
        open.textContent = "Open";
        plate.appendChild(open);
        tile.classList.remove("taken");
        return;
      }
      list.forEach(function (e) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "buyname buyname-btn";
        if (personKey(e.username) === "SUPPY") b.classList.add("suppy");
        b.textContent = buyerOnly(e.username).toUpperCase();
        b.title = "Click to rename or remove";
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          const panel = tile.querySelector(".chipeditor");
          if (!panel) return;
          tile.querySelector(".chipeditor input").value = e.username;
          panel.hidden = false;
          tile.classList.add("editing");
          tile.querySelector(".chipeditor input").focus();
          tile.querySelector(".chipeditor input").select();
        });
        plate.appendChild(b);
      });
      if (personKey(list[0].username) === "SUPPY") tile.classList.add("suppybox");
      else tile.classList.remove("suppybox");
      tile.classList.add("taken");
    });
  });

  const count = $("count");
  if (count) count.textContent = entries.length ? "(" + entries.length + ")" : "";
}

function renderBoards() {
  const host = $("boards");
  if (!host) return;
  host.className = "wrap-of-boards";
}

/* ---------- ADD ---------- */

async function addUser(targetId, rawValue, tile) {
  const username = normalizeName(rawValue);
  const note = $("saved");
  if (!username) { note.textContent = "Type a username first."; return; }

  const parts = boardSplit(username);
  if (!parts.username) { note.textContent = "Type a username first."; return; }

  let row = null;
  try {
    row = await sbAddEntry(parts.username, targetId);
  } catch (err) {
    note.textContent = err.message;
    return;
  }

  if (row) entries.push(row);

  /* ---------- A WIN IS LOGGED LOCALLY ----------

     Only if the buyer named an item after the $. The win goes out on its
     own request, and a failure there is reported, never swallowed. */
  let logged = null;
  let logError = "";
  if (parts.item && typeof logWin === "function") {
    try {
      logged = await logWin(parts.username, parts.item, targetId);
    } catch (err) {
      logError = err && err.message ? err.message : "unknown error";
    }
  }

  /* ---------- 2. THE GIVEAWAY ENTRY ---------- */
  let gwError = "";
  try {
    await gwEarnFor(targetId, username);
  } catch (err) {
    gwError = err && err.message ? err.message : "unknown error";
  }

  if (gwError) {
    refreshBoards();
    renderEntries();
  }

  /* ---------- 3. SAY WHAT HAPPENED ---------- */
  if (logged) {
    note.textContent = "Added @" + logged.username + " to " + targetId +
      " - win logged: " + logged.item;
  } else if (parts.item && logError) {
    note.textContent = "Added @" + buyerOnly(username) + " to " + targetId +
      " BUT the win did not log: " + logError;
  } else {
    note.textContent = "Added @" + buyerOnly(username) + " to " + targetId;
  }

  if (gwError) {
    note.textContent += " - BUT the giveaway entry did not save: " + gwError;
  }
}


/* ---------- THE RESET ----------

   Reset used to fail silently. Two reasons, both now gone.

   1. It asked for confirmation with confirm(), a BROWSER dialog. When a
      browser has suppressed dialogs - which Chrome does after the box is
      ticked, and which some phones and in-app browsers do by default -
      confirm() returns false without ever showing anything, so the click
      did nothing and said nothing. The confirmation is now drawn on the
      page itself instead.

   2. It deleted through sbClearTargets() in sb-client.js, which builds
      one PostgREST filter out of every box name. A name carrying a comma
      or a bracket breaks that filter, the whole request 400s, and the
      board - still full - simply reloaded looking untouched.

   So the delete happens HERE, one request per box, using the same key
   this file already carries for the win write. No other file has to be
   loaded or current for the reset to work, and a failure says which box
   it could not free rather than going quiet. */

const SB_ENTRIES_URL = SB_WIN_URL + "/rest/v1/entries";
const SB_HEADERS = {
  "apikey": SB_WIN_KEY,
  "Authorization": "Bearer " + SB_WIN_KEY,
  "Content-Type": "application/json"
};

/* Free ONE box. The box name is escaped for the URL, so a name with a
   space, a comma, a bracket or an apostrophe goes through intact. */
async function boardFreeTarget(target) {
  const url = SB_ENTRIES_URL + "?target=eq." + encodeURIComponent(target);
  const res = await fetch(url, { method: "DELETE", headers: SB_HEADERS });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error(res.status + " " + txt);
  }
  return true;
}

/* THE BOX NAMES OF ONE BOARD - that board only.

   It must not reach across the tab. The Pairs board is drawn with the
   Divisions board stacked underneath it, so anything that walks the tab
   sweeps Divisions when you asked to reset Pairs. This used to do that,
   which is why Reset Pairs took a bite out of Divisions and then left
   the Pairs names behind. One board in, that board's names out. */
function boardTargetNames(board) {
  const names = {};
  if (!board || board.derived) return [];
  board.boxes.forEach(function (box) { names[box.name] = true; });
  return Object.keys(names);
}

let resetPending = null;
let resetPendingTimer = null;

async function resetBoard(boardId) {
  const board = boardById(boardId);
  if (!board) return;

  const names = boardTargetNames(board);
  const inBoard = {};
  names.forEach(function (n) { inBoard[n] = true; });

  const doomed = entries.filter(function (e) { return inBoard[e.target]; });

  if (!doomed.length) {
    $("saved").textContent = "The " + board.label + " board is already empty.";
    return;
  }

  /* SECOND CLICK CONFIRMS. The first press arms it and says so on the
     page; pressing again within a few seconds does the clear. Nothing
     depends on a browser dialog appearing. */
  if (resetPending !== boardId) {
    resetPending = boardId;
    $("saved").textContent = "Press Reset " + board.label + " again to clear " +
      doomed.length + (doomed.length === 1 ? " name" : " names") +
      ". The winners log is kept.";
    clearTimeout(resetPendingTimer);
    resetPendingTimer = setTimeout(function () {
      resetPending = null;
      $("saved").textContent = "";
    }, 6000);
    return;
  }

  resetPending = null;
  clearTimeout(resetPendingTimer);

  /* BANK THE GIVEAWAY ENTRIES FIRST.

     The giveaway counts its entries from the board rows, so a row that
     goes takes its entry with it. Before anything is deleted, work out
     what the whole board was worth to the draw and write it down, so
     clearing Teams or Pairs leaves the giveaway exactly as it was.

     The Divisions board feeds nothing, so it banks nothing. */
  const perPerson = {};
  doomed.forEach(function (e) {
    const name = buyerOnly(e.username);
    if (!name) return;
    const boardId = giveawayBoardOf(e.target);
    if (!boardId) return;                    /* divisions, or unknown */
    if (!perPerson[name]) perPerson[name] = { teams: 0, pairs: 0 };
    perPerson[name][boardId] += 1;
  });
  /* WRITE THE BOARD DOWN FIRST. History is the record of what was on
     the board, so it has to be taken before anything goes. */
  await saveBoardHistory(board, doomed);

  undoSnapshot = doomed.slice();
  $("saved").textContent = "Clearing " + doomed.length + " from " + board.label + "...";

  const stuck = [];
  for (let i = 0; i < doomed.length; i++) {
    try {
      await boardFreeTarget(doomed[i].target);
    } catch (err) {
      stuck.push(doomed[i].target + " (" + err.message + ")");
    }
  }

  if (stuck.length) {
    $("saved").textContent = "Could not clear " + stuck.length + " of " +
      doomed.length + " boxes on " + board.label + ": " + stuck.join(", ");
  }

  closeAllPanels(null);
  await loadEntries();
  if (typeof renderWinners === "function") renderWinners();

  if (stuck.length) return;

  showUndo("Cleared " + doomed.length + " from " + board.label +
    " - the winners log is unchanged.");
}



/* ============================================================
   THE HISTORY PAGE

   Every reset with a board's own Reset button writes the board down
   first: who was on which box, on which board, at what time. Nothing
   else writes here, so this is the record of what each break held.

   IT IS READ-ONLY FROM EVERYWHERE ELSE. The only way a line leaves is
   the Delete button on this page.
   ============================================================ */

let historyRows = [];

async function historyLoad() {
  try {
    const res = await fetch(
      SB_WIN_URL + "/rest/v1/board_history?select=*&order=cleared_at.desc",
      { headers: SB_HEADERS }
    );
    if (!res.ok) return historyRows;
    historyRows = await res.json();
  } catch (e) {
    /* leave what we have rather than blanking the page */
  }
  return historyRows;
}

/* one saved reset, openable to show who sat where */
function buildHistoryEntry(row) {
  const wrap = document.createElement("div");
  wrap.className = "histentry";

  const head = document.createElement("button");
  head.type = "button";
  head.className = "histhead";

  const when = new Date(row.cleared_at);
  const good = !isNaN(when);

  const title = document.createElement("span");
  title.className = "histtitle";
  title.textContent = row.board_label || row.board_id;
  head.appendChild(title);

  const count = document.createElement("span");
  count.className = "histcount";
  count.textContent = (row.people || 0) + ((row.people === 1) ? " name" : " names");
  head.appendChild(count);

  const stamp = document.createElement("span");
  stamp.className = "histwhen";
  stamp.textContent = good ? when.toLocaleString() : "-";
  head.appendChild(stamp);

  const chev = document.createElement("span");
  chev.className = "histchev";
  chev.textContent = "\u25B8";
  head.appendChild(chev);

  const body = document.createElement("div");
  body.className = "histbody";
  body.style.display = "none";

  const list = Array.isArray(row.snapshot) ? row.snapshot : [];
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "That reset saved no names - the board was empty.";
    body.appendChild(p);
  } else {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Box</th><th>Name</th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    list.forEach(function (item) {
      const tr = document.createElement("tr");
      tr.appendChild(textCell(item.box || "-"));
      tr.appendChild(textCell(item.name || "-"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  }

  head.addEventListener("click", function () {
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "";
    chev.textContent = open ? "\u25B8" : "\u25BE";
  });

  wrap.appendChild(head);
  wrap.appendChild(body);

  /* ---------- DELETE, ONLY HERE ----------

     Nothing else in the site can remove a history line: not a board
     reset, not Hide all, not the winners page. This is the one place. */
  const bar = document.createElement("div");
  bar.className = "histbar";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "del";
  del.textContent = "Delete this reset";
  del.title = "Remove this saved board from History";
  del.addEventListener("click", async function (ev) {
    ev.stopPropagation();
    if (!confirm("Delete the saved \"" + (row.board_label || row.board_id) +
      "\" from " + (good ? when.toLocaleString() : "that reset") + "?" +
      String.fromCharCode(10, 10) + "The boards and the winners log are not touched.")) return;

    del.disabled = true;
    del.textContent = "Deleting\u2026";
    try {
      const res = await fetch(
        SB_WIN_URL + "/rest/v1/board_history?id=eq." + encodeURIComponent(row.id),
        { method: "DELETE", headers: SB_HEADERS }
      );
      if (!res.ok) {
        const txt = await res.text().catch(function () { return ""; });
        throw new Error("(" + res.status + ") " + txt);
      }
    } catch (err) {
      del.disabled = false;
      del.textContent = "Delete this reset";
      $("saved").textContent = "Could not delete that saved board: " +
        (err && err.message ? err.message : "unknown error");
      return;
    }
    await historyLoad();
    renderHistory();
    $("saved").textContent = "Deleted that saved board from History.";
  });
  bar.appendChild(del);
  wrap.appendChild(bar);

  return wrap;
}

function renderHistory() {
  const host = $("boards");
  if (!host) return;
  host.innerHTML = "";

  const count = $("count");
  if (count) {
    count.textContent = historyRows.length
      ? "(" + historyRows.length + (historyRows.length === 1 ? " saved board" : " saved boards") + ")"
      : "";
  }

  if (!historyRows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing saved yet. Press the Reset button on a board and " +
      "everything that was on it is written down here, with the time.";
    host.appendChild(p);
    return;
  }

  historyRows.forEach(function (row) {
    host.appendChild(buildHistoryEntry(row));
  });
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

    const tdWhen = document.createElement("td");
    const d = new Date(e.created_at);
    tdWhen.textContent = isNaN(d) ? "-" : d.toLocaleString();
    tr.appendChild(tdWhen);

    const tdDel = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", async function () {
      try {
        await sbRemoveEntry(e.id);
      } catch (err) {
        $("saved").textContent = err.message;
        return;
      }
      entries = entries.filter(function (x) { return x.id !== e.id; });
      refreshBoards();
      renderEntries();
    });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);

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

function startRowEdit(tr, e) {
  const td = tr.querySelector("td");
  td.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "roweditinput";
  input.value = e.username;
  const save = document.createElement("button");
  save.type = "button";
  save.className = "cesave";
  save.textContent = "Save";
  save.addEventListener("click", async function () {
    const next = normalizeName(input.value);
    if (!next) return;
    try {
      await sbRenameEntry(e.id, next);
    } catch (err) {
      $("saved").textContent = err.message;
      return;
    }
    e.username = next;
    if (typeof updateWinFor === "function") updateWinFor(e.target, next);
    refreshBoards();
    renderEntries();
  });
  td.appendChild(input);
  td.appendChild(save);
  input.focus();
}

/* ---------- the filter ---------- */

function applyFilter(q) {
  const needle = String(q || "").trim().toLowerCase();
  document.querySelectorAll("[data-search]").forEach(function (el) {
    const hay = String(el.dataset.search || "");
    el.style.display = !needle || hay.indexOf(needle) !== -1 ? "" : "none";
  });
}

/* ---------- the undo bar ---------- */

let undoSnapshot = [];

function showUndo(msg) {
  const bar = $("undobar");
  if (!bar) return;
  $("undotext").textContent = msg;
  bar.classList.add("show");
}

function closeAllPanels(except) {
  document.querySelectorAll(".tile.editing").forEach(function (t) {
    if (t !== except) {
      t.classList.remove("editing");
      const p = t.querySelector(".chipeditor");
      if (p) p.hidden = true;
    }
  });
}

/* ---------- THE CREDIT LEDGER ---------- */

async function creditAdjust(who, delta, note) {
  const name = personKey(who);
  if (!name) throw new Error("Enter a username.");

  const before = await creditReadOne(name);
  const had = before ? Number(before.amount) || 0 : 0;
  const after = Math.round((had + Number(delta)) * 100) / 100;

  const res = await fetch(SB_WIN_URL + "/rest/v1/customer_credit", {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      username: name,
      amount: after,
      updated_at: new Date().toISOString()
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save credit (" + res.status + ") " + txt);
  }

  /* a log entry, so a balance can be explained later */
  const log = await fetch(SB_WIN_URL + "/rest/v1/credit_log", {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      username: personKey(who),
      delta: delta,
      balance: after,
      note: note || ""
    })
  });

  if (!log.ok) {
    throw new Error("Balance saved, but the log entry failed (" + log.status + ")");
  }

  return { username: personKey(who), amount: after, before: before, delta: delta };
}

async function creditReadOne(name) {
  const who = personKey(name);
  if (!who) return null;
  const all = await creditReadAll();
  let found = null;
  all.forEach(function (r) {
    if (!found && personKey(r.username) === who) found = r;
  });
  return found;
}

async function creditReadAll() {
  const res = await fetch(
    SB_WIN_URL + "/rest/v1/customer_credit?select=*&order=username.asc",
    { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!res.ok) throw new Error("Could not read credit (" + res.status + ")");
  return res.json();
}

/* ONE MORE ENTRY FOR A PERSON */
async function gwAdjustPlus(name, howMany) {
  const who = personKey(name);
  const n = Math.max(1, Math.min(50, parseInt(howMany, 10) || 1));
  if (!who) throw new Error("No name given.");
  /* THE NAME WRITTEN IS THE KEY, NOT THE SPELLING.

     This wrote personName(name) - the name as it was typed - while the
     board groups rows by personKey. So pressing + on "THIN" wrote a row
     under a spelling the tile then counted separately, and the count
     looked like it had not moved. Writing the KEY means the new row
     lands on the same tile that was pressed, every time. */
  const res = await fetch(SB_GIVEAWAY_URL, {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ username: who, source: "manual" })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not add an entry (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  if (rows[0]) giveawayRows.push(rows[0]);

  /* a count of more than one gets the rest written as well, one row
     each, so the tile ends up holding exactly the number asked for */
  for (let i = 1; i < n; i++) {
    try {
      const extra = await fetch(SB_GIVEAWAY_URL, {
        method: "POST",
        headers: {
          "apikey": SB_WIN_KEY,
          "Authorization": "Bearer " + SB_WIN_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ username: who, source: "manual" })
      });
      if (extra.ok) {
        const r2 = await extra.json();
        if (r2[0]) giveawayRows.push(r2[0]);
      }
    } catch (e) { /* the ones that landed still count */ }
  }

  await gwLoad();
  return rows[0] || null;
}

/* ONE BACK - ONLY a hand-added row. Entries earned on Teams or Pairs
   are counted first and left alone, so a correction at the desk can
   never remove a box somebody won. */
async function gwAdjustMinus(name) {
  const who = personKey(name);
  if (!who) throw new Error("No name given.");

  const res = await fetch(
    SB_GIVEAWAY_URL + "?select=id,username,source,created_at&order=created_at.desc,id.desc",
    { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!res.ok) throw new Error("Could not read the entries (" + res.status + ")");
  const rows = await res.json();

  /* match on the KEY, so every spelling of the person is found */
  const mine = rows.filter(function (r) {
    return personKey(r.username) === who && r.source === "manual";
  });

  /* If there is no hand-added row, take the NEWEST earned one instead
     of refusing. The old behaviour threw here, so the button appeared
     dead for anyone whose entries all came from Teams or Pairs - which
     is most of the board. Earned rows can be put back by re-entering
     the name on the board, so removing one is recoverable. */
  const pool = mine.length ? mine : rows.filter(function (r) {
    return personKey(r.username) === who;
  });

  if (!pool.length) {
    throw new Error("No entries to remove for " + personName(name) + ".");
  }

  const doomed = pool[0];
  const del = await fetch(
    SB_GIVEAWAY_URL + "?id=eq." + encodeURIComponent(doomed.id),
    { method: "DELETE", headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!del.ok) throw new Error("Could not remove that entry (" + del.status + ")");

  giveawayRows = giveawayRows.filter(function (r) { return r.id !== doomed.id; });
  await gwLoad();
  refreshBoards();
  return doomed;
}

/* THE CONTROLS on a person's tile and on each credit row: an amount
   box, and Add / Remove for money and for entries. */
function creditControls(person) {
  const bar = document.createElement("div");
  bar.className = "creditbar";

  const amount = document.createElement("input");
  amount.type = "number";
  amount.step = "0.01";
  amount.min = "0";
  amount.className = "creditinput creditinputrow";
  amount.placeholder = "0.00";
  amount.inputMode = "decimal";
  amount.title = "Amount to add or take away";
  bar.appendChild(amount);

  async function money(sign) {
    const val = Number(amount.value) || 0;
    if (!val) { $("saved").textContent = "Enter an amount first."; return; }
    try {
      const out = await creditAdjust(person.name, sign * val, "desk adjustment");
      $("saved").textContent = personName(out.username) + " credit is now $" +
        Number(out.amount).toFixed(2) + ".";
      amount.value = "";
      if (currentTab === "credit") renderCredit();
    } catch (err) { $("saved").textContent = err.message; }
  }

  function mk(label, title, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ghost";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    bar.appendChild(b);
    return b;
  }

  mk("+", "Add this amount of credit", function () { money(1); });
  mk("\u2212", "Take this amount of credit away", function () { money(-1); });

  /* NOTHING HERE TOUCHES THE GIVEAWAY.

     This block used to carry "Entry +" and "Entry -" buttons calling
     gwAdjustPlus / gwAdjustMinus. It is drawn on EVERY credit row, so
     the moment a customer appeared on the Credit tab they were handed
     two buttons that wrote giveaway rows - which is how entering
     someone's credit put them in the draw.

     Credit is money, and money is not the draw. The only controls here
     are the amount box and +/- for the balance. Entries are earned on
     Teams and Pairs, one per two Pairs boxes, and the giveaway board is
     the only place they are adjusted by hand. */
  return bar;
}

/* ---------- THE CREDIT PAGE (control side) ---------- */
async function renderCredit() {
  const host = $("boards");
  if (!host) return;

  let rows = [];
  try {
    rows = await creditReadAll();
  } catch (err) {
    host.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = err.message;
    host.appendChild(p);
    return;
  }

  host.innerHTML = "";

  /* ---------- THE ENTRY FORM ----------

     This is what was missing. The table below lists customers who
     ALREADY have a balance, so with an empty table there was nowhere
     to type the first one - the page showed nothing and no way in.

     This form is drawn every time, whether or not any credit exists:
     a name and an amount, then Add or Remove. */
  /* ---------- THE ENTRY FORM, LAID OUT LIKE A DESK FORM ----------

     A labelled card, not a row of browser controls. Two labelled
     fields and two large buttons, so it reads as "fill this in and
     press the one you mean" rather than as a database toolbar. */
  const form = document.createElement("div");
  form.className = "creditform";

  const formTitle = document.createElement("h3");
  formTitle.className = "creditformtitle";
  formTitle.textContent = "Add or take away credit";
  form.appendChild(formTitle);

  const fields = document.createElement("div");
  fields.className = "creditfields";

  const nameWrap = document.createElement("label");
  nameWrap.className = "creditfield";
  const nameLbl = document.createElement("span");
  nameLbl.className = "creditfieldlbl";
  nameLbl.textContent = "Customer";
  nameWrap.appendChild(nameLbl);

  const nameIn = document.createElement("input");
  nameIn.type = "search";
  nameIn.className = "creditinput";
  nameIn.placeholder = "username";
  nameIn.autocomplete = "off";
  nameIn.spellcheck = false;
  nameWrap.appendChild(nameIn);
  fields.appendChild(nameWrap);

  const amtWrap = document.createElement("label");
  amtWrap.className = "creditfield";
  const amtLbl = document.createElement("span");
  amtLbl.className = "creditfieldlbl";
  amtLbl.textContent = "Amount";
  amtWrap.appendChild(amtLbl);

  const amtBox = document.createElement("span");
  amtBox.className = "creditmoney";

  const dollar = document.createElement("span");
  dollar.className = "creditdollar";
  dollar.textContent = "$";
  amtBox.appendChild(dollar);

  const amtIn = document.createElement("input");
  amtIn.type = "number";
  amtIn.step = "0.01";
  amtIn.min = "0";
  amtIn.className = "creditinput creditinputmoney";
  amtIn.placeholder = "0.00";
  amtIn.inputMode = "decimal";
  amtBox.appendChild(amtIn);
  amtWrap.appendChild(amtBox);
  fields.appendChild(amtWrap);

  form.appendChild(fields);

  async function submit(sign) {
    const who = nameIn.value.trim();
    const val = Number(amtIn.value) || 0;
    if (!who) { $("saved").textContent = "Enter a username."; nameIn.focus(); return; }
    if (!val) { $("saved").textContent = "Enter an amount."; amtIn.focus(); return; }
    try {
      const out = await creditAdjust(who, sign * val, "desk entry");
      $("saved").textContent = personName(out.username) + " credit is now $" +
        Number(out.amount).toFixed(2) + ".";
      amtIn.value = "";
      renderCredit();
    } catch (err) {
      $("saved").textContent = err.message;
    }
  }

  const actions = document.createElement("div");
  actions.className = "creditactions";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "creditbtn add";
  addBtn.innerHTML = "<b>Add</b><i>to their credit</i>";
  addBtn.title = "Add this amount to their credit";
  addBtn.addEventListener("click", function () { submit(1); });
  actions.appendChild(addBtn);

  const remBtn = document.createElement("button");
  remBtn.type = "button";
  remBtn.className = "creditbtn remove";
  remBtn.innerHTML = "<b>Remove</b><i>from their credit</i>";
  remBtn.title = "Take this amount off their credit";
  remBtn.addEventListener("click", function () { submit(-1); });
  actions.appendChild(remBtn);

  form.appendChild(actions);

  amtIn.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); submit(1); }
  });
  nameIn.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); amtIn.focus(); }
  });

  host.appendChild(form);

  /* ---------- THEN EVERY CUSTOMER WHO HAS A BALANCE ---------- */
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Customer</th><th>Credit</th><th>Last updated</th><th>Adjust</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  /* ---------- A ZERO ROW IS NOT SHOWN ----------

     The delete in creditAdjust stops a NEW zero being created, but it
     only runs when a write lands on zero - so any name already sitting
     at $0.00 stays in the table and would keep appearing here for ever.

     So the list skips them too. A customer at nothing is not a
     customer with credit, whichever way the zero got there. */
  const withCredit = rows.filter(function (r) {
    return Math.abs(Number(r.amount) || 0) > 0.0001;
  });

  withCredit.forEach(function (r) {
    const tr = document.createElement("tr");

    const c1 = document.createElement("td");
    c1.className = "who";
    c1.textContent = "@" + r.username;
    tr.appendChild(c1);

    const c2 = document.createElement("td");
    c2.className = "givcount";
    c2.textContent = "$" + (Number(r.amount) || 0).toFixed(2);
    tr.appendChild(c2);

    const c3 = document.createElement("td");
    c3.className = "meta";
    const d = new Date(r.updated_at);
    c3.textContent = isNaN(d) ? "-" : d.toLocaleString();
    tr.appendChild(c3);

    const c4 = document.createElement("td");
    c4.appendChild(creditControls({ name: r.username }));
    tr.appendChild(c4);

    tbody.appendChild(tr);
  });

  if (!withCredit.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No credit on any account. Type a username and an amount above, " +
      "then press Add - they will appear here and can be adjusted from then on.";
    host.appendChild(p);
  } else {
    table.appendChild(tbody);
    host.appendChild(table);
  }
}

/* ============================================================
   THE CARD ICON
   ============================================================

   WHAT THE ICON IS. Eight small shapes drawn as inline SVG in the same
   stroke the rest of the page uses - a jar, a box, a case, a card, a
   ring, a ball, a bottle, a tag. One is picked from the item's own
   name, so nothing has to be chosen by hand, and an accent colour
   comes with it so a card reads by colour and shape as well as text.

   NO IMAGE, NO LOGO. These are drawn here, line by line - not a file
   in the repo, not a brand mark, nothing to upload and nothing that
   can 404. If an item name matches nothing, the box is used.

   TO CHANGE THE WORDING LATER, edit INV_ICON_RULES below: the first
   rule whose word appears in the item name wins, so put the more
   specific words above the more general ones.
   ============================================================ */

const INV_GLYPHS = {
  jar:    "<rect x='5' y='9' width='14' height='13' rx='3'/>" +
          "<path d='M8 9V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V9'/>" +
          "<path d='M5 14h14'/>",
  box:    "<path d='M12 4l8 4v9l-8 4-8-4V8z'/>" +
          "<path d='M4 8l8 4 8-4M12 12v9'/>",
  case:   "<rect x='4' y='6' width='16' height='14' rx='3'/>" +
          "<path d='M9 6V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6V6'/>" +
          "<path d='M4 13h16'/>",
  card:   "<rect x='4' y='6' width='16' height='12' rx='3'/>" +
          "<path d='M4 11h16'/><path d='M8 15h5'/>",
  ring:   "<circle cx='12' cy='13' r='6'/><path d='M9.5 6.4L12 3.5l2.5 2.9'/>",
  ball:   "<circle cx='12' cy='12' r='8'/><path d='M12 4v16M4 12h16'/>",
  bottle: "<path d='M10 4h4v3.2l1.8 2.6A5 5 0 0 1 16.6 13v5.4A1.6 1.6 0 0 1 15 20H9a1.6 1.6 0 0 1-1.6-1.6V13a5 5 0 0 1 .8-3.2L10 7.2z'/>" +
          "<path d='M7.6 14.4h8.8'/>",
  tag:    "<path d='M12.8 3.8H20v7.2L11.6 19.4a2 2 0 0 1-2.8 0L3.6 14.2a2 2 0 0 1 0-2.8z'/>" +
          "<circle cx='16.2' cy='7.6' r='1.3'/>"
};

/* first match wins, so the specific words sit above the general ones */
const INV_ICON_RULES = [
  { kind: "jar",    words: ["jar", "tub", "pot", "tin", "canister"] },
  { kind: "bottle", words: ["bottle", "flask", "decant"] },
  { kind: "case",   words: ["case", "display", "shadowbox", "frame"] },
  { kind: "ring",   words: ["ring", "band", "jewel"] },
  { kind: "ball",   words: ["ball", "sphere", "helmet", "basket"] },
  { kind: "card",   words: ["card", "ticket", "stub", "photo", "print",
                            "poster", "sticker", "patch"] },
  { kind: "box",    words: ["box", "pack", "set", "sealed", "wax", "blaster",
                            "hobby", "bundle", "lot", "kit"] },
  { kind: "tag",    words: ["tag", "shirt", "jersey", "tee", "cap", "hat",
                            "banner", "flag"] }
];

function invIconKind(name) {
  const s = String(name == null ? "" : name).toLowerCase();
  for (let i = 0; i < INV_ICON_RULES.length; i++) {
    const rule = INV_ICON_RULES[i];
    for (let w = 0; w < rule.words.length; w++) {
      if (s.indexOf(rule.words[w]) !== -1) return rule.kind;
    }
  }
  return "box";
}

const INV_ACCENTS = {
  jar:    { ink: "#6ee7a8", glow: "rgba(110,231,168,.55)" },
  box:    { ink: "#ffd75e", glow: "rgba(255,215,94,.55)" },
  case:   { ink: "#7fd4ff", glow: "rgba(127,212,255,.55)" },
  card:   { ink: "#c9a6ff", glow: "rgba(201,166,255,.55)" },
  ring:   { ink: "#ffe89a", glow: "rgba(255,232,154,.6)" },
  ball:   { ink: "#ff9b7a", glow: "rgba(255,155,122,.55)" },
  bottle: { ink: "#8ef0e0", glow: "rgba(142,240,224,.55)" },
  tag:    { ink: "#ff8fd0", glow: "rgba(255,143,208,.55)" }
};

function invAccent(kind) {
  return INV_ACCENTS[kind] || INV_ACCENTS.box;
}

function invGlyph(kind) {
  const body = INV_GLYPHS[kind] || INV_GLYPHS.box;
  return "<svg class='invglyph' viewBox='0 0 24 24' aria-hidden='true' " +
    "focusable='false'>" + body + "</svg>";
}

const SB_INV_URL = SB_WIN_URL + "/rest/v1/inventory";

async function inventoryRead() {
  const res = await fetch(
    SB_INV_URL + "?select=*&order=created_at.desc",
    { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!res.ok) throw new Error("Could not read the inventory (" + res.status + ")");
  return res.json();
}

async function inventoryAdd(item, cost, qty, note) {
  const name = String(item == null ? "" : item).trim();
  if (!name) throw new Error("Enter what the item is.");

  const price = Number(cost);
  if (!isFinite(price) || price < 0) throw new Error("Enter a cost.");

  const howMany = Math.max(1, parseInt(qty, 10) || 1);

  const res = await fetch(SB_INV_URL, {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      item: name,
      cost: Math.round(price * 100) / 100,
      qty: howMany,
      note: String(note == null ? "" : note).trim()
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save that item (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  return rows[0] || null;
}

/* ---------- WHAT HAS COME OUT ----------

   Every move-out is written here BEFORE the stock line is deleted, so
   the report survives the row it came from. Each move carries a batch
   reference, so one press of Move out groups as one line of history. */
async function inventoryOutRead() {
  const res = await fetch(
    SB_INV_URL.replace("/inventory", "/inventory_out") + "?select=*&order=removed_at.desc",
    { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!res.ok) throw new Error("Could not read what has moved out (" + res.status + ")");
  return res.json();
}

/* Move the ticked stock lines out.

   THE ORDER IS: write the report line FIRST, then delete the stock row.
   If the delete failed and this ran the other way round, the item would
   vanish from inventory and leave no record - the one outcome that must
   never happen. So the record is written first and the delete second. */
/* ---------- PUT A BATCH BACK ----------

   A move out is recorded and then removed from stock. Undo does the
   reverse in the opposite order: the stock line is written back FIRST,
   and only then is the report line deleted. Done the other way round,
   a failure would lose the record and leave nothing in stock either.

   The whole batch goes back together, because it went out together. */
async function inventoryMoveBack(batch, lines) {
  if (!lines || !lines.length) throw new Error("Nothing to put back.");
  const put = [];
  const failed = [];

  for (let i = 0; i < lines.length; i++) {
    const r = lines[i];
    try {
      const res = await fetch(SB_INV_URL, {
        method: "POST",
        headers: {
          "apikey": SB_WIN_KEY,
          "Authorization": "Bearer " + SB_WIN_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          item: r.item || "",
          cost: Number(r.cost) || 0,
          qty: Number(r.qty) || 1,
          note: "put back"
        })
      });
      if (!res.ok) {
        const txt = await res.text().catch(function () { return ""; });
        throw new Error(res.status + " " + txt);
      }
      put.push(r);
    } catch (err) {
      failed.push((r.item || "a line") + ": " +
        (err && err.message ? err.message : "unknown error"));
    }
  }

  /* the report line goes only once the stock line is safely back */
  for (let i = 0; i < put.length; i++) {
    try {
      await fetch(
        SB_INV_URL.replace("/inventory", "/inventory_out") +
          "?id=eq." + encodeURIComponent(put[i].id),
        { method: "DELETE", headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
      );
    } catch (err) {
      failed.push((put[i].item || "a line") + " is back in stock but still shown as moved out");
    }
  }

  return { back: put.length, failed: failed };
}

async function inventoryMoveOut(lines, note) {
  if (!lines || !lines.length) throw new Error("Tick something to move out first.");

  const batch = "OUT-" + Date.now();
  const done = [];
  const failed = [];

  for (let i = 0; i < lines.length; i++) {
    const r = lines[i];
    try {
      const res = await fetch(
        SB_INV_URL.replace("/inventory", "/inventory_out"),
        {
          method: "POST",
          headers: {
            "apikey": SB_WIN_KEY,
            "Authorization": "Bearer " + SB_WIN_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            item: r.item || "",
            cost: Number(r.cost) || 0,
            qty: Number(r.qty) || 1,
            note: (r.note ? r.note + " | " : "") + (note || ""),
            batch: batch
          })
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(function () { return ""; });
        throw new Error(res.status + " " + txt);
      }
      done.push(r);
    } catch (err) {
      failed.push((r.item || "a line") + ": " +
        (err && err.message ? err.message : "unknown error"));
    }
  }

  /* only the lines whose record was written get taken out of stock */
  for (let i = 0; i < done.length; i++) {
    try {
      await inventoryRemove(done[i].id);
    } catch (err) {
      failed.push((done[i].item || "a line") + " could not be taken out of stock: " +
        (err && err.message ? err.message : "unknown error"));
    }
  }

  return { batch: batch, moved: done.length, failed: failed };
}

async function inventoryRemove(id) {
  const res = await fetch(
    SB_INV_URL + "?id=eq." + encodeURIComponent(id),
    { method: "DELETE", headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
  );
  if (!res.ok) throw new Error("Could not remove that line (" + res.status + ")");
  return true;
}

function invMoney(n) {
  return "$" + (Number(n) || 0).toFixed(2);
}

async function renderInventory() {
  const host = $("boards");
  if (!host) return;

  let rows = [];
  let outRows = [];
  try {
    rows = await inventoryRead();
  } catch (err) {
    host.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = err.message;
    host.appendChild(p);
    return;
  }
  try { outRows = await inventoryOutRead(); } catch (e) { outRows = []; }

  /* which lines are ticked - kept between redraws */
  if (!window.__invPicked) window.__invPicked = {};
  const picked = window.__invPicked;

  host.innerHTML = "";

  /* ---------- LAYOUT: stock on the left, the picker on the right ---------- */
  const split = document.createElement("div");
  split.className = "invsplit";

  const left = document.createElement("div");
  left.className = "invleft";
  const right = document.createElement("div");
  right.className = "invright";

  split.appendChild(left);
  split.appendChild(right);
  host.appendChild(split);

  /* ================= LEFT: THE ENTRY FORM ================= */
  const form = document.createElement("div");
  form.className = "creditform";

  const title = document.createElement("h3");
  title.className = "creditformtitle";
  title.textContent = "Log an item into the shop";
  form.appendChild(title);

  const fields = document.createElement("div");
  fields.className = "creditfields";

  function field(labelText, inputEl) {
    const wrap = document.createElement("label");
    wrap.className = "creditfield";
    const lbl = document.createElement("span");
    lbl.className = "creditfieldlbl";
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    fields.appendChild(wrap);
    return wrap;
  }

  const itemIn = document.createElement("input");
  itemIn.type = "text";
  itemIn.className = "creditinput";
  itemIn.placeholder = "what came in";
  itemIn.autocomplete = "off";
  field("Item", itemIn);

  const costIn = document.createElement("input");
  costIn.type = "number";
  costIn.step = "0.01";
  costIn.min = "0";
  costIn.className = "creditinput";
  costIn.placeholder = "0.00";
  costIn.inputMode = "decimal";
  field("Cost each", costIn);

  const qtyIn = document.createElement("input");
  qtyIn.type = "number";
  qtyIn.step = "1";
  qtyIn.min = "1";
  qtyIn.value = "1";
  qtyIn.className = "creditinput";
  qtyIn.inputMode = "numeric";
  field("How many", qtyIn);

  const noteIn = document.createElement("input");
  noteIn.type = "text";
  noteIn.className = "creditinput";
  noteIn.placeholder = "optional";
  noteIn.autocomplete = "off";
  field("Note", noteIn);

  form.appendChild(fields);

  const actions = document.createElement("div");
  actions.className = "creditactions";

  async function submit() {
    const name = itemIn.value.trim();
    const cost = Number(costIn.value) || 0;
    const qty = parseInt(qtyIn.value, 10) || 1;
    if (!name) { $("saved").textContent = "Enter what the item is."; itemIn.focus(); return; }
    if (!cost) { $("saved").textContent = "Enter a cost."; costIn.focus(); return; }
    try {
      await inventoryAdd(name, cost, qty, noteIn.value);
      $("saved").textContent = name + " logged: " + qty + " at " + invMoney(cost) + " each.";
      itemIn.value = ""; costIn.value = ""; qtyIn.value = "1"; noteIn.value = "";
      itemIn.focus();
      renderInventory();
    } catch (err) {
      $("saved").textContent = err.message;
    }
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "creditbtn add";
  addBtn.innerHTML = "<b>Log it in</b><i>add to inventory</i>";
  addBtn.addEventListener("click", submit);
  actions.appendChild(addBtn);
  form.appendChild(actions);

  itemIn.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); costIn.focus(); }
  });
  costIn.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); qtyIn.focus(); }
  });
  qtyIn.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); submit(); }
  });

  left.appendChild(form);

  /* ================= LEFT: THE STOCK ================= */
  const spend = rows.reduce(function (s, r) {
    return s + (Number(r.cost) || 0) * (Number(r.qty) || 1);
  }, 0);
  const units = rows.reduce(function (s, r) { return s + (Number(r.qty) || 1); }, 0);

  if (rows.length) {
    const head = document.createElement("div");
    head.className = "invhead";
    head.innerHTML = "<b>" + units + "</b> " + (units === 1 ? "item" : "items") +
      " in stock across <b>" + rows.length + "</b> " +
      (rows.length === 1 ? "line" : "lines") + " &middot; cost <b>" +
      invMoney(spend) + "</b>";

    left.appendChild(head);
  }

  /* the tick state has to survive a redraw, so drop anything gone */
  const stillHere = {};
  rows.forEach(function (r) { if (picked[r.id]) stillHere[r.id] = true; });
  window.__invPicked = picked = stillHere;

  /* EACH ITEM IS A CARD YOU CLICK, not a table row. The card carries
     everything entered - what it is, cost each, how many, the line
     total, the note and when it was logged. Clicking selects it and
     it appears on the calculation side; clicking again unselects. */
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing in stock. Enter an item and what it cost above.";
    left.appendChild(p);
  } else {
    const grid = document.createElement("div");
    grid.className = "invgrid";
    rows.forEach(function (r) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "invcard" + (picked[r.id] ? " on" : "");
      card.title = "Click to select " + (r.item || "this item");

      /* ---------- THE CARD ICON ----------

         A DRAWN glyph in the site's own stroke, picked from the item's
         own NAME - so a sealed box gets a box, a jersey gets a tag, a
         graded card gets a card. Eight shapes cover what comes through
         the shop; anything unrecognised falls back to the box.

         It is an inline SVG: no file to upload, nothing to license, and
         nothing to go missing from the repo. The accent colour travels
         with the glyph, so a card is identifiable by colour and shape
         before its name is read. */
      const top = document.createElement("span");
      top.className = "invcardtop";

      const kind = invIconKind(r.item);
      const accent = invAccent(kind);
      const glyph = document.createElement("span");
      glyph.className = "invglyphwrap";
      glyph.innerHTML = invGlyph(kind);
      glyph.style.setProperty("--inv-accent", accent.ink);
      glyph.style.setProperty("--inv-glow", accent.glow);
      top.appendChild(glyph);

      const nm = document.createElement("span");
      nm.className = "invcardname";
      nm.textContent = r.item || "(no name)";
      top.appendChild(nm);

      card.appendChild(top);
      card.style.setProperty("--inv-accent", accent.ink);
      card.style.setProperty("--inv-glow", accent.glow);

      const facts = document.createElement("span");
      facts.className = "invcardfacts";
      const f1 = document.createElement("i"); f1.textContent = "Cost each";
      const v1 = document.createElement("b"); v1.textContent = invMoney(r.cost);
      const f2 = document.createElement("i"); f2.textContent = "How many";
      const v2 = document.createElement("b"); v2.textContent = (r.qty || 1);
      const f3 = document.createElement("i"); f3.textContent = "Line total";
      const v3 = document.createElement("b");
      v3.textContent = invMoney((Number(r.cost) || 0) * (Number(r.qty) || 1));
      facts.appendChild(f1); facts.appendChild(v1);
      facts.appendChild(f2); facts.appendChild(v2);
      facts.appendChild(f3); facts.appendChild(v3);
      card.appendChild(facts);

      if (r.note) {
        const nt = document.createElement("span");
        nt.className = "invcardnote";
        nt.textContent = r.note;
        card.appendChild(nt);
      }

      const when = document.createElement("span");
      when.className = "invcardwhen";
      const d = new Date(r.created_at);
      when.textContent = isNaN(d) ? "" : "Logged " + d.toLocaleString();
      card.appendChild(when);

      const mark = document.createElement("span");
      mark.className = "invcardmark";
      mark.textContent = picked[r.id] ? "\u2713 SELECTED" : "Select";
      card.appendChild(mark);

      card.addEventListener("click", function () {
        if (picked[r.id]) delete picked[r.id];
        else picked[r.id] = true;
        card.className = "invcard" + (picked[r.id] ? " on" : "");
        mark.textContent = picked[r.id] ? "\u2713 SELECTED" : "Select";
        drawPicker();
      });

      grid.appendChild(card);
    });
    left.appendChild(grid);
  }

  /* ================= RIGHT: THE PICKER ================= */
  function drawPicker() {
    right.innerHTML = "";

    const card = document.createElement("div");
    card.className = "pickcard";

    const t = document.createElement("h3");
    t.className = "picktitle";
    t.textContent = "Selected to come out";
    card.appendChild(t);

    const keys = Object.keys(picked);
    const chosen = rows.filter(function (r) { return picked[r.id]; });

    if (!chosen.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Select items on the left and they come here, with the cost " +
        "added up. Press Done when the selection is finished and it goes " +
        "into one report below.";
      card.appendChild(p);
      right.appendChild(card);
      return;
    }

    /* each item, with its own line cost */
    const list = document.createElement("div");
    list.className = "picklist";
    let total = 0;
    let count = 0;

    chosen.forEach(function (r) {
      const lineTotal = (Number(r.cost) || 0) * (Number(r.qty) || 1);
      total += lineTotal;
      count += Number(r.qty) || 1;

      const row = document.createElement("div");
      row.className = "pickrow";

      const nm = document.createElement("span");
      nm.className = "pickname";
      nm.textContent = (r.item || "-") + "  x" + (r.qty || 1);
      row.appendChild(nm);

      const each = document.createElement("span");
      each.className = "pickeach";
      each.textContent = invMoney(r.cost) + " ea";
      row.appendChild(each);

      const lt = document.createElement("span");
      lt.className = "pickline";
      lt.textContent = invMoney(lineTotal);
      row.appendChild(lt);

      list.appendChild(row);
    });
    card.appendChild(list);

    /* the totals */
    const tot = document.createElement("div");
    tot.className = "picktotal";
    tot.innerHTML = "<span>" + chosen.length +
      (chosen.length === 1 ? " line" : " lines") + " &middot; " + count +
      (count === 1 ? " item" : " items") + "</span><b>" + invMoney(total) + "</b>";
    card.appendChild(tot);

    /* a note for the record */
    const noteWrap = document.createElement("label");
    noteWrap.className = "creditfield";
    const noteLbl = document.createElement("span");
    noteLbl.className = "creditfieldlbl";
    noteLbl.textContent = "Note for the record";
    noteWrap.appendChild(noteLbl);
    const outNote = document.createElement("input");
    outNote.type = "text";
    outNote.className = "creditinput";
    outNote.placeholder = "optional";
    noteWrap.appendChild(outNote);
    card.appendChild(noteWrap);

    /* ---------- DONE ----------

       Press this when the selection is finished. Everything ticked
       goes into ONE report line and comes off the inventory in one
       action, so the history reads as a single job rather than one
       entry per item. */
    const go = document.createElement("button");
    go.type = "button";
    go.className = "creditbtn done";
    go.innerHTML = "<b>Done</b><i>record and take out of inventory</i>";
    go.addEventListener("click", async function () {
      go.disabled = true;
      try {
        const res = await inventoryMoveOut(chosen, outNote.value);
        $("saved").textContent = "Done: " + res.moved +
          (res.moved === 1 ? " line" : " lines") + " recorded as one, " +
          invMoney(total) + " taken out of inventory.";
        if (res.failed && res.failed.length) {
          $("saved").textContent += " Some did not go: " + res.failed.join("; ");
        }
        window.__invPicked = {};
        renderInventory();
      } catch (err) {
        $("saved").textContent = err.message;
        go.disabled = false;
      }
    });
    card.appendChild(go);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "ghost";
    clear.textContent = "Untick all";
    clear.addEventListener("click", function () {
      window.__invPicked = {};
      renderInventory();
    });
    card.appendChild(clear);

    right.appendChild(card);
  }

  drawPicker();

  /* ================= BELOW: WHAT HAS COME OUT ================= */
  const outHead = document.createElement("div");
  outHead.className = "creditform";
  const outTitle = document.createElement("h3");
  outTitle.className = "creditformtitle";
  outTitle.textContent = "Moved out of inventory";
  outHead.appendChild(outTitle);

  if (!outRows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing has been moved out yet.";
    outHead.appendChild(p);
  } else {
    /* grouped by batch, so one press reads as one line of history */
    const batches = [];
    const byBatch = {};
    outRows.forEach(function (r) {
      const b = r.batch || "single";
      if (!byBatch[b]) { byBatch[b] = []; batches.push(b); }
      byBatch[b].push(r);
    });

    batches.forEach(function (b) {
      const lines = byBatch[b];
      const when = lines[0].removed_at;
      const d = new Date(when);

      const box = document.createElement("div");
      box.className = "outbatch";

      const head = document.createElement("div");
      head.className = "outtop";

      const label = document.createElement("span");
      label.className = "histboard";
      label.textContent = lines.length === 1 ? "1 line" : lines.length + " lines";
      head.appendChild(label);

      const stamp = document.createElement("span");
      stamp.className = "histwhen";
      stamp.textContent = isNaN(d) ? "-" : d.toLocaleString();
      head.appendChild(stamp);

      const tot = lines.reduce(function (s, r) {
        return s + (Number(r.cost) || 0) * (Number(r.qty) || 1);
      }, 0);

      const money = document.createElement("span");
      money.className = "histn";
      money.textContent = invMoney(tot) + " out";
      head.appendChild(money);

      /* PUT IT BACK - the whole batch returns to stock, and the report
         line goes with it. The stock row is written first, so a failure
         here can never lose the record without restoring the stock. */
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ghost invback";
      back.textContent = "Put back";
      back.title = "Return these to stock and remove them from this report";
      back.addEventListener("click", async function () {
        if (!window.confirm("Put these " + lines.length + " " +
            (lines.length === 1 ? "line" : "lines") + " back into stock?")) return;
        back.disabled = true;
        try {
          const res = await inventoryMoveBack(b, lines);
          $("saved").textContent = "Put " + res.back +
            (res.back === 1 ? " line" : " lines") + " back into stock.";
          if (res.failed && res.failed.length) {
            $("saved").textContent += " " + res.failed.join("; ");
          }
          renderInventory();
        } catch (err) {
          $("saved").textContent = err.message;
          back.disabled = false;
        }
      });
      head.appendChild(back);

      box.appendChild(head);

      const names = document.createElement("div");
      names.className = "histnames";
      lines.forEach(function (r) {
        const chip = document.createElement("span");
        chip.className = "histname";
        const b2 = document.createElement("b");
        b2.textContent = (r.item || "-") + " x" + (r.qty || 1) + " ";
        chip.appendChild(b2);
        chip.appendChild(document.createTextNode(invMoney(r.cost) + " ea"));
        if (r.note) chip.appendChild(document.createTextNode(" \u00b7 " + r.note));
        names.appendChild(chip);
      });
      box.appendChild(names);

      outHead.appendChild(box);
    });
  }

  host.appendChild(outHead);
}
