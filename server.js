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
function commit(op) { op.at = new Date().toISOString(); applyOp(op); op.seq = SEQ; fs.writeSync(logFd, JSON.stringify(op) + '\n'); return SEQ; }

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
