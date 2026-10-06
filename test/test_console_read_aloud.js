// U-200 — the Console's messages: a ⧉ (the whole text) and a 🔊 over each
// prompt and answer, shown on hover; ■ / ▶ on the message being read; ▶ Read
// last answer beside the speaker. Pressed on POINTERDOWN through #talk, which
// outlives the conversation's rewrites. The row's layout does not move — that
// half is measured on the rendered page.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const scene = id => require('./fixtures/console').variants().find(v => v.id === id).data;
const SID = '019fe859-3b4d-7b03';

const reads = p => (p.html().match(/data-read="[^"]*"/g) || []).map(s => s.slice(11, -1));
const btn = (p, sel) => p.query(sel)[0];
/** A press as the browser delivers it: pointerdown on #talk, its target inside the button and the row. */
const press = (p, b, mid) => {
    b.closest = s => (s === '.msg[data-mid]' ? { dataset: { mid } } : null);   // the shim's elements have no ancestors
    p.els.talk.fire('pointerdown', { target: { closest: s => (s === '.macts>button' ? b : null) } });
};

{
    const p = runPage('console.js', scene('console-read-hover'));
    ok('a prompt and an answer each carry the cluster; tool rows none',
        (p.html().match(/class="macts"/g) || []).length === 3 && reads(p).join() === ',a-m4,');
    ok('…⧉ beside the 🔊', /data-read="a-m4"[^>]*>🔊<\/button><button data-mcopy="1"/.test(p.html()));

    const copy = btn(p, 'button[data-mcopy]');
    p.posted.length = 0;
    press(p, copy, 'm4');
    ok('⧉ copies the WHOLE message through the shell\'s clipboard', p.posted.some(m => JSON.stringify(m).includes('hello from agent farm')));

    p.posted.length = 0;
    const read = p.query('button[data-read]').find(b => b.dataset.read === 'a-m4');
    press(p, read, 'm4');
    ok('‼️ 🔊 on an answer reads its transcript line, on THIS card\'s conversation, as the Console',
        p.last().type === 'readAloud' && p.last().sessionId === SID && JSON.stringify(p.last().pick) === '{"msg":"a-m4"}'
        && p.last().surface === 'console');
    p.posted.length = 0;
    press(p, p.query('button[data-read]').find(b => b.dataset.read === ''), 'm1');
    ok('a row with no line of its own is read by its words', p.last().type === 'readAloud'
        && p.last().pick.text === 'Read note.txt and tell me what is in it.');

    p.send({ type: 'reading', reading: { sessionId: SID, key: 'a-m4', paused: false } });
    ok('the broadcast paints ■ on the answer being read, in place', read.textContent === '■');
    p.posted.length = 0;
    press(p, read, 'm4');
    ok('pressing ■ stops it', p.last().type === 'readControl' && p.last().action === 'stop');
    p.send({ type: 'readRefused', error: 'no answer in words yet' });
    ok('a refusal is a toast in the host\'s words', /no answer in words/.test((p.els['afctx-toast'] || {}).textContent || ''));
}
{
    const p = runPage('console.js', scene('console-reading'));
    ok('a page opened mid-reading draws the lit ■ from its data', /data-read="a-m4"[^>]*class="readb on"[^>]*>■/.test(p.html()));
    ok('…and while something is read the status line keeps its ■, not ▶', !p.html().includes('id="c-readlast"'));
}
{
    const p = runPage('console.js', scene('console-readlast'));
    const last = btn(p, '#c-readlast');
    ok('nothing being read: ▶ Read last answer beside the speaker', !!last);
    p.posted.length = 0;
    if (last) { last.click(); }
    ok('…which reads the conversation\'s last answer', p.last() && p.last().type === 'readAloud'
        && p.last().sessionId === SID && JSON.stringify(p.last().pick) === '{}');
}
{
    const p = runPage('console.js', scene('console-readlast'), { __AFUI__: { remote: true } });
    ok('‼️ on a phone: ⧉ stays, no 🔊 and no ▶ — reading plays on the PC',
        reads(p).length === 0 && p.html().includes('data-mcopy') && !p.html().includes('id="c-readlast"'));
}

// ---------------------------------------------------------------- measured: the row does not move
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium'];
if (!CHROME.some(c => c && fs.existsSync(c))) {
    console.log('  (no Chrome on this machine — the measured half is skipped)');
} else {
    const node = args => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
    node([path.join('test', 'render_page.js'), 'console']);
    const EXPR = "(()=>{const out=[];let n=0;document.querySelectorAll('.msg').forEach(r=>{const a=r.querySelector(':scope>.macts');if(!a)return;n++;"
        + "if(getComputedStyle(a).position!=='absolute')out.push('not absolute');"
        + "const h=r.getBoundingClientRect().height,w=r.getBoundingClientRect().width;const nx=a.nextSibling;const par=a.parentNode;a.remove();"
        + "const h2=r.getBoundingClientRect().height,w2=r.getBoundingClientRect().width;par.insertBefore(a,nx);"
        + "if(Math.abs(h-h2)>0.5||Math.abs(w-w2)>0.5)out.push((r.dataset.mid||'?')+' '+h+'/'+h2);});return {n,out};})()";
    let found = null;
    try { found = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', EXPR])); } catch { found = null; }
    ok('‼️ MEASURED: the cluster takes no room — every row is the same size with it as without it'
        + (found && found.out.length ? ': ' + found.out.slice(0, 5).join(' · ') : ''),
        !!found && found.n > 0 && found.out.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
