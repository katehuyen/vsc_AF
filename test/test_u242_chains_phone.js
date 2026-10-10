// U-242 — the Chains table on a phone is a list of cards (media/afMobile.js, table[data-afcards]; the sessions table is
// the model): the chain's title heads the card, every figure wears its column's label, and the row's buttons take a
// line of their own — instead of a 96px column that stacked them one per line and ran off the screen's right edge.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'media/chains.js'), 'utf8');
const LOOK = fs.readFileSync(path.join(ROOT, 'media/afChainsLook.js'), 'utf8');

{
    ok('the table, its head and each chain row carry the card marks',
        /<table class="ch-tab" data-afcards><thead><tr data-afcardhead>/.test(PAGE) && /data-chain="\$\{esc\(r\.chainId\)\}" data-afcard>/.test(PAGE));
    ok('the chain heads the card and its state stands before it',
        /TIP\.cell\('ch-name', 'data-lead', /.test(PAGE) && /TIP\.cell\('ch-st', 'data-first', /.test(PAGE));
    const labels = ['Agent', 'Leg', 'Now', 'Last move', 'Cost', 'Next'].filter(k => !PAGE.includes(`data-label="\${esc(t('${k}'))}"`));
    ok('‼️ every figure wears its column\'s name, in the interface language' + (labels.length ? ': missing ' + labels.join(', ') : ''), labels.length === 0);
    ok('a legs strip and a form under a chain stay under its card', (PAGE.match(/<tr class="ch-sub" data-afcardmore>/g) || []).length === 2);
    ok('‼️ on a phone the buttons take a line of their own and no column is dropped',
        /html\.af-phone \.ch-tab tr\[data-afcard\] > td\.ch-acts \{ flex:1 1 100%;/.test(LOOK)
        && /html\.af-phone \.ch-tab tr\[data-afcard\] > td\.ch-wide \{ display:block; \}/.test(LOOK)
        && /html\.af-phone \.ch-tab \.ch-name \{ max-width:none; \}/.test(LOOK));
}

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    // Every chain row: are its buttons under its title or beside it, does anything cross the screen's edge, how many
    // figures show. `loose` takes the phone mark off first: the instrument has to see the table the defect was in.
    const EXPR = (loose) => `(()=>{if(${loose})document.documentElement.classList.remove('af-phone');
const W=document.documentElement.clientWidth,vis=e=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?r:null;};
let under=0,beside=0,out=0,figs=0;document.querySelectorAll('tr.ch-row').forEach(row=>{if(!row.querySelector('.ch-act'))return;
const a=vis(row.querySelector('.ch-acts')),n=vis(row.querySelector('.ch-name'));if(!a||!n)return;if(a.top>=n.bottom-0.5)under++;else beside++;
figs+=[...row.querySelectorAll('td[data-label]')].filter(vis).length;});
document.querySelectorAll('.ch-act,.ch-form,.ch-form *,.ch-tab td,.ch-tab th').forEach(e=>{const r=vis(e);if(r&&(r.right>W+0.5||r.left<-0.5))out++;});
return {W,under,beside,out,figs};})()`;
    node([path.join('test', 'render_page.js'), 'chains']);
    const measure = (loose, size) => {
        try { return JSON.parse(node([path.join('test', 'measure_page.js'), 'chains', EXPR(loose), ...size])); } catch { return null; }
    };
    const was = measure(true, ['--phone']);
    ok('the instrument sees the defect: as a table on the phone the buttons sit beside their row and cross the edge'
        + (was ? ` (${JSON.stringify(was)})` : ''), !!(was && was.W === 360 && was.beside > 0 && was.out > 0));
    const m = measure(false, ['--phone']);
    ok('‼️ on the phone every chain\'s buttons are under it, nothing crosses the screen\'s edge, and all six figures show'
        + (m ? ` (${JSON.stringify(m)})` : ''), !!(m && m.W === 360 && m.under > 0 && m.beside === 0 && m.out === 0 && m.figs === 6 * m.under));
    const d = measure(false, ['--width', '1200']);
    ok('…and on a wide screen the buttons stay in their column beside the row' + (d ? ` (${JSON.stringify(d)})` : ''),
        !!(d && d.beside > 0 && d.under === 0 && d.out === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
