/* Memorabilia Breaks — shared controller for the Teams and Divisions pages.
   Each page sets `window.PAGE_TARGETS` before this script loads:
     Teams page     -> the 32 teams, each with { id, abbr, name, colors }
     Divisions page -> the 8 divisions, each with { id, abbr, name, colors }

   One input per box: a customer username. One action: place it on that
   team or that division. Both pages read and write the same list.

   BACKEND_ENDPOINT: leave "" to store usernames in this browser's
   localStorage only. Set it to your form endpoint to save them centrally
   (Formspree, Google Apps Script, Supabase…).
   Example: const BACKEND_ENDPOINT = "https://formspree.io/f/xxxxxxxx";
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";

const $ = (id) => document.getElementById(id);

let entries = [];        // { id, username, target, createdAt }

/* ---------- storage ---------- */

function loadEntries() {
  try {
    entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    if (!Array.isArray(entries)) entries = [];
  } catch (e) {
    entries = [];
  }
  renderAll();
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    return false;
  }
}

function usersOn(targetId) {
  return entries.filter((e) => e.target === targetId);
}

/* ---------- board ---------- */

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  PAGE_TARGETS.forEach((t) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.target = t.id;
    tile.dataset.search = (t.name + " " + t.abbr).toLowerCase();

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.display = "none";
    tile.appendChild(badge);

    const eb = document.createElement("div");
    eb.className = "eb";
    eb.style.background = t.colors[0];
    const abbr = document.createElement("span");
    abbr.textContent = t.abbr;
    eb.appendChild(abbr);
    tile.appendChild(eb);

    const name = document.createElement("span");
    name.className = "name";
    name.style.background = t.colors[1];
    name.textContent = t.name;
    tile.appendChild(name);

    const roster = document.createElement("div");
    roster.className = "roster";
    roster.dataset.roster = t.id;
    tile.appendChild(roster);

    const bar = document.createElement("form");
    bar.className = "addbar";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "username";
    input.setAttribute("aria-label", "Customer username for " + t.name);
    input.autocomplete = "off";
    input.spellcheck = false;
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "+";
    btn.title = "Add username to " + t.name;
    bar.appendChild(input);
    bar.appendChild(btn);
    bar.addEventListener("submit", (ev) => {
      ev.preventDefault();
      addUser(t.id, input.value);
      input.value = "";
      input.focus();
    });
    tile.appendChild(bar);

    board.appendChild(tile);
  });
}

function refreshBoard() {
  PAGE_TARGETS.forEach((t) => {
    const roster = document.querySelector('[data-roster="' + t.id + '"]');
    const tile = document.querySelector('.tile[data-target="' + t.id + '"]');
    if (!roster || !tile) return;

    roster.innerHTML = "";
    const list = usersOn(t.id);
    list.forEach((e) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = e.username;
      chip.title = e.username;
      roster.appendChild(chip);
    });

    const badge = tile.querySelector(".badge");
    badge.textContent = list.length;
    badge.style.display = list.length ? "" : "none";
  });
}

/* ---------- add / remove ---------- */

async function addUser(targetId, rawName) {
  const username = (rawName || "").trim().replace(/^@/, "");
  const input = document.querySelector('.tile[data-target="' + targetId + '"] .addbar input');
  if (!username) {
    if (input) input.focus();
    return;
  }

  const entry = {
    id: "u" + Date.now() + Math.random().toString(36).slice(2, 7),
    username: username,
    target: targetId,
    createdAt: new Date().toISOString()
  };

  $("saved").textContent = "";

  try {
    if (BACKEND_ENDPOINT) {
      const res = await fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(entry)
      });
      if (!res.ok) throw new Error("Backend responded " + res.status);
    }
    entries.unshift(entry);
    if (!BACKEND_ENDPOINT && !persist()) throw new Error("Could not write to local storage");
    renderAll();
    $("saved").textContent = "Added @" + username + " to " + targetLabel(targetId);
  } catch (err) {
    $("saved").textContent = "Could not save: " + err.message;
  }
}

function removeUser(id) {
  entries = entries.filter((e) => e.id !== id);
  persist();
  renderAll();
}

/* ---------- the list under the board ---------- */

function renderEntries() {
  const host = $("entries");
  host.innerHTML = "";
  $("entryCount").textContent = entries.length ? "(" + entries.length + ")" : "";

  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Nothing entered yet. Type a username into any box above.";
    host.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Username</th><th>Placed on</th><th>Added</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const sorted = entries.slice().sort((a, b) => {
    const A = targetLabel(a.target), B = targetLabel(b.target);
    if (A !== B) return A.localeCompare(B);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  sorted.forEach((e) => {
    const tr = document.createElement("tr");

    const tdUser = document.createElement("td");
    tdUser.textContent = "@" + e.username;
    tr.appendChild(tdUser);

    tr.appendChild(textCell(targetLabel(e.target)));

    const when = new Date(e.createdAt);
    tr.appendChild(textCell(isNaN(when) ? "—" : when.toLocaleString()));

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeUser(e.id));
    td.appendChild(del);
    tr.appendChild(td);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
}

function textCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

/* ---------- export ---------- */

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv() {
  if (!entries.length) {
    $("saved").textContent = "Nothing to export yet.";
    return;
  }
  const rows = ["username,placed_on,added"];
  const sorted = entries.slice().sort((a, b) => {
    const A = targetLabel(a.target), B = targetLabel(b.target);
    if (A !== B) return A.localeCompare(B);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  sorted.forEach((e) => {
    rows.push(
      csvEscape(e.username) + "," +
      csvEscape(targetLabel(e.target)) + "," +
      csvEscape(e.createdAt)
    );
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-usernames.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- filter ---------- */

function applyFilter(q) {
  const needle = (q || "").trim().toLowerCase();
  let shown = 0;
  [...document.querySelectorAll(".tile")].forEach((el) => {
    const match = !needle || el.dataset.search.includes(needle);
    el.style.display = match ? "" : "none";
    if (match) shown++;
  });
  $("count").textContent = shown + " shown";
}

/* ---------- render ---------- */

function renderAll() {
  refreshBoard();
  renderEntries();
}

document.addEventListener("DOMContentLoaded", () => {
  renderBoard();
  loadEntries();
  applyFilter("");

  $("filter").addEventListener("input", (e) => applyFilter(e.target.value));
  $("exportCsv").addEventListener("click", downloadCsv);
  $("clearAll").addEventListener("click", () => {
    if (!entries.length) return;
    if (confirm("Delete all " + entries.length + " usernames?")) {
      entries = [];
      persist();
      renderAll();
    }
  });
});
