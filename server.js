// Uptown Phase 2 Site Walk: small web server with no dependencies (Node 20+).
// Serves the app under BASE, signs people in with a password (each person has their own), and keeps the walk data on a volume.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +(process.env.PORT || 8080);
const BASE = (process.env.BASE || '/uptown-phase-2').replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const PUB = path.join(__dirname, 'public');
const TZ_OFFSET_H = 4; // Dubai
// everything outside BASE goes to the program that already lives on the domain
const OTHER = (process.env.OTHER_ORIGIN || '').replace(/\/+$/, '');
fs.mkdirSync(path.join(DATA_DIR, 'photos'), { recursive: true });

/* ---------- project data (encrypted in the repo) ---------- */
let PROJECT = { items: [], p4d: { K: [], A: [] } };
function loadProject() {
  const plain = path.join(__dirname, 'data.json');
  if (fs.existsSync(plain)) { PROJECT = JSON.parse(fs.readFileSync(plain, 'utf8')); return; }
  const key = process.env.DATA_KEY;
  const enc = path.join(__dirname, 'data.enc');
  if (!key || !fs.existsSync(enc)) { console.error('No project data: set DATA_KEY.'); return; }
  const buf = Buffer.from(fs.readFileSync(enc, 'utf8'), 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  d.setAuthTag(tag);
  PROJECT = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}
loadProject();
const PROJECT_JSON = JSON.stringify(PROJECT);

/* ---------- small JSON store ---------- */
const F = n => path.join(DATA_DIR, n);
function readJSON(n, def) { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch (e) { return def; } }
function writeJSON(n, v) { const t = F(n + '.tmp'); fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, F(n)); }
let USERS = readJSON('users.json', []);
let SESS = readJSON('sessions.json', {});
const DOCS = { state: {}, extra: {}, alerts: {}, settings: {}, walks: {} };
const CHANGES = []; // {seq, col, id}
let SEQ = 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function applyOp(o) {
  const m = DOCS[o.col] || (DOCS[o.col] = {});
  if (o.op === 'delete') delete m[o.id];
  else if (o.op === 'set' || !m[o.id]) m[o.id] = o.data;
  else { const cur = m[o.id]; for (const k in o.data) cur[k] = isObj(o.data[k]) && isObj(cur[k]) ? { ...cur[k], ...o.data[k] } : o.data[k]; }
  SEQ = Math.max(SEQ + 1, o.seq || 0); CHANGES.push({ seq: SEQ, col: o.col, id: o.id });
}
// replay the log
try {
  const lines = fs.readFileSync(F('log.jsonl'), 'utf8').split('\n');
  for (const l of lines) if (l.trim()) { try { applyOp(JSON.parse(l)); } catch (e) {} }
} catch (e) {}
const logFd = fs.openSync(F('log.jsonl'), 'a');
function commit(op) { op.at = new Date().toISOString(); applyOp(op); op.seq = SEQ; fs.writeSync(logFd, JSON.stringify(op) + '\n');
  if (op.col === 'alerts' && op.op === 'set' && op.data && op.data.sent === false) escSoon();
  return SEQ; }

/* ---------- people ---------- */
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const newPin = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const pinOwner = pin => { const raw = String(pin || '').trim(), low = raw.toLowerCase();
  return USERS.find(x => x.pin && (hashPin(raw, x.salt) === x.pin || (low !== raw && hashPin(low, x.salt) === x.pin))); };
