import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query as firestoreQuery,
  where,
  orderBy,
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction,
  Timestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import {
  getDatabase,
  ref as dbRef,
  set as dbSet,
  onValue,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js";
const firebaseConfig = {
  apiKey: "AIzaSyDAop2Xj6kiziGRWtETBuAO3WY_ekO7Gnk",
  authDomain: "zerochat-45a93.firebaseapp.com",
  projectId: "zerochat-45a93",
  storageBucket: "zerochat-45a93.firebasestorage.app",
  messagingSenderId: "316492971834",
  appId: "1:316492971834:web:a64c44327494a29ca89a03",
  measurementId: "G-35E1WP24RX",
  databaseURL: "https://zerochat-45a93-default-rtdb.firebaseio.com"
};
const configured = true;
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const rtdb = getDatabase(firebaseApp, firebaseConfig.databaseURL);
const COLORS = ["#7c6af7", "#f472b6", "#34d399", "#fb923c", "#60a5fa", "#a78bfa", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];
async function hashPw(rid, pw) {
  if (!globalThis.crypto?.subtle) throw new Error("パスワード機能はHTTPSで開いたときだけ使えます");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("zc:" + rid + ":" + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const now = () => (/* @__PURE__ */ new Date()).toISOString();
const memberId = (rid, uid) => `${rid}__${uid}`;
const safeId = (value) => String(value).replace(/\//g, "%2F");
const docData = (snap) => snap.exists() ? { id: snap.id, ...snap.data() } : null;
const asError = (error) => {
  if (!error) return null;
  const code = String(error.code || "");
  const messages = {
    "auth/invalid-credential": "Invalid login credentials",
    "auth/user-not-found": "Invalid login credentials",
    "auth/wrong-password": "Invalid login credentials",
    "auth/email-already-in-use": "User already registered",
    "auth/weak-password": "Password should be at least 6 characters",
    "auth/invalid-email": "Invalid email",
    "auth/popup-closed-by-user": "ログイン画面が閉じられました",
    "auth/unauthorized-domain": "このドメインはFirebase Authenticationの承認済みドメインに登録されていません",
    "permission-denied": "権限がありません。Firebase Security Rulesを確認してください",
    "firestore/permission-denied": "権限がありません。Firebase Security Rulesを確認してください"
  };
  const e = new Error(messages[code] || error.message || "Firebaseでエラーが発生しました");
  e.code = code;
  return e;
};
function colorFor(uid) {
  const hash = [...uid].reduce((v, c) => v * 31 + c.charCodeAt(0) >>> 0, 0);
  return COLORS[hash % COLORS.length];
}
const userDocumentJobs = /* @__PURE__ */ new Map();
async function ensureUserDocumentsOnce(user) {
  const profileRef = doc(db, "profiles", user.uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    const gone = await getDoc(doc(db, "deleted_users", user.uid));
    if (gone.exists()) {
      const err = new Error("このアカウントは管理者により削除されました");
      err.code = "account-deleted";
      throw err;
    }
    const suggested = user.displayName || (user.email ? user.email.split("@")[0] : "ゲスト");
    await setDoc(profileRef, {
      id: user.uid,
      name: String(suggested || "ゲスト").slice(0, 20),
      color: colorFor(user.uid),
      photo: null,
      role: "user",
      banned: false,
      online: true,
      last_seen: now(),
      created_at: now(),
      is_anonymous: !!user.isAnonymous
    });
  }
  const officialRef = doc(db, "rooms", "official");
  await runTransaction(db, async (tx) => {
    const officialSnap = await tx.get(officialRef);
    if (!officialSnap.exists()) tx.set(officialRef, {
      id: "official",
      kind: "official",
      name: "ZeroChat 公式",
      descr: "公式ルーム",
      created_by: user.uid,
      image_admin_only: false,
      post_admin_only: false,
      pinned_message_id: null,
      pinned_text: null,
      last_message_at: now(),
      last_message_preview: "",
      last_author: null,
      created_at: now(),
      members: [user.uid],
      member_ids: [user.uid]
    });
  });
  const memberRef = doc(db, "room_members", memberId("official", user.uid));
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) {
    await setDoc(memberRef, {
      id: memberId("official", user.uid),
      room_id: "official",
      user_id: user.uid,
      role: "member",
      banned: false,
      hidden: false,
      muted: false,
      favorite: false,
      last_read_at: now(),
      joined_at: now()
    });
  }
  const officialAfter = await getDoc(officialRef);
  const officialMembers = officialAfter.data()?.member_ids || [];
  if (!officialMembers.includes(user.uid)) {
    await updateDoc(officialRef, { members: arrayUnion(user.uid), member_ids: arrayUnion(user.uid) });
  }
  const privateRef = doc(db, "private_profiles", user.uid);
  const privateSnap = await getDoc(privateRef);
  const privateData = { email: user.email || null, updated_at: now() };
  if (!privateSnap.exists()) await setDoc(privateRef, privateData);
  else if ((privateSnap.data().email || null) !== privateData.email) await updateDoc(privateRef, privateData);
  const statusRef = dbRef(rtdb, `status/${user.uid}`);
  await dbSet(statusRef, { online: true, last_seen: now() });
  await onDisconnect(statusRef).set({ online: false, last_seen: now() });
}
async function ensureUserDocuments(user) {
  const existing = userDocumentJobs.get(user.uid);
  if (existing) return existing;
  const job = ensureUserDocumentsOnce(user).finally(() => userDocumentJobs.delete(user.uid));
  userDocumentJobs.set(user.uid, job);
  return job;
}
const authFacade = {
  onAuthStateChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
      try {
        if (user) await ensureUserDocuments(user);
        callback(user ? "SIGNED_IN" : "SIGNED_OUT", user ? { user: { id: user.uid, email: user.email || null } } : null);
      } catch (error) {
        if (error?.code === "account-deleted") {
          window.__zcNotice = error.message;
          try { await firebaseSignOut(auth); } catch { }
          callback("SIGNED_OUT", null);
          return;
        }
        console.error("Firebase profile initialization failed:", error);
        callback(user ? "SIGNED_IN" : "SIGNED_OUT", user ? { user: { id: user.uid, email: user.email || null } } : null);
      }
    });
  },
  async getSession() {
    const user = auth.currentUser;
    return { data: { session: user ? { user: { id: user.uid, email: user.email || null } } : null }, error: null };
  },
  async signUp(input) {
    try {
      const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
      const name = String(input.options?.data?.name || "").trim();
      if (name) await updateProfile(credential.user, { displayName: name });
      await ensureUserDocuments(credential.user);
      if (name) await updateDoc(doc(db, "profiles", credential.user.uid), { name: name.slice(0, 20) });
      return { data: { user: credential.user, session: { user: credential.user } }, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  async signInWithPassword(input) {
    try {
      const result = await signInWithEmailAndPassword(auth, input.email, input.password);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  async signInWithOAuth(input) {
    try {
      if (input.provider !== "google") throw new Error("このログイン方法には対応していません");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  async signInAnonymously() {
    try {
      const result = await signInAnonymously(auth);
      await ensureUserDocuments(result.user);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  async signOut() {
    try {
      if (auth.currentUser) {
        const at = now();
        try {
          await dbSet(dbRef(rtdb, `status/${auth.currentUser.uid}`), { online: false, last_seen: at });
        } catch (error) {
          console.warn("Could not update offline status:", error);
        }
      }
      await firebaseSignOut(auth);
      return { error: null };
    } catch (error) {
      return { error: asError(error) };
    }
  }
};
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.operation = "select";
    this.filters = [];
    this.sort = null;
    this.maxRows = null;
    this.returning = false;
    this.singleResult = false;
    this.selection = "*";
  }
  select(columns = "*") {
    this.selection = columns;
    this.returning = true;
    return this;
  }
  insert(values) {
    this.operation = "insert";
    this.values = values;
    return this;
  }
  update(values) {
    this.operation = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(field, value) {
    this.filters.push({ field, op: "==", value });
    return this;
  }
  neq(field, value) {
    this.filters.push({ field, op: "!=", value });
    return this;
  }
  in(field, values) {
    this.filters.push({ field, op: "in", value: values || [] });
    return this;
  }
  order(field, options = {}) {
    this.sort = { field, ascending: options.ascending !== false };
    return this;
  }
  limit(count) {
    this.maxRows = Math.max(0, count);
    return this;
  }
  single() {
    this.singleResult = true;
    return this;
  }
  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
  async execute() {
    try {
      let data;
      if (this.operation === "select") data = await this.readRows();
      else if (this.operation === "insert") data = await this.insertRows();
      else if (this.operation === "update") data = await this.updateRows();
      else data = await this.deleteRows();
      if (this.singleResult && Array.isArray(data)) data = data[0] || null;
      return { data, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  }
  makeQuery(filters = this.filters) {
    const constraints = [];
    for (const f of filters) {
      if (f.op === "in" && (!Array.isArray(f.value) || !f.value.length)) continue;
      constraints.push(where(f.field, f.op, f.value));
    }
    if (this.maxRows != null && this.sort) {
      constraints.push(orderBy(this.sort.field, this.sort.ascending ? "asc" : "desc"));
      constraints.push(limit(this.maxRows));
    } else if (this.maxRows != null) {
      constraints.push(limit(this.maxRows));
    }
    return constraints.length ? firestoreQuery(collection(db, this.table), ...constraints) : collection(db, this.table);
  }
  async fetchRaw(filters = this.filters) {
    const inFilter = filters.find((f) => f.op === "in" && Array.isArray(f.value) && f.value.length > 30);
    let snaps = [];
    if (inFilter) {
      const groups = [];
      for (let i = 0; i < inFilter.value.length; i += 30) groups.push(inFilter.value.slice(i, i + 30));
      for (const group of groups) {
        const sub = filters.map((f) => f === inFilter ? { ...f, value: group } : f);
        const result = await getDocs(this.makeQuery(sub));
        snaps.push(...result.docs);
      }
    } else {
      const result = await getDocs(this.makeQuery(filters));
      snaps = result.docs;
    }
    let rows = snaps.map((s) => ({ ...s.data(), id: s.id }));
    rows = rows.filter((row) => filters.every((f) => {
      const current = row[f.field];
      if (f.op === "==") return current === f.value;
      if (f.op === "!=") return current !== f.value;
      return Array.isArray(f.value) && f.value.includes(current);
    }));
    const unique = new Map(rows.map((row) => [row.id, row]));
    return [...unique.values()];
  }
  async readRows() {
    let rows = await this.fetchRaw();
    if (this.sort) {
      const { field, ascending } = this.sort;
      rows.sort((a, b) => {
        const av = a[field] ?? "", bv = b[field] ?? "";
        const an = typeof av === "number" ? av : Date.parse(av);
        const bn = typeof bv === "number" ? bv : Date.parse(bv);
        const cmp = Number.isNaN(an) || Number.isNaN(bn) ? String(av).localeCompare(String(bv), "ja") : an - bn;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.maxRows != null) rows = rows.slice(0, this.maxRows);
    if (this.table === "room_members" && /rooms\s*\(/.test(this.selection)) {
      rows = await Promise.all(rows.map(async (row) => ({ ...row, rooms: await readOne("rooms", row.room_id) })));
    }
    if (this.table === "saved_messages" && /messages\s*\(/.test(this.selection)) {
      rows = await Promise.all(rows.map(async (row) => ({ ...row, messages: await readOne("messages", row.message_id) })));
    }
    return rows;
  }
  async insertRows() {
    const list = (Array.isArray(this.values) ? this.values : [this.values]).filter(Boolean);
    const inserted = [];
    for (const value of list) {
      const id = documentIdFor(this.table, value);
      const row = { ...value, id: value.id || id };
      if (["messages", "whispers", "feedback", "changelog", "file_chunks"].includes(this.table)) row.created_at || (row.created_at = now());
      if (this.table === "reports" || this.table === "audit_log") row.created_at || (row.created_at = now());
      await setDoc(doc(db, this.table, id), row);
      inserted.push(row);
      if (this.table === "messages" && row.kind !== "system") await updateRoomPreview(row);
    }
    return this.returning ? this.singleResult ? inserted[0] || null : inserted : null;
  }
  async updateRows() {
    const rows = await this.fetchRaw();
    for (const row of rows) {
      await updateDoc(doc(db, this.table, row.id), this.values);
      if (this.table === "profiles" && typeof this.values?.online === "boolean") {
        const uid = row.id;
        await dbSet(dbRef(rtdb, `status/${uid}`), { online: this.values.online, last_seen: this.values.last_seen || now() });
      }
    }
    return this.returning ? rows.map((row) => ({ ...row, ...this.values })) : null;
  }
  async deleteRows() {
    const rows = await this.fetchRaw();
    for (const row of rows) await deleteDoc(doc(db, this.table, row.id));
    return this.returning ? rows : null;
  }
}
function documentIdFor(table, row) {
  if (row.id) return safeId(String(row.id));
  if (table === "profiles") return String(row.user_id || row.id);
  if (table === "room_members") return safeId(memberId(row.room_id, row.user_id));
  if (table === "reactions") return safeId(`${row.message_id}__${row.user_id}__${row.emoji}`);
  if (table === "message_reads") return safeId(`${row.message_id}__${row.user_id}`);
  if (table === "poll_votes") return safeId(`${row.message_id}__${row.user_id}__${row.option_idx}`);
  if (table === "saved_messages") return safeId(`${row.user_id}__${row.message_id}`);
  return crypto.randomUUID();
}
async function readOne(table, id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, table, safeId(String(id))));
  return docData(snap);
}
async function updateRoomPreview(message) {
  const preview = message.kind === "image" ? "画像を送信しました" : message.kind === "file" ? "ファイルを送信しました" : message.kind === "poll" ? `投票: ${String(message.body || "").slice(0, 60)}` : message.kind === "stamp" ? `スタンプ ${message.body || ""}` : String(message.body || "").slice(0, 80);
  await updateDoc(doc(db, "rooms", safeId(message.room_id)), {
    last_message_at: message.created_at || now(),
    last_message_preview: preview,
    last_author: message.author_id || null
  });
}
async function getProfile(uid) {
  return readOne("profiles", uid);
}
async function getRoom(rid) {
  return readOne("rooms", rid);
}
async function getMember(rid, uid = auth.currentUser?.uid || "") {
  return readOne("room_members", memberId(rid, uid));
}
async function requireActive() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("inactive");
  const profile = await getProfile(uid);
  if (!profile || profile.banned || profile.banned_until?.toMillis?.() > Date.now()) throw new Error("inactive");
  return { uid, profile };
}
async function requireDev() {
  const { uid, profile } = await requireActive();
  if (profile.role !== "developer") throw new Error("forbidden");
  return uid;
}
async function requireVerified() {
  const { uid, profile } = await requireActive();
  if (!["verified", "developer"].includes(profile.role)) throw new Error("forbidden");
  return uid;
}
async function requireRoomMember(rid, allowHidden = true) {
  const { uid } = await requireActive();
  const m = await getMember(rid, uid);
  if (!m || m.banned || !allowHidden && m.hidden) throw new Error("forbidden");
  return { uid, member: m };
}
async function logAudit(actor, action, target) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, "audit_log", id), { id, actor_id: actor, action, target, created_at: now() });
}
async function writeMember(rid, uid, extra = {}) {
  const id = memberId(rid, uid);
  await setDoc(doc(db, "room_members", safeId(id)), {
    id,
    room_id: rid,
    user_id: uid,
    role: "member",
    banned: false,
    hidden: false,
    muted: false,
    favorite: false,
    last_read_at: now(),
    joined_at: now(),
    ...extra
  });
}
async function changeRoomMembers(rid, add = [], remove = []) {
  const patch = {};
  if (add.length) {
    patch.member_ids = arrayUnion(...add);
    patch.members = arrayUnion(...add);
  }
  if (remove.length) {
    patch.member_ids = arrayRemove(...remove);
    patch.members = arrayRemove(...remove);
  }
  if (Object.keys(patch).length) await updateDoc(doc(db, "rooms", safeId(rid)), patch);
}
async function deleteCollectionRows(table, filters) {
  const rows = await new QueryBuilder(table).select("*").then((r) => r.data || []);
  const selected = rows.filter((row) => filters.every((f) => f.op === "==" ? row[f.field] === f.value : f.op === "!=" ? row[f.field] !== f.value : f.value.includes(row[f.field])));
  for (let i = 0; i < selected.length; i += 400) {
    const batch = writeBatch(db);
    selected.slice(i, i + 400).forEach((row) => batch.delete(doc(db, table, safeId(row.id))));
    await batch.commit();
  }
}
async function runRpc(fn, args = {}) {
  const rid = String(args.rid || "");
  const uid = String(args.uid || "");
  switch (fn) {
    case "create_room": {
      const { uid: me } = await requireActive();
      const invitees = Array.isArray(args.p_invitees) ? args.p_invitees.slice(0, 50) : [];
      let code = "";
      for (let n = 0; n < 30; n++) {
        const candidate = String(1e5 + Math.floor(Math.random() * 9e5));
        if (!await getRoom(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("busy");
      const all = [.../* @__PURE__ */ new Set([me, ...invitees])];
      const room = {
        id: code,
        kind: "group",
        name: String(args.p_name || "").slice(0, 40),
        descr: String(args.p_descr || "").slice(0, 80),
        created_by: me,
        image_admin_only: false,
        post_admin_only: false,
        pinned_message_id: null,
        pinned_text: null,
        last_message_at: now(),
        last_message_preview: "",
        last_author: null,
        created_at: now(),
        members: all,
        member_ids: all
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "rooms", code), room);
      for (const person of all) {
        const id = memberId(code, person);
        batch.set(doc(db, "room_members", safeId(id)), {
          id,
          room_id: code,
          user_id: person,
          role: person === me ? "owner" : "member",
          banned: false,
          hidden: false,
          muted: false,
          favorite: false,
          last_read_at: now(),
          joined_at: now()
        });
      }
      await batch.commit();
      return code;
    }
    case "join_room": {
      const { uid: me, profile } = await requireActive();
      const room = await getRoom(rid);
      if (!room || room.kind === "dm") throw new Error("not found");
      const existing = await getMember(rid, me);
      if (existing?.banned) throw new Error("banned");
      if (!existing) {
        const needPw = !!room.has_password && profile.role !== "developer";
        if (needPw && !args.proof) throw new Error("password");
        try {
          await writeMember(rid, me, room.has_password && args.proof ? { join_proof: String(args.proof) } : {});
        } catch (e) {
          if (needPw && String(e.code || "").includes("permission")) throw new Error("wrong password");
          throw e;
        }
        await changeRoomMembers(rid, [me]);
      }
      return rid;
    }
    case "leave_room": {
      if (rid === "official") throw new Error("forbidden");
      const { uid: me } = await requireActive();
      const member = await getMember(rid, me);
      if (member && member.role !== "owner") {
        if (!member.hidden) await changeRoomMembers(rid, [], [me]);
        await deleteDoc(doc(db, "room_members", safeId(memberId(rid, me))));
      }
      return null;
    }
    case "invite_members": {
      const { uid: me } = await requireRoomMember(rid);
      const admin = await getMember(rid, me);
      if (!["owner", "admin"].includes(admin.role)) throw new Error("forbidden");
      const invitees = [...new Set((args.uids || []).map((x) => String(x)).filter((x) => x && x !== me))];
      const room = await getRoom(rid);
      if (!room) throw new Error("not found");
      const fresh = [];
      for (const person of invitees) {
        const old = await getMember(rid, person);
        if (old?.banned) continue;
        if (!old) {
          await writeMember(rid, person);
          fresh.push(person);
        }
      }
      await changeRoomMembers(rid, fresh);
      return null;
    }
    case "start_dm": {
      const { uid: me } = await requireActive();
      const other = String(args.other || "");
      if (!other || other === me) throw new Error("invalid");
      const [a, b] = [me, other].sort();
      const id = `dm_${a}_${b}`;
      const old = await getRoom(id);
      if (!old) {
        const members = [a, b];
        const batch = writeBatch(db);
        batch.set(doc(db, "rooms", id), {
          id,
          kind: "dm",
          name: null,
          descr: "",
          created_by: me,
          image_admin_only: false,
          post_admin_only: false,
          pinned_message_id: null,
          pinned_text: null,
          last_message_at: now(),
          last_message_preview: "",
          last_author: null,
          created_at: now(),
          members,
          member_ids: members
        });
        for (const person of members) {
          const mid = memberId(id, person);
          batch.set(doc(db, "room_members", safeId(mid)), {
            id: mid,
            room_id: id,
            user_id: person,
            role: "member",
            banned: false,
            hidden: false,
            muted: false,
            favorite: false,
            last_read_at: now(),
            joined_at: now()
          });
        }
        await batch.commit();
      }
      return id;
    }
    case "set_member_role": {
      const { uid: me } = await requireRoomMember(rid);
      const own = await getMember(rid, me);
      const target = await getMember(rid, uid);
      if (own?.role !== "owner" || !target || target.role === "owner") throw new Error("forbidden");
      if (!["admin", "member"].includes(args.new_role)) throw new Error("invalid");
      await updateDoc(doc(db, "room_members", safeId(memberId(rid, uid))), { role: args.new_role });
      return null;
    }
    case "ban_member": {
      const { uid: me, profile } = await requireActive();
      const own = await getMember(rid, me);
      const target = await getMember(rid, uid);
      if (!target || !(profile.role === "developer" || ["owner", "admin"].includes(own?.role))) throw new Error("forbidden");
      if (target.role === "owner") throw new Error("forbidden");
      if (target.role === "admin" && own?.role !== "owner" && profile.role !== "developer") throw new Error("forbidden");
      const on = !!args.on_off;
      await updateDoc(doc(db, "room_members", safeId(memberId(rid, uid))), { banned: on, role: "member" });
      if (!target.hidden) await changeRoomMembers(rid, on ? [] : [uid], on ? [uid] : []);
      return null;
    }
    case "delete_room": {
      const { uid: me, profile } = await requireActive();
      const room = await getRoom(rid);
      if (!room) return null;
      const own = await getMember(rid, me);
      if (!(profile.role === "developer" || ["owner", "admin"].includes(own?.role)) || rid === "official" && profile.role !== "developer") throw new Error("forbidden");
      const memberRows = await new QueryBuilder("room_members").select("*").eq("room_id", rid).eq("hidden", false);
      for (const table of ["messages", "reactions", "message_reads", "poll_votes"]) {
        const rows = await new QueryBuilder(table).select("*").eq("room_id", rid);
        for (let i = 0; i < (rows.data || []).length; i += 400) {
          const batch = writeBatch(db);
          (rows.data || []).slice(i, i + 400).forEach((row) => batch.delete(doc(db, table, safeId(row.id))));
          await batch.commit();
        }
      }
      try { await deleteDoc(doc(db, "room_secrets", safeId(rid))); } catch { }
      await deleteDoc(doc(db, "rooms", safeId(rid)));
      for (const m of memberRows.data || []) await deleteDoc(doc(db, "room_members", safeId(m.id)));
      return null;
    }
    case "set_room_privacy": {
      const { uid: me, profile } = await requireActive();
      const room = await getRoom(rid);
      if (!room || room.kind !== "group") throw new Error("not found");
      const own = await getMember(rid, me);
      if (!(profile.role === "developer" || ["owner", "admin"].includes(own?.role))) throw new Error("forbidden");
      const roomPatch = {};
      let joinHash;
      if (args.join_password !== undefined) {
        const pw = String(args.join_password || "");
        if (pw && (pw.length < 4 || pw.length > 40)) throw new Error("short");
        joinHash = pw ? await hashPw(rid, pw) : null;
        roomPatch.has_password = !!pw;
      }
      if (args.lock !== undefined) {
        if (args.lock) {
          const pw = String(args.lock_password || "");
          if (pw.length < 4 || pw.length > 40) throw new Error("short");
          roomPatch.lock_hash = await hashPw(rid, pw);
          roomPatch.locked = true;
        } else {
          roomPatch.locked = false;
          roomPatch.lock_hash = null;
        }
      }
      if (joinHash !== void 0) await setDoc(doc(db, "room_secrets", safeId(rid)), { room_id: rid, join_hash: joinHash }, { merge: true });
      if (Object.keys(roomPatch).length) await updateDoc(doc(db, "rooms", safeId(rid)), roomPatch);
      return null;
    }
    case "set_pin": {
      await requireRoomMember(rid);
      await updateDoc(doc(db, "rooms", safeId(rid)), { pinned_message_id: args.mid || null, pinned_text: args.txt || null });
      return null;
    }
    case "delete_message": {
      const { uid: me, profile } = await requireActive();
      const message = await readOne("messages", String(args.mid || ""));
      if (!message) throw new Error("not found");
      if (message.author_id !== me && profile.role !== "developer") throw new Error("forbidden");
      await updateDoc(doc(db, "messages", safeId(message.id)), { deleted: true, body: "(削除済み)", image_path: null, poll: null, ...message.kind === "file" ? { file_data: null } : {} });
      return null;
    }
    case "report_message": {
      const { uid: me } = await requireActive();
      const message = await readOne("messages", String(args.mid || ""));
      if (!message) throw new Error("not found");
      await requireRoomMember(message.room_id);
      const room = await getRoom(message.room_id);
      const id = crypto.randomUUID();
      await setDoc(doc(db, "reports", id), {
        id,
        message_id: message.id,
        room_id: message.room_id,
        room_name: room?.name || "DM",
        text_snapshot: message.kind === "image" ? "(画像)" : String(message.body || "").slice(0, 200),
        author_id: message.author_id,
        reporter_id: me,
        resolved: false,
        created_at: now()
      });
      return null;
    }
    case "mark_read": {
      const { uid: me, member } = await requireRoomMember(rid);
      if (member.hidden) return null;
      await updateDoc(doc(db, "room_members", safeId(memberId(rid, me))), { last_read_at: now() });
      const messages = await new QueryBuilder("messages").select("*").eq("room_id", rid).then((r) => (r.data || []).filter((m) => m.kind !== "system" && m.author_id !== me && Date.now() - Date.parse(m.created_at || "") < 3 * 864e5));
      for (let i = 0; i < messages.length; i += 400) {
        const batch = writeBatch(db);
        messages.slice(i, i + 400).forEach((m) => {
          const id = `${m.id}__${me}`;
          batch.set(doc(db, "message_reads", safeId(id)), { id, message_id: m.id, room_id: rid, user_id: me, read_at: now() });
        });
        await batch.commit();
      }
      return null;
    }
    case "join_room_hidden": {
      const { uid: me, profile } = await requireActive();
      if (!["verified", "developer"].includes(profile.role)) throw new Error("forbidden");
      const room = await getRoom(rid);
      if (!room || room.kind === "dm") throw new Error("not found");
      const existing = await getMember(rid, me);
      if (existing?.banned) throw new Error("banned");
      if (!existing) {
        const needPw = !!room.has_password && profile.role !== "developer";
        if (needPw && !args.proof) throw new Error("password");
        try {
          await writeMember(rid, me, { hidden: true, ...room.has_password && args.proof ? { join_proof: String(args.proof) } : {} });
        } catch (e) {
          if (needPw && String(e.code || "").includes("permission")) throw new Error("wrong password");
          throw e;
        }
      }
      await logAudit(me, "join_hidden", rid);
      return rid;
    }
    case "unhide_room": {
      const { uid: me } = await requireRoomMember(rid);
      const member = await getMember(rid, me);
      if (member.hidden) {
        await updateDoc(doc(db, "room_members", safeId(memberId(rid, me))), { hidden: false });
        await changeRoomMembers(rid, [me]);
      }
      return null;
    }
    case "preview_room": {
      const { uid: me } = await requireVerified();
      const room = await getRoom(String(args.rid || ""));
      if (!room || room.kind === "dm") throw new Error("not found");
      await logAudit(me, "preview", String(args.rid));
      const result = await new QueryBuilder("messages").select("*").eq("room_id", String(args.rid)).order("created_at", { ascending: false }).limit(40);
      return (result.data || []).reverse().map((m) => ({ id: m.id, kind: m.kind, body: m.body, created_at: m.created_at, author_id: m.author_id, deleted: m.deleted }));
    }
    case "admin_list_rooms": {
      await requireDev();
      const rooms = await new QueryBuilder("rooms").select("*");
      const groups = (rooms.data || []).filter((r) => r.kind !== "dm");
      const [members, messages] = await Promise.all([new QueryBuilder("room_members").select("*"), new QueryBuilder("messages").select("*")]);
      return groups.map((r) => ({ ...r, members: (members.data || []).filter((m) => m.room_id === r.id).length, msgs: (messages.data || []).filter((m) => m.room_id === r.id).length })).sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
    }
    case "admin_list_dms": {
      await requireDev();
      const result = await new QueryBuilder("rooms").select("*").eq("kind", "dm");
      return (result.data || []).map((r) => ({ id: r.id, last_message_at: r.last_message_at, last_message_preview: r.last_message_preview, members: r.members || [] })).sort((a, b) => Date.parse(b.last_message_at || "") - Date.parse(a.last_message_at || ""));
    }
    case "admin_read_dm": {
      const me = await requireDev();
      const result = await new QueryBuilder("messages").select("*").eq("room_id", rid).order("created_at", { ascending: false }).limit(500);
      await logAudit(me, "read_dm", rid);
      return (result.data || []).reverse().map((m) => ({ id: m.id, kind: m.kind, body: m.body, created_at: m.created_at, author_id: m.author_id, deleted: m.deleted }));
    }
    case "admin_list_reports": {
      await requireDev();
      const result = await new QueryBuilder("reports").select("*").order("created_at", { ascending: false });
      return result.data || [];
    }
    case "admin_resolve_report": {
      await requireDev();
      await updateDoc(doc(db, "reports", safeId(String(args.rid))), { resolved: true });
      await logAudit(auth.currentUser.uid, "resolve_report", String(args.rid));
      return null;
    }
    case "admin_set_banned": {
      const me = await requireDev();
      if (uid === me) throw new Error("self");
      await updateDoc(doc(db, "profiles", safeId(uid)), { banned: !!args.on_off });
      await logAudit(me, args.on_off ? "ban_user" : "unban_user", uid);
      return null;
    }
    case "admin_temp_ban": {
      const me = await requireDev();
      if (uid === me) throw new Error("self");
      const mins = Math.max(0, Math.min(Number(args.minutes) || 0, 60 * 24 * 365));
      await updateDoc(doc(db, "profiles", safeId(uid)), { banned_until: mins > 0 ? Timestamp.fromMillis(Date.now() + mins * 6e4) : null, ban_reason: String(args.reason || "").slice(0, 80) });
      await logAudit(me, mins > 0 ? "temp_ban" : "clear_temp_ban", `${uid}:${mins}m`);
      return null;
    }
    case "admin_delete_account": {
      const me = await requireDev();
      if (uid === me) throw new Error("self");
      const target = await getProfile(uid);
      if (!target) throw new Error("not found");
      await setDoc(doc(db, "deleted_users", safeId(uid)), { id: uid, name: target.name || "", by: me, at: now() });
      const mem = await new QueryBuilder("room_members").select("*").eq("user_id", uid);
      for (const m of mem.data || []) {
        if (!m.hidden) { try { await updateDoc(doc(db, "rooms", safeId(m.room_id)), { members: arrayRemove(uid), member_ids: arrayRemove(uid) }); } catch { } }
        await deleteDoc(doc(db, "room_members", safeId(m.id)));
      }
      const saved = await new QueryBuilder("saved_messages").select("*").eq("user_id", uid);
      for (const s of saved.data || []) { try { await deleteDoc(doc(db, "saved_messages", safeId(s.id))); } catch { } }
      try { await deleteDoc(doc(db, "private_profiles", safeId(uid))); } catch { }
      await deleteDoc(doc(db, "profiles", safeId(uid)));
      await logAudit(me, "delete_account", `${uid}:${target.name || ""}`);
      return null;
    }
    case "admin_clear_room_privacy": {
      const me = await requireDev();
      try { await setDoc(doc(db, "room_secrets", safeId(rid)), { room_id: rid, join_hash: null }, { merge: true }); } catch { }
      await updateDoc(doc(db, "rooms", safeId(rid)), { has_password: false, locked: false, lock_hash: null });
      await logAudit(me, "clear_room_privacy", rid);
      return null;
    }
    case "admin_set_role": {
      const me = await requireDev();
      if (!["user", "verified", "developer"].includes(args.new_role)) throw new Error("invalid");
      if (uid === me && args.new_role !== "developer") throw new Error("self");
      await updateDoc(doc(db, "profiles", safeId(uid)), { role: args.new_role });
      await logAudit(me, "set_role", `${uid}:${args.new_role}`);
      return null;
    }
    case "admin_list_emails": {
      await requireDev();
      const result = await new QueryBuilder("private_profiles").select("*");
      return Object.fromEntries((result.data || []).map((p) => [p.id, p.email || ""]));
    }
    case "admin_audit": {
      await requireDev();
      const result = await new QueryBuilder("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
      return result.data || [];
    }
    case "admin_banned_members": {
      await requireDev();
      const result = await new QueryBuilder("room_members").select("*");
      const banned = (result.data || []).filter((m) => m.banned);
      return Promise.all(banned.map(async (m) => ({ ...m, name: (await getRoom(m.room_id))?.name || m.room_id })));
    }
    default:
      throw new Error(`未対応の操作: ${fn}`);
  }
}
class Channel {
  constructor(name) {
    this.name = name;
    this.events = [];
    this.unsubscribers = [];
    this.presence = {};
    this.presenceListeners = [];
    this.roomId = null;
    this.roomStops = /* @__PURE__ */ new Map();
    this.presenceTimer = null;
    this.active = false;
    if (name.startsWith("room:")) this.roomId = name.slice(5);
  }
  on(type, filter, callback) {
    if (type === "postgres_changes") this.events.push({ filter, callback });
    else if (type === "presence") this.presenceListeners.push(callback);
    return this;
  }
  subscribe(callback) {
    if (this.active) return this;
    this.active = true;
    for (const event of this.events) this.attachEvent(event);
    if (this.roomId && this.presenceListeners.length) {
      const typingQuery = firestoreQuery(collection(db, "room_typing"), where("room_id", "==", this.roomId));
      const stop = onSnapshot(typingQuery, (snap) => {
        this.presence = {};
        snap.docs.forEach((d) => {
          const value = d.data();
          if (value.user_id) this.presence[String(value.user_id)] = [value];
        });
        this.presenceListeners.forEach((fn) => fn({}));
      }, (error) => console.error("Firestore room typing:", error));
      this.unsubscribers.push(stop);
      this.presenceTimer = window.setInterval(() => this.presenceListeners.forEach((fn) => fn({})), 1e3);
    }
    callback?.("SUBSCRIBED");
    return this;
  }
  attachEvent(event) {
    const { filter, callback } = event;
    const table = String(filter.table || "");
    if (!table) return;
    const parsed = [];
    const match = String(filter.filter || "").match(/^([a-zA-Z0-9_]+)=eq\.(.*)$/);
    if (match) parsed.push({ field: match[1], op: "==", value: match[2] });
    const attach = (constraints, queryName = table) => {
      let source = collection(db, queryName);
      if (constraints.length) source = firestoreQuery(source, ...constraints);
      const stop = onSnapshot(source, (snap) => {
        snap.docChanges().forEach((change) => {
          const fresh = { id: change.doc.id, ...change.doc.data() };
          const kind = change.type === "added" ? "INSERT" : change.type === "modified" ? "UPDATE" : "DELETE";
          const requested = String(filter.event || "*").toUpperCase();
          if (requested !== "*" && requested !== kind) return;
          callback({ eventType: kind, new: kind === "DELETE" ? {} : fresh, old: kind === "INSERT" ? {} : fresh });
        });
      }, (error) => console.error(`Firestore realtime (${queryName}):`, error));
      this.unsubscribers.push(stop);
    };
    if (parsed.length) {
      attach(parsed.map((f) => where(f.field, "==", f.value)));
    } else if (table === "rooms") {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const memberStop = onSnapshot(firestoreQuery(collection(db, "room_members"), where("user_id", "==", uid)), (membersSnap) => {
          const wanted = new Set(membersSnap.docs.filter((d) => d.data().banned !== true).map((d) => String(d.data().room_id)));
          for (const [rid, stop] of this.roomStops) if (!wanted.has(rid)) {
            stop();
            this.roomStops.delete(rid);
          }
          for (const rid of wanted) if (!this.roomStops.has(rid)) {
            let firstSnapshot = true;
            const stop = onSnapshot(doc(db, "rooms", safeId(rid)), (roomSnap) => {
              const kind = !roomSnap.exists() ? "DELETE" : firstSnapshot ? "INSERT" : "UPDATE";
              firstSnapshot = false;
              const value = roomSnap.exists() ? { ...roomSnap.data(), id: roomSnap.id } : { id: rid };
              callback({ eventType: kind, new: kind === "DELETE" ? {} : value, old: value });
            }, (error) => console.error("Room listener:", error));
            this.roomStops.set(rid, stop);
          }
        }, (error) => console.error("Room membership listener:", error));
        this.unsubscribers.push(() => {
          memberStop();
          this.roomStops.forEach((stop) => stop());
          this.roomStops.clear();
        });
      }
    } else if (table === "room_members") {
      const uid = auth.currentUser?.uid;
      if (uid) attach([where("user_id", "==", uid)]);
    } else if (table === "profiles") {
      const cache = /* @__PURE__ */ new Map();
      const statusStops = /* @__PURE__ */ new Map();
      const stop = onSnapshot(collection(db, "profiles"), (snap) => {
        snap.docChanges().forEach((change) => {
          const profile = { id: change.doc.id, ...change.doc.data() };
          if (change.type === "removed") {
            cache.delete(profile.id);
            statusStops.get(profile.id)?.();
            statusStops.delete(profile.id);
            callback({ eventType: "DELETE", new: {}, old: profile });
            return;
          }
          cache.set(profile.id, profile);
          const kind = change.type === "added" ? "INSERT" : "UPDATE";
          if (String(filter.event || "*") === "*" || String(filter.event).toUpperCase() === kind) {
            callback({ eventType: kind, new: profile, old: {} });
          }
          if (!statusStops.has(profile.id)) {
            const statusStop = onValue(dbRef(rtdb, `status/${profile.id}`), (statusSnap) => {
              const status = statusSnap.val() || {};
              const latest = cache.get(profile.id);
              if (latest) callback({ eventType: "UPDATE", new: { ...latest, online: !!status.online, last_seen: status.last_seen || latest.last_seen }, old: {} });
            }, (error) => console.error("Realtime user status:", error));
            statusStops.set(profile.id, statusStop);
          }
        });
      }, (error) => console.error("Profile listener:", error));
      this.unsubscribers.push(() => {
        stop();
        statusStops.forEach((unsub) => unsub());
        statusStops.clear();
      });
    } else if (this.roomId && table === "whispers") {
      const me = auth.currentUser?.uid;
      if (me) attach([where("room_id", "==", this.roomId), where("owner_id", "==", me)]);
    } else if (this.roomId && ["reactions", "poll_votes"].includes(table)) {
      attach([where("room_id", "==", this.roomId)]);
    } else {
      attach([]);
    }
  }
  track(value) {
    const uid = auth.currentUser?.uid;
    if (!this.roomId || !uid) return Promise.resolve();
    const id = `${this.roomId}__${uid}`;
    return setDoc(doc(db, "room_typing", safeId(id)), {
      id,
      room_id: this.roomId,
      user_id: uid,
      typing: !!value?.typing,
      updated_at: now()
    });
  }
  presenceState() {
    const current = Date.now();
    return Object.fromEntries(Object.entries(this.presence).filter(([, values]) => values.some((value) => value?.typing === true && current - Date.parse(value.updated_at || "") < 6500)));
  }
  async unsubscribe() {
    this.active = false;
    this.unsubscribers.splice(0).forEach((stop) => {
      try {
        stop();
      } catch {
      }
    });
    if (this.presenceTimer != null) {
      window.clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    if (this.roomId && auth.currentUser) {
      const id = `${this.roomId}__${auth.currentUser.uid}`;
      try {
        await deleteDoc(doc(db, "room_typing", safeId(id)));
      } catch {
      }
    }
    this.roomStops.clear();
    return "ok";
  }
}
const sb = {
  auth: authFacade,
  from: (table) => new QueryBuilder(table),
  rpc: async (name, args) => {
    try {
      return { data: await runRpc(name, args || {}), error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  },
  channel: (name) => new Channel(name),
  removeChannel: (channel) => channel?.unsubscribe?.()
};
export {
  hashPw,
  auth,
  configured,
  db,
  firebaseApp,
  rtdb,
  sb
};
