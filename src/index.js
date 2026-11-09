export { GameRoom } from "./room.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const CODE_RE = /^[A-Z0-9]{6}$/;
const USER_RE = /^[a-zA-Z0-9_]{3,20}$/;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const SESSION_TTL = 60 * 60 * 24 * 7;

const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const hexToBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const bytesToHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" }, key, 256);
  return bytesToHex(bits);
}

async function createSession(env, user) {
  const token = randomHex(32);
  const info = { username: user.username, id: user.id, role: user.role };
  await env.KV.put(`session:${token}`, JSON.stringify(info), { expirationTtl: SESSION_TTL });
  return { token, user: info };
}

async function getSession(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  return env.KV.get(`session:${token}`, "json");
}

// إرسال نسخة من الرسالة لـ Discord (اختياري)
async function notifyDeveloper(env, m) {
  const text = `📩 **رسالة جديدة من ${m.name}**${m.email ? ` (${m.email})` : ""}\n${m.message}`;

  if (env.DISCORD_BOT_TOKEN) {
    const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
    const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST", headers, body: JSON.stringify({ recipient_id: env.DEV_DISCORD_ID })
    });
    const dmBody = await dm.text();
    if (!dm.ok) { console.log("Discord DM channel failed:", dm.status, dmBody); return false; }
    const channel = JSON.parse(dmBody);
    const r = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST", headers, body: JSON.stringify({ content: text })
    });
    if (!r.ok) { console.log("Discord send failed:", r.status, await r.text()); return false; }
    return true;
  }

  if (env.DISCORD_WEBHOOK_URL) {
    const r = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text })
    });
    return r.ok;
  }
  return false;
}

