/* ============================================================
   MEMORABILIA BREAKS - WINNERS

   A log of every item won, captured automatically from the boards,
   plus a tracking-number sheet for shipping those items out.

   HOW THE WIN LOG WORKS. When a name is entered into a board box in
   the form

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

   TRACKING NUMBERS are entered by hand, one per customer, with the
   carrier and the date shipped. They are stored separately from the win
   log, so clearing one never clears the other.
   ============================================================ */

const WINNERS_KEY = "memorabilia-breaks-winners-v1";
const TRACKING_KEY = "memorabilia-breaks-tracking-v1";

let winners = [];
let tracking = [];
let undoWinnersSnapshot = null;
let undoTrackingSnapshot = null;
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

function loadTracking() {
  try {
    tracking = JSON.parse(localStorage.getItem(TRACKING_KEY) || "[]");
    if (!Array.isArray(tracking)) tracking = [];
  } catch (e) {
    tracking = [];
  }
}

function saveTracking() {
  try {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(tracking));
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
   and leaves its id, date and time untouched.

   If that box has no logged win yet (a plain name being changed into one
   that now names an item, say), a new line is recorded instead. */
function updateWinFor(target, rawEntry) {
  const parts = splitEntry(rawEntry);
  const hit = winners.filter(function (x) { return x.target === target; })[0];

  if (!hit) {
    /* no line yet — only add one if this entry actually names an item */
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
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Date</th><th>Time</th><th>Username</th>"
    + "<th>Item won</th><th>Box</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  winners.forEach(function (w) {
    const when = new Date(w.at);
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
    nameBtn.addEventListener("click", function () { editWinner(tr, w, "username"); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

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

/* ---------- TRACKING NUMBERS ----------

   Entered by hand, one per customer. Each line records who it is for,
   the carrier, the tracking number and the date it shipped.

   Kept entirely separate from the win log, so clearing one never
   touches the other. */

function addTracking(username, carrier, number, shipped) {
  const name = String(username || "").trim().replace(/^@/, "");
  const num = String(number || "").trim();

  /* a tracking line is pointless without a number */
  if (!num) return null;

  const line = {
    id: "t" + Date.now() + Math.random().toString(36).slice(2, 7),
    username: name || "(no name)",
    carrier: String(carrier || "").trim(),
    number: num,
    shipped: shipped || new Date().toISOString().slice(0, 10),
    at: new Date().toISOString()
  };

  tracking.unshift(line);
  saveTracking();
  renderTracking();
  return line;
}

function renderTracking() {
  const host = document.getElementById("tracking");
  if (!host) return;

  const count = document.getElementById("trackingCount");
  if (count) {
    count.textContent = tracking.length
      ? "(" + tracking.length + (tracking.length === 1 ? " shipment" : " shipments") + ")"
      : "";
  }

  host.innerHTML = "";

  if (!tracking.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No tracking numbers yet. Use the boxes above to add one.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Shipped</th><th>Username</th><th>Carrier</th>"
    + "<th>Tracking number</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  tracking.forEach(function (t) {
    const tr = document.createElement("tr");

    const shipped = new Date(t.shipped + "T00:00:00");
    tr.appendChild(textCell(isNaN(shipped) ? t.shipped : shipped.toLocaleDateString()));

    const tdUser = document.createElement("td");
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "nameedit";
    nameBtn.textContent = "@" + t.username;
    nameBtn.title = "Click to change the username";
    nameBtn.addEventListener("click", function () { editTracking(tr, t, "username"); });
    tdUser.appendChild(nameBtn);
    tr.appendChild(tdUser);

    const tdCarrier = document.createElement("td");
    const carBtn = document.createElement("button");
    carBtn.type = "button";
    carBtn.className = "nameedit";
    carBtn.textContent = t.carrier || "-";
    carBtn.title = "Click to change the carrier";
    carBtn.addEventListener("click", function () { editTracking(tr, t, "carrier"); });
    tdCarrier.appendChild(carBtn);
    tr.appendChild(tdCarrier);

    const tdNum = document.createElement("td");
    const numBtn = document.createElement("button");
    numBtn.type = "button";
    numBtn.className = "nameedit trackingnum";
    numBtn.textContent = t.number;
    numBtn.title = "Click to change the tracking number";
    numBtn.addEventListener("click", function () { editTracking(tr, t, "number"); });
    tdNum.appendChild(numBtn);
    tr.appendChild(tdNum);

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Remove only this tracking line";
    del.addEventListener("click", function () {
      tracking = tracking.filter(function (x) { return x.id !== t.id; });
      saveTracking();
      renderTracking();
    });
    td.appendChild(del);
    tr.appendChild(td);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  host.appendChild(table);
}

/* edit one field of a tracking line, in place */
function editTracking(tr, line, field) {
  if (tr.dataset.editing === "1") return;
  tr.dataset.editing = "1";

  const cols = { shipped: 0, username: 1, carrier: 2, number: 3 };
  const td = tr.children[cols[field]];
  td.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.value = line[field];
  input.className = "roweditinput";
  input.setAttribute("aria-label", "Edit " + field);
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
    line[field] = next;
    saveTracking();
    renderTracking();
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); renderTracking(); }
  });
  cancel.addEventListener("click", function () { renderTracking(); });

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
  const rows = ["date,time,username,item_won,box"];

  winners.slice().reverse().forEach(function (w) {
    const when = new Date(w.at);
    const good = !isNaN(when);
    rows.push([
      csvEscape(good ? when.toLocaleDateString() : ""),
      csvEscape(good ? when.toLocaleTimeString() : ""),
      csvEscape(w.username),
      csvEscape(w.item),
      csvEscape(w.target)
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

function downloadTrackingCsv() {
  const saved = document.getElementById("saved");
  if (!tracking.length) {
    if (saved) saved.textContent = "No tracking numbers to export yet.";
    return;
  }

  const NEWLINE = String.fromCharCode(10);
  const rows = ["shipped,username,carrier,tracking_number"];

  tracking.slice().reverse().forEach(function (t) {
    rows.push([
      csvEscape(t.shipped),
      csvEscape(t.username),
      csvEscape(t.carrier),
      csvEscape(t.number)
    ].join(","));
  });

  const blob = new Blob([rows.join(NEWLINE)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-tracking.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* clear the whole winners log, with undo.

   THIS IS THE ONLY THING THAT EMPTIES THE WINNERS LIST.
   It does not touch the tracking list. */
function clearWinners() {
  if (!winners.length) return;
  const line1 = "Remove all " + winners.length + " logged wins?";
  const line2 = "This clears the winners list only. The tracking numbers and the "
    + "boards are not touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoWinnersSnapshot = winners.slice();
  winners = [];
  saveWinners();
  renderWinners();
  showWinnersUndo("Cleared " + undoWinnersSnapshot.length + " logged wins.");
}

/* clear every tracking line, with its own undo */
function clearTracking() {
  if (!tracking.length) return;
  const line1 = "Remove all " + tracking.length + " tracking numbers?";
  const line2 = "This clears the tracking list only. The winners list and the "
    + "boards are not touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoTrackingSnapshot = tracking.slice();
  tracking = [];
  saveTracking();
  renderTracking();
  showWinnersUndo("Cleared " + undoTrackingSnapshot.length + " tracking numbers.");
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

/* ---------- the tracking entry form ---------- */

function initTrackingForm() {
  const form = document.getElementById("trackingForm");
  if (!form) return;

  const nameInput = document.getElementById("trkName");
  const carrierInput = document.getElementById("trkCarrier");
  const numberInput = document.getElementById("trkNumber");
  const dateInput = document.getElementById("trkDate");

  /* today, as a sensible default */
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();

    const line = addTracking(
      nameInput ? nameInput.value : "",
      carrierInput ? carrierInput.value : "",
      numberInput ? numberInput.value : "",
      dateInput ? dateInput.value : ""
    );

    const saved = document.getElementById("saved");
    if (!line) {
      if (saved) saved.textContent = "A tracking number is required.";
      if (numberInput) numberInput.focus();
      return;
    }

    if (saved) {
      saved.textContent = "Tracking added for @" + line.username + " - " + line.number;
    }

    if (nameInput) nameInput.value = "";
    if (numberInput) numberInput.value = "";
    if (nameInput) nameInput.focus();
  });
}

function initWinners() {
  loadWinners();
  loadTracking();
  renderWinners();
  renderTracking();
  initTrackingForm();

  const csv = document.getElementById("winnerCsv");
  if (csv) csv.addEventListener("click", downloadWinnersCsv);

  const clear = document.getElementById("winnerClear");
  if (clear) clear.addEventListener("click", clearWinners);

  const trkCsv = document.getElementById("trackingCsv");
  if (trkCsv) trkCsv.addEventListener("click", downloadTrackingCsv);

  const trkClear = document.getElementById("trackingClear");
  if (trkClear) trkClear.addEventListener("click", clearTracking);

  const undo = document.getElementById("winnerUndoBtn");
  if (undo) undo.addEventListener("click", function () {
    /* the undo bar serves whichever list was last cleared */
    if (undoWinnersSnapshot) {
      winners = undoWinnersSnapshot;
      undoWinnersSnapshot = null;
      saveWinners();
      renderWinners();
    }
    if (undoTrackingSnapshot) {
      tracking = undoTrackingSnapshot;
      undoTrackingSnapshot = null;
      saveTracking();
      renderTracking();
    }
    const bar = document.getElementById("winnerUndoBar");
    if (bar) bar.classList.remove("show");
  });

  const close = document.getElementById("winnerUndoClose");
  if (close) close.addEventListener("click", function () {
    const bar = document.getElementById("winnerUndoBar");
    if (bar) bar.classList.remove("show");
  });
}
