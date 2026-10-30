/* ============================================================
   Memorabilia Breaks - BOARD DEFINITIONS

   This file defines the boards. Everything else - the tabs, the grids,
   the headings, the counters, the Reset buttons - is generated from the
   lists below.

   A board:
     {
       id:    "shirts",        // unique, no spaces
       label: "Shirts",        // the section heading
       tab:   "Shirts",        // the tab button
       size:  "small",         // "small" | "medium" | "large"
       boxes: [ ... ]          // the boxes on it
     }

   size sets the layout:
     "large"  - 8 across, square tiles   (the 32 teams)
     "medium" - card grid                (the 8 divisions)
     "small"  - card grid                (the 16 pairs)

   A box:
     { name: "Bills", abbr: "BUF", color: "#00338D", bar: "#C60C30" }

   `name` is the key: it is what gets stored with each username, and it
   must be unique across every board.

   `stacksWith` on a board: other board ids to draw underneath it on the
   same tab.

   `derived: true` marks a board with no boxes of its own. Its tiles are
   worked out from the other boards, and it may also take hand-typed
   entries. The Giveaway board is one. */

/* ---------- helpers ---------- */

function teamCode(abbrOrNick) {
  const wanted = String(abbrOrNick).toUpperCase();
  let found = null;
  TEAMS.forEach(function (t) {
    if (!found && t.abbr.toUpperCase() === wanted) found = t;
  });
  if (found) return found.abbr;
  TEAMS.forEach(function (t) {
    if (!found && t.name.toUpperCase() === wanted) found = t;
  });
  return found ? found.abbr : wanted;
}

function boxColors(box) {
  if (box.color && box.bar) return [box.color, box.bar];
  const wanted = String(box.ref || box.name).toLowerCase();
  let found = null;
  TEAMS.forEach(function (t) {
    if (!found && t.name.toLowerCase() === wanted) found = t;
  });
  if (!found) {
    const firstPart = String(box.name).split(",")[0].trim().toLowerCase();
    TEAMS.forEach(function (t) {
      if (!found && t.name.toLowerCase() === firstPart) found = t;
    });
  }
  return found ? found.colors : ["#2b303c", "#e8ecf3"];
}

