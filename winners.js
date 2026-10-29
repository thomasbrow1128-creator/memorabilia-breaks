/* ============================================================
   MEMORABILIA BREAKS - WINNERS

   The win log. Every item won, captured automatically from the boards,
   with a tracking number typed in on each line.

   WHERE THE DATA LIVES. In a shared Supabase database, not in this
   browser. That is what makes it live: enter a win on your phone and it
   is on your laptop, and on the customer ledger, about a second later.

   THE SIGN-IN. Writing needs a session, and getting one needs a
   password. This page asks for it in the box at the top of the winners
   screen and keeps it for the tab only - never written to a file, to
   localStorage, or anywhere else. Close the tab and it is gone. Reading
   needs no password at all, which is how customers see their own items.

   HOW THE WIN LOG WORKS. A name entered as  buyer$item  logs a win: the
   part before the $ is the username, the part after is the item won, and
   the box itself shows only the buyer's name.

   A plain name with no "$" is just an entry: it holds the box, but
   nothing is logged, because no item is named.

   THE LOG IS APPEND-ONLY FROM THE BOARDS. Nothing done on a board can
   remove a line - not Reset board, not Hide all, not removing a name,
   not a rename (a rename UPDATES the line in place). A line leaves only
   through its own Delete button, or Clear winners.

   AN OLD LOCAL LOG IS CARRIED ACROSS. The first time you sign in, any
   wins still sitting in this browser from the previous version are
   pushed up to the shared database, once, so nothing is lost.
   ============================================================ */

let wins = [];
let undoWinsSnapshot = null;
let winnersUndoTimer = null;
let sbReady = false;

const W = (id) => document.getElementById(id);

/* Split an entry into its two parts.

   "alex$jersey"   -> { username: "alex",   item: "jersey" }
   "alex"          -> { username: "alex",   item: "" }        no item
   "alex$"         -> { username: "alex",   item: "" }        no item
   "$jersey"       -> { username: "",       item: "jersey" }  no buyer

   Only the FIRST "$" splits, so an item may itself contain one. */
function splitEntry(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/^@/, "");
  const at = text.indexOf("$");
  if (at === -1) return { username: text, item: "" };
  return {
    username: text.slice(0, at).trim(),
    item: text.slice(at + 1).trim()
  };
}

/* the local log from the previous version - only read, for the import */
const OLD_WINNERS_KEY = "memorabilia-breaks-winners-v1";

/* ---------- reading ---------- */

async function loadWins() {
  try {
    wins = await sbListWins();
    sbReady = true;
  } catch (e) {
    sbReady = false;
    wins = [];
  }
  renderWinners();
}

/* ---------- writing ---------- */

/* Record a win. Called when a name is entered that names an item. */
async function recordWin(target, rawEntry) {
  const parts = splitEntry(rawEntry);

  /* nothing to log unless an item was actually named */
  if (!parts.item) return null;

  if (!sbSignedIn()) {
    throw new Error("Sign in at the top of this page before entering wins.");
  }

  const saved = await sbAddWin({
    username: parts.username || "(no name)",
    item: parts.item,
    team: target,
    tracking: ""
  });

  if (saved) {
    wins.unshift(saved);
    renderWinners();
  }
  return saved;
}

/* Update the win line for a box after a rename, IN PLACE.

   A rename must never delete a line - the log is append-only from the
   boards. This rewrites username and item on the existing row and leaves
   its id, date, time and tracking number untouched. */
async function updateWinFor(target, rawEntry) {
  const parts = splitEntry(rawEntry);
  const hit = wins.filter(function (x) { return x.team === target; })[0];

  if (!hit) {
    if (parts.item) return recordWin(target, rawEntry);
    return null;
  }

  if (!sbSignedIn()) return hit;

  try {
    const saved = await sbUpdateWin(hit.id, {
      username: parts.username || "(no name)",
      item: parts.item
    });
    if (saved) {
      hit.username = saved.username;
      hit.item = saved.item;
      renderWinners();
    }
  } catch (e) {
    /* the rename stays on the board; the log line keeps its old text */
  }
  return hit;
}

/* ---------- the sign-in bar ---------- */

function paintSignIn() {
  const who = W("signInWho");
  const form = W("signInForm");
  if (!form) return;

  if (sbSignedIn()) {
    const u = sbUser();
    form.style.display = "none";
    if (who) {
      who.style.display = "";
      who.textContent = u && u.email ? "Signed in as " + u.email : "Signed in";
    }
  } else {
    form.style.display = "";
    if (who) who.style.display = "none";
  }
}

