/* ============================================================
   Memorabilia Breaks — BOARD DEFINITIONS
   ============================================================

   THIS IS THE ONLY FILE YOU TOUCH TO ADD OR CHANGE A BOARD.

   To add a whole new board, add one entry to BOARDS below.
   Nothing else is needed — the tab, the grid, the heading and
   the counter are all generated from this list automatically.

   Shape of a board entry:

     {
       id:    "shirts",           // unique, no spaces
       label: "Shirts",           // shown in the section heading
       tab:   "Shirts",           // shown on the button
       size:  "small",            // "small" | "medium" | "large"
       boxes: [ ... ]             // the boxes on this board
     }

   size controls how many across and how big the text is:
     "large"  8 across  — the 32 teams
     "medium" 4 across  — divisions
     "small"  3 across  — pairs

   Shape of a box:

     { name: "Cowboys, Jags" }                             // plain
     { name: "Bills", color: "#00338D", bar: "#C60C30" }   // with colors
     { name: "Bills", ref: "Bills" }                        // borrow colors
                                                              // from that team

   `name` is what gets stored and shown. It must be unique across
   every board, or two boxes would share one entry list.

   `abbr` (optional) is the short code shown in the colour block. If
   you leave it off, one is derived from the name.

   `stacksWith` (optional): an array of other board ids to draw
   underneath this board on the same tab. The Pairs tab uses this
   to put the divisions underneath the pairs.
   ============================================================ */

/* Helper — colors for a box: explicit, else by team nickname, else neutral. */
function boxColors(box) {
  if (box.color && box.bar) return [box.color, box.bar];
  const look = box.ref || box.name;
  const t = TEAMS.find(function (x) {
    return x.name.toLowerCase() === String(look).toLowerCase();
  });
  if (t) return t.colors;
  /* Try to match the first part of a comma pair. */
  const first = String(look).split(",")[0].trim();
  const t2 = TEAMS.find(function (x) {
    return x.name.toLowerCase() === first.toLowerCase();
  });
  if (t2) return t2.colors;
  return ["#2b303c", "#e8ecf3"];
}

