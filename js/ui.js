function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
const $ = (s) => document.querySelector(s);
const IC = {
  check: '<path d="m5 12 5 5 9-10"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  poll: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'
};
function ico(n, s = 20) {
  const w = h("span", { class: "ico" });
  w.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.more}</svg>`;
  return w;
}
function toast(t) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const e = h("div", { class: "toast", role: "status" }, t);
  document.body.append(e);
  setTimeout(() => e.remove(), 2800);
}
function modal(title, body, wide = false) {
  const close = () => ov.remove();
  const ov = h(
    "div",
    { class: "overlay", onclick: (e) => {
      if (e.target === ov) close();
    } },
    h(
      "div",
      { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-label": title },
      h("div", { class: "modal-h" }, h("span", {}, title), h("button", { class: "icon-btn", "aria-label": "閉じる", onclick: close }, ico("x"))),
      h("div", { class: "modal-b" }, body)
    )
  );
  document.body.append(ov);
  return close;
}
function confirmBox(title, text, ok) {
  return new Promise((res) => {
    let close;
    const done = (v) => {
      close();
      res(v);
    };
    close = modal(title, [h("p", {}, text), h(
      "div",
      { style: "display:flex;gap:8px;justify-content:flex-end" },
      h("button", { class: "btn ghost", onclick: () => done(false) }, "キャンセル"),
      h("button", { class: "btn danger", onclick: () => done(true) }, ok)
    )]);
  });
}
function popup(anchor, items) {
  document.querySelectorAll(".popup").forEach((x) => x.remove());
  const r = anchor.getBoundingClientRect();
  const p = h("div", { class: "popup" }, items.map((it) => h("button", { class: it.danger ? "danger" : "", onclick: () => {
    p.remove();
    it.run();
  } }, ico(it.icon, 18), it.label)));
  document.body.append(p);
  const w = p.offsetWidth, hg = p.offsetHeight;
  const top = r.bottom + 6 + hg <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - hg - 6);
  p.style.top = top + "px";
  p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
  setTimeout(() => document.addEventListener("click", function f() {
    p.remove();
    document.removeEventListener("click", f);
  }), 0);
}
const ms = (t) => t ? new Date(t).getTime() : 0;
const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDT = (t) => t ? new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtList = (t) => {
  if (!t) return "";
  const d = new Date(t), n = /* @__PURE__ */ new Date();
  return d.toDateString() === n.toDateString() ? fmtTime(t) : d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
};
export {
  $,
  confirmBox,
  fmtDT,
  fmtList,
  fmtTime,
  h,
  ico,
  modal,
  ms,
  popup,
  toast
};
