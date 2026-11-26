// 管理者認証（テスト用）。認証コード "admin" で自分に開発者(管理者)権限を付与します。
// ※ Firestore ルール側（admin_claims）でも検証されます。本番では削除してください。
import { auth, db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
export const ADMIN_PAGE = "admin.html";
export async function grantAdmin(code) {
  const u = auth.currentUser;
  if (!u) throw new Error("ログインしてください");
  if (String(code).trim() !== "admin") throw new Error("認証コードが違います");
  try {
    const ref = doc(db, "admin_claims", u.uid);
    const s = await getDoc(ref);
    if (!s.exists()) await setDoc(ref, { code: "admin", at: new Date().toISOString() });
    await updateDoc(doc(db, "profiles", u.uid), { role: "developer" });
  } catch (e) {
    if (String(e.code || "").includes("permission")) throw new Error("権限エラー: 最新の firestore.rules を Firebase に反映してください");
    throw e;
  }
}
