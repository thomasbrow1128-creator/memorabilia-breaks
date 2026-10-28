/* ============================================================
   Memorabilia Breaks — BOARD DEFINITIONS

   This file defines the boards. Everything else — the tabs, the
   grids, the headings, the counters, the Reset buttons — is
   generated from the lists below.

   A board:
     {
       id:    "shirts",        // unique, no spaces
       label: "Shirts",        // the section heading
       tab:   "Shirts",        // the tab button
       size:  "small",         // "small" | "medium" | "large"
       boxes: [ ... ]          // the boxes on it
     }

   size sets the layout:
     "large"  — 8 across, square tiles   (the 32 teams)
     "medium" — full-width rows          (the 8 divisions)
     "small"  — full-width rows          (the 16 pairs)

   A box:
     { name: "Bills", abbr: "BUF", color: "#00338D", bar: "#C60C30" }

   `name` is the key: it is what gets stored with each username, and
   it must be unique across every board.

   `abbr` is what shows in the colour block. If you leave it off,
   one is derived from the name.

   `image` is optional. If set, the tile loads that file and falls
   back to `abbr` when the file is missing.

   `stacksWith` on a board: other board ids to draw underneath it
   on the same tab.
   ============================================================ */

/* ---------- helpers ---------- */

/* A team's official code, looked up from teams.js by abbreviation OR
   by nickname. Used to build the pair codes so a pair can never
   disagree with the teams board. */
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

/* The two colours for a box: an explicit pair first, else the colours
   of the team it names. */
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

/* The short code for a box, derived from the name when not given. */
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

/* The 16 pairs, in board order. Each names its two clubs by their
   official codes; the colour comes from the first club. */
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

/* ---------- the boards ---------- */

const BOARDS = [
  { id: "teams",     label: "Teams",           tab: "Teams",           size: "large",  boxes: TEAM_BOXES },
  { id: "divisions", label: "Divisions",       tab: "Divisions",       size: "medium", boxes: DIVISION_BOXES },
  { id: "pairs",     label: "Pick your Pairs", tab: "Pick your Pairs", size: "small",  boxes: PAIR_BOXES,
    stacksWith: ["divisions"] }
];

/* ---------- lookups used by the page ---------- */

function boardById(id) {
  let found = null;
  BOARDS.forEach(function (b) { if (!found && b.id === id) found = b; });
  return found;
}

/* The boards drawn on one tab: the tab's own board plus anything it
   stacks underneath. */
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

/* One box, shaped the way the page needs it. */
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

/* Every box on a tab, flattened. */
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
  return name;
}

/* ---------- self-check ----------
   Runs on load. Reports anything malformed instead of drawing a
   half-broken board. */
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
      problems.push("Board " + b.id + " has no boxes.");
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
