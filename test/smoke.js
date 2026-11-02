// End-to-end check: sign in, write all three kinds of letters, time-travel, and confirm the right emails go out.
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert');
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-')), 'test.db');
process.env.BASE_URL = 'http://localhost:0';
delete process.env.SMTP_URL; delete process.env.ANTHROPIC_API_KEY; delete process.env.DATABASE_URL;
process.env.CRON_SECRET = 'test-secret-123';
const { app, tick, db, ready } = require('../server');
const { outbox } = require('../mailer');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await ready;
  const srv = app.listen(0); const base = `http://localhost:${srv.address().port}`;
  const H = { 'Content-Type': 'application/json', 'X-Lettertide': '1' };
  let cookie = '';
  const call = async (p, o = {}) => { const r = await fetch(base + p, { redirect: 'manual', ...o, headers: { ...H, cookie, ...(o.headers || {}) } }); return { r, j: await r.json().catch(() => null) }; };
  const post = (p, body) => call(p, { method: 'POST', body: JSON.stringify(body) });

  const page = await (await fetch(base + '/')).text();
  assert(page.includes('window.LETTERTIDE_API') && page.includes('<title>Lettertide</title>'));
  assert.equal((await call('/api/letters')).r.status, 401);
  assert.equal((await fetch(base + '/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"a@b.co"}' })).status, 403, 'CSRF guard');

  // sign in
  assert.equal((await post('/api/auth/request', { email: 'Parent@Example.com' })).r.status, 200);
  const link = outbox.at(-1).text.match(/https?:\S+/)[0].replace('http://localhost:0', base);
  const v = await fetch(link, { redirect: 'manual' });
  cookie = v.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(link, { redirect: 'manual' })).headers.get('location'), '/?signin=expired#home', 'single-use link');
  assert.equal((await call('/api/me')).j.email, 'parent@example.com');

  // future letter (plain) and locked letter
  const fut = await post('/api/letters', { kind: 'future', deliver: Date.now() + 120 * 864e5, deliverTo: 'Me.Later@Example.com', letter: { body: 'Hi future me', capsule: { food: 'pasta' }, guess: 'a puppy' } });
  assert.equal((await post('/api/letters', { kind: 'future', deliver: Date.now() + 120 * 864e5, deliverTo: 'bad', letter: { body: 'x' } })).r.status, 400);
  assert.equal(fut.r.status, 201);
  const locked = await post('/api/letters', { kind: 'future', deliver: Date.now() + 365 * 864e5, box: { ct: 'Y2lw', iv: 'aXY=', salt: 'c2E=', v: 2 }, hint: 'pet' });
  assert.equal(locked.r.status, 201);
  assert.equal((await post('/api/letters', { kind: 'future', deliver: Date.now() - 1, letter: { body: 'x' } })).r.status, 400);

  // postcards are sent from the sender's own phone or email: the server never emails the recipient
  const before = outbox.length;
  const card = await post('/api/letters', { kind: 'people', deliver: Date.now(), to: 'Grandma', from: 'Maya', body: 'Dear Grandma,\nThank you for the cookies!', occasion: 'thanksgiving', scene: 'leaves', recipientEmail: 'grandma@example.com' });
  assert.equal(card.r.status, 201); assert.equal(card.j.scene, 'leaves'); assert.equal(card.j.recipientEmail, undefined, 'recipient email is never stored');
  await wait(200);
  assert.equal(outbox.length, before, 'nothing emailed for a send-now postcard');
  assert.equal(require('../mailer').fromFor('Evil"<x@y>'), '"Evilx@y via Lettertide" <letters@localhost>');
  // marking a postcard as sent
  await call('/api/letters/' + card.j.id, { method: 'PATCH', body: JSON.stringify({ sent: true }) });
  assert((await call('/api/letters')).j.find(x => x.id === card.j.id).sent > 0);
  // scheduled postcard: reminder to the sender on the day
  const later = await post('/api/letters', { kind: 'people', deliver: Date.now() + 10 * 864e5, to: 'Mr. Lee', from: 'Maya', body: 'Thank you for teaching me', occasion: 'teacher', scene: 'apples' });
  assert.equal(later.r.status, 201);
  // festival and global occasions accepted; unknown scene dropped
  const diwali = await post('/api/letters', { kind: 'people', deliver: Date.now(), to: 'Nani', from: 'Maya', body: 'Happy Diwali Nani!', occasion: 'diwali', scene: 'lights' });
  assert.equal(diwali.r.status, 201); assert.equal(diwali.j.occasion, 'diwali'); assert.equal(diwali.j.scene, 'lights');
  const odd = await post('/api/letters', { kind: 'people', deliver: Date.now(), to: '<b>Bo</b>', body: '<script>x</script> hello friend', occasion: 'halloween', scene: 'not-a-scene' });
  assert.equal(odd.j.occasion, 'halloween'); assert.equal(odd.j.scene, undefined);

  // Santa: template reply, never empty, saved
  const s = await post('/api/santa', { name: 'Maya', age: '7', body: 'Dear Santa, I would love a red bike. I helped my mom bake.' });
  assert.match(s.j.reply, /Dear Maya/); assert.match(s.j.reply, /red bike/); assert.match(s.j.reply, /Santa/);
  assert.equal((await post('/api/letters', { kind: 'santa', name: 'Maya', age: '7', body: 'Dear Santa…', reply: s.j.reply })).r.status, 201);
  const xm = await post('/api/letters', { kind: 'santa', deliver: Date.now() + 20 * 864e5, name: 'Maya', age: '7', body: 'Dear Santa, hi!', reply: s.j.reply });
  assert.equal(xm.r.status, 201); assert(xm.j.deliver > Date.now() + 19 * 864e5 && !xm.j.delivered, 'Christmas-morning reply waits');
  assert.equal((await call('/api/letters')).j.length, 8);
  await db.run('UPDATE mail SET deliver = ? WHERE id = ?', Date.now() - 1000, xm.j.id);
  assert.equal((await tick()).santa, 1); assert.equal(outbox.at(-1).to, 'parent@example.com'); assert.match(outbox.at(-1).subject, /Santa wrote back to Maya/);
  assert.equal((await tick()).santa, undefined, 'Christmas email sent once');

  // time-travel: the scheduled postcard's day arrives -> reminder goes to the sender only
  await db.run('UPDATE mail SET deliver = ? WHERE id = ?', Date.now() - 1000, later.j.id);
  let res = await tick(); assert.equal(res.cards, 1);
  assert.equal(outbox.at(-1).to, 'parent@example.com'); assert.match(outbox.at(-1).subject, /send Mr. Lee's postcard/);
  assert.equal((await tick()).cards, 0, 'reminder sent once');

  // a year of silence → check-in; then future letter arrives → owner + backup
  await call('/api/me', { method: 'PATCH', body: JSON.stringify({ backupEmail: 'aunt@example.com' }) });
  await db.run('UPDATE users SET last_confirmed = ?', Date.now() - 400 * 864e5);
  res = await tick(); assert.equal(res.checkins, 1);
  await db.run('UPDATE mail SET deliver = ? WHERE id = ?', Date.now() - 1000, fut.j.id);
  res = await tick(); assert.equal(res.future, 1);
  assert.deepEqual(outbox.slice(-2).map(m => m.to).sort(), ['aunt@example.com', 'me.later@example.com']);
  const arrivedMail = outbox.find(m => m.to === 'me.later@example.com');
  assert(arrivedMail.html.includes('Hi future me') && arrivedMail.html.includes('pasta'), 'unlocked letter travels inside the email');
  assert.equal((await tick()).future, 0, 'never delivered twice');

  // opened flag only after arrival
  await call('/api/letters/' + locked.j.id, { method: 'PATCH', body: JSON.stringify({ opened: true }) });
  await call('/api/letters/' + fut.j.id, { method: 'PATCH', body: JSON.stringify({ opened: true }) });
  const all = (await call('/api/letters')).j;
  assert(!all.find(x => x.id === locked.j.id).opened && all.find(x => x.id === fut.j.id).opened);

  // free scheduler endpoint: needs the secret
  assert.equal((await fetch(base + '/api/cron/deliver')).status, 401);
  assert.equal((await fetch(base + '/api/cron/deliver?key=wrong-secret-xx')).status, 401);
  const cron = await fetch(base + '/api/cron/deliver', { headers: { Authorization: 'Bearer test-secret-123' } });
  assert.equal(cron.status, 200); assert('future' in (await cron.json()));

  // export + delete everything
  assert.equal((await call('/api/export')).j.letters.length, 8);
  assert.equal((await call('/api/me', { method: 'DELETE' })).r.status, 200);
  assert.equal((await db.get('SELECT COUNT(*) n FROM mail')).n, 0);

  srv.close();
  console.log('All checks passed: sign-in, scheduler link, postcards never email recipients, day-of reminders to sender, festival and global occasions, future letters, Santa reply (now or on Christmas morning), yearly check-in, delivery + backup, export, deletion.');
})().catch(e => { console.error(e); process.exit(1); });
