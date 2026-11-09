/* ===== إعدادات المطور (العرض فقط) ===== */
const CONFIG = {
  name: "محمد",
  title: "مطور Discord Bots و تطبيقات ويب Full-Stack",
  email: "mohamedhere63@gmail.com",
  discordName: "81a0",
  discordId: "1333368658566578259"
};

/* ===== أدوات ===== */
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
let currentRoom = null;
let mySymbol = null;
let ws = null;
let reconnectTimer = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.ceil(n / 1024)) + " KB";

async function api(url, opts = {}) {
  const token = localStorage.getItem("im_token");
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error("request failed"), { status: res.status, data });
  return data;
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function navigate(url) {
  if (url !== location.pathname) history.pushState({}, "", url);
  render();
}

/* ===== الصفحات ===== */
function home() {
  return `
  <section class="hero">
    <div>
      <p class="kicker">مرحباً بك في عالمي</p>
      <h1>أنا <span class="grad">${esc(CONFIG.name)}</span><br>وأبني تجارب رقمية مختلفة</h1>
      <p class="lead">${esc(CONFIG.title)}. أحوّل الأفكار إلى بوتات وتطبيقات ويب تشتغل بسلاسة.</p>
      <div class="btns">
        <a class="btn primary" href="/projects" data-link>شوف مشاريعي</a>
        <a class="btn ghost" href="/contact" data-link>تواصل معي</a>
      </div>
    </div>
    <div class="hero-card glass">
      <div class="logo-big">MM</div>
      <h3>Info Madman</h3>
      <p>Developer • Discord • Web</p>
    </div>
  </section>
  <section class="stats">
    <div class="glass stat"><b>Projects</b><span>تحميل مباشر</span></div>
    <div class="glass stat"><b>Full-Stack</b><span>تطوير شامل</span></div>
    <div class="glass stat"><b>AI</b><span>حلول ذكية</span></div>
  </section>`;
}

function about() {
  const skills = ["Node.js", "Express", "React", "TypeScript", "discord.js", "Socket.io", "Groq AI"];
  return `
  <h2 class="sec-title">عن المطور</h2>
  <div class="glass pad">
    <h3>${esc(CONFIG.name)}</h3>
    <p class="muted">${esc(CONFIG.title)}</p>
    <p style="margin-top:14px">أطوّر بوتات Discord وتطبيقات الويب الكاملة (Frontend + Backend)، وأركّز على الكود النظيف والتصميم اللي يعطي المستخدم تجربة ممتعة. أشتغل بشكل مستقل وأبني مشاريعي من الصفر.</p>
    <div class="chips">${skills.map(s => `<span class="chip">${s}</span>`).join("")}</div>
  </div>
  <div class="contacts">
    <div class="glass"><small>الإيميل</small><a href="mailto:${esc(CONFIG.email)}">${esc(CONFIG.email)}</a></div>
    <div class="glass"><small>اسم Discord</small><b>${esc(CONFIG.discordName)}</b></div>
    <div class="glass"><small>ID الديسكورد</small><b>${esc(CONFIG.discordId)}</b>
      <div style="margin-top:8px"><button class="btn small" data-copy="${esc(CONFIG.discordId)}">نسخ</button></div>
    </div>
  </div>`;
}

function projects() {
  return `
  <h2 class="sec-title">المشاريع</h2>
  <div id="projList" class="grid"><p class="muted">جاري التحميل...</p></div>`;
}

async function initProjects() {
  const list = $("#projList");
  try {
    const items = await api("/api/projects");
    if (!items.length) { list.innerHTML = `<p class="muted">ما فيه مشاريع بعد.</p>`; return; }
    list.innerHTML = items.map(p => `
      <article class="glass proj">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.desc)}</p>
        <div class="chips">${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
        <a class="btn primary small" href="/api/projects/${p.id}/file" download>تحميل ${esc(p.fileName)} (${fmtSize(p.size)})</a>
      </article>`).join("");
  } catch {
    list.innerHTML = `<p class="err">ما قدرنا نحمّل المشاريع</p>`;
  }
}

function lobby() {
  return `
  <h2 class="sec-title">لعبة XO أونلاين</h2>
  <p class="muted">أنشئ غرفة وأرسل الرابط لصاحبك، أو ادخل بكود غرفة موجودة.</p>
  <div class="glass pad lobby">
    <button class="btn primary" id="createRoom">إنشاء غرفة جديدة</button>
    <div class="join-row">
      <input id="roomCode" placeholder="كود الغرفة (6 أحرف)" maxlength="6">
      <button class="btn ghost" id="joinRoom">دخول</button>
    </div>
    <p id="lobbyErr" class="err"></p>
  </div>`;
}

