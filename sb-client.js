/* ============================================================
   MEMORABILIA BREAKS - the shared database connection.

   Every page loads this. It holds the publishable key, which is safe
   to expose, and the calls each page makes to the database.

   TABLES
     public.wins         every win ever recorded
     public.entries      who is on which box, right now
     public.board_state  when the current run began
   ============================================================ */

const SB_URL = "https://bzvrslhfyaetmwzbnldt.supabase.co";
const SB_KEY = "sb_publishable_pM8hQ1cP77AXANXCkAS0qA_jfC9ibYq";

function sbSession() {
  try {
    var raw = sessionStorage.getItem("mb-session");
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.access_token) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function sbSaveSession(s) {
  try {
    if (!s) sessionStorage.removeItem("mb-session");
    else sessionStorage.setItem("mb-session", JSON.stringify(s));
  } catch (e) {}
}

function sbUser() {
  var s = sbSession();
  return s && s.user ? s.user : null;
}

function sbSignedIn() {
  return !!sbSession();
}

async function sbSignIn(email, password) {
  var res = await fetch(SB_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "apikey": SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, password: password })
  });
  var body = await res.json().catch(function () { return null; });
  if (!res.ok) {
    var msg = (body && (body.error_description || body.msg || body.error)) ||
      ("Sign-in failed (" + res.status + ")");
    throw new Error(msg);
  }
  sbSaveSession(body);
  return body;
}

function sbSignOut() {
  sbSaveSession(null);
}

/* ---------- the wins table ---------- */

async function sbListWins() {
  var res = await fetch(
    SB_URL + "/rest/v1/wins?select=*&order=won_at.desc",
    { headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY } }
  );
  if (!res.ok) throw new Error("Could not read the ledger (" + res.status + ")");
  return res.json();
}

async function sbAddWin(win) {
  var s = sbSession();
  if (!s) throw new Error("Not signed in");
  var res = await fetch(SB_URL + "/rest/v1/wins", {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + s.access_token,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      username: win.username,
      item: win.item,
      team: win.team,
      tracking: win.tracking || ""
    })
  });
  if (!res.ok) {
    var txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save the win (" + res.status + ") " + txt);
  }
  var rows = await res.json();
  return rows[0] || null;
}

async function sbUpdateWin(id, patch) {
  var s = sbSession();
  if (!s) throw new Error("Not signed in");
  var res = await fetch(SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + s.access_token,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error("Could not update the win (" + res.status + ")");
  var rows = await res.json();
  return rows[0] || null;
}

async function sbDeleteWin(id) {
  var s = sbSession();
  if (!s) throw new Error("Not signed in");
  var res = await fetch(SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + s.access_token }
  });
  if (!res.ok) throw new Error("Could not delete the win (" + res.status + ")");
}

/* ---------- the run marker ---------- */

async function sbRunStarted() {
  try {
    var res = await fetch(
      SB_URL + "/rest/v1/board_state?id=eq.1&select=run_started",
      { headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY } }
    );
    if (!res.ok) return null;
    var rows = await res.json();
    return (rows && rows[0] && rows[0].run_started) || null;
  } catch (e) {
    return null;
  }
}

async function sbStartNewRun() {
  var s = sbSession();
  if (!s) throw new Error("Not signed in");
  var res = await fetch(SB_URL + "/rest/v1/board_state?id=eq.1", {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + s.access_token,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ run_started: new Date().toISOString() })
  });
  if (!res.ok) {
    var txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not start a new run (" + res.status + ") " + txt);
  }
  var rows = await res.json();
  return (rows && rows[0] && rows[0].run_started) || null;
}

/* ---------- the boards: who is on which box ----------

   One row per taken box. The table carries a unique index on target,
   so two devices racing for the same box cannot both win it - the
   database refuses the second one. That is what makes the board safe
   to have open on several screens at once.

   These are open to anyone with the link, by choice: there is no
   sign-in on the boards page. */

async function sbListEntries() {
  var res = await fetch(
    SB_URL + "/rest/v1/entries?select=*&order=created_at.asc",
    { headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY } }
  );
  if (!res.ok) throw new Error("Could not read the board (" + res.status + ")");
  return res.json();
}

/* Take a box. A throw on a duplicate target means somebody else got
   there first. */
async function sbAddEntry(username, target) {
  var res = await fetch(SB_URL + "/rest/v1/entries", {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ username: username, target: target })
  });
  if (res.status === 409) {
    throw new Error("That box was just taken by someone else.");
  }
  if (!res.ok) {
    var txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save that name (" + res.status + ") " + txt);
  }
  var rows = await res.json();
  return rows[0] || null;
}

async function sbRenameEntry(id, username) {
  var res = await fetch(SB_URL + "/rest/v1/entries?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ username: username })
  });
  if (!res.ok) throw new Error("Could not rename that name (" + res.status + ")");
  var rows = await res.json();
  return rows[0] || null;
}

async function sbRemoveEntry(id) {
  var res = await fetch(SB_URL + "/rest/v1/entries?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY }
  });
  if (!res.ok) throw new Error("Could not clear that box (" + res.status + ")");
}

/* Free every box on one board. */
async function sbClearTargets(names) {
  if (!names.length) return;
  var list = names.map(function (n) { return encodeURIComponent(n); }).join(",");
  var res = await fetch(SB_URL + "/rest/v1/entries?target=in.(" + list + ")", {
    method: "DELETE",
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY }
  });
  if (!res.ok) throw new Error("Could not clear that board (" + res.status + ")");
}

/* Free every box on every board. */
async function sbClearAllEntries() {
  var res = await fetch(SB_URL + "/rest/v1/entries?id=not.is.null", {
    method: "DELETE",
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY }
  });
  if (!res.ok) throw new Error("Could not clear the boards (" + res.status + ")");
}

/* ---------- live updates ---------- */

function sbWatchTable(topic, table, onChange) {
  if (typeof WebSocket === "undefined") return null;
  var wsUrl = SB_URL.replace("https://", "wss://") +
    "/realtime/v1/websocket?apikey=" + encodeURIComponent(SB_KEY) + "&vsn=1.0.0";
  var ws = null, heartbeat = null, ref = 0, closed = false;

  function send(obj) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (e) {}
    }
  }
  function join() {
    ref += 1;
    send({
      topic: topic, event: "phx_join",
      payload: { config: { broadcast: { self: false },
        postgres_changes: [ { event: "*", schema: "public", table: table } ] } },
      ref: String(ref)
    });
  }
  function connect() {
    if (closed) return;
    try { ws = new WebSocket(wsUrl); } catch (e) { setTimeout(connect, 5000); return; }
    ws.onopen = function () {
      join();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(function () {
        ref += 1;
        send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref) });
      }, 25000);
    };
    ws.onmessage = function (ev) {
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || !msg.event) return;
      var name = String(msg.event).toLowerCase();
      if (name === "postgres_changes" || name === "insert" ||
          name === "update" || name === "delete") {
        try { onChange(msg); } catch (e) {}
      }
    };
    ws.onclose = function () {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!closed) setTimeout(connect, 4000);
    };
    ws.onerror = function () {};
  }
  connect();
  return {
    close: function () {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (ws) { ws.onclose = null; ws.close(); }
    }
  };
}

function sbWatchWins(onChange) {
  return sbWatchTable("realtime:wins", "wins", onChange);
}

function sbWatchRun(onChange) {
  return sbWatchTable("realtime:board_state", "board_state", onChange);
}

function sbWatchEntries(onChange) {
  return sbWatchTable("realtime:entries", "entries", onChange);
}
