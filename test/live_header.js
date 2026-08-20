/**
 * A LIVE header, in a browser, for the one thing a static render cannot show:
 * WHAT HAPPENS WHEN YOU TOUCH IT.
 *
 * `render_page.js` runs a page script and writes its markup — which is right for
 * colours, widths and badges, and useless for U-74, whose whole subject is the
 * moment a hand arrives: a hover delay, a press, a menu opening under a panel.
 * So this writes ONE self-contained page with the real `media/afTip.js` and
 * `media/pageHeader.js` running in it, the real stylesheet, and a toolbar whose
 * `Console` button carries the claim menu that started the item.
 *
 *   node test/live_header.js        → dist/render/live_header.html
 *   node test/live_header.js --check → the same page, answering for itself
 *
 * Open it, or drive it:
 *   · rest on Console for 300ms — nothing (a control you press waits .6s)
 *   · rest for a second — the panel
 *   · press it — the panel goes and the two-item menu is there to be used
 *
 * ‼️ `--check` is the half a screenshot cannot take. `:hover` needs a real
 * pointer and no script can fake one — so the check page swaps `:hover` for a
 * class of IDENTICAL specificity (`.afhov`, one class against one pseudo-class),
 * which leaves the cascade exactly as it ships and lets a headless browser be
 * asked what it computes. What it answers about is the U-74 half that string
 * tests cannot reach: does `af-mute` actually BEAT the four "it is already
 * open" rules, and does `tip-act` really carry the longer delay. Run it through
 * the same Chrome the screenshots use:
 *
 *   node test/live_header.js --check
 *   "<chrome>" --headless=new --dump-dom file:///…/live_header.check.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CHECK = process.argv.includes('--check');

/** The cascade, unchanged, with `:hover` renamed to a class of the same weight
 *  so a script can put it on. Nothing else about the sheet is touched. */
const sheet = () => (CHECK
    // ‼️ AND NO TRANSITIONS, or the check measures the clock instead of the
    // cascade: `visibility` is transitioned with a delay, so any forced layout
    // between a class change and the reading starts the transition and returns
    // the value it is ON THE WAY FROM. What is under test is which rule wins,
    // and that is a question with no time in it.
    // `transition-property`, not `transition` — the delay is itself under test,
    // and the shorthand would wipe it.
    ? read('media/common.css').replace(/:hover\b/g, '.afhov') + '\n.af-tip { transition-property: none !important; }\n'
    : read('media/common.css'));

/** What the check asks the browser, once the page is up. Printed into the DOM,
 *  so `--dump-dom` is enough — no CDP, no driver, no browser to install. */
