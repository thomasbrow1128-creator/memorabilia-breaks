const SB_URL = "https://bzvrslhfyaetmwzbnldt.supabase.co";
const SB_KEY = "sb_publishable_pM8hQ1cP77AXANXCkAS0qA_jfC9ibYq";

/* Is there a signed-in session in this browser right now?

   sessionStorage, not localStorage: it lives as long as this tab. */
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
