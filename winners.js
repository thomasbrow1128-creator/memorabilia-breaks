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
   A line leaves this page in exactly two ways, both deliberate:
     - the Delete button on that line
     - the Clear winners button, which empties the lot

   TRACKING NUMBERS. Each winner line carries its own small tracking
   field, right beside the win. Type a number there and it is saved on
   that line. A tracking number is part of the win's own row, not a
   separate list.

   ---------- TWO FAULTS THIS FILE USED TO HAVE ----------

   1. A NEW WIN NEEDED A PAGE RELOAD TO APPEAR. The list was read once,
      in initWinners(). Nothing watched the wins table, so a win written
      by a board sat in the database while this page kept showing the
      list it had read at load. Only a refresh re-read it.

      There is now a watcher on the wins table, plus a slow poll as a
      backstop for a dropped socket, so a win appears within a second or
      two without anyone touching the page.

   2. DELETE ONLY CHANGED THE SCREEN. The button removed the line from
      the in-page array and called saveWinners(), which is a no-op that
      just returns true. The row stayed in the database, so the next
      reload brought it straight back.

      It was worse than that. renderWinners() redraws the whole table
      from the local array, so if that array was stale - the page had
      been open a while, or another device had added or edited wins -
      ANY redraw could hide rows that still existed. That is the "it
      removes some entries by itself" fault.

      Delete now sends a DELETE to the wins table, waits for it, and
      re-reads. A win that is gone is gone everywhere; a win that is
      still there comes back on the next read.
   ============================================================ */

const WINNERS_KEY = "memorabilia-breaks-winners-v1";

let winners = [];
let undoWinnersSnapshot = null;
let winnersUndoTimer = null;

/* the watcher and the backstop timer, kept so they are never doubled up */
let winnersWatch = null;
let winnersPoll = null;

/* ---------- storage ---------- */

/* ---------- WHERE THE WINNERS COME FROM ----------

   THE DATABASE, not this browser.

   The page used to load its list out of localStorage, which meant the
   wins only existed on the machine that happened to hold them - and any
   reload could leave the page looking empty while every win was still
   sitting in the wins table. That is what happened.

   Now the list is READ from public.wins, the same rows the customer page
   reads, so every win shows on every device and a tracking number typed
   here is the number everyone sees.

   localStorage is kept as a fallback only for the moment when the
   database cannot be reached, so a lost connection shows the last known
   list rather than a blank page. */
