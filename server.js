// Lettertide server: email sign-in, letter storage, scheduled delivery, and Santa's replies.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const db = require('./db');
const mailer = require('./mailer');
const santa = require('./santa');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET || '';
const WORKER_MS = Number(process.env.WORKER_INTERVAL_MS || 5 * 60 * 1000);
const DAY = 864e5;
const SECURE = BASE_URL.startsWith('https://');

const now = () => Date.now();
const token = () => crypto.randomBytes(32).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const normEmail = e => String(e || '').trim().toLowerCase();
const str = (v, max) => String(v ?? '').slice(0, max);

/* ---------- app ---------- */
const app = express();
// let async handlers report errors instead of hanging the request
for (const m of ['get', 'post', 'patch', 'delete', 'use']) {
  const orig = app[m].bind(app);
  app[m] = (...args) => orig(...args.map(f => typeof f === 'function' && f.length < 4 ? (req, res, next) => Promise.resolve(f(req, res, next)).catch(next) : f));
}
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '600kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'"
  });
  next();
});

const buckets = new Map();
function limit(key, max, windowMs) {
  const t = now(), b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++; buckets.set(key, b);
  return b.n <= max;
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60e3).unref();

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
async function auth(req, res, next) {
  const t = readCookie(req, 'db_session');
  if (!t) return res.status(401).json({ error: 'Please sign in first.' });
  const s = await db.get('SELECT s.user_id, s.expires, u.email, u.backup_email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ?', sha(t));
  if (!s || s.expires < now()) return res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' });
  req.user = { id: s.user_id, email: s.email, backup_email: s.backup_email };
  next();
}
app.use('/api', (req, res, next) => (req.method === 'GET' || req.get('X-Lettertide') === '1') ? next() : res.status(403).json({ error: 'Request blocked.' }));

/* ---------- sign-in ---------- */
app.post('/api/auth/request', async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please type a full email address.' });
  if (!limit('ip:' + req.ip, 10, 15 * 60e3) || !limit('em:' + email, 3, 15 * 60e3))
    return res.status(429).json({ error: 'Too many sign-in emails. Please wait 15 minutes.' });
  const t = token();
  await db.run('INSERT INTO login_tokens (hash, email, expires) VALUES (?, ?, ?)', sha(t), email, now() + 20 * 60e3);
  await mailer.send(email, mailer.templates.signIn(`${BASE_URL}/api/auth/verify?token=${t}`));
  res.json({ ok: true });
});
app.get('/api/auth/verify', async (req, res) => {
  const row = await db.get('SELECT * FROM login_tokens WHERE hash = ?', sha(String(req.query.token || '')));
  if (!row || row.used || row.expires < now()) return res.redirect('/?signin=expired#home');
  await db.run('UPDATE login_tokens SET used = 1 WHERE hash = ?', row.hash);
  let user = await db.get('SELECT * FROM users WHERE email = ?', row.email);
  if (!user) {
    user = { id: crypto.randomUUID(), email: row.email };
    await db.run('INSERT INTO users (id, email, created, last_confirmed) VALUES (?, ?, ?, ?)', user.id, user.email, now(), now());
  } else await db.run('UPDATE users SET last_confirmed = ?, checkin_sent = NULL WHERE id = ?', now(), user.id);
  const s = token();
  await db.run('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)', sha(s), user.id, now() + 90 * DAY);
  res.set('Set-Cookie', `db_session=${s}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}${SECURE ? '; Secure' : ''}`);
  res.redirect('/#home');
});
app.post('/api/auth/logout', auth, async (req, res) => {
  await db.run('DELETE FROM sessions WHERE hash = ?', sha(readCookie(req, 'db_session')));
  res.set('Set-Cookie', 'db_session=; Path=/; Max-Age=0'); res.json({ ok: true });
});
app.get('/api/me', auth, async (req, res) => res.json({ email: req.user.email, backupEmail: req.user.backup_email || '' }));
app.patch('/api/me', auth, async (req, res) => {
  const b = normEmail(req.body?.backupEmail);
  if (b && !EMAIL_RE.test(b)) return res.status(400).json({ error: 'Please type a full backup email address.' });
  await db.run('UPDATE users SET backup_email = ? WHERE id = ?', b || null, req.user.id);
  res.json({ ok: true, backupEmail: b });
});
app.delete('/api/me', auth, async (req, res) => {
  for (const t of ['mail', 'sessions', 'confirm_tokens']) await db.run(`DELETE FROM ${t} WHERE user_id = ?`, req.user.id);
  await db.run('DELETE FROM users WHERE id = ?', req.user.id);
  res.set('Set-Cookie', 'db_session=; Path=/; Max-Age=0'); res.json({ ok: true });
});
app.get('/api/confirm', async (req, res) => {
  const row = await db.get('SELECT * FROM confirm_tokens WHERE hash = ?', sha(String(req.query.token || '')));
  if (!row || row.expires < now()) return res.redirect('/?confirm=expired#mailbox');
  await db.run('UPDATE users SET last_confirmed = ?, checkin_sent = NULL WHERE id = ?', now(), row.user_id);
  await db.run('DELETE FROM confirm_tokens WHERE hash = ?', row.hash);
  res.redirect('/?confirm=ok#mailbox');
});