const CHECKS = `
const out = [];
const note = (n, got, want) => out.push((got === want ? 'ok   ' : 'FAIL ') + n + ' → ' + got + (got === want ? '' : ' (wanted ' + want + ')'));
const nav = document.querySelector('[data-afclaim="console"]');
const wrap = nav.closest('.af-tipw');
const tip = wrap.querySelector('.af-tip');
const vis = () => getComputedStyle(tip).visibility;
const delay = () => getComputedStyle(tip).transitionDelay;

wrap.classList.add('afhov');
note('a hovered panel is visible', vis(), 'visible');
note('…and waits the ordinary .25s', delay().includes('0.25s'), true);

wrap.classList.add('tip-act');
note('‼️ a trigger you press waits longer', delay().includes('0.6s'), true);

// the four "it is already open" classes, each of which the mute must beat
for (const c of ['af-on', 'af-hold', 'af-open', 'af-measure']) {
    wrap.classList.add(c);
    wrap.classList.add('af-mute');
    note('‼️ af-mute beats .' + c, vis(), 'hidden');
    note('…and takes its box with it', tip.offsetWidth, 0);
    wrap.classList.remove('af-mute');
    wrap.classList.remove(c);
}
wrap.classList.remove('tip-act');
wrap.classList.remove('afhov');

// ‼️ THE ITEM'S OWN BUG: the claim menu never opened at all. The button is
// inside an AFTip wrapper, so the menu is the WRAPPER's sibling, not the
// button's — and the handler looked at \`parentElement\`.
const menu = document.querySelector('[data-afclaimmenu="console"]');
note('the menu starts closed', menu.hidden, true);
nav.click();
note('‼️ pressing Console opens its two-item menu', menu.hidden, false);
note('…and the button says so', nav.getAttribute('aria-expanded'), 'true');
note('…and the wrapper carries the state its panel is muted by',
    !!document.querySelector('.af-claim.af-claim-open'), true);

// Coming BACK to the button with the menu still down: the component reads
// \`data-aftip-mute\` and refuses to open over the choice being made.
wrap.classList.add('afhov');
nav.dispatchEvent(new Event('pointerover', { bubbles: true }));
note('‼️ …so the button\\'s own panel stays silent while the menu is down', vis(), 'hidden');
document.body.dispatchEvent(new Event('pointerover', { bubbles: true }));

// And the press itself, on a trigger with nothing covering it.
const pbtn = document.querySelector('.af-tipw-nav > [data-afnav]');
const plain = pbtn.closest('.af-tipw');
const ptip = plain.querySelector('.af-tip');
plain.classList.add('afhov');
pbtn.dispatchEvent(new Event('pointerover', { bubbles: true }));
note('a plain nav button explains itself on hover', getComputedStyle(ptip).visibility, 'visible');
note('‼️ …at the longer delay, because it is a thing you press', getComputedStyle(ptip).transitionDelay.includes('0.6s'), true);
pbtn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
note('‼️ …and gets out of the way the moment it is pressed', getComputedStyle(ptip).visibility, 'hidden');
document.getElementById('log').textContent = out.join('\\n');
document.title = out.some(l => l.startsWith('FAIL')) ? 'CHECK FAILED' : 'CHECK OK';
`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Agent Farm — live header</title>
<style>
:root {
    --vscode-foreground:#cccccc; --vscode-editor-background:#1f1f1f;
    --vscode-editorWidget-background:#252526; --vscode-widget-border:#454545;
    --vscode-descriptionForeground:#9d9d9d; --vscode-button-background:#0078d4;
    --vscode-button-foreground:#ffffff; --vscode-button-secondaryBackground:#313131;
    --vscode-button-secondaryForeground:#cccccc; --vscode-menu-background:#252526;
    --vscode-menu-foreground:#cccccc; --vscode-menu-border:#454545;
    --vscode-list-hoverBackground:#2a2d2e; --vscode-focusBorder:#0078d4;
}
body { background:var(--vscode-editor-background); color:var(--vscode-foreground);
       font:13px "Segoe UI",sans-serif; padding:28px 24px; margin:0; }
#log { margin-top:180px; font:12px Consolas,monospace; color:#9d9d9d; white-space:pre; }
${sheet()}
</style></head>
<body>
<div id="head"></div>
<div id="log">nothing pressed yet</div>
<script>${read('media/afTip.js')}</script>
<script>${read('media/pageHeader.js')}</script>
<script>
try {
window.__AFUI__ = { notices: 0, queue: 0 };
const say = t => { document.getElementById('log').textContent = t; document.title = t; };
document.getElementById('head').innerHTML = AFHeader.html({
    title: 'Agent — live header',
    subtitle: 'the toolbar, running, so U-74 can be looked at rather than believed',
    page: 'agents',
    navActions: { console: { label: 'Talk to Agent', title: 'Console — talk to this agent, or open the page' } }
});
AFHeader.wire(
    { postMessage: m => say('posted ' + JSON.stringify(m)) },
    { navActions: { console: { onClick: () => say('claimed: Talk to Agent') } } }
);
${CHECK ? CHECKS : ''}
} catch (e) {
    document.getElementById('log').textContent = 'THREW: ' + (e && e.stack || e);
    document.title = 'CHECK FAILED';
}
</script>
</body></html>`;

fs.mkdirSync(path.join(ROOT, 'dist', 'render'), { recursive: true });
const out = path.join(ROOT, 'dist', 'render', `live_header${CHECK ? '.check' : ''}.html`);
fs.writeFileSync(out, page, 'utf8');
console.log(out);