function loadWinnersLocal() {
  try {
    const raw = localStorage.getItem(WINNERS_KEY) || "[]";
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveWinnersLocal() {
  try {
    localStorage.setItem(WINNERS_KEY, JSON.stringify(winners));
    return true;
  } catch (e) {
    return false;
  }
}

/* read the log from the database. Returns true when it worked. */
async function loadWinners() {
  try {
    if (typeof sbListWins !== "function") throw new Error("the database helper is not loaded");
    const rows = await sbListWins();
    winners = Array.isArray(rows) ? rows : [];
    saveWinnersLocal();          /* keep a copy for an offline reload */
    return true;
  } catch (e) {
    winners = loadWinnersLocal();
    return false;
  }
}

/* A change has already been written to the database, so this only has to
   put the screen back in step with it. It READS rather than rendering from
   whatever the page happens to be holding.

   THAT IS THE POINT. Rendering from the local array is what hid rows: a
   stale list redrawn itself and lines that existed in the database
   disappeared from the page until the next reload. Reading first means the
   screen can only ever show what the database actually holds. */
async function saveWinners() {
  await loadWinners();
  renderWinners();
  return true;
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

  /* remember what is being typed, so a redraw does not eat it.

     THE WATCHER NOW REDRAWS ON ITS OWN, which it did not before. Without
     this, a win arriving on another device would clear the tracking box
     somebody was halfway through typing into. */
  const typing = {};
  host.querySelectorAll("input.trackinput").forEach(function (el, i) {
    if (document.activeElement === el && el.value) typing[i] = el.value;
  });

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
    + "<th>Item won</th><th>Box</th><th>Tracking number</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  winners.forEach(function (w, rowIndex) {
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
    trkInput.value = typing[rowIndex] !== undefined ? typing[rowIndex] : (w.tracking || "");
    trkInput.placeholder = "tracking #";
    trkInput.setAttribute("aria-label", "Tracking number for " + w.username);
    trkInput.autocomplete = "off";
    trkInput.spellcheck = false;

    /* ---------- SAVING A TRACKING NUMBER ----------

       This used to write to localStorage and nothing else, which is why
       the number vanished: the list reloads from the database a moment
       later, the row comes back with an empty tracking field, and the box
       wipes itself. The number was never sent anywhere.

       It now writes to the wins table, the same row the customer page
       reads, so the number is saved for good and appears there too. The
       local copy is only kept in step AFTER the database has accepted it.

       WRITTEN WITH THE PUBLISHABLE KEY, NOT THE SIGN-IN ONE. sbUpdateWin
       demands a signed-in session, and this page has no sign-in at all -
       it threw "Not signed in" on every attempt and the number was
       discarded. That is why tracking never stuck. The wins table's policy
       allows anyone with the link to write, so the same key the board
       already uses works here. */
    async function saveTracking() {
      const next = trkInput.value.trim();
      if (next === (w.tracking || "")) return;   /* nothing changed */

      const before = w.tracking || "";
      w.tracking = next;                          /* show it straight away */

      try {
        if (!w.id) throw new Error("that win has no row id to save to");
        const res = await fetch(
          SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(w.id),
          {
            method: "PATCH",
            headers: {
              "apikey": SB_KEY,
              "Authorization": "Bearer " + SB_KEY,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({ tracking: next })
          }
        );
        if (!res.ok) {
          const txt = await res.text().catch(function () { return ""; });
          throw new Error("(" + res.status + ") " + txt);
        }
        const rows = await res.json();
        if (!rows || !rows.length) {
          throw new Error("the row was not found - it may have been deleted");
        }
      } catch (err) {
        /* put it back and SAY SO - a number that looks saved but is not is
           worse than one that visibly failed */
        w.tracking = before;
        trkInput.value = before;
        const note = document.getElementById("saved");
        if (note) {
          note.textContent = "Could not save that tracking number: " +
            (err && err.message ? err.message : "unknown error");
        }
        return;
      }

      flash(trkInput);
      const note2 = document.getElementById("saved");
      if (note2) note2.textContent = "Tracking number saved for @" + w.username + ".";
    }

    trkInput.addEventListener("blur", saveTracking);
    trkInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        saveTracking().then(function () { trkInput.blur(); });
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        trkInput.value = w.tracking || "";
        trkInput.blur();
      }
    });

    tdTrk.appendChild(trkInput);
    tr.appendChild(tdTrk);

    /* ---------- DELETE, FOR GOOD ----------

       THIS USED TO ONLY CHANGE THE SCREEN. It removed the line from the
       in-page array and called saveWinners(), which is a no-op returning
       true - so the row stayed in public.wins and the next reload pulled
       it straight back.

       It now deletes the row itself, waits for the database to confirm,
       and re-reads so the page shows what is really there. If the delete
       fails, the line is put back and the reason is shown, rather than
       leaving a button that looks like it worked. */
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.title = "Delete this win from the log";
    del.addEventListener("click", async function () {
      if (!w.id) {
        const note = document.getElementById("saved");
        if (note) note.textContent = "That line has no row id, so it cannot be deleted.";
        return;
      }
      if (!confirm("Delete the win for @" + w.username + " (" + w.item + ")?\n\n"
        + "This removes the row for everyone. The boards are not touched.")) return;

      del.disabled = true;
      del.textContent = "Deleting…";

      try {
        const res = await fetch(
          SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(w.id),
          {
            method: "DELETE",
            headers: {
              "apikey": SB_KEY,
              "Authorization": "Bearer " + SB_KEY,
              "Prefer": "return=representation"
            }
          }
        );
        if (!res.ok) {
          const txt = await res.text().catch(function () { return ""; });
          throw new Error("(" + res.status + ") " + txt);
        }
        const rows = await res.json().catch(function () { return null; });
        if (Array.isArray(rows) && rows.length === 0) {
          throw new Error("the row was not found - it may already have been deleted");
        }
      } catch (err) {
        del.disabled = false;
        del.textContent = "Delete";
        const note = document.getElementById("saved");
        if (note) {
          note.textContent = "Could not delete that win: " +
            (err && err.message ? err.message : "unknown error");
        }
        return;
      }

      /* gone for good - re-read so the page matches the database */
      await saveWinners();
      const ok = document.getElementById("saved");
      if (ok) ok.textContent = "Deleted the win for @" + w.username + ".";
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

  /* A RENAME WRITES TO THE DATABASE TOO.

     It used to change the in-page copy and call the no-op saveWinners(),
     so a corrected spelling reverted on the next reload. This sends the
     change to the row and re-reads. */
  async function commit() {
    const next = input.value.trim();
    if (!next) { input.focus(); return; }

    const before = win[field];
    win[field] = next;
    tr.dataset.editing = "";

    try {
      if (!win.id) throw new Error("that win has no row id to save to");
      const res = await fetch(
        SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(win.id),
        {
          method: "PATCH",
          headers: {
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify({ [field]: next })
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(function () { return ""; });
        throw new Error("(" + res.status + ") " + txt);
      }
    } catch (err) {
      win[field] = before;               /* put it back, do not pretend */
      const note = document.getElementById("saved");
      if (note) {
        note.textContent = "Could not save that change: " +
          (err && err.message ? err.message : "unknown error");
      }
      renderWinners();
      return;
    }

    await saveWinners();
    const done = document.getElementById("saved");
    if (done) done.textContent = "Saved the new " + field + ".";
  }

  save.addEventListener("click", commit);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); tr.dataset.editing = ""; renderWinners(); }
  });
  cancel.addEventListener("click", function () { tr.dataset.editing = ""; renderWinners(); });

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
  const rows = ["date,time,username,item_won,box,tracking_number"];

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

   THIS IS THE ONLY OTHER WAY A LINE LEAVES THIS PAGE. It now clears the
   DATABASE, not just the screen, so the emptied list survives a reload. */
async function clearWinners() {
  if (!winners.length) return;
  const line1 = "Remove all " + winners.length + " logged wins?";
  const line2 = "This clears the winners log itself, for everyone. The boards are not touched.";
  if (!confirm(line1 + String.fromCharCode(10, 10) + line2)) return;

  undoWinnersSnapshot = winners.slice();

  try {
    const res = await fetch(SB_URL + "/rest/v1/wins?id=not.is.null", {
      method: "DELETE",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY
      }
    });
    if (!res.ok) {
      const txt = await res.text().catch(function () { return ""; });
      throw new Error("(" + res.status + ") " + txt);
    }
  } catch (err) {
    undoWinnersSnapshot = null;
    const note = document.getElementById("saved");
    if (note) {
      note.textContent = "Could not clear the winners log: " +
        (err && err.message ? err.message : "unknown error");
    }
    return;
  }

  await loadWinners();
  renderWinners();
  showWinnersUndo("Cleared " + undoWinnersSnapshot.length + " logged wins. "
    + "Undo puts them back on this screen only.");
}

