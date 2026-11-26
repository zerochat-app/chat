// 1対1の音声/ビデオ通話（WebRTC）。シグナリングは Firestore の calls / call_candidates。
// STUN のみ（TURN なし）のため、厳しいNAT/社内網どうしでは繋がらないことがあります。
import { db, auth } from "./firebase.js";
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { h, ico, toast } from "./ui.js";
import { S, avatar, nameOf } from "./state.js";

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
const now = () => new Date().toISOString();
let pc = null, local = null, callId = null, peerId = "", isVideo = false, unsubs = [], pending = [], remoteSet = false;
let ringTimer = null, ringer = null, tickTimer = null, ui = null, actx = null, ended = false;

export const inCall = () => !!callId;

function ringStart(loop) {
  ringStop();
  const beep = () => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = loop ? 660 : 440;
      g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.05); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.6);
      o.connect(g).connect(actx.destination); o.start(); o.stop(t + 0.65);
    } catch { }
  };
  beep(); ringer = setInterval(beep, 1800);
}
function ringStop() { clearInterval(ringer); ringer = null; }

async function media(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("この環境では通話を使えません（HTTPSで開いてください）");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: "user", width: { ideal: 640 } } : false });
  } catch {
    throw new Error(video ? "カメラ・マイクの許可が必要です" : "マイクの許可が必要です");
  }
}

function newPc(me, other, id) {
  pc = new RTCPeerConnection(ICE);
  local.getTracks().forEach((t) => pc.addTrack(t, local));
  const remote = new MediaStream();
  pc.ontrack = (e) => { e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t)); if (ui) { ui.rv.srcObject = remote; ui.rv.play?.().catch(() => { }); ui.state.textContent = "通話中"; } };
  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    const cid = crypto.randomUUID();
    setDoc(doc(db, "call_candidates", cid), { id: cid, call_id: id, from_uid: me, to_uid: other, cand: JSON.stringify(e.candidate), created_at: now() }).catch(() => { });
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === "connected") connected();
    if (pc?.connectionState === "failed") finish("接続できませんでした（ネットワーク環境により繋がらないことがあります）", true);
  };
  unsubs.push(onSnapshot(query(collection(db, "call_candidates"), where("call_id", "==", id), where("to_uid", "==", me)), (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type !== "added") return;
      try { const cand = JSON.parse(c.doc.data().cand); remoteSet ? pc?.addIceCandidate(cand).catch(() => { }) : pending.push(cand); } catch { }
    });
  }, () => { }));
}
async function flushCandidates() {
  remoteSet = true;
  for (const c of pending) { try { await pc.addIceCandidate(c); } catch { } }
  pending = [];
}

function connected() {
  ringStop(); clearTimeout(ringTimer);
  if (!ui || tickTimer) return;
  const t0 = Date.now();
  tickTimer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1e3); ui.state.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 1000);
}

function callUi(video, status) {
  const rv = h("video", { class: "call-remote", autoplay: "", playsinline: "" });
  const lv = h("video", { class: "call-local", autoplay: "", playsinline: "", muted: "" });
  lv.muted = true; lv.srcObject = local;
  const state = h("div", { class: "call-state" }, status);
  let mic = true, cam = true;
  const micB = h("button", { class: "call-btn", "aria-label": "ミュート", onclick: () => { mic = !mic; local.getAudioTracks().forEach((t) => t.enabled = mic); micB.replaceChildren(ico(mic ? "mic" : "micOff", 24)); micB.classList.toggle("off", !mic); } }, ico("mic", 24));
  const camB = video ? h("button", { class: "call-btn", "aria-label": "カメラ", onclick: () => { cam = !cam; local.getVideoTracks().forEach((t) => t.enabled = cam); camB.replaceChildren(ico(cam ? "video" : "videoOff", 24)); camB.classList.toggle("off", !cam); } }, ico("video", 24)) : null;
  const end = h("button", { class: "call-btn hang", "aria-label": "切る", onclick: () => finish("通話を終了しました", true) }, ico("phoneOff", 26));
  const el = h("div", { class: "call-ov" + (video ? " video" : "") },
    rv, video ? lv : null,
    h("div", { class: "call-who" }, avatar(peerId, nameOf(peerId)), h("b", {}, nameOf(peerId)), state),
    h("div", { class: "call-bar" }, micB, camB, end));
  document.body.append(el);
  ui = { el, rv, state };
}

async function finish(msg, notifyPeer) {
  if (ended) return;
  ended = true;
  const id = callId, me = auth.currentUser?.uid;
  ringStop(); clearTimeout(ringTimer); clearInterval(tickTimer); tickTimer = null;
  unsubs.forEach((u) => { try { u(); } catch { } }); unsubs = [];
  try { pc?.close(); } catch { }
  local?.getTracks().forEach((t) => t.stop());
  pc = null; local = null; pending = []; remoteSet = false;
  ui?.el.remove(); ui = null;
  document.querySelector(".call-in")?.remove();
  callId = null;
  if (msg) toast(msg);
  if (id && me) {
    try { if (notifyPeer) await updateDoc(doc(db, "calls", id), { status: "ended" }); } catch { }
    try {
      const mine = await getDocs(query(collection(db, "call_candidates"), where("call_id", "==", id), where("to_uid", "==", me)));
      await Promise.all(mine.docs.map((d) => deleteDoc(d.ref).catch(() => { })));
    } catch { }
    setTimeout(() => deleteDoc(doc(db, "calls", id)).catch(() => { }), 4000);
  }
  ended = false;
}

