/* ===== إعدادات المطور (العرض فقط) ===== */
const CONFIG = {
  name: "محمد",
  title: "مطور Discord Bots و تطبيقات ويب Full-Stack",
  email: "mohamedhere63@gmail.com",
  discordName: "81a0",
  discordId: "1333368658566578259"
};

const PROJECTS = [
  { title: "منصة الامتحانات الذكية", desc: "موقع امتحانات بالذكاء الاصطناعي مع دخول للمعلم والطالب وطباعة الأوراق والشهادات.", tags: ["Express", "AI", "Groq"] },
  { title: "موقع الملازم", desc: "منصة للمعلمين لإنشاء الكتب والملازم مع محرر غني وتوليد أسئلة بالذكاء الاصطناعي.", tags: ["Node.js", "Editor", "AI"] },
  { title: "Khayal Draw", desc: "محرر صور ورسم احترافي يعمل في المتصفح.", tags: ["React", "Vite", "TypeScript"] },
  { title: "NovaDB", desc: "قاعدة بيانات مبنية من الصفر على Node.js و Socket.io.", tags: ["Node.js", "Socket.io"] },
  { title: "بوتات Discord", desc: "بوتات متعددة الأغراض لسيرفرات Discord.", tags: ["discord.js"] }
];

/* ===== أدوات ===== */
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
let currentRoom = null;
let mySymbol = null;
let ws = null;
let reconnectTimer = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    <div class="glass stat"><b>${PROJECTS.length}+</b><span>مشاريع</span></div>
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
  <div class="grid">
    ${PROJECTS.map(p => `
      <article class="glass proj">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.desc)}</p>
        <div class="chips">${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      </article>`).join("")}
  </div>`;
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
  { re: /^\/projects$/, view: projects },
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

/* ===== الملف الشخصي وصندوق الرسائل ===== */
async function initProfile() {
  const box = $("#profileBox");
  if (!localStorage.getItem("im_token")) return renderLogin(box);
  try {
    const msgs = await api("/api/messages");
    renderDashboard(box, msgs);
  } catch (err) {
    if (err.status === 401) {
      localStorage.removeItem("im_token");
      renderLogin(box);
    } else {
      box.textContent = "صار خطأ في تحميل الصفحة";
    }
  }
}

function renderLogin(box) {
  box.innerHTML = `
    <form id="loginForm">
      <input id="lu" placeholder="اسم المستخدم" autocomplete="username" required>
      <input id="lp" type="password" placeholder="كلمة المرور" autocomplete="current-password" required>
      <button class="btn primary" type="submit">دخول</button>
      <p id="loginErr" class="err"></p>
    </form>`;

  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    try {
      const { token } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: $("#lu").value.trim(), password: $("#lp").value })
      });
      localStorage.setItem("im_token", token);
      initProfile();
    } catch {
      $("#loginErr").textContent = "اسم المستخدم أو كلمة المرور غلط";
    }
  };
}

function renderDashboard(box, msgs) {
  const bio = localStorage.getItem("im_bio") || "مطور Discord Bots و Full-Stack.";
  box.innerHTML = `
    <div class="row">
      <div class="row" style="justify-content:flex-start">
        <div class="avatar">MM</div>
        <div><h3>${esc(CONFIG.name)}</h3><p class="muted">${esc(CONFIG.discordName)} • ${esc(CONFIG.email)}</p></div>
      </div>
      <button class="btn ghost small" id="logout">خروج</button>
    </div>
    <form id="bioForm" style="margin-top:22px">
      <textarea id="bio">${esc(bio)}</textarea>
      <button class="btn primary small" style="align-self:flex-start">حفظ البروفايل</button>
    </form>
    <h3 style="margin-top:36px">الرسائل الواردة (${msgs.length})</h3>
    <div style="margin-top:14px">
      ${msgs.length ? msgs.map(m => `
        <div class="inbox-item">
          <b>${esc(m.name)}</b> <small>${esc(m.email)} • ${new Date(m.date).toLocaleString("ar")}</small>
          <p>${esc(m.message)}</p>
          <button class="btn small danger" data-del="${esc(m.id)}">حذف</button>
        </div>`).join("") : `<p class="muted">ما فيه رسائل بعد.</p>`}
    </div>`;

  $("#logout").onclick = () => { localStorage.removeItem("im_token"); initProfile(); };
  $("#bioForm").onsubmit = e => {
    e.preventDefault();
    localStorage.setItem("im_bio", $("#bio").value);
    alert("تم حفظ البروفايل ✓");
  };
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
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
