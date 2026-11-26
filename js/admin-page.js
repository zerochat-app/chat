// ZeroChat 管理者ダッシュボード（専用ページ）
import { sb, db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { h, $, ico, toast, modal, confirmBox, fmtDT, loadingView, setLoading } from "./ui.js";
import { S, isDev, nameOf, avatar, isOnline, loadProfiles, badge, tempBanMs } from "./state.js";
import { grantAdmin } from "./gate.js";

const app = $("#app");
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
const THEME = localStorage.getItem("cs_theme") || "auto";
document.documentElement.dataset.theme = THEME;
const ROLE = { user: "一般", verified: "公式認証", developer: "管理者" };
const TABS = [["overview", "概要", "home"], ["users", "ユーザー", "users"], ["rooms", "ルーム", "msg"], ["dms", "DM", "lock"], ["reports", "通報", "flag"], ["feedback", "フォーム", "form"], ["changelog", "更新履歴", "history"], ["bans", "BAN", "ban"], ["audit", "ログ", "list"]];
let tab = (() => { try { return sessionStorage.getItem("cs_admin_tab") || "overview"; } catch { return "overview"; } })();
let q = "", userFilter = "all";
const D = { rooms: [], dms: [], reports: [], audit: [], emails: {}, roomBans: [], feedback: [], changelog: [], loaded: false };
let fbFilter = "open";
let typing = [];
let stops = [], timers = [];

function gate(msg, canGrant) {
  app.replaceChildren(h("div", { class: "gate" }, h("div", { class: "login-card" },
    h("div", { class: "wordmark" }, "Zero", h("i", {}, "Chat")),
    h("div", { style: "text-align:center;color:var(--sub);font-size:13px;letter-spacing:.1em" }, "ADMIN"),
    h("p", { style: "text-align:center;color:var(--sub)" }, msg),
    ...canGrant ? (() => {
      const code = h("input", { class: "field", type: "password", placeholder: "認証コード", autocomplete: "off" });
      const err = h("div", { class: "err", role: "alert" });
      const go = async () => { err.textContent = ""; try { await grantAdmin(code.value); await loadProfiles(); start(); } catch (e) { err.textContent = e.message || "認証できませんでした"; } };
      code.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) go(); });
      setTimeout(() => code.focus(), 60);
      return [code, err, h("button", { class: "btn", onclick: go }, "認証する")];
    })() : [],
    h("a", { class: "btn ghost", href: "./", style: "text-decoration:none" }, "チャットに戻る"))));
}

sb.auth.onAuthStateChange(async (_e, session) => {
  if (!session?.user) { stop(); S.uid = ""; gate("管理者ダッシュボードを使うには、先にチャットでログインしてください。", false); return; }
  S.uid = session.user.id; S.email = session.user.email || "";
  if (!started) app.replaceChildren(loadingView("管理者権限を確認中…"));
  await loadProfiles();
  if (!S.users[S.uid]) { await new Promise((r) => setTimeout(r, 800)); await loadProfiles(); }
  if (!isDev()) return gate("管理者の認証が必要です。", true);
  start();
});

function stop() { stops.forEach((f) => { try { f(); } catch { } }); stops = []; timers.forEach(clearInterval); timers = []; }

let started = false;
function start() {
  if (started) { return; }
  started = true;
  setLoading("データを読み込み中…");
  shell();
  const pc = sb.channel("admin-profiles").on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
    if (p.eventType === "DELETE") delete S.users[p.old.id]; else S.users[p.new.id] = p.new;
    render();
  }).subscribe();
  stops.push(() => sb.removeChannel(pc));
  stops.push(onSnapshot(collection(db, "room_typing"), (snap) => { typing = snap.docs.map((d) => d.data()); render(); }, (e) => console.warn("typing", e)));
  timers.push(setInterval(render, 2500));
  timers.push(setInterval(() => loadData(), 45000));
  loadData();
}

