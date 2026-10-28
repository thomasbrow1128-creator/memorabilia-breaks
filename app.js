/* Memorabilia Breaks — entry controller
   ---------------------------------------------------------------
   BACKEND_ENDPOINT: leave "" to store entries in this browser's
   localStorage only. Set it to your form endpoint to save entries
   centrally (Formspree, Netlify Forms, Google Apps Script, Supabase…).
   Example: const BACKEND_ENDPOINT = "https://formspree.io/f/xxxxxxxx";
   --------------------------------------------------------------- */

const BACKEND_ENDPOINT = "";

const STORE_KEY = "memorabilia-breaks-entries-v1";
const $ = (id) => document.getElementById(id);

let selectedAbbr = null;
let entries = [];

/* ---------- storage ---------- */

function loadEntries() {
  try {
    entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch (e) {
    entries = [];
  }
  renderEntries();
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- board ---------- */

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  TEAMS.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.dataset.abbr = t.abbr;
    btn.dataset.search = (t.city + " " + t.name + " " + t.abbr).toLowerCase();
    btn.setAttribute("aria-pressed", "false");
    btn.title = t.city + " " + t.name + " — add an entry";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset.badge = t.abbr;
    badge.style.display = "none";
    btn.appendChild(badge);

    const eb = document.createElement("div");
    eb.className = "eb";
    eb.style.background = t.colors[0];
    const abbr = document.createElement("span");
    abbr.textContent = t.abbr;
    eb.appendChild(abbr);
    btn.appendChild(eb);

    const name = document.createElement("span");
    name.className = "name";
    name.style.background = t.colors[1];
    name.textContent = t.city + " " + t.name;
    btn.appendChild(name);

    btn.addEventListener("click", () => selectTeam(t.abbr));
    board.appendChild(btn);
  });

  refreshBadges();
}

function focusTile(abbr) {
  [...document.querySelectorAll(".tile")].forEach((el) => {
    const on = el.dataset.abbr === abbr;
    el.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const el = document.querySelector('.tile[data-abbr="' + abbr + '"]');
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function refreshBadges() {
  TEAMS.forEach((t) => {
    const badge = document.querySelector('[data-badge="' + t.abbr + '"]');
    if (!badge) return;
    const n = entries.filter((e) => e.team === t.abbr).length;
    badge.textContent = n;
    badge.style.display = n ? "" : "none";
  });
}

/* ---------- selection ---------- */

function selectTeam(abbr) {
  selectedAbbr = abbr;
  const t = TEAMS.find((x) => x.abbr === abbr);
  $("team").value = abbr;
  $("entryForm").style.display = "";
  $("formTitle").textContent = "Entry form — " + t.city + " " + t.name;
  $("formSub").textContent =
    "Fill in the customer's entry for the " + t.division + " team below.";
  focusTile(abbr);
  const c = $("customer");
  if (c) c.focus({ preventScroll: true });
  $("saved").textContent = "";
}

/* ---------- entries ---------- */

function readForm() {
  return {
    id: "e" + Date.now() + Math.random().toString(36).slice(2, 7),
    customer: $("customer").value.trim(),
    email: $("email").value.trim(),
    team: $("team").value,
    product: $("product").value.trim(),
    spots: $("spots").value ? Number($("spots").value) : 1,
    amount: $("amount").value ? Number($("amount").value) : 0,
    date: $("date").value || new Date().toISOString().slice(0, 10),
    status: $("status").value,
    notes: $("notes").value.trim(),
    createdAt: new Date().toISOString()
  };
}

function labelFor(abbr) {
  const t = TEAMS.find((x) => x.abbr === abbr);
  return t ? t.city + " " + t.name : abbr;
}

async function saveEntry(entry) {
  /* Central backend, if one is configured. */
  if (BACKEND_ENDPOINT) {
    const res = await fetch(BACKEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error("Backend responded " + res.status);
    return;
  }
  /* Otherwise: this browser only. */
  entries.unshift(entry);
  if (!persist()) throw new Error("Could not write to local storage");
}

function renderEntries() {
  const host = $("entries");
  host.innerHTML = "";

  $("entryCount").textContent = entries.length
    ? "(" + entries.length + ")"
    : "";

  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No entries yet. Select a team above to add the first one.";
    host.appendChild(p);
    refreshBadges();
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr><th>Customer</th><th>Team</th><th>Product</th><th>Spots</th>" +
    "<th>Amount</th><th>Date</th><th>Status</th><th></th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((e) => {
    const tr = document.createElement("tr");
    tr.appendChild(cell(e.customer + (e.email ? " · " + e.email : "")));
    tr.appendChild(cell(labelFor(e.team)));
    tr.appendChild(cell(e.product || "—"));
    tr.appendChild(cell(String(e.spots)));
    tr.appendChild(cell(e.amount ? "$" + e.amount.toFixed(2) : "—"));
    tr.appendChild(cell(e.date));
    tr.appendChild(cell(e.status));

    const td = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      entries = entries.filter((x) => x.id !== e.id);
      persist();
      renderEntries();
    });
    td.appendChild(del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  host.appendChild(table);
  refreshBadges();
}

function cell(text) {
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
  if (!entries.length) return;
  const cols = ["customer", "email", "team", "product", "spots", "amount", "date", "status", "notes"];
  const rows = [cols.join(",")];
  entries.forEach((e) => {
    rows.push(cols.map((c) => csvEscape(c === "team" ? labelFor(e.team) : e[c])).join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "memorabilia-breaks-entries.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ---------- filter ---------- */

function applyFilter(q) {
  const needle = q.trim().toLowerCase();
  let shown = 0;
  [...document.querySelectorAll(".tile")].forEach((el) => {
    const match = !needle || el.dataset.search.includes(needle);
    el.style.display = match ? "" : "none";
    if (match) shown++;
  });
  $("count").textContent = shown + (shown === 1 ? " team" : " teams");
}

/* ---------- wire up ---------- */

document.addEventListener("DOMContentLoaded", () => {
  // Team dropdown in the form
  const sel = $("team");
  DIVISIONS.forEach((d) => {
    const g = document.createElement("optgroup");
    g.label = d.name;
    d.teams.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.abbr;
      o.textContent = t.city + " " + t.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
  sel.addEventListener("change", () => {
    if (sel.value) selectTeam(sel.value);
  });

  renderBoard();
  loadEntries();

  $("filter").addEventListener("input", (e) => applyFilter(e.target.value));
  $("clearSel").addEventListener("click", () => {
    selectedAbbr = null;
    $("entryForm").style.display = "none";
    $("formTitle").textContent = "Entry form";
    $("formSub").textContent = "Select a team on the board to begin.";
    focusTile("");
  });

  $("entryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedAbbr) return;
    $("team").value = selectedAbbr;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    $("saved").textContent = "";
    try {
      await saveEntry(readForm());
      renderEntries();
      e.target.reset();
      $("spots").value = "1";
      $("team").value = selectedAbbr;
      $("saved").textContent = "Entry added";
    } catch (err) {
      $("saved").textContent = "Could not save: " + err.message;
    }
    btn.disabled = false;
  });

  $("exportCsv").addEventListener("click", downloadCsv);

  $("clearAll").addEventListener("click", () => {
    if (!entries.length) return;
    if (confirm("Delete all " + entries.length + " entries from this browser?")) {
      entries = [];
      persist();
      renderEntries();
    }
  });
});
