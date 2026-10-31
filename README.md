<h1 align="center">Lettertide</h1>

<p align="center"><b>Letters that arrive right on time.</b><br>
Write to future you, to someone special, or to Santa (who writes back).<br>
Simple enough for a seven-year-old. Meaningful enough for their grandparents.</p>

<p align="center"><img src="docs/screenshots/home.png" alt="Lettertide home screen with three big choices: Future me, Someone special, and Santa" width="900"></p>

---

## Why Lettertide exists

Most of us remember the feeling of finding an old note we wrote years ago: the handwriting, the worries that turned out fine, the dreams that came true or quietly changed. Letters slow time down.

Websites that send a letter to your future self already exist, but they are mostly built for adults: a plain text box, a date picker, and an email years later. Children want to write letters too, to grandparents at Thanksgiving, to a teacher who helped them, to Santa in December, and to the person they'll be when they grow up. They need something they can finish on their own, that feels like a toy rather than a form, and that keeps their words safe.

Lettertide brings every letter that matters into one bright, friendly place, where a child can finish a letter without help and a grown-up still finds something meaningful.

## How Lettertide is different

| | A typical future-letter site | Lettertide |
|---|---|---|
| **Who you can write to** | Yourself | Future you, anyone you love, and Santa |
| **Made for** | Adults who like to write | Kids and grown-ups: one question per screen, big buttons, idea starters |
| **Look and feel** | A form | A real letter: airmail stripes, stamps, handwriting, and a bottle floating out to sea |
| **When it arrives** | One date, one email | Months to 100 years later, on Thanksgiving, on any day, or right now |
| **What comes back** | The letter | The letter, a time capsule shown "then and now", a guess to check, and a "write back" button that keeps the conversation going |
| **Santa** | Not included | Santa replies right away, with child-safe rules built in |
| **Cards for others** | Usually not included | Colorful cards with stickers, emailed under the writer's name, and replies go back to the family |
| **Built to last** | Depends on one email address | The whole letter travels inside the arrival email, a yearly "still you?" check, an optional backup contact, and a full export |
| **Privacy** | Varies | Optional secret word that encrypts the letter in your own browser |

### What makes it special

- **Three kinds of letters, one home.** Future me, Someone special, and Santa all live in the same mailbox.
- **Made for small hands.** One question at a time, giant tap targets, a progress trail of dots, and idea buttons like *"Right now I love…"* or *"This year I'm thankful for you because…"* for when a child gets stuck.
- **Letters that answer back.** A future letter brings back a time capsule (favorite food, best friend, what I want to be) beside empty boxes for who you are now, asks whether your guess came true, and lets you write back to the future.
- **Santa writes back, safely.** Santa never promises a specific present, never asks for an address or school, never suggests keeping secrets, and gently tells a child to talk to a trusted grown-up if they mention being hurt or scared.
- **Cards for real moments.** Thank you, Thanksgiving (it works out the date for you), birthday, get well, I love you, or just because. Pick a color and a sticker, then send it now or schedule it.
- **Sent as you, answered to you.** Grandma sees the card from "Maya via Lettertide", and when she taps Reply, it goes straight to Maya's family.
- **An airmail look.** Red-and-blue airmail stripes, envelope cream and stamp yellow on every screen and every email, with the three choices drawn as postage stamps. It works in light and dark mode.

---

## A quick tour

### Future me

Write to future you, pick when it comes back, and pack a time capsule.

<p><img src="docs/screenshots/write.png" alt="Writing a letter to future me with idea buttons" width="49%"> <img src="docs/screenshots/when.png" alt="Choosing when the letter comes back: 4 months to 20 years or a chosen day" width="49%"></p>
<p><img src="docs/screenshots/capsule.png" alt="Packing a time capsule: favorite food, best friend, favorite song, what I want to be" width="49%"> <img src="docs/screenshots/sent.png" alt="A bottle floating away on the sea with the message See you on October 31, 2031" width="49%"></p>

Years later, the letter washes ashore with everything you packed:

<p align="center"><img src="docs/screenshots/arrival.png" alt="An arrived letter from four years ago with the time capsule shown then and now" width="700"></p>

