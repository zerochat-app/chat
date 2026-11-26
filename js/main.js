import { sb, configured, hashPw } from "./firebase.js";
import { h, $, ico, toast, modal, confirmBox, popup, ms, fmtTime, fmtDT, fmtList, loadingView, setLoading } from "./ui.js";
import { officialView, VERSION_NO } from "./official.js";
import { initCalls, startCall } from "./call.js";
import { S, meP, nameOf, isDev, isVerified, verifiedUid, isOnline, badge, avatar, COLORS, loadProfiles, tempBanMs } from "./state.js";
import { adminPanel } from "./admin.js";
import { grantAdmin, ADMIN_PAGE } from "./gate.js";
const app = $("#app");
const pref = (k, d) => { try { const v = localStorage.getItem("cs_p_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem("cs_p_" + k, JSON.stringify(v)); } catch { } };
const ACCENTS = { blue: ["#4f7cff", "#8b5cf6"], mint: ["#10b981", "#06b6d4"], pink: ["#ec4899", "#8b5cf6"], sunset: ["#f97316", "#ec4899"], lime: ["#65a30d", "#10b981"], graphite: ["#475569", "#64748b"] };
function applyAppearance() {
  const r = document.documentElement, k = pref("accent", "blue"), a = ACCENTS[k];
  for (const v of ["--accent", "--accent2", "--grad", "--mine"]) r.style.removeProperty(v);
  if (a && k !== "blue") {
    r.style.setProperty("--accent", a[0]); r.style.setProperty("--accent2", a[1]);
    r.style.setProperty("--grad", `linear-gradient(135deg,${a[0]},${a[1]})`); r.style.setProperty("--mine", `linear-gradient(135deg,${a[0]},${a[1]})`);
  }
  r.dataset.fs = pref("fs", "m"); r.dataset.dense = pref("dense", false) ? "1" : "0"; r.dataset.wall = pref("wall", "normal");
  document.querySelector("meta[name=theme-color]")?.setAttribute("content", (a || ACCENTS.blue)[0]);
}
applyAppearance();
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
let actx = null;
function beep() {
  if (!pref("sound", true) || pref("dnd", false)) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(880, t0); o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.09);
    g.gain.setValueAtTime(1e-4, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.25);
    o.connect(g).connect(actx.destination); o.start(); o.stop(t0 + 0.26);
  } catch { }
}
let beatNow = () => { };
let stopCalls = null;
let whisperTo = [];
let newCount = 0;
const dayLabel = (t) => {
  const d = new Date(t), n = new Date(), y = new Date(Date.now() - 864e5);
  if (d.toDateString() === n.toDateString()) return "今日";
  if (d.toDateString() === y.toDateString()) return "昨日";
  return d.toLocaleDateString("ja-JP", { year: d.getFullYear() === n.getFullYear() ? void 0 : "numeric", month: "long", day: "numeric", weekday: "short" });
};
const isUnread = (r) => r.id !== cur && r.last_author && r.last_author !== S.uid && ms(r.last_message_at) > (readMap[r.id] || 0);
function fmt(t) {
  return t.split(/(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\|\|[^|\n]+\|\|)/g).map((s, i) => {
    if (!(i % 2)) return s;
    if (s.startsWith("**")) return h("b", {}, s.slice(2, -2));
    if (s.startsWith("~~")) return h("s", {}, s.slice(2, -2));
    if (s.startsWith("`")) return h("code", {}, s.slice(1, -1));
    const sp = h("span", { class: "spoiler", title: "タップで表示" }, s.slice(2, -2));
    sp.addEventListener("click", (e) => { e.stopPropagation(); sp.classList.toggle("show"); });
    return sp;
  });
}
function jumpTo(id) {
  const el = $("#msgs")?.querySelector(`[data-id="${id}"]`);
  if (!el) return toast("元のメッセージは読み込まれていません");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1500);
}
function updateJump() {
  const box = $("#msgs"), j = $("#jump");
  if (!box || !j) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  if (near) newCount = 0;
  j.hidden = near;
  j.querySelector("b").textContent = newCount ? newCount + "件の新着" : "最新へ";
}
async function startDm(uid) {
  try { const id = await rpc("start_dm", { other: uid }); await loadRooms(); openRoom(id); } catch { toast("DMを開始できませんでした"); }
}
function markAllRead() {
  Object.values(rooms).forEach((r) => { readMap[r.id] = Date.now(); });
  saveRead(); renderRooms(); toast("すべて既読にしました");
}
// 管理者ゲート: バージョン表記を5回タップ
let vTaps = 0, vTimer = null;
function versionTap() {
  vTaps++; clearTimeout(vTimer); vTimer = setTimeout(() => { vTaps = 0; }, 2500);
  if (vTaps < 5) return;
  vTaps = 0;
  if (isDev()) { location.href = ADMIN_PAGE; return; }
  adminAuthModal();
}
function adminAuthModal() {
  const code = h("input", { class: "field", type: "password", placeholder: "認証コード", autocomplete: "off" });
  const err = h("div", { class: "err", role: "alert" });
  let close;
  const go = async () => {
    err.textContent = "";
    try { await grantAdmin(code.value); if (S.users[S.uid]) S.users[S.uid].role = "developer"; close(); toast("管理者として認証しました"); setTimeout(() => { location.href = ADMIN_PAGE; }, 500); }
    catch (e) { err.textContent = e.message || "認証できませんでした"; }
  };
  code.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) go(); });
  close = modal("管理者認証", [h("div", { style: "display:flex;gap:12px;align-items:center" }, h("div", { class: "lock-ic" }, ico("lock", 26)), h("p", { style: "color:var(--sub);font-size:13px" }, "管理者ダッシュボードを開くには認証が必要です。")), code, err, h("button", { class: "btn", onclick: go }, "認証する")]);
  setTimeout(() => code.focus(), 60);
}
let keysBound = false;
function bindKeys() {
  if (keysBound) return; keysBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const o = [...document.querySelectorAll(".overlay,.lb")].pop();
      if (o) o.remove(); else { document.querySelector(".popup")?.remove(); $("#stamps")?.classList.remove("show"); }
    }
  });
}
const VERSION = "ZeroChat " + VERSION_NO;
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const STAMPS = "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😴 😭 😡 🥺 😱 🤗 🙄 🥳 😇 ❤️ 💖 💕 👍 👎 👏 🙌 🙏 💪 👌 ✌️ 🤝 👋 🎉 🎂 🎁 🔥 ✨ ⭐ 🌈 💯 ✅ ❌ 🐶 🐱 🐰 🦊 🐻 🐼 🍎 🍜 🍣 🍔 🍕 🍩 ☕".split(" ");
let rooms = {};
let cur = null;
let msgs = [];
let reacts = {};
let reads = {};
let votes = {};
let ch = null, roomsCh = null, profCh = null;
let listFilter = "all", openMsgId = null, replyTo = null;
let hb = null, typingUntil = 0, lastTypingSent = 0, typingNames = [], readTimer = null, loadTimer = null;
let started = false;
const imgCache = /* @__PURE__ */ new Map();
let readMap = {};
try {
  readMap = JSON.parse(localStorage.getItem("cs_read") || "{}");
} catch {
}
const saveRead = () => {
  try {
    localStorage.setItem("cs_read", JSON.stringify(readMap));
  } catch {
  }
};
const noRead = () => isVerified() && localStorage.getItem("cs_noread_" + S.uid) === "1";
const stealth = () => isVerified() && pref("stealth", false);
const noTyping = () => isVerified() && pref("notyping", false);
const unlocked = /* @__PURE__ */ new Set();
const isLockedView = (r) => !!r && !!r.locked && !unlocked.has(r.id);
const canPost = (r) => !(r.kind === "official" && !isDev()) && !(r.post_admin_only && !isRoomAdmin(r) && !isDev());
const isDm = (r) => r.kind === "dm";
const otherUid = (r) => (r.members || []).find((u) => u !== S.uid);
const roomTitle = (r) => isDm(r) ? nameOf(otherUid(r)) : r.name || "ルーム";
const isRoomAdmin = (r) => ["owner", "admin"].includes(r.mem?.role);
const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
};
const errMsg = (e) => ({ banned: "このルームには入れません", "not found": "ルームが見つかりません", forbidden: "権限がありません", password: "パスワードが必要です", "wrong password": "パスワードが違います", short: "パスワードは4文字以上で入力してください" })[e?.message] || e?.message || String(e);
const THEMES = ["auto", "light", "dark"];
const applyTheme = () => {
  document.documentElement.dataset.theme = localStorage.getItem("cs_theme") || "auto";
};
applyTheme();
if (!configured) {
  app.append(h("div", { class: "login" }, h(
    "div",
    { class: "login-card" },
    h("div", { class: "wordmark" }, "Zero", h("i", {}, "Chat")),
    h("p", {}, "Firebase の設定を読み込めませんでした。src/firebase.ts の設定を確認してください。")
  )));
} else {
  const p = new URLSearchParams(location.search);
  if (p.get("room")) {
    sessionStorage.setItem("cs_room", p.get("room"));
    history.replaceState(null, "", location.pathname);
  }
  sb.auth.onAuthStateChange((_ev, session) => {
    if (session?.user) {
      if (S.uid !== session.user.id || !started) {
        S.uid = session.user.id;
        S.email = session.user.email || "";
        setTimeout(startApp, 0);
      }
    } else {
      teardown();
      showLogin();
    }
  });
}
function showLogin() {
  app.replaceChildren();
  let signup = false;
  const err = h("div", { class: "err", role: "alert" }, window.__zcNotice || "");
  window.__zcNotice = "";
  const nameF = h("input", { class: "field", placeholder: "表示名", style: "display:none" });
  const mail = h("input", { class: "field", type: "email", placeholder: "メールアドレス", autocomplete: "email" });
  const pass = h("input", { class: "field", type: "password", placeholder: "パスワード（6文字以上）", autocomplete: "current-password" });
  const go = h("button", { class: "btn" }, "ログイン");
  const sw = h("button", { class: "linklike" }, "はじめての方はこちら（新規登録）");
  sw.onclick = () => {
    signup = !signup;
    nameF.style.display = signup ? "" : "none";
    go.textContent = signup ? "登録してはじめる" : "ログイン";
    sw.textContent = signup ? "アカウントをお持ちの方はこちら" : "はじめての方はこちら（新規登録）";
  };
  const T = { "Invalid login credentials": "メールアドレスかパスワードが違います", "User already registered": "このメールアドレスはすでに登録されています", "Email not confirmed": "メールの確認が済んでいません", "Password should be at least 6 characters": "パスワードは6文字以上にしてください" };
  const submit = async () => {
    err.textContent = "";
    go.disabled = true;
    try {
      if (signup) {
        if (!nameF.value.trim()) throw new Error("表示名を入力してください");
        const { data, error } = await sb.auth.signUp({ email: mail.value.trim(), password: pass.value, options: { data: { name: nameF.value.trim() } } });
        if (error) throw error;
        if (!data.session) err.textContent = "確認メールを送りました。メール内のリンクを開いてからログインしてください。";
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: mail.value.trim(), password: pass.value });
        if (error) throw error;
        app.replaceChildren(loadingView());
      }
    } catch (e) {
      err.textContent = T[e.message] || e.message || "ログインできませんでした";
    }
    go.disabled = false;
  };
  go.onclick = submit;
  [mail, pass, nameF].forEach((i) => i.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) submit();
  }));
  const google = h("button", { class: "btn ghost", onclick: async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) err.textContent = "Googleログインを使うには Firebase Authentication の Google プロバイダ設定が必要です（SETUP.md）";
  } }, "Googleでログイン");
  const anon = h("button", { class: "btn ghost", onclick: async () => {
    const { error } = await sb.auth.signInAnonymously();
    if (error) err.textContent = "匿名ログインは Firebase Authentication の匿名プロバイダを有効にしてください（SETUP.md）";
  } }, "登録せずに試す（匿名）");
  app.append(h("div", { class: "login" }, h(
    "div",
    { class: "login-card" },
    h("div", { class: "wordmark" }, "Zero", h("i", {}, "Chat")),
    h("p", { style: "color:var(--sub)" }, "友だちとすぐつながれるチャット"),
    google,
    h("div", { class: "sep" }, "または"),
    nameF,
    mail,
    pass,
    err,
    go,
    sw,
    anon
  )));
}
async function logout() {
  try {
    await sb.from("profiles").update({ online: false }).eq("id", S.uid);
  } catch {
  }
  await sb.auth.signOut();
}
function teardown() {
  started = false;
  clearInterval(hb);
  try { stopCalls?.(); } catch { }
  stopCalls = null;
  [ch, roomsCh, profCh].forEach((c) => c && sb.removeChannel(c));
  ch = roomsCh = profCh = null;
  cur = null;
  rooms = {};
  unlocked.clear();
  S.users = {};
  S.uid = "";
  document.body.classList.remove("in-chat");
}
async function startApp() {
  if (started) return;
  started = true;
  app.replaceChildren(loadingView("プロフィールを読み込み中…"));
  await loadProfiles();
  if (!meP()) {
    await new Promise((r) => setTimeout(r, 800));
    await loadProfiles();
  }
  if (meP()?.banned || tempBanMs(meP()) > Date.now()) {
    alert(meP()?.banned ? "このアカウントは管理者により利用停止されています" : "一時的に利用停止されています（解除: " + new Date(tempBanMs(meP())).toLocaleString("ja-JP") + "）");
    started = false;
    await sb.auth.signOut();
    return;
  }
  setLoading("ルームを読み込み中…");
  app.replaceChildren(h(
    "div",
    { class: "shell" },
    h(
      "aside",
      { class: "side" },
      h(
        "div",
        { class: "side-head" },
        h("div", { class: "wordmark" }, "Zero", h("i", {}, "Chat")),
        h("button", { class: "icon-btn", "aria-label": "設定", onclick: settingsModal }, ico("settings"))
      ),
      h(
        "div",
        { class: "side-actions" },
        h("button", { class: "btn", onclick: roomModal }, ico("plus", 17), "ルーム"),
        h("button", { class: "btn ghost", onclick: dmModal }, ico("msg", 17), "DM"),
        h("button", { class: "btn ghost icon", "aria-label": "保存したメッセージ", title: "保存したメッセージ", onclick: savedModal }, ico("star", 18))
      ),
      h("div", { class: "sidesearch" }, ico("search", 16), h("input", { id: "sideQ", placeholder: "ルームを検索", "aria-label": "ルームを検索", oninput: () => renderRooms() })),
      h("div", { class: "strip", id: "onlineStrip" }),
      h("div", { class: "filters", id: "filters" }),
      h("div", { class: "room-list", id: "roomList" }),
      h("div", { class: "side-foot" }, h("button", { class: "ver", onclick: versionTap, "aria-label": "バージョン" }, VERSION), h("span", { class: "online-cnt", id: "onlineCnt" }))
    ),
    h("main", { class: "main", id: "main" }, welcome())
  ));
  drawFilters();
  bindKeys();
  await loadRooms();
  profCh = sb.channel("profiles").on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
    if (p.eventType === "DELETE") delete S.users[p.old.id];
    else S.users[p.new.id] = p.new;
    if (p.eventType === "DELETE" && p.old.id === S.uid) {
      alert("このアカウントは管理者により削除されました");
      sb.auth.signOut();
      return;
    }
    if (S.users[S.uid]?.banned || tempBanMs(S.users[S.uid]) > Date.now()) {
      alert(S.users[S.uid].banned ? "このアカウントは管理者により利用停止されています" : "一時的に利用停止されました（解除: " + new Date(tempBanMs(S.users[S.uid])).toLocaleString("ja-JP") + "）");
      sb.auth.signOut();
      return;
    }
    renderRooms();
    renderHeader();
  }).subscribe();
  const rl = () => {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(loadRooms, 300);
  };
  roomsCh = sb.channel("rooms-watch").on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, rl).on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, rl).subscribe();
  const beat = () => {
    if (S.uid && (!document.hidden || stealth())) sb.from("profiles").update({ online: !stealth(), last_seen: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", S.uid).then(() => {
    });
  };
  beatNow = beat;
  stopCalls = initCalls();
  beat();
  hb = setInterval(beat, 12e4);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      beat();
      scheduleRead();
    }
  });
  window.addEventListener("pagehide", () => {
    if (S.uid) sb.from("profiles").update({ online: false }).eq("id", S.uid).then(() => {
    });
  });
  document.addEventListener("click", (e) => {
    const p = $("#stamps");
    if (p && !p.contains(e.target) && !e.target.closest("#stampBtn")) p.classList.remove("show");
  });
  const rid = sessionStorage.getItem("cs_room");
  if (rid) {
    sessionStorage.removeItem("cs_room");
    joinByCode(rid);
  } else if (rooms["official"] && !isMobile()) openRoom("official");
}
const isMobile = () => matchMedia("(max-width:760px)").matches;
const welcome = () => h("div", { class: "welcome" }, h("div", { class: "welcome-in" }, h("div", { class: "welcome-ic" }, ico("msg", 34)), h("div", { style: "font-size:22px;font-weight:700;color:var(--ink);margin-bottom:6px" }, "ようこそ、" + (meP()?.name || "") + "さん"), h("div", {}, "ルームを選ぶか、IDで参加・新規作成しましょう。")));
function drawFilters() {
  $("#filters")?.replaceChildren(...[["all", "すべて"], ["unread", "未読"], ["fav", "★"], ["group", "ルーム"], ["dm", "DM"]].map(([k, l]) => h("button", { class: listFilter === k ? "on" : "", onclick: () => {
    listFilter = k;
    drawFilters();
    renderRooms();
  } }, l)), h("button", { class: "icon-btn mini", title: "すべて既読にする", "aria-label": "すべて既読にする", onclick: markAllRead }, ico("checks", 17)));
}
async function loadRooms() {
  if (!S.uid) return;
  const { data, error } = await sb.from("room_members").select("role,hidden,muted,favorite,banned,rooms(*)").eq("user_id", S.uid).eq("banned", false);
  if (error) {
    console.error(error);
    return toast("一覧を読み込めません");
  }
  const next = {};
  (data || []).forEach((m) => {
    if (m.rooms) next[m.rooms.id] = {
      ...m.rooms,
      mem: { role: m.role, hidden: m.hidden, muted: m.muted, favorite: m.favorite },
      members: Array.isArray(m.rooms.members) ? m.rooms.members : []
    };
  });
  const prev = rooms;
  rooms = next;
  for (const r of Object.values(rooms)) {
    const p = prev[r.id];
    if (p && ms(r.last_message_at) > ms(p.last_message_at) && r.last_author && r.last_author !== S.uid && r.id !== cur && !r.mem.muted) notify(r);
  }
  if (cur && !rooms[cur]) {
    toast("このルームは利用できなくなりました");
    closeRoom();
  }
  renderRooms();
  renderHeader();
  applyLock();
}
function notify(r) {
  if (pref("dnd", false)) return;
  beep();
  const pv = isLockedView(r) ? "🔒 ロック中のルーム" : (r.last_message_preview || "");
  if (!document.hidden) {
    toast(roomTitle(r) + ": " + pv.slice(0, 30));
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(roomTitle(r), { body: isLockedView(r) ? "🔒 ロック中のルーム" : (r.last_message_preview || "新しいメッセージ"), icon: "icon.svg" });
    } catch {
    }
  }
}
function renderRooms() {
  const list = $("#roomList");
  if (!list) return;
  const sq = ($("#sideQ")?.value || "").trim().toLowerCase();
  const arr = Object.values(rooms).filter((r) => {
    if (listFilter === "group" && isDm(r)) return false;
    if (listFilter === "dm" && !isDm(r)) return false;
    if (listFilter === "fav" && !r.mem.favorite) return false;
    if (listFilter === "unread" && !isUnread(r)) return false;
    return !sq || roomTitle(r).toLowerCase().includes(sq);
  }).sort((a, b) => Number(b.kind === "official") - Number(a.kind === "official") || Number(b.mem.favorite) - Number(a.mem.favorite) || ms(b.last_message_at) - ms(a.last_message_at));
  list.replaceChildren();
  if (!arr.length) {
    list.append(h("div", { class: "empty" }, sq || listFilter !== "all" ? "該当するものがありません" : "まだルームがありません。「ルーム」から作成、またはIDで参加。「DM」で友だちに話しかけられます。"));
    renderStrip();
    return;
  }
  for (const r of arr) {
    const other = isDm(r) ? otherUid(r) : null;
    const unread = isUnread(r);
    list.append(h(
      "button",
      { class: "room" + (r.id === cur ? " active" : "") + (unread ? " unread" : ""), onclick: () => openRoom(r.id) },
      avatar(other || r.created_by || r.id, roomTitle(r), false, other && isOnline(other)),
      h(
        "div",
        { class: "meta" },
        h("div", { class: "top" }, h("div", { class: "name" }, roomTitle(r), r.kind === "official" ? badge() : null, r.mem.favorite ? " ★" : ""), h("div", { class: "time" }, fmtList(r.last_message_at))),
        h("div", { class: "last" }, isLockedView(r) ? "🔒 ロック中" : r.last_message_preview || (isDm(r) ? "メッセージを送ってみましょう" : r.descr || "ルームID: " + r.id))
      ),
      unread ? h("span", { class: "dot", "aria-label": "未読" }) : null
    ));
  }
  renderStrip();
}
function renderStrip() {
  const n = Object.values(rooms).filter(isUnread).length;
  document.title = (n ? `(${n}) ` : "") + "ZeroChat";
  const on = Object.values(S.users).filter((u) => u.id !== S.uid && !u.banned && isOnline(u.id));
  const cnt = $("#onlineCnt"); if (cnt) cnt.textContent = on.length ? on.length + "人オンライン" : "";
  const st = $("#onlineStrip"); if (!st) return;
  st.hidden = !on.length;
  st.replaceChildren(...on.slice(0, 14).map((u) => h("button", { class: "strip-u", title: u.name + "にDM", "aria-label": u.name + "にDM", onclick: () => startDm(u.id) }, avatar(u.id, u.name, true, true))));
}
async function openRoom(id) {
  if (!rooms[id]) return;
  if (cur === id) {
    document.body.classList.add("in-chat");
    return;
  }
  if (ch) {
    sb.removeChannel(ch);
    ch = null;
  }
  cur = id;
  msgs = [];
  reacts = {};
  reads = {};
  votes = {};
  replyTo = null;
  openMsgId = null;
  typingNames = [];
  newCount = 0;
  readMap[id] = Date.now();
  saveRead();
  whisperTo = [];
  document.body.classList.add("in-chat");
  if (rooms[id].kind === "official") {
    $("#main").replaceChildren(officialView(rooms[id], () => document.body.classList.remove("in-chat")));
    renderRooms();
    return;
  }
  $("#main").replaceChildren(h("div", { class: "chat-head", id: "chatHead" }), h("div", { id: "pinBar" }), h("div", { class: "msgs", id: "msgs" }), h("button", { class: "jump", id: "jump", hidden: true, onclick: () => { const b = $("#msgs"); b.scrollTo({ top: b.scrollHeight, behavior: "smooth" }); } }, ico("down", 16), h("b", {}, "最新へ")), composer());
  renderHeader();
  renderRooms();
  await loadMessages(id);
  if (cur !== id) return;
  subscribeRoom(id);
}
function closeRoom() {
  if (ch) {
    sb.removeChannel(ch);
    ch = null;
  }
  cur = null;
  msgs = [];
  document.body.classList.remove("in-chat");
  $("#main")?.replaceChildren(welcome());
  renderRooms();
}
async function loadMessages(id) {
  const grp = rooms[id] && !isDm(rooms[id]);
  const [m, rc, rd, vt, wh] = await Promise.all([
    sb.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: false }).limit(200),
    sb.from("reactions").select("message_id,user_id,emoji").eq("room_id", id),
    sb.from("message_reads").select("message_id,user_id,read_at").eq("room_id", id),
    sb.from("poll_votes").select("message_id,user_id,option_idx").eq("room_id", id),
    grp ? sb.from("whispers").select("*").eq("room_id", id).eq("owner_id", S.uid) : Promise.resolve({ data: [] })
  ]);
  if (cur !== id) return;
  msgs = [...(m.data || []).reverse(), ...(wh.data || []).map((w) => ({ ...w, whisper: true }))].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  (rc.data || []).forEach((x) => addTo(reacts, x.message_id, x.emoji, x.user_id));
  (rd.data || []).forEach((x) => {
    var _a;
    (reads[_a = x.message_id] || (reads[_a] = {}))[x.user_id] = x.read_at;
  });
  (vt.data || []).forEach((x) => addTo(votes, x.message_id, String(x.option_idx), x.user_id));
  renderMsgs(true);
  scheduleRead();
}
function addTo(map, mid, key, uid) {
  var _a;
  const a = (_a = map[mid] || (map[mid] = {}))[key] || (_a[key] = []);
  if (!a.includes(uid)) a.push(uid);
}
function delFrom(map, mid, key, uid) {
  const a = map[mid]?.[key];
  if (a) map[mid][key] = a.filter((x) => x !== uid);
}
function subscribeRoom(id) {
  const mine = rooms[id]?.mem?.hidden;
  ch = sb.channel("room:" + id, { config: { presence: { key: S.uid } } }).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${id}` }, (p) => {
    if (msgs.some((x) => x.id === p.new.id)) return;
    const bx = $("#msgs"), wasNear = !bx || bx.scrollHeight - bx.scrollTop - bx.clientHeight < 140;
    msgs.push(p.new);
    if (p.new.author_id !== S.uid && !wasNear) newCount++;
    renderMsgs(p.new.author_id === S.uid);
    if (p.new.author_id !== S.uid) { beep(); scheduleRead(); }
  }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${id}` }, (p) => {
    const i = msgs.findIndex((x) => x.id === p.new.id);
    if (i >= 0) {
      msgs[i] = p.new;
      renderMsgs(false);
    }
    renderHeader();
  }).on("postgres_changes", { event: "INSERT", schema: "public", table: "whispers" }, (p) => {
    if (msgs.some((x) => x.id === p.new.id)) return;
    msgs.push({ ...p.new, whisper: true });
    renderMsgs(p.new.author_id === S.uid);
    if (p.new.author_id !== S.uid) { beep(); scheduleRead(); }
  }).on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `room_id=eq.${id}` }, (p) => {
    addTo(reacts, p.new.message_id, p.new.emoji, p.new.user_id);
    renderMsgs(false);
  }).on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (p) => {
    if (p.old.message_id) {
      delFrom(reacts, p.old.message_id, p.old.emoji, p.old.user_id);
      renderMsgs(false);
    }
  }).on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: `room_id=eq.${id}` }, (p) => {
    var _a;
    (reads[_a = p.new.message_id] || (reads[_a] = {}))[p.new.user_id] = p.new.read_at;
    renderMsgs(false);
  }).on("postgres_changes", { event: "INSERT", schema: "public", table: "poll_votes", filter: `room_id=eq.${id}` }, (p) => {
    addTo(votes, p.new.message_id, String(p.new.option_idx), p.new.user_id);
    renderMsgs(false);
  }).on("postgres_changes", { event: "DELETE", schema: "public", table: "poll_votes" }, (p) => {
    if (p.old.message_id) {
      delFrom(votes, p.old.message_id, String(p.old.option_idx), p.old.user_id);
      renderMsgs(false);
    }
  }).on("presence", { event: "sync" }, () => {
    const st = ch?.presenceState() || {};
    typingNames = Object.entries(st).filter(([u, v]) => u !== S.uid && v.some((x) => x.typing)).map(([u]) => nameOf(u));
    renderHeader();
  }).subscribe((s) => {
    if (s === "SUBSCRIBED" && !mine) ch.track({ typing: false });
  });
}
function scheduleRead() {
  clearTimeout(readTimer);
  readTimer = setTimeout(async () => {
    if (!cur) return;
    readMap[cur] = Date.now();
    saveRead();
    renderRooms();
    if (noRead() || isLockedView(rooms[cur]) || document.hidden || !document.hasFocus()) return;
    sb.rpc("mark_read", { rid: cur }).then(() => {
    });
  }, 600);
}
function sendTyping() {
  if (!ch || rooms[cur]?.mem?.hidden || noTyping() || Date.now() - lastTypingSent < 2500) return;
  lastTypingSent = Date.now();
  ch.track({ typing: true });
  clearTimeout(typingUntil);
  typingUntil = setTimeout(() => ch && ch.track({ typing: false }), 3500);
}
function renderHeader() {
  const head = $("#chatHead");
  const r = cur && rooms[cur];
  if (!head || !r) return;
  const other = isDm(r) ? otherUid(r) : null;
  let sub = typingNames.length ? typingNames.join("、") + " が入力中…" : isDm(r) ? isOnline(other) ? "オンライン" : "オフライン" : r.members.length + "人" + (r.members.filter(isOnline).length ? "・" + r.members.filter(isOnline).length + "人オンライン" : "") + (r.descr ? "・" + r.descr : "");
  if (noRead()) sub += " · 既読を付けないモード";
  if (r.mem.hidden) sub += " · こっそり参加中";
  head.replaceChildren(
    h("button", { class: "icon-btn back", "aria-label": "一覧に戻る", onclick: () => document.body.classList.remove("in-chat") }, ico("back")),
    avatar(other || r.created_by || r.id, roomTitle(r), true, other && isOnline(other)),
    h("div", { class: "titles" }, h("div", { class: "t" }, roomTitle(r), r.kind === "official" ? badge() : null), h("div", { class: "s" + (typingNames.length ? " typing" : "") }, sub)),
    ...isDm(r) && other ? [
      h("button", { class: "icon-btn", "aria-label": "音声通話", title: "音声通話", onclick: () => startCall(r.id, other, false) }, ico("phone")),
      h("button", { class: "icon-btn", "aria-label": "ビデオ通話", title: "ビデオ通話", onclick: () => startCall(r.id, other, true) }, ico("video"))
    ] : [],
    h("button", { class: "icon-btn", "aria-label": "検索", onclick: searchModal }, ico("search")),
    h("button", { class: "icon-btn", "aria-label": "メニュー", onclick: (e) => roomMenu(e.currentTarget) }, ico("more"))
  );
  const pb = $("#pinBar");
  if (pb) pb.replaceChildren(...r.pinned_text ? [h("div", { class: "pinbar" }, ico("pin", 15), h("span", {}, r.pinned_text))] : []);
}
function renderMsgs(stick) {
  const box = $("#msgs");
  if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140, top = box.scrollTop;
  const out = []; let lastDay = "";
  for (const m of msgs) {
    const dl = m.created_at ? dayLabel(m.created_at) : "";
    if (dl && dl !== lastDay) { out.push(h("div", { class: "dayline" }, h("span", {}, dl))); lastDay = dl; }
    out.push(msgEl(m));
  }
  box.replaceChildren(...out);
  box.scrollTop = stick || near ? box.scrollHeight : top;
  box.onscroll = updateJump;
  updateJump();
  applyLock();
}
function linkify(t) {
  const out = [];
  const re = /(https?:\/\/[^\s<]+)/g;
  let last = 0, m;
  while (m = re.exec(t)) {
    if (m.index > last) out.push(t.slice(last, m.index));
    out.push(h("a", { href: m[1], target: "_blank", rel: "noopener noreferrer" }, m[1]));
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}
async function signed(path) {
  if (!path) return "";
  if (path.startsWith("data:image/")) return path;
  if (imgCache.has(path)) return imgCache.get(path);
  return "";
}
function whisperEl(m) {
  const mine = m.author_id === S.uid;
  const label = mine ? "→ " + (m.to || []).map(nameOf).join("、") + " だけに送信" : nameOf(m.author_id) + " さんからの耳打ち";
  return h("div", { class: "msg whisper" + (mine ? " mine" : ""), "data-id": m.id },
    !mine ? h("div", { class: "who" }, nameOf(m.author_id)) : null,
    h("div", { class: "bubble whisperb", title: fmtDT(m.created_at) }, h("div", { class: "wlabel" }, ico("whisper", 13), label), linkify(m.body || "")),
    h("div", { class: "info" }, fmtTime(m.created_at)));
}
const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
function fileCard(m) {
  return h("button", { class: "filecard", title: "保存する", onclick: (e) => { e.stopPropagation(); downloadFile(m); } },
    h("span", { class: "fc-ic" }, ico("file", 24)),
    h("span", { class: "fc-t" }, h("b", {}, m.file_name || "ファイル"), h("small", {}, fmtSize(m.file_size || 0) + " ・ タップで保存")),
    ico("download", 20));
}
async function downloadFile(m) {
  try {
    let b64 = m.file_data;
    if (!b64) {
      toast("ダウンロードしています…");
      const { data, error } = await sb.from("file_chunks").select("*").eq("message_id", m.id).eq("room_id", m.room_id);
      if (error) throw error;
      const parts = (data || []).sort((a, b) => a.i - b.i);
      if (parts.length !== m.file_chunks) throw new Error("incomplete");
      b64 = parts.map((p) => p.data).join("");
    }
    const blob = await (await fetch("data:" + (m.file_mime || "application/octet-stream") + ";base64," + b64)).blob();
    const a = h("a", { href: URL.createObjectURL(blob), download: m.file_name || "file" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) {
    console.error(e);
    toast("ファイルを取得できませんでした");
  }
}
async function sendFile(file) {
  const r = rooms[cur];
  if (!r || !file) return;
  if (!canPost(r)) return toast("このルームでは発言できません");
  if (whisperTo.length) return toast("耳打ち中は文字メッセージだけ送れます。宛先を解除してください");
  if (file.size > 4 * 1024 * 1024) return toast("ファイルは4MBまで送れます");
  if (r.image_admin_only && !isRoomAdmin(r) && file.type.startsWith("image/")) return toast("このルームでは、画像を送れるのは管理者だけです");
  toast("ファイルを準備しています…");
  try {
    const dataUrl = await blobToDataUrl(file);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const id = crypto.randomUUID();
    const row = { id, kind: "file", body: "", file_name: file.name.slice(0, 120), file_mime: file.type || "application/octet-stream", file_size: file.size };
    if (b64.length <= 800000) row.file_data = b64;
    else {
      const n = Math.ceil(b64.length / 700000);
      for (let i = 0; i < n; i++) {
        const { error } = await sb.from("file_chunks").insert({ id: id + "__" + i, message_id: id, room_id: r.id, author_id: S.uid, i, data: b64.slice(i * 700000, (i + 1) * 700000) });
        if (error) throw error;
      }
      row.file_chunks = n;
    }
    if (!await insertMsg(row)) throw new Error("send");
  } catch (e) {
    console.error(e);
    toast("ファイルを送信できませんでした");
  }
}
function msgEl(m) {
  if (m.whisper) return whisperEl(m);
  if (m.kind === "system") return h("div", { class: "sys" }, m.body);
  const r = rooms[cur];
  const mine = m.author_id === S.uid;
  const el = h("div", { class: "msg" + (mine ? " mine" : "") + (openMsgId === m.id ? " open" : ""), "data-id": m.id });
  let sx = 0, sy = 0;
  el.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => { const q = e.changedTouches[0]; if (!m.deleted && Math.abs(q.clientY - sy) < 30 && Math.abs(q.clientX - sx) > 70) { setReply(m); navigator.vibrate?.(10); } }, { passive: true });
  if (!mine && r && !isDm(r)) el.append(h("div", { class: "who" }, nameOf(m.author_id), verifiedUid(m.author_id) ? badge() : null));
  if (m.reply_text && !m.deleted) el.append(h("div", { class: "quote", title: "元のメッセージへ", onclick: () => m.reply_to && jumpTo(m.reply_to) }, m.reply_text));
  const toggle = () => {
    if (m.deleted) return;
    openMsgId = openMsgId === m.id ? null : m.id;
    renderMsgs(false);
  };
  const fileK = m.kind === "file" && !m.deleted, stamp = m.kind === "stamp" && !m.deleted, pic = m.kind === "image" && !m.deleted && m.image_path, poll = m.kind === "poll" && !m.deleted && m.poll;
  let content;
  if (m.deleted) content = "メッセージは削除されました";
  else if (poll) content = pollView(m);
  else if (fileK) content = fileCard(m);
  else if (pic) {
    const img = h("img", { class: "pic", alt: "送信された画像", loading: "lazy", onclick: (e) => {
      e.stopPropagation();
      lightbox(img.getAttribute("src") || "");
    } });
    signed(m.image_path).then((u) => img.setAttribute("src", u));
    content = img;
  } else content = stamp ? m.body : linkify(m.body || "").map((x) => x).flatMap((x) => typeof x === "string" ? mentionSplit(x, r).flatMap((y) => typeof y === "string" ? fmt(y) : [y]) : [x]);
  const toMe = (m.mentions || []).includes(S.uid);
  el.append(h("div", { class: "bubble" + (fileK ? " filec" : "") + (stamp ? " stamp" : "") + (pic ? " imgb" : "") + (m.deleted ? " deleted" : "") + (toMe ? " mentioned" : ""), title: fmtDT(m.created_at), onclick: toggle, ondblclick: () => { if (!m.deleted && m.kind !== "poll") react(m.id, "❤️"); } }, content));
  if (!m.deleted) {
    const rc = h("div", { class: "reacts" });
    Object.entries(reacts[m.id] || {}).forEach(([e, l]) => {
      if (l.length) rc.append(h("button", { class: "chip" + (l.includes(S.uid) ? " on" : ""), onclick: () => react(m.id, e) }, e + " " + l.length));
    });
    if (rc.children.length) el.append(rc);
    const act = (icon, label, fn, cls = "") => h("button", { class: cls, "aria-label": label, title: label, onclick: (ev) => {
      ev.stopPropagation();
      openMsgId = null;
      renderMsgs(false);
      fn();
    } }, ico(icon, 17));
    el.append(h(
      "div",
      { class: "bar" },
      REACTIONS.map((e) => h("button", { onclick: (ev) => {
        ev.stopPropagation();
        openMsgId = null;
        react(m.id, e);
      } }, e)),
      act("reply", "返信", () => setReply(m)),
      m.kind === "text" ? act("copy", "コピー", () => navigator.clipboard?.writeText(m.body).then(() => toast("コピーしました"))) : null,
      mine && m.kind === "text" ? act("edit", "編集", () => editMsg(m)) : null,
      r && !isDm(r) ? act("pin", r.pinned_message_id === m.id ? "ピン解除" : "ピン留め", () => togglePin(m)) : null,
      act("star", "保存", () => saveMsg(m)),
      !mine ? act("flag", "通報", () => reportMsg(m)) : null,
      mine || isDev() ? act("trash", "削除", () => deleteMsg(m), "del") : null
    ));
  }
  const readers = Object.keys(reads[m.id] || {}).filter((u) => u !== m.author_id);
  el.append(h(
    "div",
    { class: "info" },
    fmtTime(m.created_at),
    m.edited && !m.deleted ? "編集済み" : null,
    mine && !m.deleted ? h("button", { class: "linklike", style: "font-size:11px", onclick: (ev) => {
      ev.stopPropagation();
      showReadBy(m);
    } }, readers.length ? r && isDm(r) ? "既読" : "既読 " + readers.length : "未読") : null
  ));
  return el;
}
function mentionSplit(t, r) {
  const names = (r && !isDm(r) ? r.members.map(nameOf) : []).filter((n) => n && n !== "不明");
  names.push("全員");
  const re = new RegExp("(@(?:" + names.sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + "))", "g");
  return t.split(re).map((s, i) => i % 2 ? h("span", { style: "font-weight:700;color:var(--accent);background:var(--hover);border-radius:4px;padding:0 3px" }, s) : s);
}
function pollView(m) {
  const p = m.poll, v = votes[m.id] || {};
  const total = new Set(Object.values(v).flat()).size;
  return h(
    "div",
    { class: "poll" },
    h("div", { class: "pq" }, p.q),
    ...p.options.map((o, i) => {
      const l = v[String(i)] || [], pct = total ? Math.round(l.length / total * 100) : 0, on = l.includes(S.uid);
      return h(
        "button",
        { class: "popt" + (on ? " on" : ""), onclick: (e) => {
          e.stopPropagation();
          vote(m, i, on);
        } },
        h("span", { class: "pbar", style: `width:${pct}%` }),
        h("span", { class: "ptxt" }, o),
        h("span", { style: "font-size:12px;color:var(--sub)" }, l.length + "票")
      );
    }),
    h("div", { style: "font-size:12px;color:var(--sub)" }, total + "人が投票" + (p.multi ? "・複数選択OK" : ""))
  );
}
async function vote(m, i, has) {
  try {
    if (has) {
      await sb.from("poll_votes").delete().eq("message_id", m.id).eq("user_id", S.uid).eq("option_idx", i);
      delFrom(votes, m.id, String(i), S.uid);
    } else {
      if (!m.poll.multi) {
        await sb.from("poll_votes").delete().eq("message_id", m.id).eq("user_id", S.uid);
        Object.keys(votes[m.id] || {}).forEach((k) => delFrom(votes, m.id, k, S.uid));
      }
      const { error } = await sb.from("poll_votes").insert({ message_id: m.id, user_id: S.uid, option_idx: i, room_id: cur });
      if (error) throw error;
      addTo(votes, m.id, String(i), S.uid);
    }
    renderMsgs(false);
  } catch {
    toast("投票できませんでした");
  }
}
async function react(mid, e) {
  const has = (reacts[mid]?.[e] || []).includes(S.uid);
  try {
    if (has) {
      await sb.from("reactions").delete().eq("message_id", mid).eq("user_id", S.uid).eq("emoji", e);
      delFrom(reacts, mid, e, S.uid);
    } else {
      const { error } = await sb.from("reactions").insert({ message_id: mid, user_id: S.uid, emoji: e, room_id: cur });
      if (error) throw error;
      addTo(reacts, mid, e, S.uid);
    }
    renderMsgs(false);
  } catch {
    toast("リアクションできませんでした");
  }
}
function showReadBy(m) {
  const r = rooms[cur];
  const rd = reads[m.id] || {};
  const ids = Object.keys(rd).filter((u) => u !== m.author_id).sort((a, b) => ms(rd[a]) - ms(rd[b]));
  const rest = (r?.members || []).filter((u) => u !== m.author_id && !rd[u]);
  modal("既読状況（" + ids.length + "人既読）", h(
    "div",
    { style: "display:grid;gap:6px" },
    ...[...ids, ...rest].map((u) => h("div", { class: "urow" }, avatar(u, nameOf(u), true, isOnline(u)), h("div", { class: "n" }, nameOf(u), h("small", {}, rd[u] ? "既読 · " + fmtDT(rd[u]) : "未読"))))
  ));
}
function lightbox(src) {
  if (!src) return;
  const ov = h("div", { class: "lb", onclick: () => ov.remove() }, h("img", { src, alt: "画像" }));
  document.body.append(ov);
}
function editMsg(m) {
  const ta = h("textarea", { class: "field", rows: "4", style: "font-size:16px" });
  ta.value = m.body;
  let close;
  close = modal("メッセージを編集", [ta, h(
    "div",
    { style: "display:flex;gap:8px;justify-content:flex-end" },
    h("button", { class: "btn ghost", onclick: () => close() }, "キャンセル"),
    h("button", { class: "btn", onclick: async () => {
      const t = ta.value.trim();
      if (!t) return;
      close();
      const { error } = await sb.from("messages").update({ body: t, edited: true }).eq("id", m.id);
      if (error) toast("編集できませんでした");
      else {
        m.body = t;
        m.edited = true;
        renderMsgs(false);
      }
    } }, "保存")
  )]);
}
async function deleteMsg(m) {
  if (!await confirmBox("メッセージを削除", "このメッセージを削除しますか？", "削除する")) return;
  try {
    await rpc("delete_message", { mid: m.id });
  } catch {
    toast("削除できませんでした");
  }
}
async function togglePin(m) {
  const r = rooms[cur];
  const pinned = r.pinned_message_id === m.id;
  try {
    await rpc("set_pin", { rid: r.id, mid: pinned ? null : m.id, txt: pinned ? null : (m.body || "").slice(0, 80) });
    toast(pinned ? "ピン留めを外しました" : "ピン留めしました");
  } catch {
    toast("ピン留めできませんでした");
  }
}
async function reportMsg(m) {
  if (!await confirmBox("メッセージを通報", "管理者にこのメッセージを知らせます。", "通報する")) return;
  try {
    await rpc("report_message", { mid: m.id });
    toast("通報しました");
  } catch {
    toast("通報できませんでした");
  }
}
async function saveMsg(m) {
  const { data } = await sb.from("saved_messages").select("message_id").eq("user_id", S.uid).eq("message_id", m.id);
  if (data?.length) {
    await sb.from("saved_messages").delete().eq("user_id", S.uid).eq("message_id", m.id);
    toast("保存を解除しました");
  } else {
    await sb.from("saved_messages").insert({ user_id: S.uid, message_id: m.id });
    toast("メッセージを保存しました");
  }
}
async function savedModal() {
  const box = h("div", { style: "display:grid;gap:6px;max-height:60vh;overflow:auto" }, h("div", { class: "empty" }, "読み込み中…"));
  modal("保存したメッセージ", box);
  const { data } = await sb.from("saved_messages").select("message_id,messages(id,body,kind,author_id,created_at,room_id)").eq("user_id", S.uid);
  const items = (data || []).map((x) => x.messages).filter(Boolean);
  box.replaceChildren(...items.length ? items.map((m) => h("div", { class: "preview-message" }, h("small", {}, (rooms[m.room_id] ? roomTitle(rooms[m.room_id]) : "ルーム") + " · " + nameOf(m.author_id) + " · " + fmtDT(m.created_at)), m.kind === "image" ? "[画像]" : m.body)) : [h("div", { class: "empty" }, "保存したメッセージはありません。メッセージのメニューから☆で保存できます。")]);
}
function searchModal() {
  if (isLockedView(rooms[cur])) return toast("ロックを解除してください");
  const q = h("input", { class: "field", placeholder: "このルームのメッセージを検索" });
  const list = h("div", { style: "display:grid;gap:6px;max-height:55vh;overflow:auto" });
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    if (!k) {
      list.replaceChildren(h("div", { class: "empty" }, "キーワードを入力してください"));
      return;
    }
    const hits = msgs.filter((m) => m.kind !== "system" && !m.deleted && (m.body || "").toLowerCase().includes(k)).reverse().slice(0, 40);
    list.replaceChildren(...hits.length ? hits.map((m) => h("div", { class: "preview-message" }, h("small", {}, nameOf(m.author_id) + " ・ " + fmtDT(m.created_at)), m.body)) : [h("div", { class: "empty" }, "見つかりませんでした")]);
  };
  q.addEventListener("input", draw);
  draw();
  modal("検索", [q, list]);
  setTimeout(() => q.focus(), 50);
}
function exportRoom() {
  const r = rooms[cur];
  if (!r) return;
  if (isLockedView(r)) return toast("ロックを解除してください");
  const txt = msgs.map((m) => `[${fmtDT(m.created_at)}] ${m.kind === "system" ? "システム" : nameOf(m.author_id)}: ${m.deleted ? "（削除済み）" : m.kind === "image" ? "[画像]" : m.body}`).join("\n\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" })), download: roomTitle(r).replace(/[\\/:*?"<>|]/g, "_") + ".txt" });
  document.body.append(a);
  a.click();
  a.remove();
}
async function setMem(r, patch) {
  const { error } = await sb.from("room_members").update(patch).eq("room_id", r.id).eq("user_id", S.uid);
  if (error) toast("変更できませんでした");
  else {
    Object.assign(r.mem, patch);
    renderRooms();
  }
}
function roomMenu(anchor) {
  const r = rooms[cur];
  if (!r) return;
  const items = [];
  items.push({ icon: "star", label: r.mem.favorite ? "お気に入りを解除" : "お気に入りに追加", run: () => setMem(r, { favorite: !r.mem.favorite }) });
  items.push({ icon: "bell", label: r.mem.muted ? "このルームの通知を再開" : "このルームをミュート", run: () => setMem(r, { muted: !r.mem.muted }) });
  items.push({ icon: "copy", label: "会話をエクスポート", run: exportRoom });
  if (!isDm(r)) {
    items.push({ icon: "link", label: "共有リンクをコピー", run: () => navigator.clipboard?.writeText(location.origin + location.pathname + "?room=" + r.id).then(() => toast("共有リンクをコピーしました")) });
    items.push({ icon: "copy", label: "ルームIDをコピー（" + r.id + "）", run: () => navigator.clipboard?.writeText(r.id).then(() => toast("コピーしました")) });
    items.push({ icon: "users", label: "メンバーを見る", run: () => membersModal(r) });
    if (isRoomAdmin(r)) items.push({ icon: "users", label: "メンバーを招待", run: () => inviteModal(r) });
    if (isRoomAdmin(r) && r.kind !== "official") items.push({ icon: "lock", label: "ルーム設定（パスワード・ロック）", run: () => roomSettingsModal(r) });
    if (r.locked && unlocked.has(r.id)) items.push({ icon: "lock", label: "いまロックする（この端末）", run: () => { unlocked.delete(r.id); applyLock(); renderRooms(); } });
    if (isRoomAdmin(r)) items.push({ icon: "image", label: r.image_admin_only ? "画像送信を全員に許可" : "画像送信を管理者だけにする", run: () => sb.from("rooms").update({ image_admin_only: !r.image_admin_only }).eq("id", r.id).then(() => loadRooms()) });
    if (isRoomAdmin(r)) items.push({ icon: "shield", label: r.post_admin_only ? "発言を全員に許可" : "発言を管理者だけにする", run: () => sb.from("rooms").update({ post_admin_only: !r.post_admin_only }).eq("id", r.id).then(() => loadRooms()) });
    if (r.mem.hidden) items.push({ icon: "eye", label: "通常参加に切り替える", run: async () => {
      await rpc("unhide_room", { rid: r.id });
      await loadRooms();
      toast("通常参加に切り替えました");
    } });
    if (r.mem.role !== "owner" && r.kind !== "official") items.push({ icon: "logout", label: "ルームから退出", danger: true, run: async () => {
      if (await confirmBox("ルームから退出", "「" + roomTitle(r) + "」から退出します。", "退出する")) {
        closeRoom();
        try {
          await rpc("leave_room", { rid: r.id });
          await loadRooms();
        } catch {
          toast("退出できませんでした");
        }
      }
    } });
    if ((r.mem.role === "owner" || isDev()) && r.kind !== "official") items.push({ icon: "trash", label: "ルームを削除", danger: true, run: async () => {
      if (await confirmBox("ルームを削除", "ルームとメッセージがすべて消えます。", "削除する")) {
        closeRoom();
        try {
          await rpc("delete_room", { rid: r.id });
          await loadRooms();
        } catch {
          toast("削除できませんでした");
        }
      }
    } });
  }
  popup(anchor, items);
}
async function membersModal(r) {
  const body = h("div", { style: "display:grid;gap:4px" });
  const draw = async () => {
    await loadRooms();
    const rr = rooms[r.id];
    if (!rr) return;
    const { data } = await sb.from("room_members").select("user_id,role,banned,hidden").eq("room_id", r.id).eq("hidden", false);
    const list = (data || []).filter((x) => !x.hidden);
    const iOwner = rr.mem.role === "owner", iAdmin = isRoomAdmin(rr);
    const btn = (l, c, fn) => h("button", { class: "btn sm " + c, onclick: async () => {
      try {
        await fn();
        await draw();
      } catch (e) {
        toast(errMsg(e));
      }
    } }, l);
    body.replaceChildren(...list.filter((x) => !x.banned).map((x) => {
      const acts = [];
      if (iOwner && x.role !== "owner") acts.push(btn(x.role === "admin" ? "管理者を外す" : "管理者にする", "ghost", () => rpc("set_member_role", { rid: r.id, uid: x.user_id, new_role: x.role === "admin" ? "member" : "admin" })));
      if (iAdmin && x.user_id !== S.uid && x.role !== "owner" && (iOwner || x.role !== "admin")) acts.push(btn("BAN", "danger", () => rpc("ban_member", { rid: r.id, uid: x.user_id, on_off: true })));
      return h(
        "div",
        { class: "urow" },
        avatar(x.user_id, nameOf(x.user_id), true, isOnline(x.user_id)),
        h("div", { class: "n" }, nameOf(x.user_id), verifiedUid(x.user_id) ? badge() : null, h("small", {}, (x.role === "owner" ? "作成者・" : x.role === "admin" ? "管理者・" : "") + (isOnline(x.user_id) ? "オンライン" : "オフライン"))),
        acts.length ? h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" }, acts) : null
      );
    }));
    const banned = list.filter((x) => x.banned);
    if (iAdmin && banned.length) body.append(h("b", { style: "font-size:13px;color:var(--sub)" }, "BANしたメンバー"), ...banned.map((x) => h("div", { class: "urow" }, avatar(x.user_id, nameOf(x.user_id), true), h("div", { class: "n" }, nameOf(x.user_id)), btn("解除", "ghost", () => rpc("ban_member", { rid: r.id, uid: x.user_id, on_off: false })))));
  };
  modal("メンバー", body);
  draw();
}
function roomSettingsModal(r0) {
  const body = h("div", { style: "display:grid;gap:12px" });
  const sec = (s) => h("div", { class: "set-sec" }, s);
  const note = (s) => h("p", { style: "font-size:12px;color:var(--sub)" }, s);
  const draw = () => {
    const r = rooms[r0.id];
    if (!r) return;
    const apply = async (args, msg) => {
      try { await rpc("set_room_privacy", { rid: r.id, ...args }); await loadRooms(); toast(msg); draw(); }
      catch (e) { toast(errMsg(e)); }
    };
    const pw = h("input", { class: "field", type: "password", autocomplete: "new-password", maxlength: "40", placeholder: r.has_password ? "新しいパスワード（変更する場合）" : "入室パスワード（4文字以上）" });
    const lk = h("input", { class: "field", type: "password", autocomplete: "new-password", maxlength: "40", placeholder: r.locked ? "新しいロック用パスワード（変更する場合）" : "ロック解除パスワード（4文字以上）" });
    body.replaceChildren(
      sec("入室パスワード"),
      note(r.has_password ? "設定中：IDや共有リンクで入る人にパスワードを求めます。" : "未設定：IDを知っていれば誰でも入れます。"),
      pw,
      h("div", { style: "display:flex;gap:8px" },
        h("button", { class: "btn", onclick: () => pw.value.length >= 4 ? apply({ join_password: pw.value }, "入室パスワードを設定しました") : toast("4文字以上で入力してください") }, r.has_password ? "変更" : "設定"),
        r.has_password ? h("button", { class: "btn ghost", onclick: () => apply({ join_password: "" }, "入室パスワードを解除しました") }, "解除") : null),
      sec("ルームのロック"),
      note(r.locked ? "ロック中：会話内容にブラーがかかり、パスワードを入力するまで読めません。" : "ロックすると会話内容にブラーがかかり、パスワードを入力するまで読めなくなります（端末の画面上の保護です）。"),
      lk,
      h("div", { style: "display:flex;gap:8px" },
        h("button", { class: "btn", onclick: async () => {
          if (lk.value.length < 4) return toast("4文字以上で入力してください");
          await apply({ lock: true, lock_password: lk.value }, "ルームをロックしました");
          unlocked.delete(r.id); applyLock(); renderRooms();
        } }, r.locked ? "パスワードを変更" : "ロックする"),
        r.locked ? h("button", { class: "btn ghost", onclick: async () => { await apply({ lock: false }, "ロックを解除しました"); unlocked.delete(r.id); applyLock(); renderRooms(); } }, "ロック解除") : null)
    );
  };
  draw();
  modal("ルーム設定（プライバシー）", body);
}
function applyLock() {
  const r = rooms[cur], main = $("#main");
  if (!main || !r) return;
  const on = isLockedView(r);
  $("#msgs")?.classList.toggle("locked", on);
  $("#pinBar")?.classList.toggle("locked", on);
  let ov = $("#lockOv");
  if (!on) { ov?.remove(); return; }
  if (!ov) {
    const inp = h("input", { class: "field", type: "password", placeholder: "パスワード", autocomplete: "off" });
    const err = h("div", { class: "err", role: "alert" });
    const go = async () => {
      err.textContent = "";
      if (!inp.value) return;
      try {
        if (await hashPw(r.id, inp.value) === rooms[r.id]?.lock_hash) { unlocked.add(r.id); applyLock(); renderRooms(); scheduleRead(); }
        else err.textContent = "パスワードが違います";
      } catch (e) { err.textContent = e.message; }
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) go(); });
    ov = h("div", { class: "lock-ov", id: "lockOv" }, h("div", { class: "lock-ic" }, ico("lock", 26)), h("b", {}, "このルームはロックされています"), h("small", {}, "パスワードを入力すると会話が表示されます"), inp, err, h("button", { class: "btn", onclick: go }, "ロック解除"));
    main.append(ov);
    if (!isMobile()) setTimeout(() => inp.focus(), 60);
  }
  ov.style.top = ($("#chatHead")?.offsetHeight || 64) + "px";
}
function userPicker(excluded) {
  const sel = /* @__PURE__ */ new Set();
  const q = h("input", { class: "field", placeholder: "名前で探す" });
  const list = h("div", { style: "display:grid;gap:2px;max-height:220px;overflow-y:auto" });
  const count = h("div", { style: "font-size:12px;color:var(--sub)" }, "0人を選んでいます");
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const arr = Object.values(S.users).filter((u) => u.id !== S.uid && !excluded.has(u.id) && !u.banned && (!k || u.name.toLowerCase().includes(k))).sort((a, b) => a.name.localeCompare(b.name, "ja"));
    list.replaceChildren(...arr.length ? arr.map((u) => h("button", { type: "button", class: "urow", onclick: () => {
      sel.has(u.id) ? sel.delete(u.id) : sel.add(u.id);
      count.textContent = sel.size + "人を選んでいます";
      draw();
    } }, avatar(u.id, u.name, true, isOnline(u.id)), h("div", { class: "n" }, u.name), h("span", { style: "font-weight:700;color:var(--accent)" }, sel.has(u.id) ? "選択中" : ""))) : [h("div", { class: "empty" }, "選べる人がいません")]);
  };
  q.addEventListener("input", draw);
  draw();
  return { node: h("div", { style: "display:grid;gap:8px" }, h("label", {}, "招待する人（あとから追加もできます）"), q, list, count), selected: () => [...sel] };
}
function inviteModal(r) {
  const pk = userPicker(new Set(r.members));
  let close;
  close = modal("メンバーを招待", [pk.node, h("button", { class: "btn", onclick: async () => {
    const ids = pk.selected();
    if (!ids.length) return toast("招待する人を選んでください");
    try {
      await rpc("invite_members", { rid: r.id, uids: ids });
      close();
      await loadRooms();
      toast(ids.length + "人を招待しました");
    } catch (e) {
      toast("招待できませんでした");
    }
  } }, "招待する")]);
}
function roomModal() {
  let mode = "create", close;
  const body = h("div", { style: "display:grid;gap:12px" });
  const draw = () => {
    const tabs = h("div", { class: "tabs" }, ...[["create", "新しく作る"], ["join", "IDで参加"]].map(([k, l]) => h("button", { class: mode === k ? "on" : "", onclick: () => {
      mode = k;
      draw();
    } }, l)));
    if (mode === "create") {
      const name = h("input", { class: "field", placeholder: "ルーム名", maxlength: "40" });
      const desc = h("input", { class: "field", placeholder: "説明（なくてもOK）", maxlength: "80" });
      const pk = userPicker(/* @__PURE__ */ new Set());
      const go = h("button", { class: "btn", onclick: async () => {
        if (!name.value.trim()) return;
        go.disabled = true;
        try {
          const id = await rpc("create_room", { p_name: name.value.trim(), p_descr: desc.value.trim(), p_invitees: pk.selected() });
          close();
          await loadRooms();
          openRoom(id);
        } catch (e) {
          toast("ルームを作成できませんでした");
          go.disabled = false;
        }
      } }, "作成する");
      body.replaceChildren(tabs, name, desc, pk.node, go);
      setTimeout(() => name.focus(), 50);
    } else if (mode === "join") {
      const code = h("input", { class: "field", placeholder: "ルームID または 共有リンク" });
      const go = h("button", { class: "btn", onclick: async () => {
        if (code.value.trim() && await joinByCode(code.value)) close();
      } }, "参加する");
      const sneak = isVerified() ? h("button", { class: "btn ghost", onclick: async () => {
        if (!idOf(code.value)) return;
        if (await joinByCode(code.value, true)) close();
      } }, ico("eye", 17), "こっそり入室") : null;
      body.replaceChildren(tabs, h("p", { style: "font-size:13px;color:var(--sub)" }, "ルームIDまたは共有リンクを貼り付けてください。公開のルーム一覧はありません。"), code, go, sneak);
      setTimeout(() => code.focus(), 50);
    } else {
      const search = h("input", { class: "field", placeholder: "ルーム名・説明・IDで検索" });
      const list = h("div", { style: "display:grid;gap:6px;max-height:50vh;overflow:auto" }, h("div", { class: "empty" }, "読み込み中…"));
      body.replaceChildren(tabs, search, list);
      let all = [];
      const render = () => {
        const k = search.value.trim().toLowerCase();
        const f = all.filter((r) => [r.name, r.descr, r.id].some((v) => String(v || "").toLowerCase().includes(k)));
        list.replaceChildren();
        if (!f.length) return list.append(h("div", { class: "empty" }, "該当するルームはありません。"));
        f.forEach((r) => {
          const joined = !!rooms[r.id];
          const opts = (a) => popup(a, [
            { icon: "users", label: "通常参加", run: async () => {
              if (await joinByCode(r.id)) close();
            } },
            ...isVerified() ? [{ icon: "eye", label: "こっそり入室（通知・既読・オンライン表示なし）", run: async () => {
              try {
                await rpc("join_room_hidden", { rid: r.id });
                await loadRooms();
                close();
                openRoom(r.id);
                toast("こっそり入室しました");
              } catch (e) {
                toast(errMsg(e));
              }
            } }] : []
          ]);
          list.append(h(
            "div",
            { style: "display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:4px" },
            h("div", { class: "urow", style: "flex:1" }, avatar(r.created_by || r.id, r.name || "ルーム", true), h("div", { class: "n" }, r.name || "ルーム", h("small", {}, (r.descr || "説明なし") + " · " + (joined ? "参加中" : "未参加")))),
            joined ? h("button", { class: "btn ghost sm", onclick: () => {
              close();
              openRoom(r.id);
            } }, "開く") : h("button", { class: "btn ghost sm", onclick: (e) => opts(e.currentTarget) }, "参加 ▾")
          ));
        });
      };
      search.addEventListener("input", render);
      sb.from("rooms").select("id,name,descr,created_by,kind").neq("kind", "dm").order("name").then(({ data, error }) => {
        if (error) list.replaceChildren(h("div", { class: "empty" }, "取得できませんでした"));
        else {
          all = data || [];
          render();
        }
      });
    }
  };
  draw();
  close = modal("ルーム", body);
}
function idOf(input) {
  let id = String(input).trim();
  try { id = new URL(id).searchParams.get("room") || id; } catch { }
  return id.replace(/\s/g, "");
}
function askPassword(title = "パスワードが必要です", text = "このルームに入るにはパスワードを入力してください。", okLabel = "入室する") {
  return new Promise((res) => {
    const inp = h("input", { class: "field", type: "password", placeholder: "パスワード", autocomplete: "off" });
    let done = false, close, ov, mo;
    const fin = (v) => { if (done) return; done = true; mo?.disconnect(); close(); res(v); };
    const submit = () => { if (inp.value) fin(inp.value); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) submit(); });
    close = modal(title, [h("p", { style: "color:var(--sub);font-size:13px" }, text), inp, h("button", { class: "btn", onclick: submit }, okLabel)]);
    ov = [...document.querySelectorAll(".overlay")].pop();
    mo = new MutationObserver(() => { if (!document.body.contains(ov) && !done) { done = true; mo.disconnect(); res(null); } });
    mo.observe(document.body, { childList: true });
    setTimeout(() => inp.focus(), 50);
  });
}
async function joinByCode(input, hidden = false) {
  const id = idOf(input);
  let proof;
  for (let i = 0; i < 3; i++) {
    try {
      await rpc(hidden ? "join_room_hidden" : "join_room", { rid: id, proof });
      await loadRooms();
      openRoom(id);
      if (hidden) toast("こっそり入室しました");
      return true;
    } catch (e) {
      if (e?.message === "password" || e?.message === "wrong password") {
        if (e.message === "wrong password") toast("パスワードが違います");
        const pw = await askPassword();
        if (pw == null) return false;
        try { proof = await hashPw(id, pw); } catch (er) { toast(er.message); return false; }
        continue;
      }
      toast(errMsg(e));
      return false;
    }
  }
  return false;
}
function dmModal() {
  const q = h("input", { class: "field", placeholder: "名前で検索" });
  const list = h("div", {});
  let close;
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const arr = Object.values(S.users).filter((u) => u.id !== S.uid && !u.banned && (!k || u.name.toLowerCase().includes(k))).sort((a, b) => a.name.localeCompare(b.name, "ja"));
    list.replaceChildren(...arr.length ? arr.map((u) => h("button", { class: "urow", onclick: async () => {
      close();
      try {
        const id = await rpc("start_dm", { other: u.id });
        await loadRooms();
        openRoom(id);
      } catch {
        toast("DMを開始できませんでした");
      }
    } }, avatar(u.id, u.name, true, isOnline(u.id)), h("div", { class: "n" }, u.name, h("small", {}, isOnline(u.id) ? "オンライン" : "オフライン")))) : [h("div", { class: "empty" }, "見つかりませんでした。共有リンクで友だちを呼びましょう。")]);
  };
  q.addEventListener("input", draw);
  draw();
  close = modal("DMを始める", [q, list]);
}
function composer() {
  const r = rooms[cur];
  const locked = r.kind === "official" && !isDev();
  const ta = h("textarea", { id: "msgInput", rows: "1", "aria-label": "メッセージ", placeholder: locked ? "🔒 公式ルームは管理者だけ発言できます" : r.post_admin_only && !isRoomAdmin(r) && !isDev() ? "管理者だけが書き込めます" : "メッセージを入力" });
  if (!canPost(r)) ta.disabled = true;
  const sendBtn = h("button", { class: "icon-btn send", "aria-label": "送信", disabled: true }, ico("send"));
  const panel = h("div", { class: "stamps", id: "stamps" });
  const stampBtn = (s) => h("button", { onclick: (e) => {
    e.stopPropagation();
    setPref("recent", [s, ...pref("recent", []).filter((x) => x !== s)].slice(0, 12));
    send("stamp", s);
    panel.classList.remove("show");
    drawStamps();
  } }, s);
  const drawStamps = () => {
    const rc = pref("recent", []);
    panel.replaceChildren(...rc.length ? [h("div", { class: "stamp-h" }, "最近使った"), ...rc.map(stampBtn), h("div", { class: "stamp-h" }, "すべて")] : [], ...STAMPS.map(stampBtn));
  };
  drawStamps();
  const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) sendImage(f);
  } });
  const anyFile = h("input", { type: "file", hidden: true, onchange: (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) sendFile(f);
  } });
  const draftKey = "cs_draft_" + S.uid + "_" + cur;
  try {
    ta.value = localStorage.getItem(draftKey) || "";
  } catch {
  }
  const fit = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    sendBtn.disabled = !ta.value.trim();
  };
  const submit = () => {
    const t = ta.value;
    if (!t.trim()) return;
    ta.value = "";
    try {
      localStorage.removeItem(draftKey);
    } catch {
    }
    fit();
    send("text", t);
    if (!isMobile()) ta.focus();
  };
  ta.addEventListener("input", () => {
    try {
      ta.value ? localStorage.setItem(draftKey, ta.value) : localStorage.removeItem(draftKey);
    } catch {
    }
    fit();
    sendTyping();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && !ta.value) {
      const last = [...msgs].reverse().find((m) => m.author_id === S.uid && m.kind === "text" && !m.deleted);
      if (last) { e.preventDefault(); editMsg(last); }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !isMobile()) {
      e.preventDefault();
      submit();
    }
  });
  ta.addEventListener("paste", (e) => {
    const f = [...e.clipboardData?.files || []].find((x) => x.type.startsWith("image/"));
    if (f) {
      e.preventDefault();
      sendImage(f);
    }
  });
  sendBtn.addEventListener("click", submit);
  setTimeout(fit, 0);
  return h(
    "div",
    { class: "composer" },
    panel,
    h("div", { class: "replybar", id: "replyBar", hidden: true }),
    h("div", { class: "replybar whbar", id: "whBar", hidden: true }),
    h(
      "div",
      { class: "crow" },
      h("button", { class: "icon-btn", id: "stampBtn", "aria-label": "スタンプ", onclick: (e) => {
        e.stopPropagation();
        panel.classList.toggle("show");
      } }, ico("smile", 24)),
      h("button", { class: "icon-btn", "aria-label": "画像を送る", onclick: () => {
        if (r.image_admin_only && !isRoomAdmin(r)) return toast("このルームでは、画像を送れるのは管理者だけです");
        fileIn.click();
      } }, ico("image", 24)),
      h("button", { class: "icon-btn", "aria-label": "ファイルを送る", title: "ファイルを送る（4MBまで）", onclick: () => anyFile.click() }, ico("paperclip", 24)),
      !isDm(r) ? h("button", { class: "icon-btn", id: "whBtn", "aria-label": "指定した人に送る（耳打ち）", title: "指定した人だけに送る（耳打ち）", onclick: () => whisperModal(r) }, ico("whisper", 24)) : null,
      !isDm(r) ? h("button", { class: "icon-btn", "aria-label": "投票を作る", onclick: pollModal }, ico("poll", 24)) : null,
      fileIn,
      anyFile,
      ta,
      sendBtn
    )
  );
}
function setReply(m) {
  replyTo = { id: m.id, text: (m.kind === "image" ? "画像" : m.body || "").slice(0, 80) };
  drawReply();
  $("#msgInput")?.focus();
}
function drawWhisper() {
  const bar = $("#whBar");
  if (!bar) return;
  bar.replaceChildren(...whisperTo.length ? [ico("whisper", 15), h("span", {}, nameListShort(whisperTo) + " だけに送信"), h("button", { class: "icon-btn", style: "width:28px;height:28px", "aria-label": "耳打ちをやめる", onclick: () => { whisperTo = []; drawWhisper(); } }, ico("x", 16))] : []);
  bar.hidden = !whisperTo.length;
  $("#whBtn")?.classList.toggle("on", !!whisperTo.length);
}
const nameListShort = (l) => l.length > 3 ? l.slice(0, 3).map(nameOf).join("、") + " ほか" + (l.length - 3) + "人" : l.map(nameOf).join("、");
function whisperModal(r) {
  const sel = new Set(whisperTo);
  const list = h("div", { style: "display:grid;gap:2px;max-height:50vh;overflow-y:auto" });
  const count = h("div", { style: "font-size:12px;color:var(--sub)" });
  const draw = () => {
    const arr = (r.members || []).filter((u) => u !== S.uid && S.users[u] && !S.users[u].banned);
    count.textContent = sel.size ? sel.size + "人を選んでいます（最大10人）" : "選んだ人だけにメッセージが届きます。ほかのメンバーには見えません。";
    list.replaceChildren(...arr.length ? arr.map((u) => h("button", { type: "button", class: "urow", onclick: () => { sel.has(u) ? sel.delete(u) : sel.size < 10 && sel.add(u); draw(); } }, avatar(u, nameOf(u), true, isOnline(u)), h("div", { class: "n" }, nameOf(u)), h("span", { style: "font-weight:700;color:var(--accent)" }, sel.has(u) ? "選択中" : ""))) : [h("div", { class: "empty" }, "ほかのメンバーがいません")]);
  };
  draw();
  let close;
  close = modal("指定した人に送る", [count, list, h("div", { style: "display:flex;gap:8px" },
    h("button", { class: "btn ghost", onclick: () => { whisperTo = []; drawWhisper(); close(); } }, "解除"),
    h("button", { class: "btn", style: "flex:1", onclick: () => { whisperTo = [...sel]; drawWhisper(); close(); $("#msgInput")?.focus(); } }, "決定"))]);
}
async function sendWhisper(text) {
  const r = rooms[cur];
  if (!r || !canPost(r) && r.kind === "official") return;
  const wid = crypto.randomUUID(), to = [...whisperTo].slice(0, 10);
  const owners = [...new Set([S.uid, ...to])];
  const rows = owners.map((o) => ({ id: wid + "__" + o, wid, room_id: r.id, author_id: S.uid, owner_id: o, to, kind: "text", body: text.slice(0, 2000) }));
  const { error } = await sb.from("whispers").insert(rows);
  if (error) { console.error(error); toast("耳打ちを送信できませんでした"); return false; }
  const mine = rows.find((x) => x.owner_id === S.uid);
  if (mine && !msgs.some((x) => x.id === mine.id)) { msgs.push({ ...mine, whisper: true, created_at: new Date().toISOString() }); renderMsgs(true); }
  return true;
}
function drawReply() {
  const bar = $("#replyBar");
  if (!bar) return;
  bar.replaceChildren(...replyTo ? [h("span", {}, "返信: " + replyTo.text), h("button", { class: "icon-btn", style: "width:28px;height:28px", "aria-label": "返信をやめる", onclick: () => {
    replyTo = null;
    drawReply();
  } }, ico("x", 16))] : []);
  bar.hidden = !replyTo;
}
function findMentions(text, r) {
  if (isDm(r)) return [];
  const out = /* @__PURE__ */ new Set();
  if (text.includes("@全員")) r.members.forEach((u) => u !== S.uid && out.add(u));
  r.members.forEach((u) => {
    const n = nameOf(u);
    if (u !== S.uid && n !== "不明" && text.includes("@" + n)) out.add(u);
  });
  return [...out];
}
async function insertMsg(row) {
  const r = rooms[cur];
  if (!r) return;
  if (!canPost(r)) {
    toast(r.kind === "official" ? "公式ルームは管理者だけ発言できます" : "このルームは管理者だけが書き込めます");
    return false;
  }
  const base = { room_id: r.id, author_id: S.uid, ...row };
  if (replyTo) {
    base.reply_to = replyTo.id;
    base.reply_text = replyTo.text;
    replyTo = null;
    drawReply();
  }
  const { data, error } = await sb.from("messages").insert(base).select().single();
  if (error) {
    console.error(error);
    toast("送信できませんでした");
    return false;
  }
  if (data && !msgs.some((x) => x.id === data.id)) {
    msgs.push(data);
    renderMsgs(true);
  }
  if (ch) ch.track({ typing: false });
  return true;
}
async function send(kind, text) {
  text = String(text).trim();
  const r = rooms[cur];
  if (!text || !r) return;
  if (whisperTo.length && kind === "text") { await sendWhisper(text); return; }
  if (whisperTo.length) return toast("耳打ち中は文字メッセージだけ送れます。宛先を解除してください");
  const mentions = kind === "stamp" ? [] : findMentions(text, r);
  await insertMsg({ kind, body: text, mentions });
}
function pollModal() {
  const r = rooms[cur];
  if (!r) return;
  const q = h("input", { class: "field", placeholder: "質問（例：今日やるゲームは？）", maxlength: "80" });
  const opts = [h("input", { class: "field", placeholder: "選択肢1", maxlength: "40" }), h("input", { class: "field", placeholder: "選択肢2", maxlength: "40" })];
  const list = h("div", { style: "display:grid;gap:8px" }, opts);
  const add = h("button", { class: "btn ghost", onclick: () => {
    if (opts.length >= 6) return toast("選択肢は6つまでです");
    const i = h("input", { class: "field", placeholder: "選択肢" + (opts.length + 1), maxlength: "40" });
    opts.push(i);
    list.append(i);
    i.focus();
  } }, "選択肢を追加");
  const multi = h("input", { type: "checkbox" });
  let close;
  close = modal("投票を作る", [
    q,
    list,
    add,
    h("label", { style: "display:flex;gap:8px;align-items:center" }, multi, "複数選んでもOK"),
    h("button", { class: "btn", onclick: async () => {
      const question = q.value.trim(), o = opts.map((i) => i.value.trim()).filter(Boolean);
      if (!question || o.length < 2) return toast("質問と、2つ以上の選択肢を入力してください");
      close();
      if (whisperTo.length) return toast("耳打ち中は文字メッセージだけ送れます。宛先を解除してください");
      await insertMsg({ kind: "poll", body: question, poll: { q: question, options: o, multi: multi.checked } });
    } }, "送信")
  ]);
  setTimeout(() => q.focus(), 50);
}
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("load"));
      i.src = url;
    });
    let maxSide = 1280;
    let quality = 0.72;
    for (let attempt = 0; attempt < 8; attempt++) {
      const sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * sc));
      c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      const g = c.getContext("2d");
      if (!g) throw new Error("canvas");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error("blob")), "image/webp", quality));
      if (blob.size <= 560 * 1024) return blob;
      if (quality > 0.48) quality -= 0.08;
      else maxSide = Math.max(520, Math.round(maxSide * 0.82));
    }
    throw new Error("画像サイズが大きすぎます");
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}
async function sendImage(file) {
  const r = rooms[cur];
  if (!r || !file.type.startsWith("image/")) return toast("画像ファイルを選んでください");
  if (r.image_admin_only && !isRoomAdmin(r)) return toast("このルームでは、画像を送れるのは管理者だけです");
  if (whisperTo.length) return toast("耳打ち中は文字メッセージだけ送れます。宛先を解除してください");
  toast("画像を準備しています…");
  try {
    const blob = await compress(file);
    const imageData = await blobToDataUrl(blob);
    await insertMsg({ kind: "image", body: "", image_path: imageData });
  } catch (e) {
    console.error(e);
    toast("画像を送信できませんでした。画像サイズを小さくして再試行してください");
  }
}
function settingsModal() {
  let tab = "look", close;
  const body = h("div", { style: "display:grid;gap:10px" });
  const sw = (on) => h("span", { class: "switch" + (on ? " on" : "") }, h("i", {}));
  const row = (icon, label, right, fn, cls = "") => h("button", { class: "set-row " + cls, onclick: fn }, ico(icon, 20), h("span", {}, label), right);
  const go = (fn) => () => { close(); fn(); };
  const seg = (opts, cur, pick) => h("div", { class: "seg" }, opts.map(([k, l]) => h("button", { class: k === cur ? "on" : "", onclick: () => { pick(k); draw(); } }, l)));
  const flag = (icon, label, key, def, after) => row(icon, label, sw(pref(key, def)), () => { setPref(key, !pref(key, def)); after && after(); draw(); });
  const sec = (s) => h("div", { class: "set-sec" }, s);
  const draw = () => {
    const T = [["look", "外観"], ["notify", "通知"], ["more", "その他"]];
    if (isVerified()) T.push(["developer", "developer"]);
    const tabs = h("div", { class: "tabs" }, T.map(([k, l]) => h("button", { class: tab === k ? "on" : "", onclick: () => { tab = k; draw(); } }, l)));
    const u = meP(), l = h("div", {});
    const me = h("button", { class: "set-row", onclick: go(profileModal) }, avatar(S.uid, u.name), h("span", {}, u.name, verifiedUid(S.uid) ? badge() : null, h("small", { style: "display:block;color:var(--sub);font-size:12px" }, S.email || "匿名アカウント")), ico("edit", 16));
    if (tab === "look") {
      const th = localStorage.getItem("cs_theme") || "auto";
      l.append(
        sec("テーマ"), seg([["auto", "自動"], ["light", "ライト"], ["dark", "ダーク"]], th, (k) => { localStorage.setItem("cs_theme", k); applyTheme(); }),
        sec("アクセントカラー"), h("div", { class: "swatches" }, Object.entries(ACCENTS).map(([k, c]) => h("button", { class: pref("accent", "blue") === k ? "on" : "", style: `background:linear-gradient(135deg,${c[0]},${c[1]})`, "aria-label": k, onclick: () => { setPref("accent", k); applyAppearance(); draw(); } }))),
        sec("背景のアニメーション"), seg([["normal", "標準"], ["calm", "控えめ"], ["off", "なし"]], pref("wall", "normal"), (k) => { setPref("wall", k); applyAppearance(); }),
        sec("文字サイズ"), seg([["s", "小"], ["m", "標準"], ["l", "大"]], pref("fs", "m"), (k) => { setPref("fs", k); applyAppearance(); }),
        sec("表示"), flag("type", "コンパクト表示", "dense", false, applyAppearance)
      );
    } else if (tab === "notify") {
      const perm = "Notification" in window ? Notification.permission : "unsupported";
      l.append(
        sec("通知"), row("bell", "ブラウザ通知", sw(perm === "granted"), async () => { if ("Notification" in window) { await Notification.requestPermission(); draw(); } }),
        flag("volume", "通知音", "sound", true, () => { if (pref("sound", true)) beep(); }),
        flag("moon", "おやすみモード（通知・通知音をすべてオフ）", "dnd", false)
      );
    } else if (tab === "developer" && isVerified()) {
      l.append(
        sec("プライバシー"),
        flag("eye", "オンライン状態を隠す", "stealth", false, () => beatNow()),
        flag("msg", "入力中を相手に見せない", "notyping", false),
        row("checks", "既読を付けない", sw(noRead()), () => { localStorage.setItem("cs_noread_" + S.uid, noRead() ? "0" : "1"); renderHeader(); draw(); }),
        sec("隠し機能"),
        row("eye", "こっそり入室（ルームIDで）", null, go(roomModal)),
        row("search", "ルームを入室せずに閲覧（プレビュー）", null, go(previewModal))
      );
    } else {
      l.append(sec("アプリ"),
        deferredPrompt ? row("download", "アプリとしてインストール", null, async () => { deferredPrompt.prompt(); deferredPrompt = null; draw(); }) : row("download", "ホーム画面に追加する方法", null, () => toast("ブラウザのメニュー（iPhoneは共有ボタン）から「ホーム画面に追加」")),
        row("keyboard", "キーボードショートカット", null, go(shortcutsModal)),
        ...isDev() ? [sec("管理"), row("grid", "管理ダッシュボードを開く", null, () => { location.href = ADMIN_PAGE; }), row("shield", "簡易管理パネル", null, go(adminPanel))] : [],
        sec("データ"), row("trash", "この端末の設定・下書きを消去", null, async () => { if (await confirmBox("設定を消去", "この端末に保存された設定・下書き・既読位置を消します。", "消去する")) { Object.keys(localStorage).filter((k) => k.startsWith("cs_")).forEach((k) => localStorage.removeItem(k)); location.reload(); } }, "danger"),
        sec("アカウント"), row("logout", "ログアウト", null, go(logout), "danger"));
    }
    body.replaceChildren(me, tabs, l);
  };
  draw();
  close = modal("設定", body);
}
function shortcutsModal() {
  const R = [["Enter", "送信（PC）"], ["Shift + Enter", "改行"], ["↑（入力欄が空）", "直前の自分のメッセージを編集"], ["Esc", "ダイアログを閉じる"], ["ダブルクリック/タップ", "メッセージに ❤️"], ["左右にスワイプ（スマホ）", "返信"], ["**太字** ~~取消~~ `コード` ||ネタバレ||", "文字装飾"]];
  modal("ショートカット", h("div", { class: "keys" }, R.map(([k, d]) => h("div", { class: "keyrow" }, h("kbd", {}, k), h("span", {}, d)))));
}
function previewModal() {
  const code = h("input", { class: "field", placeholder: "ルームID" });
  const out = h("div", { style: "display:grid;gap:8px;max-height:50vh;overflow:auto" });
  modal("ルームの閲覧（入室しません）", [
    h("p", { style: "font-size:12px;color:var(--sub)" }, "入室・既読は発生しません。閲覧した記録は管理者の監査ログに残ります。"),
    code,
    h("button", { class: "btn", onclick: async () => {
      try {
        const d = await rpc("preview_room", { rid: code.value.trim() });
        out.replaceChildren(...d.length ? d.map((m) => h("div", { class: "preview-message" }, h("small", {}, (m.kind === "system" ? "システム" : nameOf(m.author_id)) + " · " + fmtDT(m.created_at)), m.kind === "image" ? "[画像]" : m.kind === "file" ? "[ファイル] " + (m.file_name || "") : m.deleted ? "（削除済み）" : m.body)) : [h("div", { class: "empty" }, "メッセージはありません")]);
      } catch (e) {
        toast(errMsg(e));
      }
    } }, "表示"),
    out
  ]);
}
async function squareThumb(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("load"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, size, size);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
function profileModal() {
  const u = meP();
  const name = h("input", { class: "field", value: u.name, maxlength: "20" });
  let color = u.color || COLORS[0];
  let photo;
  const pv = h("div", { style: "display:flex;gap:14px;align-items:center" });
  const sw = h("div", { class: "swatches" });
  const drawPv = () => {
    const shown = photo === void 0 ? u.photo : photo;
    const a = h("div", { class: "avatar", style: `background:${color};width:72px;height:72px;font-size:30px` }, typeof shown === "string" && shown.startsWith("data:image/") ? h("img", { src: shown, alt: "" }) : Array.from(name.value || u.name)[0] || "?");
    const fi = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (f) try {
        photo = await squareThumb(f, 160);
        drawPv();
      } catch {
        toast("この画像は読み込めませんでした");
      }
    } });
    pv.replaceChildren(a, h("div", { style: "display:grid;gap:6px" }, h("button", { class: "btn ghost sm", onclick: () => fi.click() }, "画像を選ぶ"), shown ? h("button", { class: "btn ghost sm", onclick: () => {
      photo = null;
      drawPv();
    } }, "画像を外す") : null), fi);
  };
  const draw = () => {
    sw.replaceChildren(...COLORS.map((c) => h("button", { class: c === color ? "on" : "", style: `background:${c}`, "aria-label": "色 " + c, onclick: () => {
      color = c;
      draw();
    } })));
    drawPv();
  };
  draw();
  let close;
  close = modal("プロフィール", [
    h("label", {}, "アイコン"),
    pv,
    h("label", {}, "表示名"),
    name,
    h("label", {}, "アイコンの色（画像がないとき）"),
    sw,
    h("button", { class: "btn", onclick: async () => {
      const n = name.value.trim();
      if (!n) return;
      const upd = { name: n, color };
      if (photo !== void 0) upd.photo = photo;
      const { error } = await sb.from("profiles").update(upd).eq("id", S.uid);
      if (error) toast("保存できませんでした");
      else {
        Object.assign(S.users[S.uid], upd);
        close();
        toast("保存しました");
        renderRooms();
        renderHeader();
      }
    } }, "保存する")
  ]);
}