async function loadData() {
  const safe = async (fn, def) => { try { return await rpc(fn); } catch (e) { console.warn(fn, e); return def; } };
  const [rooms, dms, reports, audit, emails, bans] = await Promise.all([safe("admin_list_rooms", []), safe("admin_list_dms", []), safe("admin_list_reports", []), safe("admin_audit", []), safe("admin_list_emails", {}), safe("admin_banned_members", [])]);
  const rows = async (t) => { try { const { data } = await sb.from(t).select("*"); return data || []; } catch { return []; } };
  const [feedback, changelog] = await Promise.all([rows("feedback"), rows("changelog")]);
  const byNew = (x, y) => Date.parse(y.created_at || 0) - Date.parse(x.created_at || 0);
  Object.assign(D, { rooms, dms, reports, audit, emails, roomBans: bans, feedback: feedback.sort(byNew), changelog: changelog.sort(byNew), loaded: true });
  render();
}

const roomName = (id) => { const r = D.rooms.find((x) => x.id === id); if (r) return r.name || "ルーム"; if (D.dms.some((x) => x.id === id)) return "DM"; return id; };
const typingNow = () => typing.filter((t) => t.typing && Date.now() - Date.parse(t.updated_at || 0) < 6500);
const typingOf = (uid) => typingNow().find((t) => t.user_id === uid);
const users = () => Object.values(S.users);
const openReports = () => D.reports.filter((r) => !r.resolved);
const openFeedback = () => D.feedback.filter((f) => !f.status || f.status === "open");
const tempBanned = (u) => tempBanMs(u) > Date.now();

function shell() {
  app.replaceChildren(h("div", { class: "adm" },
    h("nav", { class: "adm-nav", id: "nav" }),
    h("main", { class: "adm-main" },
      h("div", { class: "adm-top" }, h("h1", { id: "ttl" }, ""), h("span", { class: "live" }, h("i", {}), "リアルタイム"),
        h("button", { class: "icon-btn", title: "再読み込み", "aria-label": "再読み込み", onclick: () => { loadData(); toast("更新しました"); } }, ico("refresh", 18)),
        h("a", { class: "icon-btn", href: "./", title: "チャットに戻る", "aria-label": "チャットに戻る" }, ico("back", 20))),
      h("div", { class: "adm-body", id: "body" }))));
}

function navDraw() {
  const nav = $("#nav"); if (!nav) return;
  const me = S.users[S.uid];
  nav.replaceChildren(
    h("div", { class: "adm-brand" }, h("div", { class: "wordmark" }, "Zero", h("i", {}, "Chat")), h("small", {}, "Admin Dashboard")),
    ...TABS.map(([k, l, ic]) => h("button", { class: "adm-tab" + (tab === k ? " on" : ""), onclick: () => { tab = k; q = ""; try { sessionStorage.setItem("cs_admin_tab", k); } catch { } render(true); } },
      ico(ic, 20), h("span", {}, l), k === "reports" && openReports().length ? h("span", { class: "cnt" }, openReports().length) : null, k === "feedback" && openFeedback().length ? h("span", { class: "cnt" }, openFeedback().length) : null)),
    h("div", { class: "adm-sp" }),
    me ? h("div", { class: "adm-me" }, avatar(me.id, me.name, true, true), h("div", {}, h("b", {}, me.name), h("span", { style: "color:var(--sub)" }, "管理者"))) : null);
}

const card = (icon, k, v, cls = "") => h("div", { class: "card " + cls }, h("div", { class: "k" }, ico(icon, 17), k), h("div", { class: "v" }, String(v)));
const empty = (t) => h("div", { class: "none" }, t);
const act = (fn, msg) => async () => { try { await fn(); if (msg) toast(msg); await loadProfiles(); await loadData(); } catch (e) { toast("失敗: " + (e.message || e)); } };
const btn = (label, cls, fn) => h("button", { class: "btn sm " + cls, onclick: fn }, label);
const online = () => users().filter((u) => !u.banned && isOnline(u.id));

