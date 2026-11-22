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
    body: JSON.stringify({ username: personName(name), source: source, run_id: runId || "legacy" })
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

/* ---------- RETIRED: THE BOARD-WIDE RECONCILE ----------

   This function walked every box on the boards and paid out entries to
   match. It is gone, and the reason is the bug you saw.

   It wrote with gwAdd, which is the MANUAL-entry helper: its rows carry
   no run_id and no cap, so it could pay a person again every time it
   ran, for boxes that had already paid. Its count also used
   gwStoredCount, a bare tally of rows by name - so a stale row from an
   earlier break read as "already have this one", the count never
   settled, and a person with one Pairs box could hold a hand of
   entries.

   Nothing called it any more, so it could not cause harm where it sat -
   but leaving a per-box payer in the file is how this comes back the
   next time somebody wires it up. The earn on commit is the single
   writer now, and it counts boxes before it writes. */

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

/* ---------- WHO IS THIS PERSON? ----------

   ONE RULE, USED EVERYWHERE A NAME IS READ.

   A box typed as  buyer$item  names the BUYER before the $ and the ITEM
   won after it. That is the whole convention. So the person on a box is
   whatever comes BEFORE the first $, upper-cased, with the spaces tidied.

   This is the fix for both faults at once:

     PAIRS COUNTING - "DAVID ZYC" and "DAVID ZYC$JD5" were two different
     people, so neither ever reached the two boxes that earn an entry and
     the entry was never written.

     WIN LOGGING   - the win was written with the buyer as "DAVID ZYC$JD5"
     and the item as "JD5", so it reached the Winners page as a name that
     matched nobody.

   With this, both read the same person, and a $ still sends its item to
   the Winners page. */
/* ---------- WHICH BOARD A BOX BELONGS TO ----------

   Called in four places below - the entry earn, the giveaway count, the
   winners tally, and the board reconcile - and it was missing from the
   file entirely, so every call threw `giveawayBoardOf is not defined`.

   THAT IS THE TEAMS BUG. The Teams commit path reaches this call BEFORE
   it reaches the win write, so a $item typed on the Teams board saved
   the name and then died one step short of logging the win. The Pairs
   board commits on its own path, past this call, which is why wins
   worked there and not on Teams.

   DIVISIONS ANSWER null FIRST, and that ordering matters: "afc-east"
   contains a hyphen, so testing for a hyphen before testing for a
   division would file every division box under Pairs. */
/* ---------- HOW MANY ENTRIES A PERSON IS OWED ----------

   Counted from boxes held, never from the act of typing:

     pairs - one entry for every TWO boxes held
     teams - one entry for every box held
     anything else - no giveaway at all

   This was called in two places and defined in NONE, so both callers
   threw `giveawayRate is not defined`: the earn on commit, and the
   reconcile. It lives next to giveawayBoardOf because the two always
   travel together - one says which board a box belongs to, the other
   says what that board pays. */
function giveawayRate(boardId, boxes) {
  const n = Number(boxes) || 0;
  if (n < 0) return 0;
  if (boardId === "pairs") return Math.floor(n / 2);
  if (boardId === "teams") return n;
  return 0;
}

/* ---------- WHICH BOARD A BOX BELONGS TO ----------

   THIS WAS THE PAIRS BUG. It tested for a HYPHEN, on the reasoning
   that a Pairs box is named like "bills-jets". A hyphen is the LOGO
   FILENAME, not the box name. What the board actually stores is the
   name as boards.js defines it:

       "Seahawks, Chargers"    "Bengals, Colts"    "49ers, Bears"

   comma and space - so EVERY pairs box fell through to "teams" and
   paid ONE ENTRY PER BOX instead of one per two. That is why a single
   pairs box paid out, and why the count never matched the rule.

   The board is decided by the NAME now, matched against the same list
   the board is drawn from. Divisions are checked first, so a division
   name can never be read as a pair. */
const GIV_PAIR_NAMES = [
  "Cowboys, Jags","Chiefs, Cardinals","Broncos, Saints","Eagles, Panthers",
  "Vikings, Titans","Packers, Falcons","Seahawks, Chargers","Bucs, Commanders",
  "Ravens, Rams","Patriots, Browns","49ers, Bears","Lions, Raiders",
  "Bengals, Colts","Bills, Jets","Steelers, Texans","Dolphins, Giants"
];

function giveawayBoardOf(targetId) {
  const id = String(targetId == null ? "" : targetId).trim();
  if (!id) return null;

  /* divisions feed no giveaway - answered before anything else */
  const low = id.toLowerCase();
  if (low.indexOf("afc") === 0 || low.indexOf("nfc") === 0) return null;

  /* a Pairs box is one of the sixteen pairs, by name */
  const tidy = low.replace(/\s+/g, " ");
  for (let i = 0; i < GIV_PAIR_NAMES.length; i++) {
    if (GIV_PAIR_NAMES[i].toLowerCase() === tidy) return "pairs";
  }

  /* a name carrying a comma is still a pair, even if the list above
     has not caught it - a new pair added later must not become teams */
  if (id.indexOf(",") !== -1) return "pairs";

  return "teams";
}

function personKey(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/^@/, "");
  const before = text.split("$")[0];
  return before.trim().toUpperCase();
}

/* the name as it should be DISPLAYED - the buyer part, in its own case */
function personName(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/^@/, "");
  return text.split("$")[0].trim();
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
/* ---------- SAVING A BOARD TO HISTORY ----------

   Every reset with a board's own Reset button writes the board down
   BEFORE a single row is deleted, so the snapshot holds it exactly as it
   stood when Reset was pressed.

   One row in public.board_history per reset: which board, when, how many
   people, and the whole board as JSON - each entry naming the BOX and the
   NAME, which is what lets History show who sat on which team or pair.

   A FAILED SAVE IS REPORTED, never swallowed. A reset that quietly lost
   the night would be worse than one that refused to run. */
