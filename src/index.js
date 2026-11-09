export { GameRoom } from "./room.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const CODE_RE = /^[A-Z0-9]{6}$/;

function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function isAuthed(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  return (await env.KV.get(`session:${token}`)) !== null;
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// إرسال نسخة من الرسالة لـ Discord (اختياري): DM من البوت، أو Webhook
async function notifyDeveloper(env, m) {
  const text = `📩 **رسالة جديدة من ${m.name}**${m.email ? ` (${m.email})` : ""}\n${m.message}`;

  if (env.DISCORD_BOT_TOKEN) {
    const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };

    const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: env.DEV_DISCORD_ID })
    });
    const dmBody = await dm.text();
    if (!dm.ok) {
      console.log("Discord DM channel failed:", dm.status, dmBody);
      return false;
    }
    const channel = JSON.parse(dmBody);

    const r = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: text })
    });
    if (!r.ok) {
      console.log("Discord send failed:", r.status, await r.text());
      return false;
    }
    return true;
  }

  if (env.DISCORD_WEBHOOK_URL) {
    const r = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text })
    });
    return r.ok;
  }
  return false;
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // ----- التواصل: الرسالة تنحفظ في صندوق المطور داخل الموقع -----
  if (path === "/api/contact" && method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim().slice(0, 60);
    const email = String(body.email || "").trim().slice(0, 100);
    const message = String(body.message || "").trim().slice(0, 1500);
    if (!name || !message) return json({ error: "missing fields" }, 400);

    const id = crypto.randomUUID();
    const entry = { id, name, email, message, date: new Date().toISOString() };
    await env.KV.put(`msg:${String(Date.now()).padStart(15, "0")}:${id}`, JSON.stringify(entry));

    let delivered = false;
    try { delivered = await notifyDeveloper(env, entry); } catch (e) { console.log("notify failed:", e.message); }
    return json({ ok: true, delivered });
  }

  // ----- تسجيل دخول المطور -----
  if (path === "/api/login" && method === "POST") {
    const { username, password } = await readJson(request);
    if (username !== env.DEV_USER || password !== env.DEV_PASS) return json({ error: "wrong credentials" }, 401);
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    await env.KV.put(`session:${token}`, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    return json({ token });
  }

  // ----- صندوق الرسائل (للمطور فقط) -----
  if (path === "/api/messages" && method === "GET") {
    if (!(await isAuthed(request, env))) return json({ error: "unauthorized" }, 401);
    const list = await env.KV.list({ prefix: "msg:", limit: 500 });
    const items = await Promise.all(list.keys.map(k => env.KV.get(k.name, "json")));
    return json(items.filter(Boolean).reverse());
  }

  if (path.startsWith("/api/messages/") && method === "DELETE") {
    if (!(await isAuthed(request, env))) return json({ error: "unauthorized" }, 401);
    const id = decodeURIComponent(path.slice("/api/messages/".length));
    const list = await env.KV.list({ prefix: "msg:", limit: 1000 });
    const key = list.keys.find(k => k.name.endsWith(`:${id}`));
    if (key) await env.KV.delete(key.name);
    return json({ ok: true });
  }

  // ----- اختبار إرسال Discord (للمطور) -----
  if (path === "/api/test-dm" && method === "POST") {
    if (!(await isAuthed(request, env))) return json({ error: "unauthorized" }, 401);
    const ok = await notifyDeveloper(env, { name: "اختبار", email: "", message: "رسالة تجريبية ✓" });
    return json({ ok });
  }

  // ----- الغرف -----
  if (path === "/api/rooms" && method === "POST") {
    const code = newRoomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await stub.fetch("https://room/init", { method: "POST" });
    return json({ code });
  }

  if (path.startsWith("/api/rooms/") && method === "GET") {
    const code = path.slice("/api/rooms/".length).toUpperCase();
    if (!CODE_RE.test(code)) return json({ exists: false });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const info = await stub.fetch("https://room/info");
    return json(await info.json());
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws/")) {
      const code = url.pathname.slice("/ws/".length).toUpperCase();
      if (!CODE_RE.test(code)) return new Response("bad room", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.log("api error:", e.message);
        return json({ error: "server error" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