function room(code) {
  return `
  <h2 class="sec-title">غرفة <span class="grad">${esc(code)}</span></h2>
  <div class="glass xo">
    <p id="roomInfo" class="muted">جاري الدخول للغرفة...</p>
    <p id="xoScore" class="muted"></p>
    <p id="xoStatus"></p>
    <div id="board" class="board"></div>
    <div class="row">
      <button class="btn ghost small" id="copyLink">نسخ رابط الغرفة</button>
      <button class="btn primary small" id="rematch" hidden>لعب مرة ثانية</button>
    </div>
  </div>`;
}

function contact() {
  return `
  <h2 class="sec-title">تواصل مع المطور</h2>
  <div class="glass pad">
    <form id="contactForm">
      <input id="cName" placeholder="اسمك" required maxlength="60">
      <input id="cEmail" type="email" placeholder="إيميلك (اختياري)" maxlength="100">
      <textarea id="cMsg" placeholder="اكتب رسالتك..." required maxlength="1500"></textarea>
      <button class="btn primary" type="submit">إرسال</button>
      <p id="cStatus" class="msg"></p>
    </form>
  </div>`;
}

function profile() {
  return `
  <h2 class="sec-title">الملف الشخصي</h2>
  <div id="profileBox" class="glass pad"></div>`;
}

/* ===== الراوتر ===== */
const routes = [
  { re: /^\/$/, view: home },
  { re: /^\/about$/, view: about },
  { re: /^\/projects$/, view: projects, init: initProjects },
  { re: /^\/games$/, view: lobby, init: initLobby },
  { re: /^\/games\/([A-Za-z0-9]{6})$/, view: m => room(m[1].toUpperCase()), init: m => initRoom(m[1].toUpperCase()) },
  { re: /^\/contact$/, view: contact, init: initContact },
  { re: /^\/profile$/, view: profile, init: initProfile }
];

function closeRoomSocket() {
  clearTimeout(reconnectTimer);
  if (ws) {
    const old = ws;
    ws = null;
    old.close();
  }
}

function render() {
  const path = location.pathname.replace(/\/+$/, "") || "/";

  if (currentRoom) {
    closeRoomSocket();
    currentRoom = null;
    mySymbol = null;
  }

  const base = "/" + (path.split("/")[1] || "");
  document.querySelectorAll("[data-link]").forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === base));
  $("#nav").classList.remove("open");
  window.scrollTo(0, 0);

  const route = routes.find(r => r.re.test(path));
  if (!route) {
    app.innerHTML = `<section class="page"><h2 class="sec-title">الصفحة غير موجودة</h2><a class="btn primary" href="/" data-link>الرئيسية</a></section>`;
    return;
  }

  const match = path.match(route.re);
  app.innerHTML = `<section class="page">${route.view(match)}</section>`;
  if (route.init) route.init(match);
}

/* ===== التواصل ===== */
function initContact() {
  $("#contactForm").onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const status = $("#cStatus");
    btn.disabled = true;
    try {
      await api("/api/contact", {
        method: "POST",
        body: JSON.stringify({ name: $("#cName").value, email: $("#cEmail").value, message: $("#cMsg").value })
      });
      status.textContent = "تم إرسال رسالتك للمطور ✓";
      status.className = "msg";
      e.target.reset();
    } catch {
      status.textContent = "صار خطأ، حاول مرة ثانية";
      status.className = "err";
    }
    btn.disabled = false;
  };
}

/* ===== XO أونلاين ===== */
function initLobby() {
  $("#createRoom").onclick = async () => {
    try {
      const { code } = await api("/api/rooms", { method: "POST" });
      navigate(`/games/${code}`);
    } catch {
      $("#lobbyErr").textContent = "ما قدرنا ننشئ الغرفة، حاول مرة ثانية";
    }
  };

  $("#joinRoom").onclick = async () => {
    const code = $("#roomCode").value.trim().toUpperCase();
    const err = $("#lobbyErr");
    if (!/^[A-Z0-9]{6}$/.test(code)) { err.textContent = "الكود لازم يكون 6 أحرف أو أرقام"; return; }
    try {
      const info = await api(`/api/rooms/${code}`);
      if (info.exists) navigate(`/games/${code}`);
      else err.textContent = "الغرفة ما لقيناها";
    } catch {
      err.textContent = "صار خطأ، حاول مرة ثانية";
    }
  };
}