async function saveBoardHistory(board, doomed) {
  const snapshot = doomed.map(function (e) {
    return { box: e.target, name: e.username };
  });

  try {
    const res = await fetch(SB_WIN_URL + "/rest/v1/board_history", {
      method: "POST",
      headers: {
        "apikey": SB_WIN_KEY,
        "Authorization": "Bearer " + SB_WIN_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        board_id: board.id,
        board_label: board.label,
        people: snapshot.length,
        snapshot: snapshot
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(function () { return ""; });
      throw new Error("(" + res.status + ") " + txt);
    }
  } catch (err) {
    $("saved").textContent = "Could NOT save " + board.label +
      " to History: " + (err && err.message ? err.message : "unknown error");
    return false;
  }
  return true;
}

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

  /* HISTORY sits last, after the boards. It is not in BOARDS because it
     has no boxes to draw - but it belongs on the same row of tabs. */
  const hist = document.createElement("button");
  hist.type = "button";
  hist.dataset.viewBtn = "history";
  hist.setAttribute("role", "tab");
  hist.textContent = "History";
  hist.addEventListener("click", function () { setTab("history"); });
  nav.appendChild(hist);

  /* CREDIT sits last - control side only. Not in BOARDS: it shows
     balances, not boxes, so it is handled like History. */
  const cred = document.createElement("button");
  cred.type = "button";
  cred.dataset.viewBtn = "credit";
  cred.setAttribute("role", "tab");
  cred.textContent = "Credit";
  cred.addEventListener("click", function () { setTab("credit"); });
  nav.appendChild(cred);

  /* INVENTORY - control side only. What has been bought into the shop,
     and what it cost. Hand-entered, like Credit. */
  const inv = document.createElement("button");
  inv.type = "button";
  inv.dataset.viewBtn = "inventory";
  inv.setAttribute("role", "tab");
  inv.textContent = "Inventory";
  inv.addEventListener("click", function () { setTab("inventory"); });
  nav.appendChild(inv);
}

function setCompact(on) {
  const wrap = document.querySelector(".wrap");
  if (wrap) wrap.classList.toggle("compact", !!on);
  const head = document.querySelector("header");
  if (head) head.classList.toggle("compact", !!on);
}

function setTab(tabId) {
  /* THE HISTORY TAB IS NOT A BOARD. It has no boxes, nothing to type on
     and nothing to reset, so it is handled before the board lookups -
     which would otherwise fall through to the first board and draw that
     instead. */
  if (tabId === "history") {
    currentTab = "history";
    setCompact(false);

    document.querySelectorAll("[data-view-btn]").forEach(function (b) {
      const on = b.dataset.viewBtn === "history";
      b.className = on ? "on" : "";
      b.setAttribute("aria-selected", on ? "true" : "false");
    });

    $("boardTitle").textContent = "History";
    $("boardSub").textContent = "Every board written down when it was reset, newest first.";
    $("filter").value = "";

    /* THE TOOLBAR IS LEFT ALONE HERE.

       This used to disable Reset board, Download CSV and Hide all while
       the History tab was open and re-enable them on the way out - and
       that is what greyed out the Reset Giveaway button for good. The
       giveaway carries its OWN button on the board heading, plus the
       toolbar one; only the toolbar one was being disabled, so the two
       could disagree and one stayed dead after a visit to History.

       Nothing is disabled now. The toolbar buttons already stand down by
       themselves where they do not apply - the toolbar Reset says so in
       words on a stacked tab, and History has no boxes to draw so there
       is nothing there to reset anyway. */
    $("saved").textContent = "";
    historyLoad().then(function () { renderHistory(); });
    return;
  }

  /* THE CREDIT TAB IS NOT A BOARD EITHER. It lists balances and the
     controls to move them, so it is handled before the board lookups -
     which would otherwise fall through to the first board. */
  if (tabId === "credit") {
    currentTab = "credit";
    setCompact(false);

    document.querySelectorAll("[data-view-btn]").forEach(function (b) {
      const on = b.dataset.viewBtn === "credit";
      b.className = on ? "on" : "";
      b.setAttribute("aria-selected", on ? "true" : "false");
    });

    $("boardTitle").textContent = "Credit";
    $("boardSub").textContent = "Customer credit, entered by hand. Add or remove at will.";
    $("filter").value = "";
    $("saved").textContent = "";
    renderCredit();
    return;
  }

  /* INVENTORY IS NOT A BOARD EITHER. It lists stock bought into the
     shop, so it is handled like History and Credit - before the board
     lookups, which would otherwise fall through to the first board. */
  if (tabId === "inventory") {
    currentTab = "inventory";
    setCompact(false);
    document.querySelectorAll("[data-view-btn]").forEach(function (b) {
      const on = b.dataset.viewBtn === "inventory";
      b.className = on ? "on" : "";
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("boardTitle").textContent = "Inventory";
    $("boardSub").textContent = "Stock bought into the shop, and what it cost.";
    $("filter").value = "";
    $("saved").textContent = "";
    renderInventory();
    return;
  }

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

/* Live updates for the stored giveaway entries. Defined in this file when
   sb-client.js does not provide it, so the boards can never fail to boot
   because one name is missing. */
if (typeof sbWatchGiveaway !== "function" && typeof sbWatchTable === "function") {
  window.sbWatchGiveaway = function (onChange) {
    return sbWatchTable("realtime:giveaway_entries", "giveaway_entries", onChange);
  };
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

  /* THE BOX SHOWS THE TEAM'S LOGO, NOT ITS INITIALS.

     t.image comes from boards.js, which builds logos/<city>-<nickname>.png
     for every box. The team colour stays behind it so a logo that has not
     been uploaded yet still leaves a coloured plate rather than a hole.

     If the file is missing, the img simply fails to load and the initials
     are NOT used - the coloured box stands on its own. Nothing falls back
     to letters. */
  const eb = document.createElement("div");
  eb.className = "eb";
  eb.style.background = t.colors[0];

  if (t.image) {
    const logo = document.createElement("img");
    logo.className = "teamlogo";
    logo.src = t.image;
    logo.alt = t.name;
    logo.loading = "lazy";
    logo.decoding = "async";
    /* a missing file leaves the plate clean - no broken-image icon */
    logo.addEventListener("error", function () { logo.remove(); });
    eb.appendChild(logo);
  }
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

  /* THE LOGO ITSELF IS THE TARGET.

     Clicking the emblem must do the obvious thing: if the box is free, put
     the cursor in its field so a name can be typed; if it is taken, open the
     edit panel. The whole plate is the click target, not just the strip at
     the bottom, so the logo reads as the button. */
  function plateClick(ev) {
    if (ev.target.closest && ev.target.closest(".addbar")) return;
    if (usersOn(t.id).length) { openPanel(); return; }
    const box = tile.querySelector(".addbar input");
    if (box) box.focus();
  }
  eb.addEventListener("click", plateClick);
  buyer.addEventListener("click", plateClick);

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

  /* ONE RESET PER TAB, AND NO MORE.

     The Pairs tab also carries the Divisions board underneath it, so
     giving every board its own button put two of them on that screen
     and made it unclear which one you were pressing - and the one you
     wanted, Pairs, was not the one that ran.

     Now the button belongs to the board that OWNS the tab: Pairs gets
     the only button on its screen, and it clears all 16 Pairs boxes.
     A board merely stacked underneath gets none. */
  if (b.stackedUnder) return head;

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "boardreset";
  reset.id = "resetFor_" + b.id;
  reset.dataset.resetFor = b.id;
  reset.textContent = "Reset " + (b.resetLabel || b.label);
  reset.title = b.resetTitle || ("Remove every username from the " + b.label + " boxes");
  reset.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    resetBoard(b.id);
  });
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
  /* COUNT THE STORED ROWS, AND NOTHING ELSE.

     Every entry is a row in public.giveaway_entries, written the moment
     it was earned. The board rows on Teams and Pairs are NOT read here
     any more - that is the whole point: once an entry is stored, no
     board can take it away. Reset Pairs empties the Pairs boxes and the
     draw does not move.

     A row whose source is "manual" came from the box on the giveaway
     board itself, and only those carry a Remove. */
  /* ---------- ONE PERSON, ONE TILE ----------

     Rows were grouped by the RAW name, case included - so "THIN",
     "Thin" and "thin" drew three tiles, and the same person appeared
     under "MIKE THE GOAT", "MikeTheGoat" and "MIKETHEGOAT". The board
     showed 27 tiles for far fewer people and the counts looked wrong
     because each tile held only part of a person.

     Grouping is now on personKey - trimmed, spaces tidied, upper-cased
     - so every spelling of one person lands on one tile. The name SHOWN
     is the tidied form too, so the tile reads the same on every device
     rather than depending on whichever row was written first. */
  const perPerson = {};
  const shown = {};
  giveawayRows.forEach(function (r) {
    const key = personKey(r.username);
    if (!key) return;
    if (!perPerson[key]) {
      perPerson[key] = { stored: 0, manual: 0, ids: [], manualIds: [] };
      shown[key] = personName(r.username);
    }
    perPerson[key].stored += 1;
    perPerson[key].ids.push(r.id);
    if (r.source === "manual") {
      perPerson[key].manual += 1;
      perPerson[key].manualIds.push(r.id);
    }
  });

  const out = Object.keys(perPerson).map(function (key) {
    const c = perPerson[key];
    return {
      key: key,
      name: shown[key] || key,
      count: c.stored,
      earned: c.stored - c.manual,
      manual: c.manual,
      ids: c.ids,
      manualIds: c.manualIds,
      index: 0
    };
  });

  out.sort(function (x, y) {
    if (y.count !== x.count) return y.count - x.count;
    return x.name.localeCompare(y.name);
  });

  out.forEach(function (entry, i) { entry.index = i; });
  return out;
}

/* The flat list for the wheel: one name per ENTRY, so a person with
   three entries holds three wedges and three times the odds. */
function giveawayDraw() {
  const out = [];
  giveawayEntries().forEach(function (person) {
    for (let i = 0; i < person.count; i++) out.push(person.name);
  });
  return out;
}

/* One giveaway tile: a name, and a Remove button on the manual ones.

   `manualId` is the row id when this entry was typed by hand, so it can
   be taken back out. An entry earned from Teams or Pairs has no id of
   its own - it disappears when the name comes off that board - so it
   gets no Remove button. */
function buildGiveawayTile(person) {
  const name = person.name;
  const tile = document.createElement("div");
  tile.className = "tile givetile";
  tile.dataset.target = "giveaway:" + name;
  tile.dataset.search = String(name).toLowerCase();

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = person.index + 1;
  tile.appendChild(badge);

  const eb = document.createElement("div");
  eb.className = "eb";
  eb.style.background = "#2b303c";
  const initials = document.createElement("span");
  initials.className = "initials";
  initials.textContent = String(name).slice(0, 2).toUpperCase();
  eb.appendChild(initials);

  /* how many entries they hold, big and gold, right on the emblem */
  const count = document.createElement("span");
  count.className = "givcount";
  count.textContent = person.count;
  count.title = person.count + (person.count === 1 ? " entry" : " entries") + " in the draw";
  eb.appendChild(count);
  tile.appendChild(eb);

  const buyer = document.createElement("div");
  buyer.className = "buyer";
  const buylbl = document.createElement("span");
  buylbl.className = "buylbl";
  buylbl.textContent = person.count === 1 ? "1 entry" : person.count + " entries";
  buyer.appendChild(buylbl);
  const names = document.createElement("span");
  names.className = "buynames";
  const line = document.createElement("span");
  line.className = "buyname";
  line.textContent = name;
  names.appendChild(line);
  buyer.appendChild(names);

  /* where the entries came from, in plain words */
  const bits = [];
  if (person.teams) bits.push(person.teams + " team");
  if (person.pairs) bits.push(person.pairs + (person.pairs === 1 ? " pair" : " pairs"));
  if (person.manual) bits.push(person.manual + " added");
  if (bits.length) {
    const from = document.createElement("span");
    from.className = "givfrom";
    from.textContent = bits.join(" + ");
    buyer.appendChild(from);
  }

  /* ---------- THE ENTRY CONTROLS ----------

     Adjust this person's entry count by hand, right on their box: one
     more, or one back. This is the giveaway side only - it writes and
     removes rows with source "manual", so it never disturbs an entry
     earned on Teams or Pairs.

     These sit on the giveaway tile because this is the giveaway board.
     The credit controls are NOT here - credit is its own manual tab
     and has nothing to do with the draw. */
  const adjust = document.createElement("div");
  adjust.className = "gwadjust";

  const amount = document.createElement("input");
  amount.type = "number";
  amount.step = "1";
  amount.min = "1";
  amount.value = "1";
  amount.className = "gwamt";
  amount.inputMode = "numeric";
  amount.title = "How many entries to add or take away";
  amount.addEventListener("click", function (ev) { ev.stopPropagation(); });
  adjust.appendChild(amount);

  async function move(sign) {
    const n = Math.abs(parseInt(amount.value, 10)) || 1;
    $("saved").textContent = (sign > 0 ? "Adding " : "Taking away ") +
      n + (n === 1 ? " entry" : " entries") + "...";
    try {
      if (sign > 0) await gwAdjustPlus(name, n);
      else await gwAdjustMinus(name, n);
      gwRedraw();
      $("saved").textContent = name + " now holds " + gwCountFor(name) +
        (gwCountFor(name) === 1 ? " entry" : " entries") + ".";
    } catch (err) { $("saved").textContent = err.message; }
  }

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "gwbtn minus";
  minus.textContent = "\u2212";
  minus.title = "Take entries away from " + name;
  minus.addEventListener("click", function (ev) {
    ev.stopPropagation(); ev.preventDefault(); move(-1);
  });
  adjust.appendChild(minus);

  const more = document.createElement("button");
  more.type = "button";
  more.className = "gwbtn plus";
  more.textContent = "+";
  more.title = "Add entries for " + name;
  more.addEventListener("click", function (ev) {
    ev.stopPropagation(); ev.preventDefault(); move(1);
  });
  adjust.appendChild(more);

  buyer.appendChild(adjust);

  tile.appendChild(buyer);

  /* NO PER-ENTRY REMOVE.

     Each giveaway tile used to carry a Remove button for hand-typed
     entries. That is now gone on purpose: Reset Giveaway is the one and
     only thing that takes an entry out of the draw, so nobody can trim
     the draw one tile at a time by mistake. The count and the source
     line stay, so you can still see what each person holds. */

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
      await gwAdd(name, "manual");
    } catch (err) {
      note.textContent = "Could not add that entry: " + err.message;
      return;
    }

    input.value = "";
    renderBoards();
    renderEntries();
    if (typeof renderWinners === "function") renderWinners();
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

  /* ---------- COUNT FROM THE DATABASE, NOT FROM MEMORY ----------

     THE OLD FIRST LINE WAS THE BUG:

         if (!giveawayRows.length) { ... "already empty" ... return; }

     giveawayRows is filled by gwLoad(), which runs at startup and on a
     timer. Press the button before that has landed - a fresh load, a
     slow connection - and the array is still empty while the board on
     screen plainly shows hundreds of entries. The function then said
     "already empty" and did nothing, which is exactly what a dead
     button looks like.

     So the count is read fresh here, at the moment of the press. */
  note.textContent = "Reading the draw\u2026";
  await gwLoad();

  let live = [];
  try {
    const res = await fetch(
      SB_GIVEAWAY_URL + "?select=id",
      { headers: { "apikey": SB_WIN_KEY, "Authorization": "Bearer " + SB_WIN_KEY } }
    );
    if (!res.ok) throw new Error("(" + res.status + ")");
    live = await res.json();
  } catch (err) {
    note.textContent = "Could not read the draw: " +
      (err && err.message ? err.message : "unknown error");
    return;
  }

  if (!live.length) {
    note.textContent = "The giveaway is already empty.";
    return;
  }

  if (!confirm("Remove all " + live.length + " entries from the giveaway?" +
    String.fromCharCode(10, 10) +
    "The boards are not touched. This is the ONLY way an entry leaves the draw.")) {
    note.textContent = "";
    return;
  }

  /* ---------- ONE REQUEST, NOT ONE PER ROW ----------

     This used to delete each row on its own, so a draw of 257 entries
     meant 257 sequential requests: many seconds of a button that gave
     no sign of life, and a partial failure if the connection blinked
     halfway. PostgREST can delete the lot in a single call, and the
     message says so while it runs. */
  note.textContent = "Removing " + live.length + " entries from the draw\u2026";

  try {
    const res = await fetch(SB_GIVEAWAY_URL + "?id=not.is.null", {
      method: "DELETE",
      headers: {
        "apikey": SB_WIN_KEY,
        "Authorization": "Bearer " + SB_WIN_KEY
      }
    });
    if (!res.ok) {
      const txt = await res.text().catch(function () { return ""; });
      throw new Error("(" + res.status + ") " + txt);
    }
  } catch (err) {
    note.textContent = "Could not clear the draw: " +
      (err && err.message ? err.message : "unknown error");
    return;
  }

  await gwLoad();
  refreshBoards();
  renderEntries();
  if (typeof renderWinners === "function") renderWinners();

  note.textContent = "Took all " + live.length + " entries out of the draw.";
}
/* ---------- THE SPIN WHEEL ----------

   A real wheel, drawn on a canvas. One wedge per entry in the draw, so
   somebody with three entries holds three wedges and three times the
   odds. It reads the SAME list the tiles are built from, so the wheel
   and the board can never disagree about who is in the draw.

   The pointer sits at the top. The wheel spins, slows, and stops under
   it; the winner is the name whose wedge landed there. */

/* THE WHEEL PALETTE.

   Taken from the TKS Breakz mark: deep space navy and violet, the two
   neon rails (blue and magenta), and brushed gold. Sixteen tones so
   neighbouring wedges never repeat, which is what stops a busy wheel
   reading as one muddy disc. */
const WHEEL_COLOURS = [
  "#1d3f7a", "#8a1f6d", "#c9a227", "#17707d",
  "#5a2a8f", "#a8412c", "#2f6fa8", "#b8860b",
  "#3f2a6e", "#1f6b4a", "#9b1c4a", "#276bb5",
  "#7a4a12", "#2a4f8a", "#6d2b7a", "#0f6f7a"
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

  /* ---------- THE HUB ----------

     The transparent TKS mark sits at the centre of the wheel, and the
     whole hub is the SPIN button. The mark is loaded from the repo root
     and laid over a gold disc, so it reads as a seal on the axle rather
     than a logo dropped on top.

     If the file cannot load, the word SPIN stands in - the button still
     works either way. */
  const hub = document.createElement("button");
  hub.type = "button";
  hub.className = "wheelhub";
  hub.title = "Spin the wheel to pick a winner";

  const hubImg = document.createElement("img");
  hubImg.className = "wheelhubimg";
  hubImg.alt = "Spin";
  hubImg.src = "tks-mark.svg";
  hubImg.addEventListener("error", function () {
    hubImg.remove();
    const word = document.createElement("span");
    word.className = "wheelhubword";
    word.textContent = "SPIN";
    hub.appendChild(word);
  });
  hub.appendChild(hubImg);
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
    const drawn = giveawayDraw();
    const n = drawn.length;
    if (!n) return [];
    const step = (Math.PI * 2) / n;
    return drawn.map(function (who, i) {
      return {
        name: who,
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

    /* a rim of deep space behind everything, so the gold ring sits on it */
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = "#0a1024";
    ctx.fill();

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

    /* ---------- THE NAMES, ON EVERY WEDGE ----------

       THE MIDDLE SMEAR. Names used to be written radially when they did
       not fit their slice - turned outward and run from the hub to the
       rim. On a busy wheel several long names did that at once and all
       of them crossed the centre, stacking into an unreadable white
       block in the middle of the wheel.

       NOTHING IS DRAWN THROUGH THE CENTRE NOW. Every label lies ALONG
       its own wedge, at a radius where the slice is wide enough to hold
       it:
         - a wide slice keeps a full-size name out near the rim;
         - a narrow one steps the name outward, where the slice is wider;
         - the font shrinks to fit, with a 7px floor;
         - and a name too long even then is trimmed with an ellipsis.

       A label never starts inside r*0.42, so the hub stays clear. */
    list.forEach(function (seg) {
      const share = seg.end - seg.start;          /* slice width, radians */
      const mid = (seg.start + seg.end) / 2 + angle;

      /* how far out the name has to sit for its slice to be wide enough */
      const need = 22;                            /* px of height a line wants */
      let radius = Math.min(r - 16, Math.max(r * 0.46, need / share));

      /* the font follows the room available at that radius */
      let size = Math.max(7, Math.min(16, Math.round(share * radius / 0.72)));
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      let label = seg.name;
      let font = "700 " + size + "px Inter, system-ui, sans-serif";
      ctx.font = font;

      let width = ctx.measureText(label).width;
      const room = radius - r * 0.42;             /* usable run of the label */

      if (width > room) {
        /* trim the name, never move it inward */
        let cut = label.length;
        while (cut > 3 && ctx.measureText(label.slice(0, cut) + "\u2026").width > room) cut--;
        label = label.slice(0, cut) + "\u2026";
        width = ctx.measureText(label).width;
      }

      /* a soft dark shadow so the name reads on any wedge colour */
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillText(label, radius + 1, 1);
      ctx.fillStyle = "#fdf6df";
      ctx.fillText(label, radius, 0);

      ctx.restore();
    });

    /* ---------- THE RIM ----------

       Two bands: a wide gold outer ring with a soft glow behind it, and
       a thin bright inner line. That is the gold metal from the TKS mark,
       and it is what makes the wheel read as part of the site rather than
       a flat chart wheel. */
    ctx.save();
    ctx.shadowColor = "rgba(255,205,90,.55)";
    ctx.shadowBlur = 26;

    ctx.beginPath();
    ctx.arc(r, r, r - 5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,80,255,.35)";
    ctx.lineWidth = 16;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(r, r, r - 8, 0, Math.PI * 2);
    const rim = ctx.createLinearGradient(0, 0, 0, w);
    rim.addColorStop(0, "#fff3c4");
    rim.addColorStop(0.42, "#e8bf5c");
    rim.addColorStop(1, "#8a6410");
    ctx.strokeStyle = rim;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();

    /* a thin neon line inside the gold, so the wedges sit in a lit ring */
    ctx.beginPath();
    ctx.arc(r, r, r - 15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(63,208,255,.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* ---------- THE GLASS DOME ----------

       A soft highlight across the top half, so the wheel looks lit from
       above rather than painted flat. */
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 17, 0, Math.PI * 2);
    ctx.clip();
    const dome = ctx.createLinearGradient(0, 0, 0, w);
    dome.addColorStop(0, "rgba(255,255,255,.20)");
    dome.addColorStop(0.45, "rgba(255,255,255,.05)");
    dome.addColorStop(1, "rgba(0,0,0,.28)");
    ctx.fillStyle = dome;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();

    /* ---------- THE POINTER ----------

       IT SITS AT THE TOP, because that is where the winner is READ.

       windowAt() resolves the winning wedge from the angle at 12 o'clock
       (-90 degrees). The arrow was drawn at 3 o'clock, so it appeared to
       mark a different slot from the one the code chose. Point and result
       disagreed on screen even though the maths was right.

       A gold arrow hangs at the top, its POINT aimed DOWN into the rim.
       The point is the marker - there is no dot, because a marker that is
       not the point is what confuses people.

       Drawn after the rim and the dome, so nothing covers it, and it does
       not rotate: it marks the fixed slot the wheel stops under. */
    /* ---------- WHERE THE ARROW LIVES ----------

       r is the CENTRE of the canvas, not the rim. The old constants
       added to r, which put the point a third of the way INTO the wheel
       and the body across the middle - so it read as a marker sitting
       on the hub, not a pointer at the rim.

       The rim is the TOP EDGE of the canvas, at y near 0. The point now
       lands a hair below that line, so it visibly touches the edge it
       marks, and the whole body sits ABOVE the wheel in the empty band
       at the top. Nothing overlaps the face. */
    const rimY  = 2;                 /* the gold rim, top of the canvas */
    const tipY  = rimY + 4;          /* the point, touching the rim */
    const backY = rimY - 44;         /* the body, above the wheel */
    const halfW = 26;                /* half the width of the arrow */

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.8)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;

    ctx.beginPath();
    ctx.moveTo(r, tipY);                        /* the point, at the rim */
    ctx.lineTo(r - halfW, backY);               /* left back corner */
    ctx.lineTo(r - 13, backY + 12);
    ctx.lineTo(r + 13, backY + 12);             /* the tail notch */
    ctx.lineTo(r + halfW, backY);               /* right back corner */
    ctx.closePath();

    const ag = ctx.createLinearGradient(r - halfW, backY, r + halfW, backY);
    ag.addColorStop(0, "#8a6410");
    ag.addColorStop(0.32, "#ffe89a");
    ag.addColorStop(0.64, "#e8bf5c");
    ag.addColorStop(1, "#a3760a");
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.restore();

    /* a bright edge, so the shape reads against the gold rim */
    ctx.beginPath();
    ctx.moveTo(r, tipY);
    ctx.lineTo(r - halfW, backY);
    ctx.lineTo(r - 13, backY + 12);
    ctx.lineTo(r + 13, backY + 12);
    ctx.lineTo(r + halfW, backY);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,248,215,.95)";
    ctx.lineWidth = 2.5;
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
    holder.classList.add("spinning");
    result.textContent = "Spinning...";
    result.classList.remove("won");

    const TAU = Math.PI * 2;

    /* ---------- ONE CLEAN SPIN ----------

       A single ease-out and nothing else: the wheel starts quickly, slows
       the whole way down, and stops. No wobble, no overshoot, no bounce.

       The wobble and the bounce were removed on purpose. Both moved the
       angle AFTER the spin had landed, so the wheel could settle on one
       wedge and then report a different one, and the bounce kept it
       turning for another third of a second after the name was read.

       So: sampled easing, four fixed turns, about four seconds. The
       angle the animation ends at is the angle the winner is read from,
       exactly. */
    const turns = 4;
    const land = Math.random() * TAU;
    const from = angle;
    const to = from + turns * TAU + land;

    const howLong = 4200;
    const started = performance.now();

    function frame(now) {
      const t = Math.min((now - started) / howLong, 1);

      /* cubic ease-out: quick off the mark, long slow settle */
      const e = 1 - Math.pow(1 - t, 3);

      angle = from + (to - from) * e;
      draw();

      /* the rim brightens as it slows, then goes dark when it stops */
      holder.style.setProperty("--spin-glow", String(1 - e));

      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }

      /* the angle the wheel stopped at IS the angle that gets read */
      angle = to % TAU;
      holder.classList.remove("spinning");
      draw();
      announce(angle, list);
    }

    function announce(a, list) {
      const who = winnerAt(a);
      const held = list.filter(function (s) { return s.name === who; }).length;
      result.innerHTML = "Winner: <b>" + who + "</b>" +
        (held > 1 ? " (" + held + " entries)" : " (1 entry)");
      result.classList.add("won");
      spinning = false;
      hub.disabled = false;
      holder.style.setProperty("--spin-glow", "0");
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

  /* ---------- THE PAGES THAT ARE NOT BOARDS ARE LEFT ALONE ----------

     Credit, History and Inventory are drawn by their own functions, and
     they share this same container. renderBoards() did not check which
     tab was open, so a redraw fired while one of them was showing would
     paint a board over the top - which is how "EVERYONE ENTERED" ended
     up under the Inventory form, and why the stock list with its tick
     boxes was replaced before it could be used.

     A redraw on one of those tabs either re-draws that page or does
     nothing. It never draws a board. */
  if (currentTab === "inventory") { renderInventory(); return; }
  if (currentTab === "credit") { renderCredit(); return; }
  if (currentTab === "history") { historyLoad().then(function () { renderHistory(); }); return; }

  /* A BUTTON LEFT DISABLED BY ANOTHER TAB IS CLEARED HERE.

     A disabled flag survives a redraw unless something clears it, so a
     button switched off on one tab stayed grey on the next. Every board
     draw now starts from a clean slate. */
  ["resetBoard", "exportCsv", "clearAll", "filter"].forEach(function (id) {
    const el = $(id);
    if (el) el.disabled = false;
  });

  const boards = boardsOnTab(currentTab);
  const stacked = boards.length > 1;

  host.innerHTML = "";

  boards.forEach(function (b, bIndex) {
    /* only the board that OWNS the tab carries a Reset. A board stacked
       underneath it - Divisions, under Pairs - does not, so the Pairs
       screen has exactly one button on it. */
    b.stackedUnder = stacked && bIndex > 0;
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
      drawn.forEach(function (person) {
        grid.appendChild(buildGiveawayTile(person));
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
    } else {
      b.boxes.forEach(function (box) {
        const t = targetByName(box.name);
        if (t) grid.appendChild(buildTile(t));
      });
    }
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
    if (onGiveaway) {
      toolbarReset.dataset.resetFor = primary.id;
      toolbarReset.textContent = "Reset giveaway";
      toolbarReset.title = "Take every hand-typed entry back out. " +
        "Entries earned on Teams and Pairs stay, and no win is touched.";
      toolbarReset.disabled = false;
      toolbarReset.style.display = "";
    } else {
      toolbarReset.dataset.resetFor = primary.id;
      toolbarReset.textContent = stacked ? "Reset " + primary.label : "Reset board";
      toolbarReset.title = "Remove every username from the " + primary.label + " boxes";
      toolbarReset.disabled = false;
      toolbarReset.style.display = "";
    }
  }
  /* Hide all and Download CSV mean nothing on a generated board */
  if (toolbarClear) toolbarClear.style.display = onGiveaway ? "none" : "";
  if (toolbarCsv) toolbarCsv.style.display = onGiveaway ? "none" : "";

  /* the heading line, so the giveaway explains its own numbers */
  if (onGiveaway) {
    const people = giveawayEntries();
    const draw = giveawayDraw();
    const manual = entries.filter(function (e) { return isGiveawayTarget(e.target); }).length;
    $("boardSub").textContent = draw.length
      ? draw.length + (draw.length === 1 ? " entry" : " entries") +
        " in the draw, across " + people.length +
        (people.length === 1 ? " person" : " people") +
        (manual ? " - " + manual + " added by hand." : " - one wedge per entry.")
      : "No entries yet.";
    /* the wheel was rebuilt with the board, so it is already current */
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

  /* ---------- ENABLING A RESET BUTTON ----------

     THE GIVEAWAY WAS ALWAYS DISABLED. countOnBoard() counts rows in
     public.entries whose target is a BOX on that board. The giveaway is
     a derived board with no boxes at all - its entries live in
     giveaway_entries - so the count came back 0 every time, and this
     line switched the button off with 257 entries sitting in the draw.

     A board counts its boxes. The giveaway counts its DRAW. */
  document.querySelectorAll("[data-reset-for]").forEach(function (el) {
    const id = el.dataset.resetFor;
    const board = boardById(id);

    let n;
    if (board && board.derived) {
      /* no boxes to count - what matters is whether anyone is in the draw */
      n = giveawayRows.length;
    } else {
      n = countOnBoard(id);
    }

    el.disabled = n === 0;
    el.classList.toggle("hasnames", n > 0);

    /* the giveaway explains what its button will do */
    if (board && board.derived) {
      el.title = n
        ? "Take all " + n + " entries out of the draw. The boards are not touched."
        : "The draw is empty.";
    }
  });
}

/* Fill the gold PURCHASER plate with the buyer's name only. An item
   entered after a "$" is logged on the winners page, not shown here. */
/* The name shown on a tile and in the entries list.

   The BUYER part only: a box typed as "david zyc$JD5" shows "david zyc",
   and the $item still goes to the Winners page. Showing the raw string
   was part of the same fault - it made one person look like two. */
/* ---------- SUPPY ----------

   A box holding the word SUPPY on its own stands out in the neon theme,
   so it can be picked out among the rest at a glance.

   ONLY the word by itself counts. "suppy" on its own, in any case, with
   the spaces tidied - but NOT "suppy1", NOT "dave suppy", and not a
   buyer part before it. It has to be the whole name in the box. */
function isSuppy(raw) {
  return String(raw == null ? "" : raw)
    .trim().replace(/^@/, "").replace(/\s+/g, " ").toUpperCase() === "SUPPY";
}

function buyerOnly(raw) {
  const parts = boardSplit(raw);
  return parts.username || String(raw == null ? "" : raw);
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
    const raw = buyerOnly(e.username);
    /* a box holding SUPPY and nothing else gets the neon treatment,
       so it can be picked out among the rest at a glance */
    line.className = isSuppy(raw) ? "buyname suppy" : "buyname";
    line.textContent = raw;
    host.appendChild(line);
  });

  /* the plate too, so the whole box lights up and not just the word */
  const glow = list.some(function (e) { return isSuppy(buyerOnly(e.username)); });
  tile.classList.toggle("suppybox", glow);
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

    /* A TAKEN SPOT GREYS OUT, LOGO AND ALL.

       The .taken class desaturates and dims the whole tile, so an occupied
       box reads as occupied instantly without hiding who holds it. The
       logo is included in the effect, which is the point - the colour is
       what tells you it is free. */
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

  /* ---------- ONE PERSON MAY HOLD MORE THAN ONE BOX ----------

     This refused the save whenever the BOX already had a name on it,
     which is right for every board except Pairs. On Pairs a person is
     allowed to hold several pairs - four pairs is two giveaway
     entries - and the guard was rejecting every pair after the first,
     so the giveaway only ever saw one of them.

     So the rule now depends on the board:

       Pairs - a person may take as many pair boxes as they like. What
               is still refused is putting a SECOND NAME on a box that
               already has one, because that would overwrite it.

       every other board - one box, one name, as before. */
  const alreadyOnBox = usersOn(targetId);
  if (alreadyOnBox.length) {
    const heldBySomeoneElse = alreadyOnBox.some(function (e) {
      return personKey(e.username) !== personKey(username);
    });
    const boardId = giveawayBoardOf(targetId);
    const allowMore = boardId === "pairs";

    if (heldBySomeoneElse || !allowMore) {
      note.textContent = targetId + " is already taken. Remove that name first.";
      return;
    }
    /* same person, Pairs board: fall through and add the box */
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

  /* ---------- 1. THE WIN GOES FIRST ----------

     THE ORDER HERE MATTERS, and getting it wrong is what broke the log.

     This used to write the giveaway entry BEFORE the win. The giveaway
     write fetches from the database twice to count entries, and if either
     fetch threw or hung, everything after it was skipped - including the
     win. Board rows kept saving while wins silently stopped, which is
     exactly what it looked like.

     So the win is written IMMEDIATELY after the box saves, before
     anything else can fail. boardSplit and boardLogWin live in THIS file,
     so the win records whether or not winners.js loaded. */
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

  /* the board redraws NOW, so the box shows the name and the win count is
     right even if the giveaway write below is still in flight */
  refreshBoards();
  renderEntries();
  if (typeof renderWinners === "function") renderWinners();

  /* ---------- 2. THE GIVEAWAY ENTRY, IN ITS OWN GUARDED BLOCK ----------

     Its own try/catch, AFTER the win. A failure here can no longer take
     the win down with it, and it is reported in words rather than
     swallowed. */
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

  /* the stored giveaway entries are read once at startup and watched, so
     a name entered on another device shows in the draw here */
  gwLoad().then(function () { refreshBoards(); });
  /* Live updates for the stored entries.

     This used to call sbWatchGiveaway() expecting it to exist in
     sb-client.js. It did not, so the call threw on the very first line of
     boot and killed everything after it: the tabs and toolbar drew, then
     the page stopped dead and no tiles appeared. A missing watcher must
     never be able to do that, so the watcher is defined HERE if it is not
     already there, and a plain refresh is used as the fallback. */
  if (typeof sbWatchGiveaway === "function") {
    sbWatchGiveaway(function () { gwLoad().then(function () { refreshBoards(); }); });
  } else {
    setInterval(function () { gwLoad().then(function () { refreshBoards(); }); }, 15000);
  }
  setInterval(function () { loadEntries(); }, 30000);

  $("filter").addEventListener("input", function (e) { applyFilter(e.target.value); });
  $("exportCsv").addEventListener("click", downloadCsv);

  $("resetBoard").addEventListener("click", function () {
    const id = this.dataset.resetFor || currentTab;
    const b = boardById(id);
    /* the giveaway has its own reset: hand-typed entries only */
    if (b && b.derived) { resetGiveaway(); return; }

    /* ON A TAB THAT HAS ITS OWN BUTTON, the toolbar button stands down.
       Pairs carries "Reset Pick your Pairs" over its heading; letting the
       toolbar button run as well gave the same screen two resets that
       could disagree about which board they meant. */
    if (boardsOnTab(id).length > 1) {
      $("saved").textContent = "Use the Reset button on the " + b.label +
        " heading to clear that board.";
      return;
    }
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

/* ============================================================
   CREDIT  +  PER-PERSON GIVEAWAY ADJUST

   CONTROL SIDE ONLY. Credit is entered by hand: a username and an
   amount. No customer page reads it.

   WRITES GO THROUGH AN EDGE FUNCTION. The service key lives in that
   function's secrets, so no key appears in this file, and the public
   policies on customer_credit stay SELECT-only.
   ============================================================ */

/* WRITES STRAIGHT TO THE TABLE, the same way every other write on this
   board does. No function, no secret, no second key - the publishable
   key already writes entries, wins and history. */
async function creditAdjust(name, delta, note) {
  const who = personName(name);
  const move = Number(delta);
  if (!who) throw new Error("Enter a username.");
  if (!isFinite(move) || move === 0) throw new Error("Enter an amount to add or remove.");

  const current = await creditReadOne(who);
  const before = current ? Number(current.amount) || 0 : 0;
  const after = Math.round((before + move) * 100) / 100;

  /* THE CONFLICT TARGET GOES IN THE URL.

     This was a plain POST with a merge-duplicates header, and PostgREST
     cannot merge on a header alone - without ?on_conflict= it tries a
     bare INSERT, which collides with customer_credit_username_key the
     moment the name already exists. That is the 409 you saw: the first
     add worked, every add after it failed, and Remove failed with it.

     Naming the column here is what turns the insert into an upsert, so
     a balance is replaced rather than collided with. */
  const res = await fetch(
    SB_WIN_URL + "/rest/v1/customer_credit?on_conflict=username",
    {
    method: "POST",
    headers: {
      "apikey": SB_WIN_KEY,
      "Authorization": "Bearer " + SB_WIN_KEY,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      username: personKey(who),
      amount: after,
      note: note || "",
      updated_at: new Date().toISOString()
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    if (res.status === 409) {
      throw new Error("That name already has a balance and it could not be " +
        "updated. Try again, or check the row in customer_credit.");
    }
    throw new Error("Could not save the credit (" + res.status + ") " + txt);
  }

  /* ---------- ZERO MEANS GONE ----------

     A customer at $0.00 is not a customer with credit - they are a
     name that should not be on this list at all. So when a balance
     comes out at exactly zero, the row is DELETED rather than left
     sitting at nothing.

     The move is still logged first, so the statement reads: they had
     x, they were taken to 0, and the row went. Nothing disappears
     without a line to explain it.

     ONLY the customer_credit row goes. credit_log is never trimmed -
     it is the record of what happened, and a record you delete is not
     a record. */
  if (after === 0) {
    const del = await fetch(
      SB_WIN_URL + "/rest/v1/customer_credit?username=eq." +
        encodeURIComponent(personKey(who)),
      {
        method: "DELETE",
        headers: {
          "apikey": SB_WIN_KEY,
          "Authorization": "Bearer " + SB_WIN_KEY
        }
      }
    );
    if (!del.ok) {
      throw new Error("The balance reached zero but the row could not be " +
        "removed (" + del.status + ")");
    }
    return {
      username: personKey(who),
      amount: 0,
      before: before,
      delta: move,
      removed: true
    };
  }

  /* the movement is logged BEFORE any removal, so a row that goes is
     still explained by a line that stays */
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
      delta: move,
      balance: after,
      note: note || ""
    })
  });

  if (!log.ok) {
    throw new Error("Balance saved, but the log entry failed (" + log.status + ")");
  }

  return { username: personKey(who), amount: after, before: before, delta: move };
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
  table.appendChild(tbody);

  const wrap = document.createElement("div");
  wrap.className = "giventries";
  wrap.appendChild(table);
  host.appendChild(wrap);

  if (!withCredit.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No credit on any account. Type a username and an amount above, " +
      "then press Add - they will appear here and can be adjusted from then on.";
    host.appendChild(p);
  }
}

/* ============================================================
   INVENTORY  -  CONTROL SIDE ONLY

   What has been bought into the shop, and what it cost. Hand-entered:
   an item, a cost each, how many, and an optional note. Nothing else
   on the site reads this table and no customer page can see it.

   The total above the list is the cost of everything logged, so the
   stock figure does not have to be added up by eye.
   ============================================================ */

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

/* ---------- ONLY ONE RUN MAY DRAW ----------

   renderInventory awaits two fetches before it paints. If a redraw
   fires while it is waiting - a board repaint, a watcher, another tab
   switch - a SECOND run starts and clears the container, and the first
   run's table is thrown away with it. That is why the stock table
   never appeared while the entry form did: the form is written before
   the awaits land, the table after, and the second run wipes the lot.

   A run token fixes it. Each call takes a number; only the call whose
   number is still the newest is allowed to touch the container. */
let invRun = 0;

async function renderInventory() {
  const host = $("boards");
  if (!host) return;

  const myRun = ++invRun;

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

  /* a newer run has started, so this one must not draw */
  if (myRun !== invRun) return;

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

  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing in stock. Enter an item and what it cost above.";
    left.appendChild(p);
  } else {
    const table = document.createElement("table");
    table.className = "invtable";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th></th><th>Item</th><th>Cost each</th><th>Qty</th>" +
      "<th>Total</th><th>Note</th><th>Logged</th><th></th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(function (r) {
      const tr = document.createElement("tr");
      if (picked[r.id]) tr.className = "picked";

      const c0 = document.createElement("td");
      const tick = document.createElement("input");
      tick.type = "checkbox";
      tick.checked = !!picked[r.id];
      tick.title = "Tick to move this out";
      tick.addEventListener("change", function () {
        if (tick.checked) picked[r.id] = true; else delete picked[r.id];
        tr.className = tick.checked ? "picked" : "";
        drawPicker();
      });
      c0.appendChild(tick);
      tr.appendChild(c0);

      const c1 = document.createElement("td");
      c1.className = "who";
      c1.textContent = r.item || "-";
      tr.appendChild(c1);

      const c2 = document.createElement("td");
      c2.className = "givcount";
      c2.textContent = invMoney(r.cost);
      tr.appendChild(c2);

      const c3 = document.createElement("td");
      c3.className = "meta";
      c3.textContent = r.qty || 1;
      tr.appendChild(c3);

      const c4 = document.createElement("td");
      c4.className = "givcount";
      c4.textContent = invMoney((Number(r.cost) || 0) * (Number(r.qty) || 1));
      tr.appendChild(c4);

      const c5 = document.createElement("td");
      c5.className = "meta";
      c5.textContent = r.note || "";
      tr.appendChild(c5);

      const c6 = document.createElement("td");
      c6.className = "meta";
      const d = new Date(r.created_at);
      c6.textContent = isNaN(d) ? "-" : d.toLocaleString();
      tr.appendChild(c6);

      const c7 = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost";
      del.textContent = "Remove";
      del.title = "Delete this line without recording it";
      del.addEventListener("click", async function () {
        try {
          await inventoryRemove(r.id);
          delete picked[r.id];
          $("saved").textContent = (r.item || "That line") + " removed.";
          renderInventory();
        } catch (err) {
          $("saved").textContent = err.message;
        }
      });
      c7.appendChild(del);
      tr.appendChild(c7);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const wrap = document.createElement("div");
    wrap.className = "giventries";
    wrap.appendChild(table);
    left.appendChild(wrap);
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
      p.textContent = "Tick items on the left and they come here, with the cost " +
        "added up. Press Done when the selection is finished and it goes " +
        "into one report.";
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