function wireSignIn() {
  const form = W("signInForm");
  if (!form) return;

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const email = (W("signInEmail").value || "").trim();
    const pass = W("signInPass").value || "";
    const msg = W("signInMsg");
    const btn = W("signInGo");

    if (!email || !pass) {
      if (msg) msg.textContent = "Enter the email and password.";
      return;
    }

    if (btn) btn.disabled = true;
    if (msg) msg.textContent = "Signing in...";

    try {
      await sbSignIn(email, pass);
      /* the password is used once and dropped - never stored */
      W("signInPass").value = "";
      if (msg) msg.textContent = "";
      paintSignIn();
      await loadWins();
      const moved = await importLocalWins();
      if (moved && msg) {
        msg.textContent = "Brought " + moved + (moved === 1 ? " old win" : " old wins") +
          " across from this browser.";
      }
    } catch (e) {
      if (msg) msg.textContent = "Could not sign in: " + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const out = W("signInOut");
  if (out) out.addEventListener("click", function () {
    sbSignOut();
    paintSignIn();
  });
}

/* ---------- the page ---------- */

function renderWinners() {
  const host = W("winners");
  if (!host) return;

  const count = W("winnerCount");
  if (count) {
    count.textContent = wins.length
      ? "(" + wins.length + (wins.length === 1 ? " win" : " wins") + ")"
      : "";
  }

  host.innerHTML = "";

  if (!wins.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = sbReady
      ? "No winners yet. Enter a name on any board as  buyer$item  and it is logged here automatically."
      : "Could not reach the ledger. Check the connection, then press Refresh.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  table.className = "winnersTable";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Date</th><th>Time</th><th>Username</th>"
    + "<th>Item won</th><th>Team</th><th>Tracking number</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  wins.forEach(function (w) {
    const when = new Date(w.won_at);
    const good = !isNaN(when);

    const tr = document.createElement("tr");

    tr.appendChild(textCell(good ? when.toLocaleDateString() : "-"));
    tr.appendChild(textCell(good ? when.toLocaleTimeString() : "-"));

    /* username */
    const tdUser = document.createElement("td");
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "nameedit";
    nameBtn.textContent = "@" + w.username;
    nameBtn.title = "Click to change the username";
    nameBtn.addEventListener("click", function () { editWin(tr, w, "username"); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

    /* item */
    const tdItem = document.createElement("td");
    const itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = "nameedit";
    itemBtn.textContent = w.item;
    itemBtn.title = "Click to change the item";
    itemBtn.addEventListener("click", function () { editWin(tr, w, "item"); });
    tdItem.appendChild(itemBtn);
    tr.appendChild(tdItem);

    tr.appendChild(textCell(w.team));

    /* ---- TRACKING, on the line itself ----
       Saves on blur or Enter, straight to the shared database, so the
       customer sees it on their ledger at the same moment. */
    const tdTrk = document.createElement("td");
    tdTrk.className = "trackcell";

    const trkInput = document.createElement("input");
    trkInput.type = "text";
    trkInput.className = "trackinput";
    trkInput.value = w.tracking || "";
    trkInput.placeholder = "tracking #";
    trkInput.setAttribute("aria-label", "Tracking number for " + w.username);
    trkInput.autocomplete = "off";
    trkInput.spellcheck = false;

    async function saveTracking() {
      const next = trkInput.value.trim();
      if (next === (w.tracking || "")) return;
      if (!sbSignedIn()) { trkInput.value = w.tracking || ""; return; }
      try {
        const saved = await sbUpdateWin(w.id, { tracking: next });
        if (saved) { w.tracking = saved.tracking; flash(trkInput); }
      } catch (e) {
        trkInput.value = w.tracking || "";
        const note = W("saved");
        if (note) note.textContent = "Could not save that tracking number.";
      }
    }

    trkInput.addEventListener("blur", saveTracking);
    trkInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); saveTracking(); trkInput.blur(); }
      if (ev.key === "Escape") {
        ev.preventDefault();
        trkInput.value = w.tracking || "";
        trkInput.blur();
      }
    });

    tdTrk.appendChild(trkInput);
    tr.appendChild(tdTrk);

    /* delete just this line */
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Remove only this logged win";
    del.addEventListener("click", async function () {
      if (!sbSignedIn()) return;
      try {
        await sbDeleteWin(w.id);
        wins = wins.filter(function (x) { return x.id !== w.id; });
        renderWinners();
      } catch (e) {
        const note = W("saved");
        if (note) note.textContent = "Could not delete that line.";
      }
    });
    td.appendChild(del);
    tr.appendChild(td);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  host.appendChild(table);
}

/* a brief highlight so a saved tracking number is visibly acknowledged */
function flash(el) {
  if (!el) return;
  el.classList.add("saved");
  setTimeout(function () { el.classList.remove("saved"); }, 900);
}

/* rename one field of a logged win, in place */
function editWin(tr, win, field) {
  if (tr.dataset.editing === "1") return;
  tr.dataset.editing = "1";

  const col = field === "username" ? 2 : 3;
  const td = tr.children[col];
  td.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.value = win[field];
  input.className = "roweditinput";
  input.setAttribute("aria-label", field === "username" ? "Edit username" : "Edit item");
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

  td.appendChild(input);
  td.appendChild(save);
  td.appendChild(cancel);

  async function commit() {
    const next = input.value.trim();
    if (!next) { input.focus(); return; }
    if (!sbSignedIn()) { renderWinners(); return; }
    const patch = {};
    patch[field] = next;
    try {
      const saved = await sbUpdateWin(win.id, patch);
      if (saved) win[field] = saved[field];
    } catch (e) { /* leaves the old text in place */ }
    renderWinners();
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); renderWinners(); }
  });
  cancel.addEventListener("click", function () { renderWinners(); });

  input.focus();
  input.select();
}

