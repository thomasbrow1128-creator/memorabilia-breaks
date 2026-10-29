/* ============================================================
   MEMORABILIA BREAKS - WINNERS

   The win log. Every item won, captured automatically from the boards,
   with a tracking number typed in on each line, plus the control that
   starts a new run.

   WHERE THE DATA LIVES. In a shared Supabase database, not in this
   browser. Enter a win on your phone and it is on your laptop, and on
   the customer page, about a second later.

   THE SIGN-IN. Writing needs a session, which needs a password. This
   page asks for it in the box at the top and keeps it for the tab only,
   never written to a file or to localStorage. Close the tab and it is
   gone. Reading needs no password, which is how customers see their
   own items.

   THE CURRENT RUN. The customer page shows two leaderboards: the
   Current Run board, which counts only wins since a certain moment, and
   the All-Time board, which counts everything. The marker that decides
   where the current run begins belongs to this page.

   STARTING A NEW RUN MOVES ONE TIMESTAMP. It deletes nothing, so the
   all-time board is untouched and no customer loses their history.
   Only the current-run board goes back to zero.

   HOW THE WIN LOG WORKS. A name entered as  buyer$item  logs a win: the
   part before the $ is the username, the part after is the item won,
   and the box itself shows only the buyer's name.

   THE LOG IS APPEND-ONLY FROM THE BOARDS. Nothing done on a board can
   remove a line - not Reset board, not Hide all, not removing a name,
   not a rename (a rename UPDATES the line in place). A line leaves only
   through its own Delete button, or Clear winners.
   ============================================================ */

let wins = [];
let undoWinsSnapshot = null;
let winnersUndoTimer = null;
let sbReady = false;
let runStarted = null;

const W = (id) => document.getElementById(id);
const OLD_WINNERS_KEY = "memorabilia-breaks-winners-v1";

function splitEntry(raw) {
  const text = String(raw == null ? "" : raw).trim().replace(/^@/, "");
  const at = text.indexOf("$");
  if (at === -1) return { username: text, item: "" };
  return {
    username: text.slice(0, at).trim(),
    item: text.slice(at + 1).trim()
  };
}

/* ---------- reading ---------- */

async function loadWins() {
  try {
    wins = await sbListWins();
    runStarted = await sbRunStarted();
    sbReady = true;
  } catch (e) {
    sbReady = false;
    wins = [];
  }
  renderWinners();
  paintRun();
}

/* ---------- writing ---------- */

async function recordWin(target, rawEntry) {
  const parts = splitEntry(rawEntry);
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
  } catch (e) { /* the rename stays on the board; the log keeps its old text */ }
  return hit;
}

/* ---------- the current run ---------- */

function paintRun() {
  const el = W("runBegan");
  if (!el) return;
  if (!runStarted) {
    el.textContent = "not set yet";
    return;
  }
  const d = new Date(runStarted);
  el.textContent = isNaN(d) ? "-" : d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

async function startNewRun() {
  const note = W("saved");
  const btn = W("newRun");

  if (!sbSignedIn()) {
    if (note) note.textContent = "Sign in above before starting a new run.";
    return;
  }

  const line1 = "Start a new run?";
  const line2 = "The Current Run board on the customer page goes back to zero." +
    String.fromCharCode(10) +
    "Nothing is deleted, and the All-Time board is not touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  if (btn) btn.disabled = true;
  if (note) note.textContent = "Starting a new run...";

  try {
    const when = await sbStartNewRun();
    runStarted = when || new Date().toISOString();
    paintRun();
    if (note) note.textContent = "New run started. The all-time board is unchanged.";
  } catch (e) {
    if (note) note.textContent = "Could not start a new run: " + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
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

    const tdUser = document.createElement("td");
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "nameedit";
    nameBtn.textContent = "@" + w.username;
    nameBtn.title = "Click to change the username";
    nameBtn.addEventListener("click", function () { editWin(tr, w, "username"); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

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

function flash(el) {
  if (!el) return;
  el.classList.add("saved");
  setTimeout(function () { el.classList.remove("saved"); }, 900);
}

function textCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

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

function csvEscape(v) {
  const Q = String.fromCharCode(34), C = String.fromCharCode(44), N = String.fromCharCode(10);
  const s = String(v == null ? "" : v);
  if (s.indexOf(Q) !== -1 || s.indexOf(C) !== -1 || s.indexOf(N) !== -1) {
    return Q + s.split(Q).join(Q + Q) + Q;
  }
  return s;
}

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

/* ---------- clear, with undo ---------- */

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

/* ---------- anything left in this browser ---------- */

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
  paintRun();

  const csv = W("winnerCsv");
  if (csv) csv.addEventListener("click", downloadWinnersCsv);

  const clear = W("winnerClear");
  if (clear) clear.addEventListener("click", clearWinners);

  const newRun = W("newRun");
  if (newRun) newRun.addEventListener("click", startNewRun);

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

  /* a win, a rename, or a tracking number typed anywhere lands here */
  sbWatchWins(function () { loadWins(); });

  /* a new run started on another device lands here as well */
  sbWatchRun(function () { loadWins(); });
}
