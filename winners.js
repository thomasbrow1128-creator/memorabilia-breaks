/* ============================================================
   MEMORABILIA BREAKS - WINNERS

   A log of every item won, captured automatically from the boards, with
   a tracking number typed in on each line.

   HOW THE WIN LOG WORKS. When a name is entered into a board box in the
   form

       buyer$item

   everything BEFORE the "$" becomes the winner's username, and
   everything AFTER it becomes the item won. Both are recorded here with
   the date and time, and the box itself shows only the buyer's name.

   A plain name with no "$" is just an entry: it still holds the box,
   but nothing is written to the winners log, because no item is named.

   THE LOG IS APPEND-ONLY FROM THE BOARDS. Nothing done on a board can
   remove a line from this page:
     - Reset board            -> log untouched
     - Hide all               -> log untouched
     - removing one name      -> log untouched
     - renaming a name        -> the line is UPDATED in place
   The ONLY way a line leaves is the Clear winners button on this page.

   TRACKING NUMBERS. Each winner line carries its own small tracking
   field, right beside the win. Type a number there and it is saved on
   that line. A tracking number is part of the win's own row, not a
   separate list.
   ============================================================ */

const WINNERS_KEY = "memorabilia-breaks-winners-v1";

let winners = [];
let undoWinnersSnapshot = null;
let winnersUndoTimer = null;

/* ---------- storage ---------- */

function loadWinners() {
  try {
    winners = JSON.parse(localStorage.getItem(WINNERS_KEY) || "[]");
    if (!Array.isArray(winners)) winners = [];
  } catch (e) {
    winners = [];
  }
}

function saveWinners() {
  try {
    localStorage.setItem(WINNERS_KEY, JSON.stringify(winners));
    return true;
  } catch (e) {
    return false;
  }
}

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

/* ---------- the win log ---------- */

/* Record a win. Called when a name is entered that names an item. */
function recordWin(target, rawEntry) {
  const parts = splitEntry(rawEntry);

  /* nothing to log unless an item was actually named */
  if (!parts.item) return null;

  const when = new Date();
  const win = {
    id: "w" + Date.now() + Math.random().toString(36).slice(2, 7),
    username: parts.username || "(no name)",
    item: parts.item,
    target: target,
    tracking: "",
    at: when.toISOString()
  };

  winners.unshift(win);
  saveWinners();
  renderWinners();
  return win;
}

/* Update the winner line for a box after a rename, IN PLACE.

   A rename must never delete a line — the log is append-only from the
   boards. So this rewrites the username and item on the existing line
   and leaves its id, date, time and tracking number untouched. */
function updateWinFor(target, rawEntry) {
  const parts = splitEntry(rawEntry);
  const hit = winners.filter(function (x) { return x.target === target; })[0];

  if (!hit) {
    if (parts.item) return recordWin(target, rawEntry);
    return null;
  }

  hit.username = parts.username || "(no name)";
  hit.item = parts.item;
  saveWinners();
  renderWinners();
  return hit;
}

/* Remove the log entry for a box, if there is one.

   NOTE: nothing on a board calls this any more. The log is append-only
   from the boards, so this exists only for internal use. */
function dropWinFor(target) {
  const before = winners.length;
  winners = winners.filter(function (w) { return w.target !== target; });
  if (winners.length !== before) saveWinners();
}

/* ---------- the page ---------- */

function renderWinners() {
  const host = document.getElementById("winners");
  if (!host) return;

  const count = document.getElementById("winnerCount");
  if (count) {
    count.textContent = winners.length
      ? "(" + winners.length + (winners.length === 1 ? " win" : " wins") + ")"
      : "";
  }

  host.innerHTML = "";

  if (!winners.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No winners yet. Enter a name on any board as  buyer$item  "
      + "and it is logged here automatically.";
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

  winners.forEach(function (w) {
    const when = new Date(w.at);
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
    nameBtn.addEventListener("click", function () { editWinner(tr, w, "username"); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

    /* item */
    const tdItem = document.createElement("td");
    const itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = "nameedit";
    itemBtn.textContent = w.item;
    itemBtn.title = "Click to change the item";
    itemBtn.addEventListener("click", function () { editWinner(tr, w, "item"); });
    tdItem.appendChild(itemBtn);
    tr.appendChild(tdItem);

    tr.appendChild(textCell(w.target));

    /* ---- TRACKING, on the line itself ----
       A small always-visible input. Type a number and it saves on that
       win the moment you leave the field or press Enter. */
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

    function saveTracking() {
      const next = trkInput.value.trim();
      if (next === (w.tracking || "")) return;   /* nothing changed */
      w.tracking = next;
      saveWinners();
      flash(trkInput);
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

    /* delete */
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Remove only this logged win";
    del.addEventListener("click", function () {
      winners = winners.filter(function (x) { return x.id !== w.id; });
      saveWinners();
      renderWinners();
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
function editWinner(tr, win, field) {
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

  function commit() {
    const next = input.value.trim();
    if (!next) { input.focus(); return; }
    win[field] = next;
    saveWinners();
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
  const saved = document.getElementById("saved");
  if (!winners.length) {
    if (saved) saved.textContent = "Nothing to export yet.";
    return;
  }

  const NEWLINE = String.fromCharCode(10);
  const rows = ["date,time,username,item_won,team,tracking_number"];

  winners.slice().reverse().forEach(function (w) {
    const when = new Date(w.at);
    const good = !isNaN(when);
    rows.push([
      csvEscape(good ? when.toLocaleDateString() : ""),
      csvEscape(good ? when.toLocaleTimeString() : ""),
      csvEscape(w.username),
      csvEscape(w.item),
      csvEscape(w.target),
      csvEscape(w.tracking || "")
    ].join(","));
  });

  const blob = new Blob([rows.join(NEWLINE)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-winners.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* clear the whole winners log, with undo.

   THIS IS THE ONLY THING THAT EMPTIES THE WINNERS LIST. */
function clearWinners() {
  if (!winners.length) return;
  const line1 = "Remove all " + winners.length + " logged wins?";
  const line2 = "This clears the winners list only. The boards are not touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoWinnersSnapshot = winners.slice();
  winners = [];
  saveWinners();
  renderWinners();
  showWinnersUndo("Cleared " + undoWinnersSnapshot.length + " logged wins.");
}

function showWinnersUndo(message) {
  const bar = document.getElementById("winnerUndoBar");
  const txt = document.getElementById("winnerUndoText");
  if (!bar || !txt) return;
  txt.textContent = message;
  bar.classList.add("show");
  if (winnersUndoTimer) clearTimeout(winnersUndoTimer);
  winnersUndoTimer = setTimeout(function () { bar.classList.remove("show"); }, 14000);
}

function initWinners() {
  loadWinners();
  renderWinners();

  const csv = document.getElementById("winnerCsv");
  if (csv) csv.addEventListener("click", downloadWinnersCsv);

  const clear = document.getElementById("winnerClear");
  if (clear) clear.addEventListener("click", clearWinners);

  const undo = document.getElementById("winnerUndoBtn");
  if (undo) undo.addEventListener("click", function () {
    if (!undoWinnersSnapshot) return;
    winners = undoWinnersSnapshot;
    undoWinnersSnapshot = null;
    saveWinners();
    renderWinners();
    const bar = document.getElementById("winnerUndoBar");
    if (bar) bar.classList.remove("show");
  });

  const close = document.getElementById("winnerUndoClose");
  if (close) close.addEventListener("click", function () {
    const bar = document.getElementById("winnerUndoBar");
    if (bar) bar.classList.remove("show");
  });
}
