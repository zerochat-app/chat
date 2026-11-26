// 公式ルーム専用ページ（チャットではなく、更新履歴とフォーム）
import { sb } from "./firebase.js";
import { h, ico, toast, fmtDT } from "./ui.js";
import { S, badge } from "./state.js";

export const VERSION_NO = "2.1";
export const BUILTIN_LOG = [
  { id: "b-2.1", version: "2.1", created_at: "2026-11-26T20:00:00+09:00", title: "通話・ファイル・耳打ち、公式ページ刷新", items: ["DMで音声通話・ビデオ通話ができるようになりました", "ファイルを送受信できるようになりました（最大4MB）", "ルーム内で指定した人だけに届く「耳打ち」を追加", "スマホ・タブレット表示を改善", "この公式ページに更新履歴とフォームを設置", "管理画面にTempBAN・アカウント削除・フォーム受信箱などを追加", "読み込み画面を刷新"] },
  { id: "b-2.0.1", version: "2.0.1", created_at: "2026-11-26T12:00:00+09:00", title: "プライバシー強化", items: ["ルームに入室パスワードとロックを追加（ルーム設定から）", "公式ルームは管理者のみ発言・退出不可に", "プライバシー系の設定を「developer」タブに集約", "コマンドパレットを廃止"] },
  { id: "b-2.0", version: "2.0", created_at: "2026-10-01T00:00:00+09:00", title: "ZeroChat 2.0", items: ["グループ・DM・リアクション・投票・画像送信・既読・ピン留め など"] }
];
const KINDS = [["feature", "機能リクエスト"], ["bug", "不具合の報告"], ["report", "ユーザー・ルームの通報"], ["other", "その他"]];
const STATUS = { open: "受付済み", progress: "対応中", done: "対応済み", closed: "見送り" };
let lastSent = 0;

export function officialView(room, goBack) {
  let tab = "log";
  const body = h("div", { class: "off-body" });
  const tabs = h("div", { class: "tabs off-tabs" });
  const draw = () => {
    tabs.replaceChildren(...[["log", "バージョン履歴", "history"], ["form", "フォーム", "form"], ["mine", "送信履歴", "list"]].map(([k, l, ic]) => h("button", { class: tab === k ? "on" : "", onclick: () => { tab = k; draw(); } }, ico(ic, 16), l)));
    body.replaceChildren(h("div", { class: "empty" }, "読み込み中…"));
    ({ log: drawLog, form: drawForm, mine: drawMine })[tab]();
  };
  async function drawLog() {
    const { data } = await sb.from("changelog").select("*");
    const all = [...(data || []), ...BUILTIN_LOG].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
    body.replaceChildren(...all.map((e, i) => h("article", { class: "log" + (i === 0 ? " latest" : "") },
      h("div", { class: "log-h" }, h("span", { class: "ver-chip" }, "v" + e.version), i === 0 ? h("span", { class: "tag on" }, "最新") : null, h("small", {}, fmtDT(e.created_at))),
      h("h3", {}, e.title || ""),
      Array.isArray(e.items) && e.items.length ? h("ul", {}, e.items.map((t) => h("li", {}, t))) : (e.body ? h("p", {}, e.body) : null))));
  }
  function drawForm() {
    let kind = "feature";
    const kinds = h("div", { class: "seg" });
    const title = h("input", { class: "field", maxlength: "60", placeholder: "タイトル（例：スタンプを増やしてほしい）" });
    const target = h("input", { class: "field", maxlength: "80", placeholder: "対象（通報のとき：ユーザー名・ルームIDなど）" });
    const text = h("textarea", { class: "field", rows: "6", maxlength: "1000", placeholder: "内容をできるだけくわしく書いてください" });
    const err = h("div", { class: "err", role: "alert" });
    const drawKinds = () => { kinds.replaceChildren(...KINDS.map(([k, l]) => h("button", { class: k === kind ? "on" : "", onclick: () => { kind = k; drawKinds(); target.style.display = k === "report" ? "" : "none"; } }, l))); };
    drawKinds(); target.style.display = "none";
    const go = h("button", { class: "btn", onclick: async () => {
      err.textContent = "";
      if (!title.value.trim() || !text.value.trim()) { err.textContent = "タイトルと内容を入力してください"; return; }
      if (Date.now() - lastSent < 30000) { err.textContent = "少し時間をおいてから送信してください"; return; }
      go.disabled = true;
      const id = crypto.randomUUID();
      const { error } = await sb.from("feedback").insert({ id, kind, title: title.value.trim(), body: text.value.trim(), target: kind === "report" ? target.value.trim() : "", author_id: S.uid, status: "open", reply: "" });
      go.disabled = false;
      if (error) { err.textContent = "送信できませんでした"; return; }
      lastSent = Date.now();
      toast("送信しました。ありがとうございます");
      tab = "mine"; draw();
    } }, ico("send", 17), "送信する");
    body.replaceChildren(h("p", { class: "off-note" }, "追加してほしい機能・不具合・通報などを管理者に送れます。返信は「送信履歴」に表示されます。"), kinds, title, target, text, err, go);
  }
  async function drawMine() {
    const { data } = await sb.from("feedback").select("*").eq("author_id", S.uid);
    const rows = (data || []).sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
    body.replaceChildren(...rows.length ? rows.map((f) => h("article", { class: "log" },
      h("div", { class: "log-h" }, h("span", { class: "tag" }, (KINDS.find((k) => k[0] === f.kind) || [, "その他"])[1]), h("span", { class: "tag " + (f.status === "done" ? "on" : f.status === "progress" ? "type" : "") }, STATUS[f.status] || "受付済み"), h("small", {}, fmtDT(f.created_at))),
      h("h3", {}, f.title), h("p", {}, f.body),
      f.reply ? h("div", { class: "reply" }, h("b", {}, "運営からの返信"), h("p", {}, f.reply)) : null)) : [h("div", { class: "empty" }, "まだ送信していません")]);
  }
  draw();
  return h("div", { class: "official" },
    h("div", { class: "chat-head" },
      h("button", { class: "icon-btn back", "aria-label": "一覧に戻る", onclick: goBack }, ico("back")),
      h("div", { class: "off-logo" }, ico("shield", 20)),
      h("div", { class: "titles" }, h("div", { class: "t" }, room.name || "ZeroChat 公式", badge()), h("div", { class: "s" }, "お知らせ・フィードバック"))),
    tabs, body);
}
