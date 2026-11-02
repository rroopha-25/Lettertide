// Email sending, three ways (first one configured wins):
//  1. MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET: a free Google Apps Script on your Gmail sends it
//     (works on Render's free plan, which blocks SMTP). See google-apps-script/send-mail.gs.
//  2. SMTP_URL: any SMTP provider (needs a paid Render plan or another host that allows SMTP).
//  3. Neither: emails are printed to the console, for local development.
'use strict';
const nodemailer = require('nodemailer');

const FROM = process.env.MAIL_FROM || 'Lettertide <letters@localhost>';
const WEBHOOK = process.env.MAIL_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.MAIL_WEBHOOK_SECRET || '';
const transport = !WEBHOOK && process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const outbox = []; // last messages, used by tests in console mode

const fmt = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(title, bodyHtml, cta) {
  return `<!doctype html><html><body style="margin:0;background:#FBF4E6;font-family:Helvetica,Arial,sans-serif;color:#16305F">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="height:10px;background:repeating-linear-gradient(-45deg,#E23B3B 0 12px,#FFFDF8 12px 20px,#1F4FA0 20px 32px,#FFFDF8 32px 40px);background-color:#E23B3B;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#FFFDF8;padding:22px 28px 6px">
<div style="font-size:26px;font-weight:800;color:#16305F">Lettertide</div></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
<div style="font-size:16px;line-height:1.6">${bodyHtml}</div>
${cta ? `<p style="margin:26px 0 8px"><a href="${cta.href}" style="background:#E23B3B;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(cta.label)}</a></p>
<p style="font-size:12px;color:#6b6390;word-break:break-all">${esc(cta.href)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

const templates = {
  signIn: link => ({
    subject: 'Your Lettertide sign-in link',
    text: `Open this link to sign in (it works once, for 20 minutes):\n${link}`,
    html: wrap('Sign in to Lettertide', 'Tap the button to sign in. The link works once and expires in 20 minutes. If you didn\'t ask for it, ignore this email.', { href: link, label: 'Sign in' })
  }),
  arrived: ({ created, link, letter }) => {
    // an unlocked letter travels inside the email, so it arrives even if the account is long forgotten
    const caps = letter ? [['food', 'Favorite food'], ['friend', 'Best friend'], ['song', 'Favorite song or show'], ['be', 'What I wanted to be']].filter(([k]) => letter.capsule?.[k]) : [];
    const body = letter ? `<div style="background:#FFFDF8;border:3px solid #EADFC8;border-radius:16px;padding:20px;font-family:'Comic Sans MS','Patrick Hand',cursive;font-size:19px;line-height:1.55;white-space:pre-wrap">${esc(letter.body)}</div>
      ${caps.length ? `<h2 style="font-size:18px;margin:20px 0 6px">Your time capsule</h2>${caps.map(([k, q]) => `<div style="margin:4px 0"><b>${q}:</b> ${esc(letter.capsule[k])}</div>`).join('')}` : ''}
      ${letter.guess ? `<h2 style="font-size:18px;margin:20px 0 6px">Your guess about the future</h2><div>${esc(letter.guess)}</div><p>Did it come true?</p>` : ''}`
      : `It's locked with your secret word, so open it on Lettertide.`;
    return {
      subject: `A letter from ${fmt(created)} just washed ashore!`,
      text: `The letter you wrote to yourself on ${fmt(created)} has arrived.\n\n${letter ? letter.body + '\n\n' : ''}Open it on Lettertide: ${link}`,
      html: wrap('A letter from past you is here!', `You wrote to yourself on <b>${fmt(created)}</b>. It has been floating at sea ever since, and today it washed ashore.<br><br>${body}`, { href: link, label: letter ? 'Write back to the future' : 'Open my letter' })
    };
  },
  // A card arrives as a postcard: the picture side on top, the written side (message, stamp, postmark, address) below.
  card: (c, sentAt = Date.now()) => {
    const T = { sun: ['#F5B935', '#16305F'], berry: ['#E23B3B', '#FFFDF8'], ocean: ['#1F4FA0', '#FFFDF8'], fall: ['#C98D4B', '#2E1A08'], mint: ['#FFFDF8', '#16305F'], grape: ['#16305F', '#FFFDF8'] }[c.theme] || ['#F5B935', '#16305F'];
    const O = {
      thanks: ['A thank-you card for you', 'Thank you!', '💌'], birthday: ['A birthday card for you', 'Happy birthday!', '🎂'], getwell: ['A get-well card for you', 'Get well soon', '🌻'],
      love: ['A card full of love for you', 'With love', '💗'], hello: ['A card for you', 'Hello from me', '✉️'], thanksgiving: ['A Happy Thanksgiving card for you', 'Happy Thanksgiving', '🍂'],
      diwali: ['A Happy Diwali card for you', 'Happy Diwali', '🪔'], hanukkah: ['A Happy Hanukkah card for you', 'Happy Hanukkah', '🕎'], christmas: ['A Merry Christmas card for you', 'Merry Christmas', '🎄'],
      kwanzaa: ['A Happy Kwanzaa card for you', 'Happy Kwanzaa', '🕯️'], pongal: ['A Happy Pongal card for you', 'Happy Pongal', '🌾'], lunar: ['A Happy Lunar New Year card for you', 'Happy Lunar New Year', '🏮'],
      eidfitr: ['An Eid Mubarak card for you', 'Eid Mubarak', '🌙'], eidadha: ['An Eid Mubarak card for you', 'Eid Mubarak', '🌙'], holi: ['A Happy Holi card for you', 'Happy Holi', '🎨'],
      mothers: ['A Happy Mother’s Day card for you', 'Happy Mother’s Day', '💐'], fathers: ['A Happy Father’s Day card for you', 'Happy Father’s Day', '⭐'], rakhi: ['A Happy Raksha Bandhan card for you', 'Happy Raksha Bandhan', '🧵']
    }[c.occasion] || ['A card for you', 'Hello from me', '✉️'];
    const [subj, greeting, icon] = O;
    const day = new Date(sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    const hand = "'Patrick Hand','Comic Sans MS','Chalkboard SE',cursive";
    const stripe = 'repeating-linear-gradient(-45deg,#E23B3B 0 10px,#FFFDF8 10px 16px,#1F4FA0 16px 26px,#FFFDF8 26px 32px)';
    const html = `<!doctype html><html><body style="margin:0;background:#FBF4E6;font-family:Helvetica,Arial,sans-serif;color:#16305F">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 12px;font-size:15px;color:#5B6888">📬 ${c.from ? `${esc(c.from)} sent you a postcard` : 'You have a postcard'}</td></tr>

<tr><td style="background:${T[0]};background-image:${stripe};padding:8px;border-radius:14px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${T[0]};border-radius:8px"><tr><td align="center" style="padding:40px 20px 34px;color:${T[1]}">
    <div style="font-size:64px;line-height:1">${icon}</div>
    <div style="font-size:40px;font-weight:800;line-height:1.1;margin-top:14px">${esc(greeting)}${c.to ? `,<br>${esc(c.to)}!` : '!'}</div>
    <div style="font-size:14px;letter-spacing:3px;margin-top:16px;opacity:.85">GREETINGS FROM LETTERTIDE</div>
  </td></tr></table>
</td></tr>

<tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr>

<tr><td style="background:#FFFDF8;border:1px solid #E6DCC6;border-radius:14px;padding:22px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="width:58%;padding-right:16px;border-right:2px solid #E6DCC6;font-family:${hand};font-size:19px;line-height:1.55;color:#16305F;white-space:pre-wrap">${esc(c.body)}${c.from ? `<div style="font-size:21px;font-weight:700;margin-top:12px">From ${esc(c.from)}</div>` : ''}</td>
    <td valign="top" style="width:42%;padding-left:16px">
      <table cellpadding="0" cellspacing="0" align="right" style="border:3px dashed #FFFDF8;outline:3px solid ${T[0] === '#FFFDF8' ? '#E23B3B' : T[0]};background:${T[0] === '#FFFDF8' ? '#E23B3B' : T[0]};width:84px"><tr><td align="center" style="padding:8px 4px;color:${T[0] === '#FFFDF8' || T[0] === '#E23B3B' || T[0] === '#1F4FA0' || T[0] === '#16305F' ? '#FFFDF8' : T[1]}">
        <div style="font-size:30px;line-height:1">${icon}</div><div style="font-size:9px;font-weight:800;letter-spacing:1px;margin-top:4px">AIRMAIL</div>
      </td></tr></table>
      <div style="clear:both;height:8px;font-size:0">&nbsp;</div>
      <table cellpadding="0" cellspacing="0" style="border:2px solid #9AA6C2;border-radius:50%;width:92px;height:92px;transform:rotate(-12deg)"><tr><td align="center" valign="middle" style="font-size:9px;font-weight:800;color:#7D89A8;letter-spacing:.5px;line-height:1.4">LETTERTIDE<br>${day}<br>DELIVERED</td></tr></table>
      <div style="margin-top:16px;font-size:12px;color:#5B6888;font-weight:700">TO</div>
      <div style="border-bottom:1.5px solid #C9BFA8;padding:4px 0;font-family:${hand};font-size:20px;color:#16305F">${esc(c.to || '')}</div>
      <div style="border-bottom:1.5px solid #C9BFA8;height:22px"></div>
      <div style="border-bottom:1.5px solid #C9BFA8;height:22px"></div>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:14px 4px 0;font-size:14px;color:#5B6888">↩️ Reply to this email to write back${c.from ? ' to ' + esc(c.from) : ''}.</td></tr>
<tr><td style="padding:6px 4px 0;font-size:12px;color:#9AA6C2">Sent with Lettertide, letters that arrive right on time.</td></tr>
</table></td></tr></table></body></html>`;
    return {
      subject: c.from ? `${subj} from ${c.from}` : `${subj}, ${c.to}!`,
      text: `${greeting}, ${c.to}!\n\n${c.body}\n\n${c.from ? `From ${c.from}\n\n` : ''}(A postcard sent with Lettertide. Reply to this email to write back${c.from ? ' to ' + c.from : ''}.)`,
      html
    };
  },
  sendReminder: c => ({
    subject: `Today's the day to send ${c.to}'s postcard`,
    text: `You made a postcard for ${c.to}. Today's the day to send it. Open Lettertide on your phone and tap Send postcard: ${c.link}`,
    html: wrap(`Time to send ${c.to}'s postcard`, `You made a postcard for <b>${esc(c.to)}</b>, and today's the day.<br><br>Open your mailbox on Lettertide on your phone and tap <b>Send postcard</b>. It goes from your own phone or email, so ${esc(c.to)} sees it's from you.`, { href: c.link, label: 'Open my mailbox' })
  }),
  arrivedBackup: ({ owner, link }) => ({
    subject: 'A Lettertide letter has arrived for someone who listed you',
    text: `${owner} listed you as their backup contact. A letter they wrote to themselves has arrived. Please let them know: ${link}`,
    html: wrap('Please pass this on', `<b>${esc(owner)}</b> listed you as their backup contact. A letter they wrote to their future self has arrived, but we haven't heard from their email in over a year.<br><br>Only they can open it, with their own passphrase. Please let them know it's waiting.`, { href: link, label: 'Go to Lettertide' })
  }),
  checkIn: ({ link, pending }) => ({
    subject: 'Is this still the right inbox?',
    text: `You have ${pending} letter(s) at sea. Confirm this is still your email: ${link}`,
    html: wrap('Still you?', `You have <b>${pending}</b> letter${pending === 1 ? '' : 's'} at sea. Once a year we check that this inbox still reaches you, so nothing gets lost. One tap confirms it.`, { href: link, label: "Yes, it's me" })
  })
};

// A card shows the writer's name as the sender ("Maya via Lettertide") and replies go to their own email.
// Sending with their actual address in From would be blocked as spoofing by Gmail, Yahoo and Outlook.
const FROM_ADDR = (FROM.match(/<([^>]+)>/) || [, FROM])[1];
function fromFor(name) {
  if (!name) return FROM;
  const clean = String(name).replace(/["<>\r\n\\]/g, '').slice(0, 60).trim();
  return clean ? `"${clean} via Lettertide" <${FROM_ADDR}>` : FROM;
}

async function send(to, msg, opts = {}) {
  if (WEBHOOK) {
    const r = await fetch(WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ secret: WEBHOOK_SECRET, to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: opts.replyTo || '',
        name: opts.fromName ? `${String(opts.fromName).replace(/["<>\r\n]/g, '').slice(0, 60)} via Lettertide` : 'Lettertide' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error('Mail script refused: ' + (j.error || r.status));
    return;
  }
  if (!transport) {
    outbox.push({ to, ...msg, ...opts });
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`\n[mail → ${to}] ${msg.subject}\n${msg.text}\n`);
    return;
  }
  await transport.sendMail({ from: fromFor(opts.fromName), to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: opts.replyTo });
}

module.exports = { send, templates, outbox, fromFor, mode: WEBHOOK ? 'gmail-script' : transport ? 'smtp' : 'console' };
