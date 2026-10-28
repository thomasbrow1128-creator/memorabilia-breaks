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

/* Helper — initials for the color block when a box has no short code. */
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

/* The 16 pairs exactly as listed on the board. */
const PAIR_BOXES = [
  "Cowboys, Jags",
  "Chiefs, Cardinals",
  "Broncos, Saints",
  "Eagles, Panthers",
  "Vikings, Titans",
  "Packers, Falcons",
  "Seahawks, Chargers",
  "Bucs, Commanders",
  "Ravens, Rams",
  "Patriots, Browns",
  "49ers, Bears",
  "Lions, Raiders",
  "Bengals, Colts",
  "Bills, Jets",
  "Steelers, Texans",
  "Dolphins, Giants"
].map(function (n) { return { name: n }; });

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
