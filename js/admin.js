import { sb } from "./firebase.js";
import { h, modal, toast, confirmBox, fmtDT } from "./ui.js";
import { S, nameOf, isDev, avatar, isOnline, loadProfiles } from "./state.js";
const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
};
const ROLE_LABEL = { user: "一般", verified: "公式認証", developer: "開発者" };
function adminPanel() {
  if (!isDev()) return toast("開発者のみ使えます");
  let tab = "users";
  const tabs = h("div", { class: "tabs" });
  const list = h("div", { class: "alist" });
  const small = (t) => h("small", {}, t);
  const row = (left, ...right) => h("div", { class: "arow" }, left, h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end" }, ...right));
  const btn = (label, cls, fn) => h("button", { class: "btn sm " + cls, onclick: async () => {
    try {
      await fn();
    } catch (e) {
      toast("失敗: " + (e.message || e));
    }
  } }, label);
  let draw;
  const act = (fn, msg) => async () => {
    await fn();
    toast(msg);
    await loadProfiles();
    await draw();
  };
  const TABS = [["users", "登録者"], ["rooms", "ルーム"], ["dms", "DM"], ["reports", "通報"], ["bans", "BAN"], ["audit", "監査ログ"]];
  draw = async () => {
    tabs.replaceChildren(...TABS.map(([k, l]) => h("button", { class: tab === k ? "on" : "", onclick: () => {
      tab = k;
      draw();
    } }, l)));
    list.replaceChildren(h("div", { class: "empty" }, "読み込み中…"));
    try {
      const rows = [];
      if (tab === "users") {
        const emails = await rpc("admin_list_emails");
        Object.values(S.users).sort((a, b) => +new Date(b.last_seen || 0) - +new Date(a.last_seen || 0)).forEach((u) => {
          const self = u.id === S.uid;
          rows.push(row(
            h(
              "div",
              { style: "display:flex;gap:10px;align-items:center" },
              avatar(u.id, u.name, true, isOnline(u.id)),
              h("div", {}, h("b", {}, u.name), u.banned ? "（停止中）" : "", small((emails[u.id] || "") + "｜" + ROLE_LABEL[u.role] + "｜" + (isOnline(u.id) ? "オンライン" : "最終 " + fmtDT(u.last_seen))))
            ),
            self ? null : h(
              "select",
              { class: "field", style: "width:auto;padding:4px 8px", onchange: (e) => act(() => rpc("admin_set_role", { uid: u.id, new_role: e.target.value }), "権限を変更しました")() },
              ...Object.entries(ROLE_LABEL).map(([v, l]) => {
                const o = h("option", { value: v }, l);
                if (v === u.role) o.selected = true;
                return o;
              })
            ),
            self ? null : btn(u.banned ? "停止解除" : "停止", u.banned ? "ghost" : "danger", act(() => rpc("admin_set_banned", { uid: u.id, on_off: !u.banned }), u.banned ? "解除しました" : "停止しました"))
          ));
        });
      } else if (tab === "rooms") {
        const rs = await rpc("admin_list_rooms");
        rs.forEach((r) => rows.push(row(
          h("div", {}, h("b", {}, r.name || "ルーム"), small(`ID ${r.id}｜${r.members}人｜${r.msgs}件｜作成 ${nameOf(r.created_by)}｜${fmtDT(r.created_at)}`)),
          btn("削除", "danger", async () => {
            if (await confirmBox("ルームを削除", `「${r.name}」とメッセージがすべて消えます。`, "削除する")) await act(() => rpc("delete_room", { rid: r.id }), "削除しました")();
          })
        )));
        if (!rows.length) rows.push(h("div", { class: "empty" }, "ルームがありません"));
      } else if (tab === "dms") {
        const ds = await rpc("admin_list_dms");
        rows.push(h("p", { style: "font-size:12px;color:var(--sub)" }, "DMを開くと、閲覧した記録が監査ログに残ります。"));
        ds.forEach((d) => {
          const ms = d.members || [];
          rows.push(row(
            h("div", {}, h("b", {}, ms.map(nameOf).join(" × ")), small((d.last_message_preview || "メッセージなし") + "｜" + fmtDT(d.last_message_at))),
            btn("読む", "ghost", () => viewDm(d.id, ms))
          ));
        });
        if (!ds.length) rows.push(h("div", { class: "empty" }, "DMはありません"));
      } else if (tab === "reports") {
        const rp = await rpc("admin_list_reports");
        rp.forEach((x) => rows.push(row(
          h("div", {}, h("b", {}, nameOf(x.author_id) + " の発言"), `（${x.room_name || ""}）${x.resolved ? " ✔対応済み" : ""}`, small(x.text_snapshot || ""), small("通報者 " + nameOf(x.reporter_id) + "｜" + fmtDT(x.created_at))),
          h(
            "div",
            { style: "display:grid;gap:4px" },
            x.resolved ? null : btn("対応済み", "ghost", act(() => rpc("admin_resolve_report", { rid: x.id }), "対応済みにしました")),
            x.message_id ? btn("発言を削除", "ghost", act(() => rpc("delete_message", { mid: x.message_id }), "削除しました")) : null,
            x.author_id ? btn("送信者を停止", "danger", act(() => rpc("admin_set_banned", { uid: x.author_id, on_off: true }), "停止しました")) : null
          )
        )));
        if (!rp.length) rows.push(h("div", { class: "empty" }, "通報はありません"));
      } else if (tab === "bans") {
        rows.push(h("b", {}, "アカウント停止中"));
        Object.values(S.users).filter((u) => u.banned).forEach((u) => rows.push(row(h("div", {}, u.name), btn("解除", "ghost", act(() => rpc("admin_set_banned", { uid: u.id, on_off: false }), "解除しました")))));
        if (!Object.values(S.users).some((u) => u.banned)) rows.push(h("div", { class: "empty" }, "いません"));
        rows.push(h("b", { style: "margin-top:12px" }, "ルームからBANされたメンバー"));
        const bm = await rpc("admin_banned_members");
        bm.forEach((b) => rows.push(row(h("div", {}, nameOf(b.user_id), small("ルーム: " + (b.name || b.room_id))), btn("解除", "ghost", act(() => rpc("ban_member", { rid: b.room_id, uid: b.user_id, on_off: false }), "解除しました")))));
        if (!bm.length) rows.push(h("div", { class: "empty" }, "いません"));
      } else {
        const au = await rpc("admin_audit");
        au.forEach((a) => rows.push(h("div", { class: "arow" }, h("div", {}, h("b", {}, nameOf(a.actor_id)), " " + a.action, small((a.target || "") + "｜" + fmtDT(a.created_at))))));
        if (!au.length) rows.push(h("div", { class: "empty" }, "記録はありません"));
      }
      list.replaceChildren(...rows);
    } catch (e) {
      console.error(e);
      list.replaceChildren(h("div", { class: "empty" }, "読み込めませんでした: " + (e.message || e)));
    }
  };
  modal("管理パネル", [tabs, list], true);
  draw();
}
async function viewDm(id, ms) {
  const box = h("div", { class: "alist", style: "gap:6px;padding:8px" }, h("div", { class: "empty" }, "読み込み中…"));
  modal(ms.map(nameOf).join(" × ") + " のDM", box, true);
  try {
    const msgs = await rpc("admin_read_dm", { rid: id });
    box.replaceChildren(...msgs.length ? msgs.map((m) => h(
      "div",
      { class: "preview-message" },
      h("small", {}, (m.kind === "system" ? "システム" : nameOf(m.author_id)) + " · " + fmtDT(m.created_at)),
      m.kind === "image" ? "[画像]" : m.deleted ? "（削除済み）" : m.body
    )) : [h("div", { class: "empty" }, "メッセージはありません")]);
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.replaceChildren(h("div", { class: "empty" }, "読み込めませんでした: " + (e.message || e)));
  }
}
export {
  adminPanel
};