function newRoomCode() {
  return randomHex(3).toUpperCase();
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  /* ----- إنشاء حساب: أول حساب يصير المطور (id 01) ----- */
  if (path === "/api/register" && method === "POST") {
    const { username = "", password = "" } = await readJson(request);
    if (!USER_RE.test(username)) return json({ error: "invalid_username" }, 400);
    if (String(password).length < 6) return json({ error: "weak_password" }, 400);

    const key = `user:${username.toLowerCase()}`;
    if (await env.KV.get(key)) return json({ error: "exists" }, 409);

    const count = Number((await env.KV.get("meta:count")) || 0) + 1;
    await env.KV.put("meta:count", String(count));
    const id = String(count).padStart(2, "0");
    const role = count === 1 ? "developer" : "member";
    const salt = randomHex(16);
    const hash = await hashPassword(String(password), salt);

    await env.KV.put(key, JSON.stringify({ username, id, role, salt, hash, created: new Date().toISOString() }));
    return json(await createSession(env, { username, id, role }));
  }

  /* ----- تسجيل الدخول ----- */
  if (path === "/api/login" && method === "POST") {
    const { username = "", password = "" } = await readJson(request);
    const user = await env.KV.get(`user:${String(username).toLowerCase()}`, "json");
    if (!user) return json({ error: "account_not_found" }, 404);

    const hash = await hashPassword(String(password), user.salt);
    if (hash !== user.hash) return json({ error: "wrong_password" }, 401);
    return json(await createSession(env, user));
  }

  if (path === "/api/me" && method === "GET") {
    const s = await getSession(request, env);
    if (!s) return json({ error: "unauthorized" }, 401);
    return json({ user: s });
  }

  /* ----- المشاريع ----- */
  if (path === "/api/projects" && method === "GET") {
    const list = await env.KV.list({ prefix: "proj:", limit: 1000 });
    const items = await Promise.all(list.keys.map(k => env.KV.get(k.name, "json")));
    return json(items.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)));
  }

  if (path === "/api/projects" && method === "POST") {
    const s = await getSession(request, env);
    if (s?.role !== "developer") return json({ error: "forbidden" }, 403);

    const body = await readJson(request);
    const title = String(body.title || "").trim().slice(0, 80);
    const desc = String(body.desc || "").trim().slice(0, 500);
    const tags = String(body.tags || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 8);
    const fileName = String(body.fileName || "").trim().slice(0, 120);
    const fileType = String(body.fileType || "application/octet-stream").slice(0, 100);
    const data = String(body.data || "");
    if (!title || !fileName || !data) return json({ error: "missing_fields" }, 400);

    const size = Math.floor(data.length * 0.75);
    if (size > MAX_FILE_BYTES) return json({ error: "file_too_big" }, 413);

    const id = randomHex(8);
    const meta = { id, title, desc, tags, fileName, fileType, size, date: new Date().toISOString() };
    await env.KV.put(`file:${id}`, data);
    await env.KV.put(`proj:${id}`, JSON.stringify(meta));
    return json({ ok: true, project: meta });
  }

  const projMatch = path.match(/^\/api\/projects\/([a-f0-9]{16})(\/file)?$/);
  if (projMatch) {
    const id = projMatch[1];

    // تحميل الملف (متاح للجميع)
    if (method === "GET" && projMatch[2]) {
      const meta = await env.KV.get(`proj:${id}`, "json");
      const b64 = await env.KV.get(`file:${id}`);
      if (!meta || !b64) return json({ error: "not_found" }, 404);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          "Content-Type": meta.fileType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`
        }
      });
    }

    // حذف مشروع (للمطور فقط)
    if (method === "DELETE" && !projMatch[2]) {
      const s = await getSession(request, env);
      if (s?.role !== "developer") return json({ error: "forbidden" }, 403);
      await env.KV.delete(`proj:${id}`);
      await env.KV.delete(`file:${id}`);
      return json({ ok: true });
    }
  }

  /* ----- التواصل: الرسالة تنحفظ في صندوق المطور ----- */
  if (path === "/api/contact" && method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim().slice(0, 60);
    const email = String(body.email || "").trim().slice(0, 100);
    const message = String(body.message || "").trim().slice(0, 1500);
    if (!name || !message) return json({ error: "missing_fields" }, 400);

    const id = crypto.randomUUID();
    const entry = { id, name, email, message, date: new Date().toISOString() };
    await env.KV.put(`msg:${String(Date.now()).padStart(15, "0")}:${id}`, JSON.stringify(entry));

    let delivered = false;
    try { delivered = await notifyDeveloper(env, entry); } catch (e) { console.log("notify failed:", e.message); }
    return json({ ok: true, delivered });
  }

  /* ----- صندوق الرسائل (للمطور فقط) ----- */
  if (path === "/api/messages" && method === "GET") {
    const s = await getSession(request, env);
    if (s?.role !== "developer") return json({ error: "forbidden" }, 403);
    const list = await env.KV.list({ prefix: "msg:", limit: 500 });
    const items = await Promise.all(list.keys.map(k => env.KV.get(k.name, "json")));
    return json(items.filter(Boolean).reverse());
  }

  if (path.startsWith("/api/messages/") && method === "DELETE") {
    const s = await getSession(request, env);
    if (s?.role !== "developer") return json({ error: "forbidden" }, 403);
    const id = decodeURIComponent(path.slice("/api/messages/".length));
    const list = await env.KV.list({ prefix: "msg:", limit: 1000 });
    const key = list.keys.find(k => k.name.endsWith(`:${id}`));
    if (key) await env.KV.delete(key.name);
    return json({ ok: true });
  }

  if (path === "/api/test-dm" && method === "POST") {
    const s = await getSession(request, env);
    if (s?.role !== "developer") return json({ error: "forbidden" }, 403);
    const ok = await notifyDeveloper(env, { name: "اختبار", email: "", message: "رسالة تجريبية ✓" });
    return json({ ok });
  }

  /* ----- الغرف ----- */
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

  return json({ error: "not_found" }, 404);
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
        return json({ error: "server_error" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