function setPin(u, pin) { u.salt = crypto.randomBytes(8).toString('hex'); u.pin = hashPin(pin, u.salt); }
function uniquePin() { for (let i = 0; i < 50; i++) { const p = newPin(); if (!pinOwner(p)) return p; } throw new Error('No free PIN'); }
// sign-in is a password (PIN) only: each person has their own, so saves still show who did them
// the admin password always follows ADMIN_PIN, so changing that variable changes the password
if (process.env.ADMIN_PIN) {
  let a = USERS.find(x => x.id === 'admin');
  if (!a) { a = { id: 'admin', name: process.env.ADMIN_NAME || 'Admin', role: 'admin' }; USERS.push(a); }
  if (!a.pin || hashPin(process.env.ADMIN_PIN, a.salt) !== a.pin) { setPin(a, process.env.ADMIN_PIN); for (const t in SESS) if (SESS[t].uid === 'admin') delete SESS[t]; writeJSON('sessions.json', SESS); }
  a.role = 'admin'; writeJSON('users.json', USERS);
}
// first walk, if none yet
if (!Object.keys(DOCS.walks).length) {
  const d = new Date(Date.now() + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
  commit({ op: 'set', col: 'walks', id: d, data: { id: d, date: d, title: 'Site walk', by: 'system', at: new Date().toISOString() } });
}
function userOf(req) {
  const c = String(req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith('swt='));
  const t = c ? decodeURIComponent(c.slice(4)) : null;
  const s = t && SESS[t]; if (!s) return null;
  const u = USERS.find(x => x.id === s.uid); return u ? { ...u, token: t } : null;
}
const pub = u => ({ id: u.id, name: u.name, role: u.role });


/* ---------- email: walk updates and escalations ---------- */
const MAIL_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Uptown Site Walk <sitewalk@pmc-mace.com>';
const APP_URL = process.env.APP_URL || ('https://dmcc.pmc-mace.com' + BASE + '/');
const ESC_DELAY = (+process.env.ESC_DELAY_MIN || 10) * 60e3;
const DAILY_HOUR = +(process.env.DAILY_HOUR || 18);
let MAIL = readJSON('mail.json', { list: [], lastDaily: '' });
const okEmail = e => /^[^\s@<>",;:]+@[^\s@<>",;:]+\.[a-z]{2,}$/i.test(String(e || ''));
const mailTo = kind => MAIL.list.filter(x => x[kind] && okEmail(x.email));
const H = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = id => (USERS.find(x => x.id === id) || {}).name || '';
const dubaiDay = (t) => new Date((t ? Date.parse(t) : Date.now()) + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
const dayLabel = d => { const x = new Date(d + 'T00:00:00Z'); return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
function mailLog(o) { try { fs.appendFileSync(F('mail.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); } catch (e) {} console.log('mail ' + JSON.stringify(o).slice(0, 300)); }
function sendMail(m) {
  return new Promise((ok, no) => {
    if (!MAIL_KEY) return no(Object.assign(new Error('Automatic email is not switched on yet.'), { code: 'no_mail' }));
    const payload = JSON.stringify({ from: MAIL_FROM, to: m.to.map(x => x.email), subject: m.subject, html: m.html, text: m.text, attachments: m.attachments, reply_to: m.replyTo });
    const api = new URL(process.env.MAIL_API || 'https://api.resend.com/emails');
    const r = (api.protocol === 'http:' ? http : https).request(api, { method: 'POST', timeout: 60000, headers: { Authorization: 'Bearer ' + MAIL_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { mailLog({ ok: true, kind: m.kind, to: m.to.map(x => x.email), subject: m.subject }); ok(true); }
        else { mailLog({ ok: false, kind: m.kind, code: res.statusCode, err: d.slice(0, 300) }); no(new Error('The email service refused it (' + res.statusCode + ').')); } });
    });
    r.on('timeout', () => r.destroy(new Error('Email timed out.'))); r.on('error', e => { mailLog({ ok: false, kind: m.kind, err: e.message }); no(e); }); r.end(payload);
  });
}
// light email layout, inline styles only (Outlook safe)
function layout(title, sub, inner, link) {
  return `<!doctype html><html><body style="margin:0;background:#f3f1f5;font-family:Arial,Helvetica,sans-serif;color:#1e1e1e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1f5"><tr><td align="center" style="padding:20px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border:1px solid #e3e0e8;border-radius:12px">
<tr><td style="padding:16px 20px;border-bottom:4px solid #8b3aa3"><img src="${APP_URL}dmcc.png" alt="DMCC" height="22" style="height:22px;vertical-align:middle;border:0"><span style="display:inline-block;width:1px;height:18px;background:#d9d6de;margin:0 12px;vertical-align:middle"></span><img src="${APP_URL}mace.png" alt="Mace" height="20" style="height:20px;vertical-align:middle;border:0"></td></tr>
<tr><td style="padding:18px 20px 4px"><div style="font-size:11px;letter-spacing:1px;color:#7a3a92;font-weight:bold;text-transform:uppercase">DMCC Uptown Phase 2 &middot; Towers T3 and T4</div>
<div style="font-size:22px;font-weight:bold;margin-top:4px">${H(title)}</div><div style="font-size:13px;color:#666;margin-top:4px">${H(sub)}</div></td></tr>
<tr><td style="padding:8px 20px 22px">${inner}<p style="margin:20px 0 0"><a href="${APP_URL}${link || ''}" style="background:#8b3aa3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Open the site walk</a></p></td></tr>
<tr><td style="padding:12px 20px;background:#faf9fb;color:#888;font-size:11px;border-radius:0 0 12px 12px">Sent by the Uptown Phase 2 site walk app (Mace PMC, contractor ASC). You get this because the site walk admin added you. Ask the admin to stop it.</td></tr>
</table></td></tr></table></body></html>`;
}
const tile = (n, label, bg, fg) => `<td style="padding:4px"><div style="background:${bg};color:${fg};border-radius:8px;padding:10px 12px;min-width:84px"><div style="font-size:22px;font-weight:bold">${H(n)}</div><div style="font-size:11px">${H(label)}</div></div></td>`;
const tiles = list => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px -4px"><tr>${list.map(x => tile(...x)).join('')}</tr></table>`;
const ST_COL = { 'Behind': '#c00000', 'Not started, due': '#e5701a', 'Done': '#2e9e5b', 'ESCALATE': '#6e1a28', 'On track': '#2e9e5b' };
function table(head, rows, colorCol) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin-top:6px">
<tr>${head.map(x => `<th align="left" style="background:#f1eaf5;color:#4a1f5a;padding:7px 8px;border-bottom:1px solid #e3d6ea">${H(x)}</th>`).join('')}</tr>
${rows.map((r, i) => `<tr>${r.map((c, j) => { const col = j === colorCol && ST_COL[c]; return `<td style="padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top;${String(c ?? '').length <= 14 ? 'white-space:nowrap;' : ''}${col ? `color:${col};font-weight:bold` : ''}">${H(c)}</td>`; }).join('')}</tr>`).join('')}</table>`;
}
const h2 = t => `<div style="font-size:15px;font-weight:bold;margin:18px 0 2px">${H(t)}</div>`;
const num = v => (v == null || v === '' || isNaN(+v)) ? '' : Math.round(+v * 10) / 10;
const itemOf = r => PROJECT.items.find(x => x.r === r) || (DOCS.extra || {})[r] || null;

/* escalations: one email for each batch, about 10 minutes after the first one is saved */
let escTimer = null;
function escSoon(ms) { if (escTimer || !MAIL_KEY || !mailTo('esc').length) return; escTimer = setTimeout(escFlush, ms || ESC_DELAY); }
async function escFlush() {
  escTimer = null; const to = mailTo('esc'); if (!MAIL_KEY || !to.length) return;
  const cut = Date.now() - 7 * 864e5;
  const list = Object.entries(DOCS.alerts || {}).filter(([id, a]) => a && a.sent === false && Date.parse(a.at) > cut).sort((a, b) => (b[1].late || 0) - (a[1].late || 0));
  if (!list.length) return;
  const rows = list.map(([id, a]) => [`${a.b} ${a.l}`, a.w + (a.loc ? ` (${a.loc})` : ''), a.st, a.late != null ? a.late + ' d' : '', `${num(a.act) ?? ''}% of ${num(a.plan) ?? ''}%`, a.note || '', nameOf(a.by)]);
  const inner = `<p style="margin:6px 0 0;font-size:14px">${list.length} item${list.length > 1 ? 's' : ''} turned <b style="color:#6e1a28">ESCALATE</b> on the site walk: behind and more than 7 days late, or on the critical path and late.</p>`
    + table(['Area', 'Item', 'Status', 'Late', 'Actual of planned', 'Site note', 'Walked by'], rows, 2);
  const text = `${list.length} items to escalate on the Uptown Phase 2 site walk:\n\n` + rows.map(r => `- ${r[0]}: ${r[1]}. ${r[2]}, ${r[3]} late, ${r[4]}.${r[5] ? ' Note: ' + r[5] : ''}`).join('\n') + `\n\nOpen: ${APP_URL}#issues`;
  try {
    await sendMail({ kind: 'esc', to, subject: `Escalation: ${list.length} item${list.length > 1 ? 's' : ''} late on Uptown Phase 2`, html: layout(`${list.length} item${list.length > 1 ? 's' : ''} to escalate`, 'Raised on the site walk ' + dayLabel(dubaiDay()), inner, '#issues'), text });
    for (const [id] of list) commit({ op: 'update', col: 'alerts', id, data: { sent: true, sentAt: new Date().toISOString() }, by: 'system' });
  } catch (e) { escTimer = setTimeout(escFlush, 30 * 60e3); }
}
// catch escalations saved just before a restart
setTimeout(() => escSoon(60e3), 5000);

/* daily summary at 6 pm Dubai: what the team filled today */
function dailyRows(day) {
  const rows = [];
  for (const [r, st] of Object.entries(DOCS.state || {})) {
    const h = (st && st.h) || {}; const keys = Object.keys(h).sort();
    keys.forEach((k, i) => { const e = h[k]; if (!e || !e.at || dubaiDay(e.at) !== day) return;
      let prev = null; for (let j = i - 1; j >= 0; j--) if (h[keys[j]] && h[keys[j]].p != null) { prev = h[keys[j]].p; break; }
      const it = itemOf(r) || { b: '', l: '', w: r };
      if (prev == null && it.a13 != null) prev = it.a13;
      rows.push({ b: it.b, l: it.l, w: it.w, loc: it.loc || '', prev, p: e.p, c: e.c || '', ph: (e.ph || []).length, by: nameOf(e.by) }); });
  }
  const B = ['Tower 3', 'Tower 4', 'Podium'];
  return rows.sort((a, b) => ((B.indexOf(a.b) + 9) % 9) - ((B.indexOf(b.b) + 9) % 9) || String(a.l).localeCompare(String(b.l), 'en', { numeric: true }));
}
async function dailySend(day, force) {
  const to = mailTo('walk'); if (!MAIL_KEY || !to.length) return { sent: false, why: 'no one' };
  const rows = dailyRows(day); if (!rows.length && !force) return { sent: false, why: 'nothing filled' };
  const people = [...new Set(rows.map(x => x.by).filter(Boolean))];
  const esc = Object.values(DOCS.alerts || {}).filter(a => a && a.at && dubaiDay(a.at) === day).length;
  const photos = rows.reduce((n, x) => n + x.ph, 0), moved = rows.filter(x => x.p != null && (x.prev == null || +x.p !== +x.prev)).length;
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const inner = tiles([[rows.length, rows.length === 1 ? 'item updated' : 'items updated', '#f1eaf5', '#4a1f5a'], [moved, '% saved', '#e7f4eb', '#1d6b3c'], [esc, 'new escalations', esc ? '#6e1a28' : '#f3f3f3', esc ? '#fff' : '#333'], [photos, 'photos', '#f3f3f3', '#333']])
    + `<p style="margin:8px 0 0;font-size:13px;color:#555">${people.length ? 'Walked by ' + H(people.join(', ')) + '.' : 'No one filled the walk today.'}</p>`
    + (rows.length ? h2('What changed today') + table(['Area', 'Item', 'Last %', 'Now %', 'Site note', 'Photos', 'By'], rows.slice(0, 250).map(x => [`${x.b} ${x.l}`, x.w + (x.loc ? ` (${x.loc})` : ''), num(x.prev), num(x.p), x.c, x.ph || '', x.by])) + (rows.length > 250 ? `<p style="font-size:12px;color:#666">And ${rows.length - 250} more in the app.</p>` : '') : '');
  const text = `Uptown Phase 2 site walk, ${dayLabel(day)}\n${rows.length} items updated${people.length ? ' by ' + people.join(', ') : ''}. ${esc} new escalations.\n\n` + rows.slice(0, 150).map(x => `- ${x.b} ${x.l}: ${x.w}. ${num(x.prev)}% to ${num(x.p)}%${x.c ? '. ' + x.c : ''}`).join('\n') + `\n\nOpen: ${APP_URL}`;
  await sendMail({ kind: 'daily', to, subject: `Site walk today: ${pl(rows.length, 'item')} updated, ${pl(esc, 'escalation')} (Uptown Phase 2, ${dayLabel(day)})`, html: layout('Site walk today', dayLabel(day), inner), text });
  return { sent: true, rows: rows.length };
}
setInterval(async () => {
  const now = new Date(Date.now() + TZ_OFFSET_H * 3600e3), day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < DAILY_HOUR || MAIL.lastDaily === day) return;
  MAIL.lastDaily = day; writeJSON('mail.json', MAIL);
  try { await dailySend(day); } catch (e) {}
}, +process.env.DAILY_CHECK_MS || 5 * 60e3);

/* walk report: someone presses Email report; the phone sends the summary and the files it made */
const clip = (v, n) => String(v ?? '').slice(0, n || 200);
function walkReportMail(b, u) {
  const t = b.t || {}, areas = Array.isArray(b.areas) ? b.areas.slice(0, 20) : [], top = Array.isArray(b.top) ? b.top.slice(0, 15) : [], escs = Array.isArray(b.esc) ? b.esc.slice(0, 200) : [];
  const inner = tiles([[t.walked, 'walked', '#f1eaf5', '#4a1f5a'], [t.walk, 'due, not walked', '#f3f3f3', '#333'], [t.done, 'done', '#2e9e5b', '#fff'], [t.behind, 'behind', '#c00000', '#fff'], [t.ns, 'not started, due', '#e5701a', '#fff'], [t.esc, 'to escalate', '#6e1a28', '#fff']])
    + (b.note ? `<p style="margin:10px 0 0;font-size:14px;background:#faf6fc;border-left:3px solid #8b3aa3;padding:8px 10px">${H(clip(b.note, 1500))}<br><span style="color:#777;font-size:12px">${H(u.name)}</span></p>` : '')
    + h2('By area') + table(['Area', 'Items', 'Walked', 'Done', 'Behind', 'Not started', 'Escalate', 'Worst late'], areas.map(a => [clip(a[0], 40), a[1], a[2], a[3], a[4], a[5], a[6], (a[7] ?? '') + ' d']))
    + h2('Top late') + (top.length ? table(['Area', 'Item', 'Late', 'Actual of planned', 'Site note'], top.map(x => [`${clip(x.b, 20)} ${clip(x.l, 20)}`, clip(x.w, 160), (x.late ?? '') + ' d', `${num(x.a)}% of ${num(x.p)}%`, clip(x.c, 300)])) : '<p style="font-size:13px">Nothing late.</p>')
    + (escs.length > top.length ? h2(`All ${escs.length} to escalate`) + table(['Area', 'Item', 'Late', 'Actual of planned'], escs.map(x => [`${clip(x.b, 20)} ${clip(x.l, 20)}`, clip(x.w, 160), (x.late ?? '') + ' d', `${num(x.a)}% of ${num(x.p)}%`])) : '');
  return { html: layout('Site walk report', `Walk of ${clip(b.wkLabel, 40)}${b.title ? ' · ' + clip(b.title, 60) : ''} · sent by ${u.name}`, inner, '#report'), text: clip(b.text, 20000) + `\n\nOpen: ${APP_URL}` };
}

/* ---------- http helpers ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.css': 'text/css' };
function send(res, code, body, type, extra) {
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...(extra || {}) });
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json', { 'Cache-Control': 'no-store', ...(extra || {}) });
function body(req, limit) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { no(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', no);
  });
}
const tries = new Map();
let allTries = [];
function limited(ip) { const now = Date.now(), t = (tries.get(ip) || []).filter(x => now - x < 60e3); t.push(now); tries.set(ip, t);
  allTries = allTries.filter(x => now - x < 60e3); allTries.push(now); return t.length > 8 || allTries.length > 40; }
const cookie = (t, maxAge) => `swt=${encodeURIComponent(t)}; Path=${BASE || '/'}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NO_SECURE ? '' : '; Secure'}`;

/* ---------- api ---------- */
async function apiRoute(req, res, p, q) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0];
  if (p === 'login' && req.method === 'POST') {
    if (limited(ip)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
    const b = JSON.parse((await body(req, 1e4)).toString() || '{}');
    const u = String(b.pin || '').trim().length >= 4 ? pinOwner(b.pin) : null;
    console.log(`login ${u ? 'ok ' + u.id : 'wrong'} ip=${ip} ua=${String(req.headers['user-agent'] || '').slice(0, 60)}`);
    if (!u) return json(res, 401, { error: 'Wrong password.' });
    const t = crypto.randomBytes(24).toString('hex'); SESS[t] = { uid: u.id, at: Date.now() }; writeJSON('sessions.json', SESS);
    return json(res, 200, { user: pub(u) }, { 'Set-Cookie': cookie(t, 3600 * 24 * 180) });
  }
  const u = userOf(req);
  if (!u) return json(res, 401, { error: 'Sign in first.', code: 'unauthenticated' });
  if (p === 'logout') { delete SESS[u.token]; writeJSON('sessions.json', SESS); return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); }
  if (p === 'me') return json(res, 200, { user: pub(u) });
  if (p === 'data') return send(res, 200, PROJECT_JSON, 'application/json', { 'Cache-Control': 'private, max-age=300' });
  if (p === 'names') { const o = {}; for (const x of USERS) o[x.id] = x.name; return json(res, 200, o); }
  if (p === 'changes') {
    const since = +q.get('since') || 0; const seen = new Set(), docs = [];
    const list = since > 0 && since <= SEQ ? CHANGES.filter(c => c.seq > since) : CHANGES;
    for (let i = list.length - 1; i >= 0; i--) { const c = list[i], k = c.col + '/' + c.id; if (seen.has(k)) continue; seen.add(k); docs.push({ col: c.col, id: c.id, data: (DOCS[c.col] || {})[c.id] ?? null }); }
    return json(res, 200, { seq: SEQ, docs: docs.reverse(), full: !(since > 0 && since <= SEQ) });
  }
  if (p === 'doc' && req.method === 'GET') { const d = (DOCS[q.get('col')] || {})[q.get('id')]; return json(res, 200, { exists: d != null, data: d ?? null }); }
  if (p === 'doc' && req.method === 'POST') {
    if (u.role === 'viewer') return json(res, 403, { error: 'View only.', code: 'invalid_argument' });
    const b = JSON.parse((await body(req, 2e5)).toString() || '{}');
    if (!['state', 'extra', 'alerts', 'settings', 'walks'].includes(b.col) || !/^[\w.\-]{1,80}$/.test(String(b.id || ''))) return json(res, 400, { error: 'Bad document.', code: 'invalid_argument' });
    if (b.col === 'settings' && u.role !== 'admin') return json(res, 403, { error: 'Admin only.', code: 'invalid_argument' });
    if (!['set', 'update', 'delete'].includes(b.op)) return json(res, 400, { error: 'Bad op.' });
    if (b.op === 'delete' && u.role !== 'admin') return json(res, 403, { error: 'Admin only.', code: 'invalid_argument' });
    const seq = commit({ op: b.op, col: b.col, id: String(b.id), data: b.data || {}, by: u.id });
    return json(res, 200, { seq });
  }
  if (p === 'photo' && req.method === 'POST') {
    if (u.role === 'viewer') return json(res, 403, { error: 'View only.' });
    const buf = await body(req, 12e6); if (buf.length < 100) return json(res, 400, { error: 'Empty photo.' });
    const id = Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
    fs.writeFileSync(path.join(DATA_DIR, 'photos', id + '.jpg'), buf); return json(res, 200, { id });
  }
  if (p === 'mail' && req.method === 'GET') {
    const w = mailTo('walk').map(x => x.name || x.email), e = mailTo('esc').map(x => x.name || x.email);
    return json(res, 200, { on: !!MAIL_KEY, from: MAIL_FROM, walk: w, esc: e, walkEmails: mailTo('walk').map(x => x.email), escEmails: mailTo('esc').map(x => x.email), ...(u.role === 'admin' ? { list: MAIL.list } : {}) });
  }
  if (p === 'mail/list' && req.method === 'POST') {
    if (u.role !== 'admin') return json(res, 403, { error: 'Admin only.' });
    const b = JSON.parse((await body(req, 5e4)).toString() || '{}'); const list = Array.isArray(b.list) ? b.list.slice(0, 40) : [];
    const bad = list.find(x => !okEmail(String(x.email || '').trim())); if (bad) return json(res, 400, { error: 'Check this email: ' + String(bad.email || '(empty)') });
    MAIL.list = list.map(x => ({ name: String(x.name || '').trim().slice(0, 60), email: String(x.email).trim().toLowerCase().slice(0, 120), walk: !!x.walk, esc: !!x.esc }));
    writeJSON('mail.json', MAIL); escSoon(60e3); return json(res, 200, { ok: true, list: MAIL.list });
  }
  if (p === 'mail/test' && req.method === 'POST') {
    if (u.role !== 'admin') return json(res, 403, { error: 'Admin only.' });
    const to = MAIL.list.filter(x => okEmail(x.email)); if (!to.length) return json(res, 400, { error: 'Add an email first.' });
    try { await sendMail({ kind: 'test', to, subject: 'Test from the Uptown Phase 2 site walk', html: layout('Email works', 'Test sent by ' + u.name, '<p style="font-size:14px">This is a test. From now on you get the site walk emails that the admin switched on for you.</p>'), text: 'Test from the Uptown Phase 2 site walk. ' + APP_URL }); return json(res, 200, { ok: true, to: to.map(x => x.name || x.email) }); }
    catch (e) { return json(res, e.code === 'no_mail' ? 409 : 502, { error: e.message, code: e.code || 'mail' }); }
  }
  if ((p === 'mail/walk' || p === 'mail/esc') && req.method === 'POST') {
    if (u.role === 'viewer') return json(res, 403, { error: 'View only.' });
    const kind = p === 'mail/walk' ? 'walk' : 'esc', to = mailTo(kind);
    const b = JSON.parse((await body(req, 40e6)).toString() || '{}');
    if (!to.length) return json(res, 400, { error: kind === 'walk' ? 'No one is set to get the walk report. Admin: Team, then Email.' : 'No one is set to get escalations. Admin: Team, then Email.', code: 'no_one' });
    if (!MAIL_KEY) return json(res, 409, { error: 'Automatic email is not switched on yet.', code: 'no_mail', to: to.map(x => x.email) });
    let m;
    if (kind === 'walk') m = walkReportMail(b, u);
    else { const items = (Array.isArray(b.items) ? b.items : []).slice(0, 400);
      const rows = items.map(x => [`${clip(x.b, 20)} ${clip(x.l, 20)}`, clip(x.w, 160), clip(x.st, 30), (x.late ?? '') + ' d', `${num(x.a)}% of ${num(x.p)}%`, clip(x.c, 300)]);
      m = { html: layout(`${items.length} item${items.length === 1 ? '' : 's'} to escalate`, `Walk of ${clip(b.wkLabel, 40)} · sent by ${u.name}`, `<p style="margin:6px 0 0;font-size:14px">Behind and more than 7 days late, or on the critical path and late.</p>` + table(['Area', 'Item', 'Status', 'Late', 'Actual of planned', 'Site note'], rows, 2), '#issues'),
        text: rows.map(r => `- ${r[0]}: ${r[1]}. ${r[3]} late, ${r[4]}.${r[5] ? ' ' + r[5] : ''}`).join('\n') + `\n\nOpen: ${APP_URL}#issues` }; }
    const files = (Array.isArray(b.files) ? b.files : []).slice(0, 3).filter(f => /^[\w.\-]{1,80}\.(pdf|xlsx)$/i.test(String(f.filename || '')) && typeof f.content === 'string').map(f => ({ filename: f.filename, content: f.content }));
    const subject = kind === 'walk' ? `Site walk report: walk of ${clip(b.wkLabel, 40)} (Uptown Phase 2)` : `Escalation list: ${(b.items || []).length} items (Uptown Phase 2, walk of ${clip(b.wkLabel, 40)})`;
    try { await sendMail({ kind, to, subject, html: m.html, text: m.text, attachments: files.length ? files : undefined, replyTo: undefined }); return json(res, 200, { ok: true, to: to.map(x => x.name || x.email) }); }
    catch (e) { return json(res, 502, { error: e.message, code: 'mail' }); }
  }
  if (p === 'users') {
    if (u.role !== 'admin') return json(res, 403, { error: 'Admin only.' });
    if (req.method === 'GET') return json(res, 200, USERS.map(pub));
    if (req.method === 'POST') {
      const b = JSON.parse((await body(req, 1e4)).toString() || '{}');
      let x = b.id ? USERS.find(y => y.id === String(b.id)) : null;
      if (!x) { const name = String(b.name || '').trim().slice(0, 60); if (!name) return json(res, 400, { error: 'Type the person\'s name.' });
        x = { id: 'u' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name, role: ['admin', 'walker', 'viewer'].includes(b.role) ? b.role : 'walker' }; USERS.push(x); }
      const pin = uniquePin(); setPin(x, pin); writeJSON('users.json', USERS);
      for (const t in SESS) if (SESS[t].uid === x.id && t !== u.token) delete SESS[t]; writeJSON('sessions.json', SESS);
      return json(res, 200, { ...pub(x), pin });
    }
    if (req.method === 'DELETE') {
      const id = String(q.get('id') || ''); if (id === u.id) return json(res, 400, { error: 'You cannot remove yourself.' });
      USERS = USERS.filter(x => x.id !== id); writeJSON('users.json', USERS);
      for (const t in SESS) if (SESS[t].uid === id) delete SESS[t]; writeJSON('sessions.json', SESS);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'Not found.' });
}

/* ---------- pass-through to the other program ---------- */
function proxy(req, res) {
  const u = new URL(req.url, OTHER + '/'), lib = u.protocol === 'http:' ? http : https;
  const h = { ...req.headers, host: u.host, 'x-forwarded-host': req.headers.host || '', 'x-forwarded-proto': 'https' };
  const up = lib.request(u, { method: req.method, headers: h }, pr => {
    const hd = { ...pr.headers };
    if (hd.location) hd.location = String(hd.location).split(OTHER).join('');
    if (hd['set-cookie']) hd['set-cookie'] = [].concat(hd['set-cookie']).map(c => c.replace(/;\s*Domain=[^;]*/i, ''));
    delete hd['strict-transport-security'];
    res.writeHead(pr.statusCode || 502, hd); pr.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain' }); } res.end('The main site is not reachable right now.'); });
  req.pipe(up);
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); let p = decodeURIComponent(url.pathname);
    if (p === '/health') return send(res, 200, 'ok', 'text/plain');
    if (!p.includes('/api/changes') && !p.includes('_blob/')) console.log(`${req.method} ${p} host=${req.headers.host || ''}`);
    if (p === BASE) { res.writeHead(302, { Location: BASE + '/' }); return res.end(); }
    if (!p.startsWith(BASE + '/')) {
      if (OTHER) return proxy(req, res);
      if (p === '/') { res.writeHead(302, { Location: BASE + '/' }); return res.end(); }
      return send(res, 404, 'Not found', 'text/plain');
    }
    p = p.slice(BASE.length + 1);
    if (p.startsWith('api/')) return await apiRoute(req, res, p.slice(4), url.searchParams);
    if (p.startsWith('_blob/')) {
      if (!userOf(req)) return send(res, 401, 'Sign in', 'text/plain');
      const id = p.slice(6).replace(/[^\w]/g, ''); const f = path.join(DATA_DIR, 'photos', id + '.jpg');
      if (!fs.existsSync(f)) return send(res, 404, 'No photo', 'text/plain');
      return send(res, 200, fs.readFileSync(f), 'image/jpeg', { 'Cache-Control': 'private, max-age=31536000, immutable' });
    }
    if (p === '' || p === 'index.html') p = 'index.html';
    const f = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(f);
    const cache = ext === '.html' || p === 'sw.js' || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=86400';
    return send(res, 200, fs.readFileSync(f), TYPES[ext] || 'application/octet-stream', { 'Cache-Control': cache, ...(p === 'sw.js' ? { 'Service-Worker-Allowed': BASE + '/' } : {}) });
  } catch (e) { console.error(e); try { json(res, 500, { error: 'Server error.' }); } catch (x) {} }
});
server.listen(PORT, () => console.log(`Site walk on :${PORT}${BASE}/ (data in ${DATA_DIR}, ${PROJECT.items.length} items)`));