/* ---------- export ---------- */

function downloadWinnersCsv() {
  const note = W("saved");
  if (!wins.length) {
    if (note) note.textContent = "Nothing to export yet.";
    return;
  }

  const N = String.fromCharCode(10);
  const rows = ["date,time,username,item_won,team,tracking_number"];

  wins.slice().reverse().forEach(function (w) {
    const when = new Date(w.won_at);
    const good = !isNaN(when);
    rows.push([
      csvEscape(good ? when.toLocaleDateString() : ""),
      csvEscape(good ? when.toLocaleTimeString() : ""),
      csvEscape(w.username),
      csvEscape(w.item),
      csvEscape(w.team),
      csvEscape(w.tracking || "")
    ].join(","));
  });

  const blob = new Blob([rows.join(N)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-winners.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- clear the whole log, with undo ---------- */

async function clearWinners() {
  if (!wins.length || !sbSignedIn()) return;
  const line1 = "Remove all " + wins.length + " logged wins?";
  const line2 = "This clears the shared ledger too - customers will no longer see these items.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoWinsSnapshot = wins.slice();

  try {
    for (let i = 0; i < undoWinsSnapshot.length; i++) {
      await sbDeleteWin(undoWinsSnapshot[i].id);
    }
    wins = [];
    renderWinners();
    showWinnersUndo("Cleared " + undoWinsSnapshot.length + " logged wins.");
  } catch (e) {
    const note = W("saved");
    if (note) note.textContent = "Could not clear every line. Press Refresh to see what remains.";
    await loadWins();
  }
}

function showWinnersUndo(message) {
  const bar = W("winnerUndoBar");
  const txt = W("winnerUndoText");
  if (!bar || !txt) return;
  txt.textContent = message;
  bar.classList.add("show");
  if (winnersUndoTimer) clearTimeout(winnersUndoTimer);
  winnersUndoTimer = setTimeout(function () { bar.classList.remove("show"); }, 14000);
}

/* ---------- bringing across anything already in this browser ----------

   The previous version kept wins in localStorage. Anything still there
   is pushed up to the shared database once, then the local copy is
   cleared so it never doubles up. Runs only when signed in. */
async function importLocalWins() {
  if (!sbSignedIn()) return 0;

  let pending = [];
  try {
    const raw = localStorage.getItem(OLD_WINNERS_KEY);
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
    if (!o || !o.item) continue;

    /* skip anything already in the shared ledger */
    const dupe = wins.some(function (w) {
      return w.username === o.username && w.item === o.item && w.team === o.target;
    });
    if (dupe) continue;

    try {
      const saved = await sbAddWin({
        username: o.username || "(no name)",
        item: o.item,
        team: o.target || "-",
        tracking: o.tracking || ""
      });
      if (saved) { wins.unshift(saved); moved++; }
    } catch (e) { /* one bad row never stops the rest */ }
  }

  try { localStorage.removeItem(OLD_WINNERS_KEY); } catch (e) {}
  renderWinners();
  return moved;
}

/* ---------- start ---------- */

function initWinners() {
  wireSignIn();
  paintSignIn();

  const csv = W("winnerCsv");
  if (csv) csv.addEventListener("click", downloadWinnersCsv);

  const clear = W("winnerClear");
  if (clear) clear.addEventListener("click", clearWinners);

  const refresh = W("winnerRefresh");
  if (refresh) refresh.addEventListener("click", async function () {
    await loadWins();
    const note = W("saved");
    if (note) note.textContent = "Ledger refreshed.";
  });

  const undo = W("winnerUndoBtn");
  if (undo) undo.addEventListener("click", async function () {
    if (!undoWinsSnapshot || !sbSignedIn()) return;
    const bar = W("winnerUndoBar");
    if (bar) bar.classList.remove("show");
    const back = undoWinsSnapshot;
    undoWinsSnapshot = null;
    for (let i = 0; i < back.length; i++) {
      const o = back[i];
      try {
        const saved = await sbAddWin({
          username: o.username, item: o.item, team: o.team, tracking: o.tracking || ""
        });
        if (saved) wins.unshift(saved);
      } catch (e) { /* keep going */ }
    }
    renderWinners();
  });

  const close = W("winnerUndoClose");
  if (close) close.addEventListener("click", function () {
    const bar = W("winnerUndoBar");
    if (bar) bar.classList.remove("show");
  });

  loadWins().then(function () {
    if (sbSignedIn()) importLocalWins();
  });

  /* Follow the table. A win entered on another device lands here too. */
  sbWatchWins(function () { loadWins(); });
}