### Someone special

Make a card, decorate it, and send it now or on the day that matters.

<p><img src="docs/screenshots/card.png" alt="Designing a kraft-paper Thanksgiving card for Grandma with a leaf sticker" width="49%"> <img src="docs/screenshots/card-when.png" alt="Choosing to send the card on Thanksgiving to Grandma's email" width="49%"></p>

What Grandma receives in her inbox:

<p align="center"><img src="docs/screenshots/email-card.png" alt="The Thanksgiving card as an email, signed From Maya" width="520"></p>

### Santa

Tell Santa about your year. An envelope flies to the North Pole, and Santa writes back.

<p><img src="docs/screenshots/santa-write.png" alt="Writing a letter to Santa with idea buttons" width="49%"> <img src="docs/screenshots/santa-reply.png" alt="Santa's reply to Maya under a snowy North Pole scene" width="49%"></p>

### My mailbox

Every letter in one place: floating to the future, arrived, Santa's replies, and cards for people.

<p align="center"><img src="docs/screenshots/mailbox.png" alt="The mailbox with letters grouped by type" width="800"></p>

### On a phone, in dark mode

<p align="center"><img src="docs/screenshots/mobile-dark.png" alt="Lettertide home on a phone in dark mode" width="280">&nbsp;&nbsp;&nbsp;<img src="docs/screenshots/mobile-santa.png" alt="Writing to Santa on a phone in dark mode" width="280"></p>

---

## Safety and privacy

- **Grown-ups sign in** with an email link (no passwords to remember). Kids never need an account of their own.
- **Secret-word letters** are encrypted in the browser (AES-256) before they are saved. Without the word, nobody can read them, including whoever runs the server.
- **Santa's rules** are fixed on the server and can't be changed by what a child types.
- **No spoofed email.** Cards are sent from Lettertide under the writer's name with Reply-To set to the family's email, so they don't get blocked as fake mail.
- **Limits** on sign-in emails, cards (20 a day) and Santa replies keep it from being misused.
- **Your data is yours.** Download every letter at any time, or delete your account and everything in it.

## How it works

- **Website:** one HTML page (no framework) with a step-by-step wizard for each kind of letter.
- **Server:** Node.js with Express, and SQLite (built into Node 22) for storage.
- **Delivery:** every 5 minutes the server sends whatever is due: arriving future letters, scheduled cards, and the yearly check-in.
- **Email:** any SMTP provider. A Gmail app password works for getting started.
- **Santa:** writes personal replies with Claude when an Anthropic API key is set; otherwise a warm ready-made reply is used.

## Run it on your computer

Requires Node.js 22.13 or newer.

```bash
npm install
npm start          # open http://localhost:3000
npm test           # end-to-end check of every feature
```

Without email settings, emails are printed in the terminal, so you can copy the sign-in link from there.

## Put it online

1. **Email:** create a Gmail app password (Google Account → Security → App passwords), or use a provider like Resend or Postmark.
2. **Hosting:** on [Render](https://render.com), choose **New → Blueprint** and pick this repository. The included `render.yaml` sets up the site and a disk for letters (Starter plan, about $7 a month, so it stays awake to deliver on time).
3. **Settings:** fill in the values from `.env.example`:
   - `BASE_URL`: your site address, for example `https://lettertide.onrender.com`
   - `SMTP_URL`: for Gmail, `smtps://YOUR-NAME%40gmail.com:APP-PASSWORD@smtp.gmail.com:465`
   - `MAIL_FROM`: `Lettertide <your-name@gmail.com>`
   - `ANTHROPIC_API_KEY`: optional, for personal Santa replies
4. **Backups:** copy the `data/` folder to a second place every day. Future letters need to survive for years.

A `Dockerfile` is included for any other host.

## Project structure

```
public/index.html   the whole website
server.js           sign-in, letters API, delivery worker
mailer.js           email sending and email designs
santa.js            Santa's replies and safety rules
test/smoke.js       end-to-end test of every feature
render.yaml         one-click setup on Render
docs/screenshots/   the pictures in this README
```
