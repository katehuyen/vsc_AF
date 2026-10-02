// U-176 — A PHONE'S SCREEN IS 360px WIDE, AND HEADLESS CHROME WILL NOT BE.
// `--window-size=360,800` is widened to 500 without a word, so a "phone" picture
// was a 500px layout cut down the side. The page is drawn in a phone-sized
// srcdoc frame instead; this proves the frame's own width reaches the page.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PHONE, MIN_WINDOW, phoneSize, phoneWrap, windowSize } = require('./phone_frame');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

ok('--phone is portrait 360x800', phoneSize(['x', '--phone']) === PHONE.portrait && PHONE.portrait.w === 360 && PHONE.portrait.h === 800);
ok('--phone land is landscape 800x360', phoneSize(['--phone', 'land']) === PHONE.landscape);
ok('--phone long is the phone\'s width, long enough to read a whole page', phoneSize(['--phone', 'long']) === PHONE.long && PHONE.long.w === 360 && PHONE.long.h > 800);
ok('--phone followed by another flag stays portrait', phoneSize(['--phone', '--light']) === PHONE.portrait);
ok('no --phone, no phone', phoneSize(['x', '--width', '360']) === null);
ok('the window holds the frame at the browser\'s floor', windowSize(PHONE.portrait) === `--window-size=${MIN_WINDOW},800`);
ok('…and is the frame itself when it is wider', windowSize(PHONE.landscape) === '--window-size=800,360');
const wrapped = phoneWrap('<html><body><p class="a" title="x & y">"q"</p></body></html>', PHONE.portrait, '<i>after</i>', 'now');
const srcdoc = /srcdoc="([^"]*)"/.exec(wrapped);
ok('the page goes into srcdoc escaped, so its quotes cannot end the attribute',
    !!srcdoc && srcdoc[1].includes('<p class=&quot;a&quot; title=&quot;x &amp; y&quot;>&quot;q&quot;</p>'));
ok('the page is marked as on a phone', !!srcdoc && srcdoc[1].includes('<html data-af-phone=&quot;1&quot;>'));
ok('…and the phone layer runs on it, told which page it is',
    !!srcdoc && srcdoc[1].includes('window.AFMobile') && srcdoc[1].includes('AFMobile.page(&quot;now&quot;)'));
ok('the frame is the phone\'s size', /width:360px;height:800px/.test(wrapped));
ok('what is measured from outside sits beside the frame', wrapped.includes('</iframe><i>after</i>'));

// ---- the browser half: the width the PAGE sees (skipped where no Chrome is installed)
const RENDER = path.join(__dirname, '..', 'dist', 'render');
let chrome = true;
try { require('./shoot_page').browser(); } catch { chrome = false; }
if (chrome) {
    fs.mkdirSync(RENDER, { recursive: true });
    const name = '.af-phone-probe';
    const file = path.join(RENDER, name + '.html');
    fs.writeFileSync(file, '<!DOCTYPE html><html><head><style>@media (max-width:400px){#w{color:rgb(1,2,3)}}</style></head>'
        + '<body><div id="w">w</div></body></html>', 'utf8');
    const measure = (...extra) => JSON.parse(execFileSync(process.execPath,
        [path.join(__dirname, 'measure_page.js'), name, 'JSON.stringify({w:innerWidth,c:getComputedStyle(document.getElementById("w")).color})', ...extra],
        { encoding: 'utf8', timeout: 120000 }).trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'));
    try {
        const p = measure('--phone');
        ok('‼️ inside the frame the page is 360px wide', p.w === 360);
        ok('…so a narrow rule applies', p.c === 'rgb(1, 2, 3)');
        const l = measure('--phone', 'land');
        ok('landscape is 800px wide', l.w === 800);
        const plain = measure('--width', '360');
        ok('(the defect this exists for) a bare 360 window is wider than 360', plain.w > 360);
    } finally {
        fs.rmSync(file, { force: true });
    }
}

console.log(`test_phone_frame: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