function userRow(u) {
  const t = typingOf(u.id), on = isOnline(u.id), self = u.id === S.uid;
  return h("div", { class: "item" },
    avatar(u.id, u.name, false, on),
    h("div", { class: "main-c" },
      h("div", { class: "t" }, u.name, u.role !== "user" ? h("span", { class: "tag " + (u.role === "developer" ? "dev" : "type") }, ROLE[u.role]) : null,
        on ? h("span", { class: "tag on" }, "オンライン") : null, t ? h("span", { class: "tag type" }, h("span", { class: "typing-dots" }, "入力中")) : null, u.banned ? h("span", { class: "tag ban" }, "BAN中") : null, tempBanned(u) ? h("span", { class: "tag ban" }, "TempBAN 〜" + fmtDT(tempBanMs(u))) : null),
      h("small", {}, (D.emails[u.id] || (u.is_anonymous ? "匿名アカウント" : "メール非公開")) + " ｜ " + (t ? "入力先: " + roomName(t.room_id) : on ? "オンライン中" : "最終 " + fmtDT(u.last_seen)) + " ｜ 登録 " + fmtDT(u.created_at)),
      h("small", { style: "opacity:.6" }, "UID " + u.id)),
    self ? h("span", { class: "tag" }, "あなた") : h("div", { class: "acts" },
      h("select", { class: "field", "aria-label": "権限", onchange: (e) => act(() => rpc("admin_set_role", { uid: u.id, new_role: e.target.value }), "権限を変更しました")() },
        ...Object.entries(ROLE).map(([v, l]) => { const o = h("option", { value: v }, l); if (v === u.role) o.selected = true; return o; })),
      btn(u.banned ? "BAN解除" : "BAN", u.banned ? "ghost" : "danger", async () => {
        if (!u.banned && !await confirmBox("ユーザーをBAN", `「${u.name}」を利用停止にします。`, "BANする")) return;
        act(() => rpc("admin_set_banned", { uid: u.id, on_off: !u.banned }), u.banned ? "解除しました" : "BANしました")();
      }),
      btn(tempBanned(u) ? "TempBAN解除" : "TempBAN", "ghost", () => tempBanModal(u)),
      btn("名前リセット", "ghost", async () => { if (await confirmBox("表示名をリセット", `「${u.name}」の表示名とアイコンを初期化します。`, "リセット")) act(async () => { const { error } = await sb.from("profiles").update({ name: "ユーザー" + u.id.slice(0, 4), photo: null }).eq("id", u.id); if (error) throw error; }, "リセットしました")(); }),
      btn("削除", "danger", () => deleteAccount(u))));
}

function tempBanModal(u) {
  let close;
  const reason = h("input", { class: "field", placeholder: "理由（任意・80文字まで）", maxlength: "80", value: u.ban_reason || "" });
  const set = (minutes, msg) => act(() => rpc("admin_temp_ban", { uid: u.id, minutes, reason: reason.value.trim() }), msg)().then(() => close());
  const opts = [[10, "10分"], [60, "1時間"], [360, "6時間"], [1440, "1日"], [10080, "7日"], [43200, "30日"]];
  close = modal(`TempBAN: ${u.name}`, [
    h("p", { style: "font-size:13px;color:var(--sub)" }, tempBanned(u) ? "現在 " + fmtDT(tempBanMs(u)) + " まで停止中です。" : "指定した時間だけ、メッセージの送受信などができなくなります。時間が過ぎると自動で解除されます。"),
    reason,
    h("div", { class: "chips" }, opts.map(([m, l]) => h("button", { onclick: () => set(m, l + " のTempBANにしました") }, l))),
    tempBanned(u) ? h("button", { class: "btn ghost", onclick: () => set(0, "TempBANを解除しました") }, "TempBANを解除") : null
  ]);
}
async function deleteAccount(u) {
  if (!await confirmBox("アカウントを削除", `「${u.name}」を削除します。プロフィール・メールアドレス・ルーム参加情報が消え、このアカウントでは再ログイン・再登録できなくなります（投稿済みメッセージは残ります）。元に戻せません。`, "削除する")) return;
  act(() => rpc("admin_delete_account", { uid: u.id }), "アカウントを削除しました")();
}
function exportUsers() {
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv = ["uid,name,email,role,banned,created_at", ...users().map((u) => [u.id, u.name, D.emails[u.id], u.role, u.banned ? "1" : "0", u.created_at].map(esc).join(","))].join("\n");
  const a = h("a", { href: URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })), download: "zerochat-users.csv" });
  document.body.append(a); a.click(); a.remove();
}
const FB_KIND = { feature: "機能リクエスト", bug: "不具合", report: "通報", other: "その他" };
const FB_STATUS = { open: "受付済み", progress: "対応中", done: "対応済み", closed: "見送り" };