function boxAbbr(box) {
  if (box.abbr) return box.abbr;
  const parts = String(box.name).split(",");
  if (parts.length >= 2) {
    return parts[0].trim().slice(0, 3).toUpperCase() + ", " +
           parts[1].trim().slice(0, 3).toUpperCase();
  }
  const words = String(box.name).split(" ");
  if (words.length >= 2) {
    return words.map(function (w) { return w.charAt(0); }).join("").toUpperCase();
  }
  return String(box.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
}

function emblemPath(city, nick) {
  const slug = String(city + " " + nick)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return "logos/" + slug + ".svg";
}

/* ---------- the box lists ---------- */

const TEAM_BOXES = TEAMS.map(function (t) {
  return {
    name: t.city + " " + t.name,
    abbr: t.abbr,
    color: t.colors[0],
    bar: t.colors[1],
    image: emblemPath(t.city, t.name)
  };
});

const DIVISION_BOXES = DIVISIONS.map(function (d) {
  return {
    name: d.name,
    abbr: d.name.replace(/[^A-Za-z]/g, "").toUpperCase(),
    color: d.teams[0].colors[0],
    bar: d.teams[0].colors[1]
  };
});

const PAIR_SPECS = [
  ["Cowboys, Jags",      "DAL", "JAX"],
  ["Chiefs, Cardinals",  "KC",  "ARI"],
  ["Broncos, Saints",    "DEN", "NO" ],
  ["Eagles, Panthers",   "PHI", "CAR"],
  ["Vikings, Titans",    "MIN", "TEN"],
  ["Packers, Falcons",   "GB",  "ATL"],
  ["Seahawks, Chargers", "SEA", "LAC"],
  ["Bucs, Commanders",   "TB",  "WAS"],
  ["Ravens, Rams",       "BAL", "LAR"],
  ["Patriots, Browns",   "NE",  "CLE"],
  ["49ers, Bears",       "SF",  "CHI"],
  ["Lions, Raiders",     "DET", "LV" ],
  ["Bengals, Colts",     "CIN", "IND"],
  ["Bills, Jets",        "BUF", "NYJ"],
  ["Steelers, Texans",   "PIT", "HOU"],
  ["Dolphins, Giants",   "MIA", "NYG"]
];

const PAIR_BOXES = PAIR_SPECS.map(function (spec) {
  const name = spec[0];
  const codeA = teamCode(spec[1]);
  const codeB = teamCode(spec[2]);
  const colours = boxColors({ name: name, ref: codeA });
  return {
    name: name,
    abbr: codeA + ", " + codeB,
    color: colours[0],
    bar: colours[1]
  };
});

/* ---------- THE GIVEAWAY ----------

   A spin-wheel board. Every tile is one chance in the draw, so a person
   with three entries gets three tiles.

   ENTRIES ARRIVE TWO WAYS.

     1. Earned, from the two boards that feed it:
          Teams board  - every name entered earns ONE giveaway entry.
          Pairs board  - EVERY TWO SEPARATE PAIRS earn ONE entry, so
                         2 boxes = 1 entry, 4 = 2, 6 = 3, and a single
                         box earns NOTHING.
        The DIVISIONS board feeds nothing. It is deliberately absent
        from GIVEAWAY_SOURCES, so a name typed there never enters.

     2. Typed by hand, straight onto the giveaway board itself. Each one
        is a single extra entry, however many times it is typed.

   The earned tiles are worked out, never stored, so renaming or
   removing somebody on Teams or Pairs updates this board by itself.
   The hand-typed ones ARE stored, so they survive a reload and reach
   every device. */

const GIVEAWAY_SOURCES = ["teams", "pairs"];

/* The exact box names on each feeding board, as sets.

   Which board a row belongs to is decided by LOOKING ITS NAME UP IN
   THESE, never by trusting a board field. A row whose name is in neither
   set earns nothing, so the Divisions board cannot leak into the draw
   however its rows happen to be stored - and a single Pairs box can
   never be miscounted as a team, which would hand out one entry for one
   pair instead of one entry for two. */
const TEAM_BOX_SET = {};
TEAM_BOXES.forEach(function (b) { TEAM_BOX_SET[b.name] = true; });

const PAIR_BOX_SET = {};
PAIR_BOXES.forEach(function (b) { PAIR_BOX_SET[b.name] = true; });

/* Which board a stored name belongs to, or "" for neither.
   Pairs is checked first, so a name on both would count as a pair. */
function giveawayBoardOf(name) {
  const n = String(name || "");
  if (PAIR_BOX_SET[n]) return "pairs";
  if (TEAM_BOX_SET[n]) return "teams";
  return "";
}

/* How many entries a number of names on one board earns.

     teams - one entry for every name.
     pairs - ONE ENTRY FOR EVERY TWO SEPARATE PAIRS. Two boxes earn one
             entry, four earn two, six earn three, one earns none. */
function giveawayRate(boardId, howMany) {
  if (boardId === "pairs") return Math.floor(howMany / 2);
  return howMany;
}

/* The prefix that marks a row as a MANUAL giveaway entry. */
const GIVEAWAY_TARGET_PREFIX = "Giveaway: ";

function isGiveawayTarget(target) {
  return String(target || "").indexOf(GIVEAWAY_TARGET_PREFIX) === 0;
}

function giveawayTargetFor(name) {
  return GIVEAWAY_TARGET_PREFIX + name;
}

function giveawayNameFrom(target) {
  return String(target || "").slice(GIVEAWAY_TARGET_PREFIX.length);
}

/* ---------- the boards ---------- */

const BOARDS = [
  { id: "teams",     label: "Teams",           tab: "Teams",           size: "large",  boxes: TEAM_BOXES },
  { id: "divisions", label: "Divisions",       tab: "Divisions",       size: "medium", boxes: DIVISION_BOXES },
  { id: "pairs",     label: "Pick your Pairs", tab: "Pick your Pairs", size: "small",  boxes: PAIR_BOXES,
    stacksWith: ["divisions"] },
  { id: "giveaway",  label: "Giveaway",        tab: "Giveaway",        size: "small",  boxes: [],
    derived: true, manual: true }
];

/* ---------- lookups used by the page ---------- */

function boardById(id) {
  let found = null;
  BOARDS.forEach(function (b) { if (!found && b.id === id) found = b; });
  return found;
}

function boardsOnTab(id) {
  const primary = boardById(id);
  if (!primary) return [];
  const out = [primary];
  (primary.stacksWith || []).forEach(function (extraId) {
    const extra = boardById(extraId);
    if (extra) out.push(extra);
  });
  return out;
}

function targetFromBox(box, boardId) {
  return {
    id: box.name,
    name: box.name,
    abbr: boxAbbr(box),
    colors: boxColors(box),
    image: box.image || "",
    board: boardId
  };
}

function targetsOnTab(id) {
  const out = [];
  boardsOnTab(id).forEach(function (b) {
    b.boxes.forEach(function (box) {
      out.push(targetFromBox(box, b.id));
    });
  });
  return out;
}

/* One box by its stored name, across every board. */
function targetByName(name) {
  let found = null;
  BOARDS.forEach(function (b) {
    b.boxes.forEach(function (box) {
      if (!found && box.name === name) found = targetFromBox(box, b.id);
    });
  });
  return found;
}

/* The text shown for a stored target name. */
function targetLabel(name) {
  if (isGiveawayTarget(name)) return giveawayNameFrom(name) + " (giveaway)";
  return name;
}

/* ---------- self-check ---------- */
function checkBoards() {
  const problems = [];
  const seenIds = {};
  const seenNames = {};

  BOARDS.forEach(function (b) {
    if (!b.id) problems.push("A board has no id.");
    if (seenIds[b.id]) problems.push("Two boards share the id " + b.id);
    seenIds[b.id] = true;

    if (!b.label) problems.push("Board " + b.id + " has no label.");
    if (["small", "medium", "large"].indexOf(b.size) === -1) {
      problems.push("Board " + b.id + " has a bad size: " + b.size);
    }
    if (!b.boxes || !b.boxes.length) {
      if (!b.derived) problems.push("Board " + b.id + " has no boxes.");
      return;
    }

    b.boxes.forEach(function (box) {
      if (!box.name) { problems.push("A box on " + b.id + " has no name."); return; }
      if (seenNames[box.name]) {
        problems.push("Two boxes share the name " + box.name);
      }
      seenNames[box.name] = true;
    });

    (b.stacksWith || []).forEach(function (extra) {
      if (!boardById(extra)) {
        problems.push("Board " + b.id + " stacks a board that does not exist: " + extra);
      }
    });
  });

  if (problems.length) {
    console.error("Board problems: " + problems.join(" | "));
  }
  return problems;
}