/* ---------- letters ---------- */
const isBox = b => b && typeof b === 'object' && ['ct', 'iv', 'salt'].every(k => typeof b[k] === 'string' && b[k].length < 400000);
const THEMES = ['sun', 'berry', 'ocean', 'fall', 'mint', 'grape'];
const STICKERS = ['heart', 'star', 'leaf', 'flower', 'diya', 'lantern', 'moon', 'menorah', 'tree', 'sun'];
const OCCASIONS = ['thanks', 'birthday', 'getwell', 'love', 'hello', 'thanksgiving', 'diwali', 'hanukkah', 'christmas', 'kwanzaa', 'pongal', 'lunar', 'eidfitr', 'holi', 'mothers', 'eidadha', 'fathers', 'rakhi'];

function clean(b) {
  const kind = b.kind;
  if (kind === 'future') {
    const to = normEmail(b.deliverTo);
    if (to && !EMAIL_RE.test(to)) throw 'That email address doesn\'t look right.';
    const out = { chain: Math.max(1, Math.min(999, Number(b.chain) || 1)), deliverTo: to || undefined };
    if (b.box) { if (!isBox(b.box)) throw 'The locked letter is damaged.'; out.box = b.box; out.hint = str(b.hint, 200); }
    else {
      const l = b.letter || {};
      if (!String(l.body || '').trim()) throw 'The letter is empty.';
      const c = l.capsule || {};
      out.letter = { body: str(l.body, 20000), guess: str(l.guess, 300), capsule: { food: str(c.food, 120), friend: str(c.friend, 120), song: str(c.song, 120), be: str(c.be, 120) } };
    }
    return out;
  }
  if (kind === 'people') {
    if (!String(b.to || '').trim() || !String(b.body || '').trim()) throw 'The card needs a name and a message.';
    const email = normEmail(b.recipientEmail);
    if (email && !EMAIL_RE.test(email)) throw 'That email address doesn\'t look right.';
    return { to: str(b.to, 80), from: str(b.from, 60), body: str(b.body, 5000), theme: THEMES.includes(b.theme) ? b.theme : 'sun',
      sticker: STICKERS.includes(b.sticker) ? b.sticker : 'heart', occasion: OCCASIONS.includes(b.occasion) ? b.occasion : 'hello', recipientEmail: email || undefined };
  }
  if (kind === 'santa') return { name: str(b.name, 60), age: str(b.age, 20), body: str(b.body, 5000), reply: str(b.reply, 5000) };
  throw 'Unknown letter type.';
}
const toClient = r => ({ ...JSON.parse(r.data), id: r.id, kind: r.kind, created: r.created, deliver: r.deliver, delivered: !!r.delivered_at, opened: r.opened || undefined });

