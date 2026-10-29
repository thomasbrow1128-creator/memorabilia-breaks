/* ============================================================
   MEMORABILIA BREAKS - the shared database connection.

   Every page that touches the ledger loads this: the board writes,
   the customer page reads.

   WHAT IS SAFE TO PUT HERE. Only the PUBLISHABLE key, which is meant
   to be visible to anyone. On its own it can do nothing - the
   database rules decide what each visitor may do with it.

   WHAT MUST NEVER GO HERE. The email, the password, or the secret key
   (the one labelled "service_role"). The password is typed by hand on
   the board instead, so it never touches a file in this repo.

   THE PROJECT
     name     mem breaks
     api url  [bzvrslhfyaetmwzbnldt.supabase.co](https://bzvrslhfyaetmwzbnldt.supabase.co)
     tables   public.wins        every win ever recorded
              public.board_state when the current run began
   ============================================================ */

const SB_URL = "[bzvrslhfyaetmwzbnldt.supabase.co](https://bzvrslhfyaetmwzbnldt.supabase.co)";
const SB_KEY = "sb_publishable_pM8hQ1cP77AXANXCkAS0qA_jfC9ibYq";

/* Is there a signed-in session in this browser right now?

   sessionStorage, not localStorage: it lives as long as this tab. */
function sbSession() {
  try {
    const raw = sessionStorage.getItem("mb-session");
    if (!raw) return null;
    const s = JSON.parse(raw);
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
  } catch (e) { /* a private window may refuse; the page still works */ }
}

function sbUser() {
  const s = sbSession();
  return s && s.user ? s.user : null;
}

function sbSignedIn() {
  return !!sbSession();
}

/* ---------- signing in ----------

   The password is used once to obtain a token and is then dropped. It is
   never stored, never logged and never written to a file. */
async function sbSignIn(email, password) {
  const res = await fetch(SB_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "apikey": SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, password: password })
  });

  const body = await res.json().catch(function () { return null; });

  if (!res.ok) {
    const msg = (body && (body.error_description || body.msg || body.error)) ||
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

/* Read every win. Anyone may do this - it is what the customer page
   uses. No sign-in needed. */
async function sbListWins() {
  const res = await fetch(
    SB_URL + "/rest/v1/wins?select=*&order=won_at.desc",
    { headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY } }
  );
  if (!res.ok) throw new Error("Could not read the ledger (" + res.status + ")");
  return res.json();
}

/* Add one win. Needs a signed-in session - the database refuses
   otherwise. This is what keeps customers from writing. */
async function sbAddWin(win) {
  const s = sbSession();
  if (!s) throw new Error("Not signed in");

  const res = await fetch(SB_URL + "/rest/v1/wins", {
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
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not save the win (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  return rows[0] || null;
}

/* Change one field on one win - a rename, or a tracking number. */
async function sbUpdateWin(id, patch) {
  const s = sbSession();
  if (!s) throw new Error("Not signed in");

  const res = await fetch(SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(id), {
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
  const rows = await res.json();
  return rows[0] || null;
}

/* Delete one win. Signed in only. */
async function sbDeleteWin(id) {
  const s = sbSession();
  if (!s) throw new Error("Not signed in");

  const res = await fetch(SB_URL + "/rest/v1/wins?id=eq." + encodeURIComponent(id), {
    method: "DELETE",
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + s.access_token }
  });

  if (!res.ok) throw new Error("Could not delete the win (" + res.status + ")");
}

/* ---------- the run marker ----------

   The Current Run leaderboard counts only wins from a certain moment
   onward. That moment lives in one row of public.board_state, so
   starting a new run MOVES A TIMESTAMP and never deletes a win. Every
   win stays in the table, which is what lets the all-time board keep
   counting right through a reset. */

/* When did the current run begin? Anyone may ask - the customer page
   needs it. Returns null if it cannot be read. */
async function sbRunStarted() {
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/board_state?id=eq.1&select=run_started",
      { headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return (rows && rows[0] && rows[0].run_started) || null;
  } catch (e) {
    return null;
  }
}

/* Start a new run: move the marker to right now.

   Signed in only. This deletes NOTHING - every win stays, so the
   all-time board is untouched. Only the current-run board goes to zero. */
async function sbStartNewRun() {
  const s = sbSession();
  if (!s) throw new Error("Not signed in");

  const res = await fetch(SB_URL + "/rest/v1/board_state?id=eq.1", {
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
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Could not start a new run (" + res.status + ") " + txt);
  }
  const rows = await res.json();
  return (rows && rows[0] && rows[0].run_started) || null;
}

/* ---------- live updates ----------

   Supabase pushes a message down a websocket whenever a row changes.
   Pages listen on both tables, so a win - or a new run - reaches every
   open screen about a second later. */

function sbWatchTable(topic, table, onChange) {
  if (typeof WebSocket === "undefined") return null;

  const wsUrl = SB_URL.replace("https://", "wss://") +
    "/realtime/v1/websocket?apikey=" + encodeURIComponent(SB_KEY) + "&vsn=1.0.0";

  let ws = null;
  let heartbeat = null;
  let ref = 0;
  let closed = false;

  function send(obj) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* dropped socket */ }
    }
  }

  function join() {
    ref += 1;
    send({
      topic: topic,
      event: "phx_join",
      payload: {
        config: {
          broadcast: { self: false },
          postgres_changes: [ { event: "*", schema: "public", table: table } ]
        }
      },
      ref: String(ref)
    });
  }

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      setTimeout(connect, 5000);
      return;
    }

    ws.onopen = function () {
      join();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(function () {
        ref += 1;
        send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref) });
      }, 25000);
    };

    ws.onmessage = function (ev) {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || !msg.event) return;
      const name = String(msg.event).toLowerCase();
      if (name === "postgres_changes" || name === "insert" ||
          name === "update" || name === "delete") {
        try { onChange(msg); } catch (e) { /* a broken listener never kills the socket */ }
      }
    };

    ws.onclose = function () {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!closed) setTimeout(connect, 4000);
    };

    ws.onerror = function () { /* onclose handles the retry */ };
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

/* watch the wins table (the name the pages already call) */
function sbWatchWins(onChange) {
  return sbWatchTable("realtime:wins", "wins", onChange);
}

/* watch the run marker, so a new run lands on every open screen */
function sbWatchRun(onChange) {
  return sbWatchTable("realtime:board_state", "board_state", onChange);
}
