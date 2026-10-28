/* Memorabilia Breaks — shared helpers for the Teams and Divisions pages.
   Loaded by both index.html and divisions.html, after teams.js. */

const STORE_KEY = "memorabilia-breaks-usernames-v1";

/* The 8 divisions, built from teams.js. A username placed on a division is
   stored as its own entry, separate from any team entry. */
const DIVISION_LIST = DIVISIONS.map((d) => ({
  name: d.name,
  abbr: d.name.replace(/[^A-Z]/g, ""),
  colors: d.teams[0].colors,
  teams: d.teams
}));

/* Every entry stores { id, username, target, createdAt } where `target` is
   either a team abbreviation (e.g. "BUF") or a division name (e.g. "AFC East"). */

function teamByAbbr(abbr) {
  return TEAMS.find((t) => t.abbr === abbr);
}

function divisionByName(name) {
  return DIVISION_LIST.find((d) => d.name === name);
}

function targetLabel(id) {
  const t = teamByAbbr(id);
  if (t) return t.city + " " + t.name;
  const d = divisionByName(id);
  if (d) return d.name;
  return id;
}