app.get('/api/letters', auth, async (req, res) => {
  res.json((await db.all('SELECT * FROM mail WHERE user_id = ? ORDER BY created DESC', req.user.id)).map(toClient));
});
app.post('/api/letters', auth, async (req, res) => {
  const b = req.body || {};
  let data; try { data = clean(b); } catch (e) { return res.status(400).json({ error: String(e) }); }
  const t = now();
  let deliver = Number(b.deliver);
  if (b.kind === 'santa') deliver = t;
  else if (b.kind === 'people') { if (!(deliver >= t - 5 * 60e3 && deliver < t + 5 * 365 * DAY)) return res.status(400).json({ error: 'Pick a day within the next 5 years.' }); deliver = Math.max(deliver, t); }
  else if (!(deliver > t + 60e3 && deliver < t + 101 * 365 * DAY)) return res.status(400).json({ error: 'Pick a day between tomorrow and 100 years from now.' });
  const count = (await db.get('SELECT COUNT(*) n FROM mail WHERE user_id = ?', req.user.id)).n;
  if (count >= 1000) return res.status(400).json({ error: 'Your mailbox is full. Delete some old letters first.' });
  if (b.kind === 'people' && data.recipientEmail && !limit('cards:' + req.user.id, 20, DAY)) return res.status(429).json({ error: 'You can email up to 20 cards a day. Try again tomorrow.' });
  const id = crypto.randomUUID();
  const recipient = b.kind === 'people' ? data.recipientEmail || null : b.kind === 'future' ? data.deliverTo || req.user.email : null;
  await db.run('INSERT INTO mail (id, user_id, kind, created, deliver, data, recipient_email, delivered_at) VALUES (?,?,?,?,?,?,?,?)', id, req.user.id, b.kind, t, deliver, JSON.stringify(data), recipient, b.kind === 'santa' || (b.kind === 'people' && !recipient) ? t : null);
  res.status(201).json(toClient(await db.get('SELECT * FROM mail WHERE id = ?', id)));
  if (b.kind === 'people' && recipient && deliver <= now() + 1000) tick().catch(e => console.error(e)); // "right now" cards go out immediately
});
app.patch('/api/letters/:id', auth, async (req, res) => {
  const r = await db.get('SELECT * FROM mail WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Letter not found.' });
  if (req.body?.opened && r.deliver <= now()) await db.run('UPDATE mail SET opened = ? WHERE id = ?', now(), r.id);
  res.json(toClient(await db.get('SELECT * FROM mail WHERE id = ?', r.id)));
});
app.delete('/api/letters/:id', auth, async (req, res) => {
  await db.run('DELETE FROM mail WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});
app.get('/api/export', auth, async (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="lettertide-letters.json"');
  res.json({ exported: new Date().toISOString(), letters: (await db.all('SELECT * FROM mail WHERE user_id = ?', req.user.id)).map(toClient) });
});

/* ---------- Santa ---------- */
app.post('/api/santa', auth, async (req, res) => {
  const name = str(req.body?.name, 60).trim(), age = str(req.body?.age, 20), body = str(req.body?.body, 4000);
  if (!name || !body.trim()) return res.status(400).json({ error: 'Santa needs your name and your letter.' });
  if (!limit('santa:' + req.user.id, 15, 60 * 60e3)) return res.status(429).json({ error: 'Santa\'s mailbag is very full! Please try again in an hour.' });
  res.json({ reply: await santa.reply(name, age, body) });
});

/* ---------- page ---------- */
const PAGE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const SHELL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>window.LETTERTIDE_API="/api";</script></head><body>${PAGE}</body></html>`;
app.get('/', async (req, res) => res.type('html').send(SHELL));
app.get('/healthz', async (req, res) => res.json({ ok: true }));

// A free scheduler (cron-job.org) calls this every 10 minutes. It keeps the free server awake
// and sends whatever letters and cards are due.
app.get('/api/cron/deliver', async (req, res) => {
  const given = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '') || String(req.query.key || '');
  if (!CRON_SECRET || given.length !== CRON_SECRET.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(CRON_SECRET)))
    return res.status(401).json({ error: 'Not allowed.' });
  res.json(await tick());
});

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong on our side. Please try again.' }); });

/* ---------- delivery worker ---------- */
let running = false;
async function tick() {
  if (running) return { skipped: true };
  running = true;
  const t = now(), out = { future: 0, cards: 0, checkins: 0 };
  try {
    const due = await db.all(`SELECT m.*, u.email, u.backup_email, u.last_confirmed FROM mail m JOIN users u ON u.id = m.user_id
                            WHERE m.delivered_at IS NULL AND m.deliver <= ? LIMIT 300`, t);
    for (const m of due) {
      try {
        if (m.kind === 'future') {
          const d = JSON.parse(m.data);
          await mailer.send(m.recipient_email || m.email, mailer.templates.arrived({ created: m.created, link: `${BASE_URL}/#mailbox`, letter: d.letter }));
          if (m.backup_email && t - m.last_confirmed > 395 * DAY) await mailer.send(m.backup_email, mailer.templates.arrivedBackup({ owner: m.email, link: BASE_URL }));
          out.future++;
        } else if (m.kind === 'people' && m.recipient_email) {
          const card = JSON.parse(m.data);
          await mailer.send(m.recipient_email, mailer.templates.card(card, t), { replyTo: m.email, fromName: card.from });
          out.cards++;
        }
        await db.run('UPDATE mail SET delivered_at = ? WHERE id = ?', t, m.id);
      } catch (e) { console.error('delivery failed', m.id, e.message); }
    }
    const stale = await db.all(`SELECT u.* FROM users u WHERE u.last_confirmed < ? AND (u.checkin_sent IS NULL OR u.checkin_sent < ?)
                              AND EXISTS (SELECT 1 FROM mail m WHERE m.user_id = u.id AND m.kind = 'future' AND m.delivered_at IS NULL) LIMIT 200`, t - 365 * DAY, t - 30 * DAY);
    for (const u of stale) {
      const ct = token();
      await db.run('INSERT INTO confirm_tokens (hash, user_id, expires) VALUES (?, ?, ?)', sha(ct), u.id, t + 60 * DAY);
      const pending = (await db.get("SELECT COUNT(*) n FROM mail WHERE user_id = ? AND kind = 'future' AND delivered_at IS NULL", u.id)).n;
      try { await mailer.send(u.email, mailer.templates.checkIn({ link: `${BASE_URL}/api/confirm?token=${ct}`, pending })); await db.run('UPDATE users SET checkin_sent = ? WHERE id = ?', t, u.id); out.checkins++; }
      catch (e) { console.error('check-in failed', u.id, e.message); }
    }
    await db.run('DELETE FROM login_tokens WHERE expires < ?', t - DAY);
    await db.run('DELETE FROM sessions WHERE expires < ?', t);
    await db.run('DELETE FROM confirm_tokens WHERE expires < ?', t);
  } finally { running = false; }
  return out;
}

const ready = db.init();
if (require.main === module) {
  ready.then(() => {
    app.listen(PORT, () => console.log(`Lettertide at ${BASE_URL} (db: ${db.mode}, mail: ${mailer.mode}, santa: ${santa.mode})`));
    tick().catch(e => console.error(e));
    setInterval(() => tick().catch(e => console.error(e)), WORKER_MS);
  }).catch(e => { console.error('Could not open the database:', e.message); process.exit(1); });
}
module.exports = { app, tick, db, ready };
