import { sb } from "./firebase.js";
import { h, ico } from "./ui.js";
const S = { uid: "", email: "", users: {} };
const meP = () => S.users[S.uid];
const nameOf = (u) => u && S.users[u]?.name || "不明";
const isDev = () => meP()?.role === "developer";
const isVerified = () => ["verified", "developer"].includes(meP()?.role);
const verifiedUid = (u) => ["verified", "developer"].includes(S.users[u]?.role);
const isOnline = (u) => !!S.users[u]?.online && Date.now() - new Date(S.users[u]?.last_seen || 0).getTime() < 15e4;
const badge = () => h("span", { class: "vbadge", title: "公式" }, ico("check", 11));
const COLORS = ["#7c6af7", "#f472b6", "#34d399", "#fb923c", "#60a5fa", "#a78bfa", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];
const colorOf = (u) => S.users[u]?.color || COLORS[[...String(u)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % COLORS.length, 0)];
function avatar(uid, label, small = false, online = false) {
  const photo = S.users[uid]?.photo;
  const a = h(
    "div",
    { class: "avatar" + (small ? " sm" : ""), style: `background:${colorOf(uid)}` },
    typeof photo === "string" && photo.startsWith("data:image/") ? h("img", { src: photo, alt: "" }) : Array.from(label || "?")[0] || "?"
  );
  if (online) a.append(h("span", { class: "on" }));
  return a;
}
async function loadProfiles() {
  const { data } = await sb.from("profiles").select("*");
  S.users = {};
  (data || []).forEach((p) => S.users[p.id] = p);
}
export {
  COLORS,
  S,
  avatar,
  badge,
  colorOf,
  isDev,
  isOnline,
  isVerified,
  loadProfiles,
  meP,
  nameOf,
  verifiedUid
};
