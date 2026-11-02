// Builds the GitHub Pages site into ./_site from public/index.html.
// The page in public/ is a body fragment (it is also served by server.js and published as a Claude artifact),
// so this wraps it in a full HTML document with sharing previews and an icon.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, '_site');
const SITE = process.env.SITE_URL || 'https://rroopha-25.github.io/Lettertide/';
const STATS = process.env.GOATCOUNTER || 'lettertide'; // free, cookie-free visit counts at https://<code>.goatcounter.com
let page =fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

const take = re => { const m = page.match(re); if (m) page = page.replace(m[0], ''); return m ? m[0] : ''; };
const title = take(/<title>[\s\S]*?<\/title>\s*/) || '<title>Lettertide</title>';
take(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/);
const fonts = [];
let m; const linkRe = /<link rel="(?:preconnect|stylesheet)"[^>]*>\s*/g;
while ((m = linkRe.exec(page))) fonts.push(m[0].trim());
page = page.replace(linkRe, '');

const desc = 'Letters that arrive right on time. Write to future you, send a painted postcard to someone special, or write to Santa, who writes back. Simple enough for kids.';
const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 30"><rect x="8" y="0" width="6" height="5" rx="1.5" fill="#E23B3B"/><path d="M8 5h6v4c5 2 6 5 6 9v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-8c0-4 1-7 6-9z" fill="#1F4FA0"/><rect x="6" y="14" width="10" height="10" rx="1.5" fill="#FFFDF8"/></svg>');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${title.trim()}
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="Lettertide">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FBF4E6">
<link rel="icon" href="${icon}">
<script>window.LETTERTIDE_STATS = 1</script>
<script data-goatcounter="https://${STATS}.goatcounter.com/count" data-goatcounter-settings='{"no_onload":true}' async src="//gc.zgo.at/count.js" onload="window.lettertideFlush && lettertideFlush()"></script>
${fonts.join('\n')}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${page.trim()}
</body>
</html>
`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(root, 'docs', 'og.png'), path.join(out, 'og.png'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Built ${path.relative(root, out)}/index.html (${(html.length / 1024).toFixed(0)} KB) for ${SITE}`);
