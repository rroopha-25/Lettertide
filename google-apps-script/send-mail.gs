// Lettertide mail sender: a free Google Apps Script that sends Lettertide's emails from your Gmail.
// Setup: script.google.com > New project > paste this > change SECRET > Deploy > New deployment >
// type "Web app", Execute as "Me", Who has access "Anyone" > Deploy > copy the Web app URL.
// Put the URL in Render as MAIL_WEBHOOK_URL and the same SECRET as MAIL_WEBHOOK_SECRET.

const SECRET = 'CHANGE-ME-to-a-long-made-up-phrase';

function doPost(e) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad request' }); }
  if (!SECRET || SECRET.indexOf('CHANGE-ME') === 0 || d.secret !== SECRET) return out({ ok: false, error: 'not allowed' });
  if (!d.to || !d.subject) return out({ ok: false, error: 'missing to or subject' });
  if (MailApp.getRemainingDailyQuota() < 1) return out({ ok: false, error: 'daily Gmail limit reached' });
  const message = { to: d.to, subject: d.subject, body: d.text || '', htmlBody: d.html || undefined, name: d.name || 'Lettertide' };
  if (d.replyTo) message.replyTo = d.replyTo;
  MailApp.sendEmail(message);
  return out({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
}

// Run this once from the editor (select it, click Run) to approve sending and send yourself a test email.
function testSend() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Lettertide test', 'Your Lettertide mail sender works.');
}