/* Helper — initials for the colour block when a box has no short code. */
function boxAbbr(box) {
  if (box.abbr) return box.abbr;
  const parts = String(box.name).split(",");
  if (parts.length >= 2) {
    return parts[0].trim().slice(0, 3).toUpperCase() + ", " +
           parts[1].trim().slice(0, 3).toUpperCase();
  }
  const words = String(box.name).split(/\s+/);
  if (words.length >= 2) {
    return words.map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  return String(box.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
}

/* Look a team up by its abbreviation or its nickname, so a pair can be
   written either way and still resolve to the official code. */
function teamCode(abbrOrNick) {
  const t = TEAMS.find(function (x) {
    return x.abbr.toUpperCase() === String(abbrOrNick).toUpperCase() ||
           x.name.toLowerCase() === String(abbrOrNick).toLowerCase();
  });
  return t ? t.abbr : String(abbrOrNick).toUpperCase();
}

/* ---------- the box lists ---------- */

const TEAM_BOXES = TEAMS.map(function (t) {
  return { name: t.city + " " + t.name, abbr: t.abbr, color: t.colors[0], bar: t.colors[1] };
});

const DIVISION_BOXES = DIVISIONS.map(function (d) {
  return {
    name: d.name,
    abbr: d.name.replace(/[^A-Za-z]/g, "").toUpperCase(),
    color: d.teams[0].colors[0],
    bar: d.teams[0].colors[1]
  };
});

/* The 16 pairs. Each carries an explicit `abbr` built from the two
   teams' own codes in teams.js, so a pair reads the same way a single
   team does — "DAL, JAX" rather than a made-up short form. */
const PAIR_BOXES = [
  { name: "Cowboys, Jags",      teams: ["DAL", "JAX"] },
  { name: "Chiefs, Cardinals",  teams: ["KC",  "ARI"] },
  { name: "Broncos, Saints",    teams: ["DEN", "NO"]  },
  { name: "Eagles, Panthers",   teams: ["PHI", "CAR"] },
  { name: "Vikings, Titans",    teams: ["MIN", "TEN"] },
  { name: "Packers, Falcons",   teams: ["GB",  "ATL"] },
  { name: "Seahawks, Chargers", teams: ["SEA", "LAC"] },
  { name: "Bucs, Commanders",   teams: ["TB",  "WAS"] },
  { name: "Ravens, Rams",       teams: ["BAL", "LAR"] },
  { name: "Patriots, Browns",   teams: ["NE",  "CLE"] },
  { name: "49ers, Bears",       teams: ["SF",  "CHI"] },
  { name: "Lions, Raiders",     teams: ["DET", "LV"]  },
  { name: "Bengals, Colts",     teams: ["CIN", "IND"] },
  { name: "Bills, Jets",        teams: ["BUF", "NYJ"] },
  { name: "Steelers, Texans",   teams: ["PIT", "HOU"] },
  { name: "Dolphins, Giants",   teams: ["MIA", "NYG"] }
].map(function (p) {
  const codes = p.teams.map(teamCode);
  const first = TEAMS.find(function (x) { return x.abbr === codes[0]; });
  const colours = first ? first.colors : ["#2b303c", "#e8ecf3"];
  return {
    name: p.name,
    abbr: codes.join(", "),
    color: colours[0],
    bar: colours[1]
  };
});

/* ---------- the boards themselves ---------- */

const BOARDS = [
  {
    id: "teams",
    label: "Teams",
    tab: "Teams",
    size: "large",
    boxes: TEAM_BOXES
  },
  {
    id: "divisions",
    label: "Divisions",
    tab: "Divisions",
    size: "medium",
    boxes: DIVISION_BOXES
  },
  {
    id: "pairs",
    label: "Pick your Pairs",
    tab: "Pick your Pairs",
    size: "small",
    boxes: PAIR_BOXES,
    /* draw the divisions underneath the pairs on this tab */
    stacksWith: ["divisions"]
  }
];

/* ---------- derived, do not edit ---------- */

function boardById(id) {
  return BOARDS.find(function (b) { return b.id === id; });
}

/* Boards shown on a tab: the board itself plus anything it stacks. */
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

/* Every box target on a tab, flattened. */
function targetsOnTab(id) {
  return boardsOnTab(id).reduce(function (acc, b) {
    return acc.concat(b.boxes.map(function (box) {
      return {
        id: box.name,
        name: box.name,
        abbr: boxAbbr(box),
        colors: boxColors(box),
        board: b.id
      };
    }));
  }, []);
}

/* Look up one target by its stored name, across every board. */
function targetByName(name) {
  for (let i = 0; i < BOARDS.length; i++) {
    const boxes = BOARDS[i].boxes;
    for (let j = 0; j < boxes.length; j++) {
      if (boxes[j].name === name) {
        return {
          id: boxes[j].name,
          name: boxes[j].name,
          abbr: boxAbbr(boxes[j]),
          colors: boxColors(boxes[j]),
          board: BOARDS[i].id
        };
      }
    }
  }
  return null;
}

/* Readable label for a stored target name. */
function targetLabel(name) {
  return name;
}

/* ---------- self-check ----------
   Runs on load. If a board is malformed, it reports the problem
   loudly on the page and in the console instead of drawing a
   half-broken board. */

function checkBoards() {
  const problems = [];
  const seen = {};

  BOARDS.forEach(function (b) {
    if (!b.id) problems.push("A board is missing an id.");
    if (seen[b.id]) problems.push("Duplicate board id: " + b.id);
    seen[b.id] = true;

    if (!b.label) problems.push("Board " + b.id + " is missing a label.");
    if (!b.size) problems.push("Board " + b.id + " is missing a size.");
    if (["small", "medium", "large"].indexOf(b.size) === -1) {
      problems.push("Board " + b.id + " has an unknown size: " + b.size);
    }
    if (!Array.isArray(b.boxes) || !b.boxes.length) {
      problems.push("Board " + b.id + " has no boxes.");
    }
    (b.stacksWith || []).forEach(function (extra) {
      if (!boardById(extra)) {
        problems.push("Board " + b.id + " stacks an unknown board: " + extra);
      }
    });
  });

  /* A pair naming a team that isn't in teams.js would silently fall
     back to the typed text, so flag it here instead. */
  BOARDS.forEach(function (b) {
    (b.boxes || []).forEach(function (box) {
      if (!box.teams) return;
      box.teams.forEach(function (code) {
        const found = TEAMS.some(function (x) {
          return x.abbr.toUpperCase() === String(code).toUpperCase() ||
                 x.name.toLowerCase() === String(code).toLowerCase();
        });
        if (!found) {
          problems.push("Box " + box.name + " names an unknown team: " + code);
        }
      });
    });
  });

  /* Duplicate box names would make two boxes share one entry list. */
  const names = {};
  BOARDS.forEach(function (b) {
    b.boxes.forEach(function (box) {
      if (!box.name) { problems.push("A box on " + b.id + " has no name."); return; }
      if (names[box.name]) {
        problems.push("Duplicate box name " + box.name + " on " + names[box.name] + " and " + b.id);
      }
      names[box.name] = b.id;
    });
  });

  if (problems.length) {
    console.error("Board configuration problems: " + problems.join(" | "));
  }
  return problems;
}
