// Email sending. Configure SMTP_URL (e.g. smtps://user:pass@smtp.provider.com:465) to send real mail.
// Without it, emails are printed to the console so you can develop locally.
'use strict';
const nodemailer = require('nodemailer');

const FROM = process.env.MAIL_FROM || 'Lettertide <letters@localhost>';
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
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
  card: c => {
    const T = { sun: ['#F5B935', '#16305F'], berry: ['#E23B3B', '#FFFDF8'], ocean: ['#1F4FA0', '#FFFDF8'], fall: ['#C98D4B', '#2E1A08'], mint: ['#FFFDF8', '#16305F'], grape: ['#16305F', '#FFFDF8'] }[c.theme] || ['#F5B935', '#16305F'];
    const subj = { thanks: 'A thank-you card for you', thanksgiving: 'A Happy Thanksgiving card for you', birthday: 'A birthday card for you', getwell: 'A get-well card for you', love: 'A card full of love for you', hello: 'A card for you' }[c.occasion] || 'A card for you';
    return {
      subject: c.from ? `${subj} from ${c.from}` : `${subj}, ${c.to}!`,
      text: `To ${c.to}\n\n${c.body}\n\n${c.from ? `From ${c.from}\n\n` : ''}(Reply to this email to write back${c.from ? ' to ' + c.from : ''}.)`,
      html: wrap(subj, `<div style="background:${T[0]};color:${T[1]};border:4px solid #16305F;border-radius:6px;padding:24px;font-family:'Comic Sans MS','Patrick Hand',cursive">
        <div style="font-size:24px;font-weight:700;margin-bottom:10px">To ${esc(c.to)}</div>
        <div style="font-size:20px;line-height:1.5;white-space:pre-wrap">${esc(c.body)}</div>${c.from ? `<div style="font-size:22px;font-weight:700;margin-top:14px">From ${esc(c.from)}</div>` : ''}</div>
        <p style="font-size:14px;color:#6b6390;margin-top:16px">Reply to this email to write back${c.from ? ' to ' + esc(c.from) : ''}.</p>`)
    };
  },
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
  if (!transport) {
    outbox.push({ to, ...msg, ...opts });
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`\n[mail → ${to}] ${msg.subject}\n${msg.text}\n`);
    return;
  }
  await transport.sendMail({ from: fromFor(opts.fromName), to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: opts.replyTo });
}

module.exports = { send, templates, outbox, fromFor, mode: transport ? 'smtp' : 'console' };