export async function startCall(roomId, other, video) {
  const me = auth.currentUser?.uid;
  if (!me) return;
  if (callId) return toast("すでに通話中です");
  try { local = await media(video); } catch (e) { return toast(e.message); }
  ended = false; callId = crypto.randomUUID(); peerId = other; isVideo = video; remoteSet = false; pending = [];
  const id = callId;
  try {
    newPc(me, other, id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(doc(db, "calls", id), { id, room_id: roomId, caller_id: me, callee_id: other, kind: video ? "video" : "audio", status: "ringing", offer: { type: offer.type, sdp: offer.sdp }, created_at: now() });
  } catch (e) {
    console.error(e);
    callId = id; await finish("通話を開始できませんでした", false); return;
  }
  callUi(video, "呼び出し中…");
  ringStart(false);
  ringTimer = setTimeout(() => finish("応答がありませんでした", true), 45000);
  unsubs.push(onSnapshot(doc(db, "calls", id), async (s) => {
    const d = s.data();
    if (!d) return;
    if (d.answer && !pc?.currentRemoteDescription && pc) { try { await pc.setRemoteDescription(d.answer); await flushCandidates(); ringStop(); clearTimeout(ringTimer); ui && (ui.state.textContent = "接続中…"); } catch { } }
    if (["ended", "declined", "busy"].includes(d.status)) finish(d.status === "declined" ? "相手が通話を断りました" : d.status === "busy" ? "相手は通話中です" : "通話が終了しました", false);
  }, () => { }));
}

function incoming(call) {
  document.querySelector(".call-in")?.remove();
  const stop = (status) => { ringStop(); document.querySelector(".call-in")?.remove(); return updateDoc(doc(db, "calls", call.id), { status }).catch(() => { }); };
  const card = h("div", { class: "call-in", role: "alertdialog" },
    avatar(call.caller_id, nameOf(call.caller_id)),
    h("div", { class: "ci-t" }, h("b", {}, nameOf(call.caller_id)), h("small", {}, call.kind === "video" ? "ビデオ通話の着信" : "音声通話の着信")),
    h("button", { class: "call-btn hang sm", "aria-label": "拒否", onclick: () => stop("declined") }, ico("phoneOff", 22)),
    h("button", { class: "call-btn ok sm", "aria-label": "応答", onclick: () => accept(call) }, ico(call.kind === "video" ? "video" : "phone", 22)));
  document.body.append(card);
  ringStart(true);
  const off = onSnapshot(doc(db, "calls", call.id), (s) => { const d = s.data(); if (!d || d.status !== "ringing") { if (!callId) { ringStop(); card.remove(); } off(); } }, () => { });
  setTimeout(() => { if (card.isConnected) { card.remove(); ringStop(); off(); } }, 45000);
}

async function accept(call) {
  document.querySelector(".call-in")?.remove(); ringStop();
  const me = auth.currentUser?.uid;
  if (callId) return;
  const video = call.kind === "video";
  try { local = await media(video); } catch (e) { toast(e.message); updateDoc(doc(db, "calls", call.id), { status: "declined" }).catch(() => { }); return; }
  ended = false; callId = call.id; peerId = call.caller_id; isVideo = video; remoteSet = false; pending = [];
  try {
    newPc(me, call.caller_id, call.id);
    await pc.setRemoteDescription(call.offer);
    await flushCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(doc(db, "calls", call.id), { answer: { type: answer.type, sdp: answer.sdp }, status: "active" });
  } catch (e) {
    console.error(e);
    await finish("通話に応答できませんでした", true); return;
  }
  callUi(video, "接続中…");
  unsubs.push(onSnapshot(doc(db, "calls", call.id), (s) => {
    const d = s.data();
    if (!d || ["ended", "declined"].includes(d.status)) finish("通話が終了しました", false);
  }, () => { }));
}

// 着信の監視を開始。戻り値は停止関数。
export function initCalls() {
  const me = auth.currentUser?.uid;
  if (!me) return () => { };
  const stop = onSnapshot(query(collection(db, "calls"), where("callee_id", "==", me), where("status", "==", "ringing")), (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type !== "added") return;
      const d = c.doc.data();
      if (Date.now() - Date.parse(d.created_at || 0) > 50000) return;
      if (callId) { updateDoc(c.doc.ref, { status: "busy" }).catch(() => { }); return; }
      incoming(d);
    });
  }, (e) => console.warn("calls", e));
  return () => { stop(); if (callId) finish("", true); };
}