async function initRoom(code) {
  currentRoom = code;

  $("#board").onclick = e => {
    const cell = e.target.closest(".cell");
    if (cell && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "move", index: +cell.dataset.i }));
    }
  };
  $("#rematch").onclick = () => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "rematch" }));
  };
  $("#copyLink").onclick = () => {
    navigator.clipboard?.writeText(location.href);
    $("#copyLink").textContent = "تم النسخ ✓";
    setTimeout(() => ($("#copyLink").textContent = "نسخ رابط الغرفة"), 1500);
  };

  try {
    const info = await api(`/api/rooms/${code}`);
    if (currentRoom !== code) return;
    if (!info.exists) { $("#roomInfo").textContent = "الغرفة ما لقيناها"; return; }
  } catch {
    $("#roomInfo").textContent = "صار خطأ في الاتصال";
    return;
  }

  connectRoom(code);
}

function connectRoom(code) {
  closeRoomSocket();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws/${code}`);
  ws = sock;

  sock.onopen = () => sock.send(JSON.stringify({ type: "join" }));

  sock.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === "joined") {
      mySymbol = msg.symbol;
      renderRoom(msg.state);
    } else if (msg.type === "state") {
      renderRoom(msg);
    } else if (msg.type === "error") {
      $("#roomInfo").textContent = msg.error;
    }
  };

  sock.onclose = () => {
    if (ws !== sock) return;
    const info = $("#roomInfo");
    if (info) info.textContent = "انقطع الاتصال، جاري إعادة الاتصال...";
    reconnectTimer = setTimeout(() => { if (currentRoom === code) connectRoom(code); }, 2000);
  };
}

function renderRoom(s) {
  const board = $("#board");
  if (!board) return;

  board.innerHTML = s.board.map((v, i) => `<button class="cell ${v}" data-i="${i}">${v}</button>`).join("");
  if (s.line) s.line.forEach(k => board.children[k].classList.add("win"));

  $("#xoScore").textContent = `X: ${s.score.X}  —  O: ${s.score.O}`;
  $("#roomInfo").textContent = `أنت: ${mySymbol || "..."}`;

  let text;
  if (s.players < 2) text = "بانتظار لاعب ثاني... شارك الرابط معه";
  else if (s.winner) text = s.winner === "draw" ? "تعادل!" : (s.winner === mySymbol ? "🎉 فزت!" : "خسرت هالجولة");
  else text = s.turn === mySymbol ? "دورك" : "دور الخصم";
  $("#xoStatus").textContent = text;

  const rematch = $("#rematch");
  rematch.hidden = !(s.winner && s.players === 2);
  rematch.textContent = s.rematch === 1 ? "بانتظار الخصم..." : "لعب مرة ثانية";
}

/* ===== الحساب والملف الشخصي ===== */
async function initProfile() {
  const box = $("#profileBox");
  if (!localStorage.getItem("im_token")) return renderAuth(box);
  try {
    const { user } = await api("/api/me");
    await renderDashboard(box, user);
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem("im_token");
      renderAuth(box);
    } else {
      box.textContent = "صار خطأ في تحميل الصفحة";
    }
  }
}

const AUTH_ERRORS = {
  account_not_found: "الحساب مو موجود. سوِّ حساب جديد من تبويب إنشاء حساب",
  wrong_password: "كلمة المرور غلط",
  exists: "اسم المستخدم هذا مأخوذ",
  invalid_username: "اسم المستخدم لازم يكون حروف إنجليزية وأرقام أو _ (من 3 إلى 20)",
  weak_password: "كلمة المرور لازم تكون 6 أحرف على الأقل"
};

function renderAuth(box, mode = "login") {
  const isLogin = mode === "login";
  box.innerHTML = `
    <div class="tabs">
      <button class="btn small ${isLogin ? "primary" : "ghost"}" data-mode="login">تسجيل دخول</button>
      <button class="btn small ${isLogin ? "ghost" : "primary"}" data-mode="register">إنشاء حساب</button>
    </div>
    <form id="authForm" style="margin-top:20px">
      <input id="au" placeholder="اسم المستخدم" autocomplete="username" required>
      <input id="ap" type="password" placeholder="كلمة المرور" autocomplete="${isLogin ? "current-password" : "new-password"}" required>
      <button class="btn primary" type="submit">${isLogin ? "دخول" : "إنشاء الحساب"}</button>
      <p id="authErr" class="err"></p>
    </form>`;

  box.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => renderAuth(box, b.dataset.mode));

  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const body = JSON.stringify({ username: $("#au").value.trim(), password: $("#ap").value });
    try {
      const data = await api(isLogin ? "/api/login" : "/api/register", { method: "POST", body });
      localStorage.setItem("im_token", data.token);
      initProfile();
    } catch (err) {
      $("#authErr").textContent = AUTH_ERRORS[err.data?.error] || "صار خطأ، حاول مرة ثانية";
    }
  };
}

async function renderDashboard(box, user) {
  const isDev = user.role === "developer";
  const bio = localStorage.getItem("im_bio") || "مطور Discord Bots و Full-Stack.";
  box.innerHTML = `
    <div class="row">
      <div class="row" style="justify-content:flex-start">
        <div class="avatar">${esc(user.id)}</div>
        <div>
          <h3>${esc(user.username)}</h3>
          <p class="muted">${isDev ? "المطور (حساب 01)" : "عضو"}</p>
        </div>
      </div>
      <button class="btn ghost small" id="logout">خروج</button>
    </div>
    <form id="bioForm" style="margin-top:22px">
      <textarea id="bio">${esc(bio)}</textarea>
      <button class="btn primary small" style="align-self:flex-start">حفظ البروفايل</button>
    </form>
    <div id="devArea">${isDev ? "" : `<p class="muted" style="margin-top:30px">حسابك عضو عادي. تقدر تحمّل المشاريع من صفحة المشاريع.</p>`}</div>`;

  $("#logout").onclick = () => { localStorage.removeItem("im_token"); initProfile(); };
  $("#bioForm").onsubmit = e => {
    e.preventDefault();
    localStorage.setItem("im_bio", $("#bio").value);
    alert("تم حفظ البروفايل ✓");
  };

  if (isDev) await renderDevArea();
}

async function renderDevArea() {
  const area = $("#devArea");
  const [msgs, projects] = await Promise.all([api("/api/messages"), api("/api/projects")]);

  area.innerHTML = `
    <h2 class="sec-title" style="margin-top:40px">رفع مشروع</h2>
    <form id="uploadForm" class="glass pad">
      <input id="pTitle" placeholder="اسم المشروع" required maxlength="80">
      <textarea id="pDesc" placeholder="وصف المشروع" maxlength="500" style="min-height:90px"></textarea>
      <input id="pTags" placeholder="الوسوم مفصولة بفاصلة (مثال: Node.js, AI)">
      <input id="pFile" type="file" required>
      <button class="btn primary" type="submit">رفع المشروع</button>
      <p id="uploadMsg" class="msg"></p>
    </form>

    <h2 class="sec-title" style="margin-top:40px">مشاريعي (${projects.length})</h2>
    <div>${projects.length ? projects.map(p => `
      <div class="inbox-item">
        <b>${esc(p.title)}</b> <small>${esc(p.fileName)} • ${fmtSize(p.size)}</small>
        <p class="muted">${esc(p.desc)}</p>
        <button class="btn small danger" data-delp="${esc(p.id)}">حذف</button>
      </div>`).join("") : `<p class="muted">ما رفعت مشاريع بعد.</p>`}</div>

    <h2 class="sec-title" style="margin-top:40px">الرسائل الواردة (${msgs.length})</h2>
    <div>${msgs.length ? msgs.map(m => `
      <div class="inbox-item">
        <b>${esc(m.name)}</b> <small>${esc(m.email)} • ${new Date(m.date).toLocaleString("ar")}</small>
        <p>${esc(m.message)}</p>
        <button class="btn small danger" data-del="${esc(m.id)}">حذف</button>
      </div>`).join("") : `<p class="muted">ما فيه رسائل بعد.</p>`}</div>`;

  $("#uploadForm").onsubmit = async e => {
    e.preventDefault();
    const file = $("#pFile").files[0];
    const msg = $("#uploadMsg");
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { msg.className = "err"; msg.textContent = "الملف أكبر من 15 MB"; return; }

    msg.className = "msg";
    msg.textContent = "جاري الرفع...";
    try {
      const data = await readBase64(file);
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title: $("#pTitle").value.trim(),
          desc: $("#pDesc").value.trim(),
          tags: $("#pTags").value,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          data
        })
      });
      initProfile();
    } catch (err) {
      msg.className = "err";
      msg.textContent = err.data?.error === "file_too_big" ? "الملف كبير" : "صار خطأ في الرفع";
    }
  };

  area.querySelectorAll("[data-delp]").forEach(b => b.onclick = async () => {
    if (!confirm("تبي تحذف المشروع؟")) return;
    await api(`/api/projects/${b.dataset.delp}`, { method: "DELETE" });
    initProfile();
  });

  area.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    await api(`/api/messages/${encodeURIComponent(b.dataset.del)}`, { method: "DELETE" });
    initProfile();
  });
}

/* ===== أحداث عامة ===== */
document.addEventListener("click", e => {
  const link = e.target.closest("a[data-link]");
  if (link && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy);
    copy.textContent = "تم ✓";
    setTimeout(() => (copy.textContent = "نسخ"), 1500);
  }
});

window.addEventListener("popstate", render);
$("#menuBtn").onclick = () => $("#nav").classList.toggle("open");
$("#year").textContent = new Date().getFullYear();
render();