const views = {
  overview() {
    const us = users(), on = online(), tn = typingNow();
    const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return { d, n: us.filter((u) => u.created_at && new Date(u.created_at).toDateString() === d.toDateString()).length }; });
    const max = Math.max(1, ...days.map((x) => x.n));
    return [
      h("div", { class: "cards" },
        card("users", "登録ユーザー", us.length), card("activity", "オンライン", on.length, "ok"), card("msg", "入力中", tn.length, "acc"),
        card("home", "ルーム", D.rooms.length), card("lock", "DM", D.dms.length), card("flag", "未対応の通報", openReports().length, openReports().length ? "warn" : ""), card("ban", "BAN中", us.filter((u) => u.banned).length), card("ban", "TempBAN中", us.filter(tempBanned).length), card("form", "未対応フォーム", openFeedback().length, openFeedback().length ? "warn" : "")),
      h("div", { class: "grid2" },
        h("div", { class: "box" }, h("h3", {}, ico("activity", 18), "いまオンライン"), ...on.length ? on.slice(0, 12).map(userMini) : [empty("オンラインのユーザーはいません")]),
        h("div", { class: "box" }, h("h3", {}, ico("msg", 18), "入力中ライブ"), ...tn.length ? tn.map((t) => h("div", { class: "item" }, avatar(t.user_id, nameOf(t.user_id), true, true), h("div", { class: "main-c" }, h("div", { class: "t" }, nameOf(t.user_id), h("span", { class: "typing-dots" }, " 入力中")), h("small", {}, roomName(t.room_id))))) : [empty("今は誰も入力していません")])),
      h("div", { class: "box" }, h("h3", {}, ico("users", 18), "新規登録（直近7日）"),
        h("div", { class: "bars" }, days.map((x) => h("div", {}, x.n, h("i", { style: `height:${Math.max(3, x.n / max * 80)}px` }), x.d.getMonth() + 1 + "/" + x.d.getDate())))),
      openReports().length ? h("div", { class: "box" }, h("h3", {}, ico("flag", 18), "未対応の通報"), ...openReports().slice(0, 3).map(reportRow)) : null
    ];
  },
  users() {
    const f = userFilter, k = q.trim().toLowerCase();
    let arr = users().filter((u) => (f === "all") || (f === "online" && isOnline(u.id)) || (f === "typing" && typingOf(u.id)) || (f === "banned" && (u.banned || tempBanned(u))) || (f === "admin" && u.role === "developer"));
    if (k) arr = arr.filter((u) => [u.name, D.emails[u.id], u.id].some((v) => String(v || "").toLowerCase().includes(k)));
    arr.sort((a, b) => Number(isOnline(b.id)) - Number(isOnline(a.id)) || Date.parse(b.last_seen || 0) - Date.parse(a.last_seen || 0));
    const search = h("input", { class: "field", placeholder: "名前・メール・UIDで検索", value: q, oninput: (e) => { q = e.target.value; render(true, true); } });
    return [h("div", { class: "tools" }, search, h("div", { class: "chips" }, [["all", "すべて"], ["online", "オンライン"], ["typing", "入力中"], ["banned", "BAN中"], ["admin", "管理者"]].map(([v, l]) => h("button", { class: f === v ? "on" : "", onclick: () => { userFilter = v; render(true); } }, l)), h("button", { onclick: exportUsers }, "CSV出力"))),
      h("div", { class: "list" }, ...arr.length ? arr.map(userRow) : [empty("該当するユーザーがいません")])];
  },
  rooms() {
    const k = q.trim().toLowerCase();
    const arr = D.rooms.filter((r) => !k || [r.name, r.id, nameOf(r.created_by)].some((v) => String(v || "").toLowerCase().includes(k)));
    return [h("div", { class: "tools" }, h("input", { class: "field", placeholder: "ルーム名・IDで検索", value: q, oninput: (e) => { q = e.target.value; render(true, true); } })),
      h("div", { class: "list" }, ...arr.length ? arr.map((r) => h("div", { class: "item" },
        avatar(r.created_by || r.id, r.name || "ルーム", false),
        h("div", { class: "main-c" }, h("div", { class: "t" }, r.name || "ルーム", r.kind === "official" ? badge() : null, r.post_admin_only ? h("span", { class: "tag" }, "管理者のみ発言") : null),
          h("small", {}, `${r.has_password ? "🔑 " : ""}${r.locked ? "🔒 " : ""}${r.members}人 ｜ ${r.msgs}件 ｜ 作成 ${nameOf(r.created_by)} ｜ ${fmtDT(r.created_at)}`), h("small", { style: "opacity:.6" }, "ID " + r.id)),
        h("div", { class: "acts" },
          btn("IDコピー", "ghost", () => navigator.clipboard?.writeText(r.id).then(() => toast("コピーしました"))),
          r.kind === "official" ? null : btn("中身を見る", "ghost", () => viewRoom(r)),
          r.has_password || r.locked ? btn("パスワード/ロック解除", "ghost", act(() => rpc("admin_clear_room_privacy", { rid: r.id }), "解除しました")) : null,
          r.kind === "official" ? null : btn("削除", "danger", async () => { if (await confirmBox("ルームを削除", `「${r.name}」とメッセージがすべて消えます。`, "削除する")) act(() => rpc("delete_room", { rid: r.id }), "削除しました")(); })))) : [empty("ルームがありません")])];
  },
  dms() {
    return [h("p", { style: "font-size:12px;color:var(--sub)" }, "DMを開くと、閲覧した記録が監査ログに残ります。"),
      h("div", { class: "list" }, ...D.dms.length ? D.dms.map((d) => h("div", { class: "item" },
        h("div", { class: "main-c" }, h("div", { class: "t" }, (d.members || []).map(nameOf).join(" × ")), h("small", {}, (d.last_message_preview || "メッセージなし") + " ｜ " + fmtDT(d.last_message_at))),
        h("div", { class: "acts" }, btn("読む", "ghost", () => viewDm(d.id, d.members || []))))) : [empty("DMはありません")])];
  },
  reports() {
    return [h("div", { class: "list" }, ...D.reports.length ? D.reports.map(reportRow) : [empty("通報はありません")])];
  },
  bans() {
    const bu = users().filter((u) => u.banned);
    const tb = users().filter(tempBanned);
    return [h("div", { class: "box" }, h("h3", {}, ico("ban", 18), "アカウント停止中"), ...bu.length ? bu.map((u) => h("div", { class: "item" }, avatar(u.id, u.name, true), h("div", { class: "main-c" }, h("div", { class: "t" }, u.name)), btn("解除", "ghost", act(() => rpc("admin_set_banned", { uid: u.id, on_off: false }), "解除しました")))) : [empty("いません")]),
      h("div", { class: "box" }, h("h3", {}, ico("ban", 18), "TempBAN中"), ...tb.length ? tb.map((u) => h("div", { class: "item" }, avatar(u.id, u.name, true), h("div", { class: "main-c" }, h("div", { class: "t" }, u.name), h("small", {}, "解除予定 " + fmtDT(tempBanMs(u)) + (u.ban_reason ? " ｜ " + u.ban_reason : ""))), btn("解除", "ghost", act(() => rpc("admin_temp_ban", { uid: u.id, minutes: 0 }), "解除しました")))) : [empty("いません")]),
      h("div", { class: "box" }, h("h3", {}, ico("ban", 18), "ルームからBANされたメンバー"), ...D.roomBans.length ? D.roomBans.map((b) => h("div", { class: "item" }, h("div", { class: "main-c" }, h("div", { class: "t" }, nameOf(b.user_id)), h("small", {}, "ルーム: " + (b.name || b.room_id))), btn("解除", "ghost", act(() => rpc("ban_member", { rid: b.room_id, uid: b.user_id, on_off: false }), "解除しました")))) : [empty("いません")])];
  },
  feedback() {
    const arr = D.feedback.filter((f) => fbFilter === "all" || (f.status || "open") === fbFilter);
    return [h("div", { class: "tools" }, h("div", { class: "chips" }, [["open", "未対応"], ["progress", "対応中"], ["done", "対応済み"], ["all", "すべて"]].map(([v, l]) => h("button", { class: fbFilter === v ? "on" : "", onclick: () => { fbFilter = v; render(true); } }, l)))),
      h("div", { class: "list" }, ...arr.length ? arr.map((f) => h("div", { class: "item" },
        h("div", { class: "main-c" },
          h("div", { class: "t" }, f.title, h("span", { class: "tag" }, FB_KIND[f.kind] || "その他"), h("span", { class: "tag " + (f.status === "done" ? "on" : f.status === "progress" ? "type" : "ban") }, FB_STATUS[f.status || "open"])),
          h("small", {}, f.body), f.target ? h("small", {}, "対象: " + f.target) : null,
          h("small", {}, `${nameOf(f.author_id)} ｜ ${fmtDT(f.created_at)}`),
          f.reply ? h("small", { style: "color:var(--accent)" }, "返信済み: " + f.reply) : null),
        h("div", { class: "acts" },
          h("select", { class: "field", "aria-label": "状態", onchange: (e) => act(async () => { const { error } = await sb.from("feedback").update({ status: e.target.value }).eq("id", f.id); if (error) throw error; }, "更新しました")() },
            ...Object.entries(FB_STATUS).map(([v, l]) => { const o = h("option", { value: v }, l); if (v === (f.status || "open")) o.selected = true; return o; })),
          btn("返信", "ghost", () => replyModal(f)),
          btn("削除", "danger", async () => { if (await confirmBox("削除", "このフォームを削除します。", "削除する")) act(async () => { const { error } = await sb.from("feedback").delete().eq("id", f.id); if (error) throw error; }, "削除しました")(); })))) : [empty("該当するフォームはありません")])];
  },
  changelog() {
    const ver = h("input", { class: "field", placeholder: "バージョン（例: 2.2）", maxlength: "12" });
    const ttl = h("input", { class: "field", placeholder: "タイトル", maxlength: "60" });
    const items = h("textarea", { class: "field", rows: "4", placeholder: "変更点（1行に1項目）", maxlength: "800" });
    return [h("div", { class: "box" }, h("h3", {}, ico("history", 18), "更新履歴を追加（公式ページに表示）"), ver, ttl, items,
        btn("公開する", "", act(async () => {
          if (!ver.value.trim() || !ttl.value.trim()) throw new Error("バージョンとタイトルを入力してください");
          const id = crypto.randomUUID();
          const { error } = await sb.from("changelog").insert({ id, version: ver.value.trim(), title: ttl.value.trim(), items: items.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20), created_at: new Date().toISOString(), by: S.uid });
          if (error) throw error;
        }, "公開しました"))),
      h("div", { class: "list" }, ...D.changelog.length ? D.changelog.map((e) => h("div", { class: "item" },
        h("div", { class: "main-c" }, h("div", { class: "t" }, "v" + e.version + " " + e.title), h("small", {}, (e.items || []).join(" ・ ")), h("small", {}, fmtDT(e.created_at))),
        btn("削除", "danger", async () => { if (await confirmBox("削除", "この更新履歴を削除します。", "削除する")) act(async () => { const { error } = await sb.from("changelog").delete().eq("id", e.id); if (error) throw error; }, "削除しました")(); }))) : [empty("追加した更新履歴はありません（組み込みの履歴は公式ページに常に表示されます）")])];
  },
  audit() {
    return [h("div", { class: "list" }, ...D.audit.length ? D.audit.map((a) => h("div", { class: "item" }, h("div", { class: "main-c" }, h("div", { class: "t" }, nameOf(a.actor_id), h("span", { class: "tag" }, a.action)), h("small", {}, (a.target || "") + " ｜ " + fmtDT(a.created_at))))) : [empty("記録はありません")])];
  }
};
function userMini(u) {
  const t = typingOf(u.id);
  return h("div", { class: "item" }, avatar(u.id, u.name, true, true), h("div", { class: "main-c" }, h("div", { class: "t" }, u.name, t ? h("span", { class: "tag type" }, h("span", { class: "typing-dots" }, "入力中")) : null), h("small", {}, t ? roomName(t.room_id) : ROLE[u.role])));
}
function reportRow(x) {
  return h("div", { class: "item" },
    h("div", { class: "main-c" }, h("div", { class: "t" }, nameOf(x.author_id) + " の発言", x.resolved ? h("span", { class: "tag on" }, "対応済み") : h("span", { class: "tag ban" }, "未対応")), h("small", {}, x.text_snapshot || ""), h("small", {}, `${x.room_name || ""} ｜ 通報者 ${nameOf(x.reporter_id)} ｜ ${fmtDT(x.created_at)}`)),
    h("div", { class: "acts" },
      x.resolved ? null : btn("対応済み", "ghost", act(() => rpc("admin_resolve_report", { rid: x.id }), "対応済みにしました")),
      x.message_id ? btn("発言を削除", "ghost", act(() => rpc("delete_message", { mid: x.message_id }), "削除しました")) : null,
      x.author_id ? btn("BAN", "danger", act(() => rpc("admin_set_banned", { uid: x.author_id, on_off: true }), "BANしました")) : null));
}
function replyModal(f) {
  const t = h("textarea", { class: "field", rows: "5", maxlength: "600", placeholder: "返信（送信者の「送信履歴」に表示されます）" });
  t.value = f.reply || "";
  let close;
  close = modal("返信: " + f.title, [t, h("button", { class: "btn", onclick: () => { close(); act(async () => { const { error } = await sb.from("feedback").update({ reply: t.value.trim(), status: f.status === "open" || !f.status ? "progress" : f.status }).eq("id", f.id); if (error) throw error; }, "返信しました")(); } }, "返信する")]);
}
async function viewRoom(r) {
  const box = h("div", { class: "list", style: "max-height:60vh;overflow:auto" }, empty("読み込み中…"));
  modal((r.name || "ルーム") + "（直近40件・閲覧記録が残ります）", box, true);
  try {
    const msgs = await rpc("preview_room", { rid: r.id });
    box.replaceChildren(...msgs.length ? msgs.map((m) => h("div", { class: "preview-message" }, h("small", {}, nameOf(m.author_id) + " · " + fmtDT(m.created_at)), m.kind === "image" ? "[画像]" : m.kind === "file" ? "[ファイル]" : m.deleted ? "（削除済み）" : m.body)) : [empty("メッセージはありません")]);
  } catch (e) { box.replaceChildren(empty("読み込めませんでした: " + (e.message || e))); }
}
async function viewDm(id, ms) {
  const box = h("div", { class: "list", style: "max-height:60vh;overflow:auto" }, empty("読み込み中…"));
  modal(ms.map(nameOf).join(" × ") + " のDM", box, true);
  try {
    const msgs = await rpc("admin_read_dm", { rid: id });
    box.replaceChildren(...msgs.length ? msgs.map((m) => h("div", { class: "preview-message" }, h("small", {}, (m.kind === "system" ? "システム" : nameOf(m.author_id)) + " · " + fmtDT(m.created_at)), m.kind === "image" ? "[画像]" : m.kind === "file" ? "[ファイル]" : m.deleted ? "（削除済み）" : m.body)) : [empty("メッセージはありません")]);
    box.scrollTop = box.scrollHeight;
  } catch (e) { box.replaceChildren(empty("読み込めませんでした: " + (e.message || e))); }
}

let lastTab = "";
function render(force, keepFocus) {
  if (!$("#body")) return;
  navDraw();
  $("#ttl").textContent = TABS.find((t) => t[0] === tab)?.[1] || "";
  const body = $("#body");
  // 入力欄にフォーカス中の自動更新は避ける
  const ae = document.activeElement;
  if (!force && ae && ae.tagName === "INPUT" && body.contains(ae)) return;
  const st = body.scrollTop, hadFocus = keepFocus && ae && ae.tagName === "INPUT", pos = hadFocus ? ae.selectionStart : 0;
  body.replaceChildren(...(views[tab]?.() || []).filter(Boolean));
  if (lastTab === tab) body.scrollTop = st;
  lastTab = tab;
  if (hadFocus) { const i = body.querySelector("input.field"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { } } }
}
