/* 32 NFL teams, grouped by conference and division.
   `colors` are the primary panel color and the end-zone bar color. */

const DIVISIONS = [
  { name: "AFC East",  conf: "AFC", teams: [
    { abbr: "BUF", city: "Buffalo",     name: "Bills",     colors: ["#00338D", "#C60C30"] },
    { abbr: "MIA", city: "Miami",       name: "Dolphins",  colors: ["#008E97", "#FC4C02"] },
    { abbr: "NE",  city: "New England", name: "Patriots",  colors: ["#002244", "#C60C30"] },
    { abbr: "NYJ", city: "New York",    name: "Jets",      colors: ["#125740", "#FFFFFF"] }
  ]},
  { name: "AFC North", conf: "AFC", teams: [
    { abbr: "BAL", city: "Baltimore",   name: "Ravens",    colors: ["#241773", "#9E7C0C"] },
    { abbr: "CIN", city: "Cincinnati",  name: "Bengals",   colors: ["#FB4F14", "#000000"] },
    { abbr: "CLE", city: "Cleveland",   name: "Browns",    colors: ["#311D00", "#FF3C00"] },
    { abbr: "PIT", city: "Pittsburgh",  name: "Steelers",  colors: ["#101820", "#FFB612"] }
  ]},
  { name: "AFC South", conf: "AFC", teams: [
    { abbr: "HOU", city: "Houston",     name: "Texans",    colors: ["#03202F", "#A71930"] },
    { abbr: "IND", city: "Indianapolis",name: "Colts",     colors: ["#002C5F", "#A2AAAD"] },
    { abbr: "JAX", city: "Jacksonville",name: "Jaguars",   colors: ["#006778", "#D7A22A"] },
    { abbr: "TEN", city: "Tennessee",   name: "Titans",    colors: ["#0C2340", "#4B92DB"] }
  ]},
  { name: "AFC West", conf: "AFC", teams: [
    { abbr: "DEN", city: "Denver",      name: "Broncos",   colors: ["#FB4F14", "#002244"] },
    { abbr: "KC",  city: "Kansas City", name: "Chiefs",    colors: ["#E31837", "#FFB81C"] },
    { abbr: "LV",  city: "Las Vegas",   name: "Raiders",   colors: ["#000000", "#A5ACAF"] },
    { abbr: "LAC", city: "Los Angeles", name: "Chargers",  colors: ["#0080C6", "#FFC20E"] }
  ]},
  { name: "NFC East", conf: "NFC", teams: [
    { abbr: "DAL", city: "Dallas",      name: "Cowboys",   colors: ["#003594", "#869397"] },
    { abbr: "NYG", city: "New York",    name: "Giants",    colors: ["#0B2265", "#A71930"] },
    { abbr: "PHI", city: "Philadelphia",name: "Eagles",    colors: ["#004C54", "#A5ACAF"] },
    { abbr: "WAS", city: "Washington",  name: "Commanders",colors: ["#5A1414", "#FFB612"] }
  ]},
  { name: "NFC North", conf: "NFC", teams: [
    { abbr: "CHI", city: "Chicago",     name: "Bears",     colors: ["#0B162A", "#C83803"] },
    { abbr: "DET", city: "Detroit",     name: "Lions",     colors: ["#0076B6", "#B0B7BC"] },
    { abbr: "GB",  city: "Green Bay",   name: "Packers",   colors: ["#203731", "#FFB612"] },
    { abbr: "MIN", city: "Minnesota",   name: "Vikings",   colors: ["#4F2683", "#FFC62F"] }
  ]},
  { name: "NFC South", conf: "NFC", teams: [
    { abbr: "ATL", city: "Atlanta",     name: "Falcons",   colors: ["#A71930", "#000000"] },
    { abbr: "CAR", city: "Carolina",    name: "Panthers",  colors: ["#0085CA", "#101820"] },
    { abbr: "NO",  city: "New Orleans", name: "Saints",    colors: ["#D3BC8D", "#101820"] },
    { abbr: "TB",  city: "Tampa Bay",   name: "Buccaneers",colors: ["#D50A0A", "#FF7900"] }
  ]},
  { name: "NFC West", conf: "NFC", teams: [
    { abbr: "ARI", city: "Arizona",     name: "Cardinals", colors: ["#97233F", "#FFB612"] },
    { abbr: "LAR", city: "Los Angeles", name: "Rams",      colors: ["#003594", "#FFA300"] },
    { abbr: "SF",  city: "San Francisco",name: "49ers",    colors: ["#AA0000", "#B3995D"] },
    { abbr: "SEA", city: "Seattle",     name: "Seahawks",  colors: ["#002244", "#69BE28"] }
  ]}
];

/* Flat list of all 32 teams, in board order. */
const TEAMS = DIVISIONS.flatMap(d =>
  d.teams.map(t => ({ ...t, division: d.name, conference: d.conf }))
);