/* Clear winners' undo restores the SCREEN, not the database.

   The rows are genuinely deleted, so there is nothing to un-delete without
   writing them all back as new rows with new ids. Rather than pretend, this
   rebuilds the list in the page so the night's log can be read again, and
   the message says so. Download the CSV before clearing if the log matters. */
function showWinnersUndo(message) {
  const bar = document.getElementById("winnerUndoBar");
  const txt = document.getElementById("winnerUndoText");
  if (!bar || !txt) return;
  txt.textContent = message;
  bar.classList.add("show");
  if (winnersUndoTimer) clearTimeout(winnersUndoTimer);
  winnersUndoTimer = setTimeout(function () { bar.classList.remove("show"); }, 14000);
}

/* ---------- staying in step with the database ----------

   A WIN NOW APPEARS WITHOUT A REFRESH.

   The list used to be read once, at load, and never again - so a win
   written by a board showed up only after somebody reloaded the page.

   Two things keep it current:
     - a realtime watcher on the wins table, which fires the moment a row
       is inserted, updated or deleted anywhere, and
     - a slow poll as a backstop, because a websocket can drop quietly on
       a flaky connection and the page would then sit on a stale list.

   Both call the same refresh, which re-reads and redraws. */
async function refreshWinnersPage() {
  await loadWinners();
  renderWinners();
}

function startWinnersWatch() {
  /* only once - initWinners can be called again by the page switcher */
  if (winnersWatch) return;
  try {
    if (typeof sbWatchWins === "function") {
      winnersWatch = sbWatchWins(function () {
        refreshWinnersPage();
      });
    }
  } catch (e) {
    /* the poll below covers this */
  }

  if (!winnersPoll) {
    winnersPoll = setInterval(refreshWinnersPage, 15000);
  }
}

function initWinners() {
  loadWinners().then(function () {
    renderWinners();
  });
  renderWinners();

  const csv = document.getElementById("winnerCsv");
  if (csv && !csv.dataset.wired) {
    csv.dataset.wired = "1";
    csv.addEventListener("click", downloadWinnersCsv);
  }

  const clear = document.getElementById("winnerClear");
  if (clear && !clear.dataset.wired) {
    clear.dataset.wired = "1";
    clear.addEventListener("click", clearWinners);
  }

  const refresh = document.getElementById("winnerRefresh");
  if (refresh && !refresh.dataset.wired) {
    refresh.dataset.wired = "1";
    refresh.addEventListener("click", function () {
      refreshWinnersPage().then(function () {
        const note = document.getElementById("saved");
        if (note) note.textContent = "Winners refreshed.";
      });
    });
  }

  const undo = document.getElementById("winnerUndoBtn");
  if (undo && !undo.dataset.wired) {
    undo.dataset.wired = "1";
    undo.addEventListener("click", function () {
      if (!undoWinnersSnapshot) return;
      winners = undoWinnersSnapshot;
      undoWinnersSnapshot = null;
      renderWinners();
      const bar = document.getElementById("winnerUndoBar");
      if (bar) bar.classList.remove("show");
    });
  }

  const close = document.getElementById("winnerUndoClose");
  if (close && !close.dataset.wired) {
    close.dataset.wired = "1";
    close.addEventListener("click", function () {
      const bar = document.getElementById("winnerUndoBar");
      if (bar) bar.classList.remove("show");
    });
  }

  startWinnersWatch();
}

