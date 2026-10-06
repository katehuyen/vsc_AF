// U-206 (a, c) — THE READING SEEN WHILE IT LASTS, FROM ANY PAGE.
//
// (a) The header's 🔊 turns into the reading (🗣️, ⏸️ paused) and a click opens a small
//     player — whose words, which paragraph, ⏮ ⏸/▶ ⏭ ■ and the speed. Its buttons go
//     through the one route every page already has (afnav → handleAfNav), which runs
//     the reading's own commands; nothing is wired per page.
// (c) The transcript and the Console mark the paragraph being read and keep it in view,
//     until the reader scrolls by hand. Checked in a real Chrome, because the mark is a
//     CSS highlight and the follow is a scroll — neither exists in the DOM shim.
//
//   node test/test_reading_follow.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const out = (...p) => require(path.join(ROOT, 'out', ...p));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const H = out('core', 'soundHeader.js');
const B = out('core', 'readingBadge.js');
const { ReadingNow } = out('core', 'soundCard.js');
const { readingView } = out('core', 'readerOps.js');
const { paragraphHead } = out('core', 'reader.js');

const base = { muted: false, quietInside: false, quietConfigured: false, quietLine: '', armed: ['question'], silentSessions: [] };
const at = o => Object.assign({ paragraph: 1, paragraphs: 3, sentence: 0, word: 0, wordLen: 0, paused: false, rate: 2, live: true }, o);
const badge = B.readingBadge({ sessionId: 'aaaa1111-x', surface: 'transcript', turn: 3 }, at(), 'developer #3');

// ---------------------------------------------------------------- 1. the state the header draws
{
    ok('the badge carries what the player draws: label, paragraph, speed',
        badge.label === 'developer #3 · 2/3' && badge.paragraph === 'Paragraph 2 of 3' && badge.rate === 2);
    ok('…and before the player speaks the speed is not known', B.readingBadge({ sessionId: '', surface: 'bridge' }, null, '').rate === null);
    const s = H.soundHeader({ ...base, reading: badge });
    ok('reading: the 🔊 becomes 🗣️, named by the reading', s.state === 'reading' && s.icon === '🗣️'
        && s.head === 'Sound — reading: developer #3 · 2/3');
    ok('MIRROR — the hover opens with the reading, then what rings', s.lines[0] === 'Reading: developer #3 — turn 3\'s answer'
        && s.lines.includes('') && s.lines[s.lines.length - 1] === 'Rings: Asking you');
    ok('the player\'s state rides with it', JSON.stringify(s.reading)
        === JSON.stringify({ head: 'Reading: developer #3 — turn 3\'s answer', paragraph: 'Paragraph 2 of 3', paused: false, rate: 2 }));
    const p = H.soundHeader({ ...base, muted: true, reading: B.readingBadge({ sessionId: '', surface: 'selection' }, at({ paused: true }), '') });
    ok('paused: ⏸️ — and a reading outranks Mute all, which never silences an ask', p.state === 'paused' && p.icon === '⏸️' && p.reading.paused);
    const none = H.soundHeader({ ...base, reading: null });
    ok('nothing read: the state it always had, and no player', none.state === 'on' && !('reading' in none));
}

// ---------------------------------------------------------------- 2. the paragraph's first words
{
    ok('a paragraph\'s head is its first twelve words', paragraphHead(' one two three four five six seven eight nine ten eleven twelve thirteen ')
        === 'one two three four five six seven eight nine ten eleven twelve');
    const rn = new ReadingNow();
    rn.start('s1', new Promise(() => undefined), { surface: 'transcript', msg: 'a1' }, ['First words.', 'Second paragraph here.']);
    const deps = { readingNow: rn, dialogue: { speaking: true, state: at({ paragraph: 1, paragraphs: 2 }) } };
    ok('the reading view carries the head of the paragraph being read',
        JSON.stringify(readingView(deps)) === '{"sessionId":"s1","key":"a1","paused":false,"head":"Second paragraph here."}');
    rn.stop();
    ok('…and a stopped reading forgets them', rn.headOf(1) === '' && readingView(deps) === null);
    const ops = read('src', 'core', 'readerOps.ts');
    ok('every reading asked for hands its paragraphs\' heads over', /readingNow\.start\([^;]*paras\.map\(p => paragraphHead\(p\)\)\)/.test(ops));
}

// ---------------------------------------------------------------- 3. one route on every page
{
    const ran = [];
    const fake = new Proxy({ commands: { executeCommand: (...a) => { ran.push(a); return Promise.resolve(); } } }, {
        get: (t, k) => (k in t ? t[k] : new Proxy(function () { }, { get: () => () => undefined }))
    });
    const load = Module._load;
    Module._load = function (req, ...rest) { return req === 'vscode' ? fake : load.call(this, req, ...rest); };
    const { handleAfNav } = out('panels', 'base.js');
    Module._load = load;
    const go = to => { ran.length = 0; handleAfNav(to); return JSON.stringify(ran); };
    ok('⏸/▶ ⏭ ⏮ ■ run the reading\'s own commands', go('reading:toggle') === '[["agentfarm.pauseReading"]]'
        && go('reading:next') === '[["agentfarm.nextParagraph"]]' && go('reading:prev') === '[["agentfarm.previousParagraph"]]'
        && go('reading:stop') === '[["agentfarm.stopReading"]]');
    ok('the speed is Sound: Reading Speed with the number', go('reading:rate:-3') === '[["agentfarm.readingSpeed",-3]]'
        && go('reading:rate:10') === '[["agentfarm.readingSpeed",10]]');
    ok('anything else under reading: runs nothing', go('reading:shout') === '[]' && go('reading:rate:999') === '[]' && go('reading:') === '[]');
    ok('…and the plain nav still navigates', go('sound') === '[["agentfarm.openSound"]]');
    const pkg = JSON.parse(read('package.json'));
    const cmds = new Set(pkg.contributes.commands.map(c => c.command));
    ok('every command it routes to is a real, contributed command', ['agentfarm.pauseReading', 'agentfarm.nextParagraph',
        'agentfarm.previousParagraph', 'agentfarm.stopReading', 'agentfarm.readingSpeed'].every(c => cmds.has(c)));
    const ext = read('src', 'extension.ts');
    ok('Sound: Reading Speed is registered on the reading\'s one body', /registerCommand\('agentfarm\.readingSpeed', \(rate\?: unknown\) => readingSpeed\(rate\)\)/.test(ext)
        && /const readingSpeed = async[\s\S]{0,400}readingAct\(readerDeps, '', rate\)/.test(ext));
    ok('every reading change pushes the header, and the header reads the same badge as the bar',
        /const readingRepaint = \(\): void => \{[^}]*pushSoundHeader\(\);/.test(ext) && /reading: readingBadgeNow\(\)/.test(ext)
        && /new ReadingStatusBar\(\{ view: readingBadgeNow \}\)/.test(ext));
    const manifest = JSON.parse(read('parity.manifest.json'));
    ok('parity: Sound: Reading Speed is alerts.reading', manifest.entries.some(e => e.ui.includes('cmd:agentfarm.readingSpeed')
        && (e.ops || []).includes('alerts.reading')));
}

// ---------------------------------------------------------------- 4. the header's player, in the page shell
{
    const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
    const needs = require(path.join(__dirname, 'fixtures', 'needs.js'));
    const sound = H.soundHeader({ ...base, reading: badge });
    // timers run when the test says so, once each — a page's self-re-arming tick never loops here
    const timers = [];
    const flush = () => timers.splice(0).forEach(f => f());
    const p = runPage(needs.script, needs.data(), { __AFUI__: { sound }, setTimeout: f => { timers.push(f); return 0; } });
    const send = m => { p.send(m); flush(); };
    const btn = () => p.query('[data-afsound]')[0];
    const P = p.sandbox.window.AFReadingPlayer;
    ok('the header draws the reading: 🗣️, its name, and the click line for the player', btn().dataset.afsound === 'reading'
        && /aria-label="Sound — reading: developer #3 · 2\/3"/.test(p.html()) && /Click opens the player/.test(p.html()));
    btn().dispatchEvent(new p.sandbox.Event('click'));
    ok('a click opens the player instead of going to the Sound page', !!P && P.isOpen()
        && !(p.last() && p.last().type === 'afnav' && p.last().to === 'sound'));
    const box = () => (p.els['af-rp'] || {})._html || '';
    ok('the player: whose words, the paragraph, ⏮ ⏸ ⏭ ■ and the speed', /Reading: developer #3 — turn 3's answer/.test(box())
        && /Paragraph 2 of 3/.test(box()) && /data-afrp="prev"/.test(box()) && /data-afrp="toggle"[^>]*>⏸</.test(box())
        && /data-afrp="next"/.test(box()) && /data-afrp="stop"/.test(box()) && /<b>2<\/b>/.test(box()));
    const press = act => { p.query(`[data-afrp="${act}"]`)[0].dispatchEvent(new p.sandbox.Event('click')); return p.last(); };
    ok('its buttons go the one shared way: afnav reading:<act>', press('toggle').to === 'reading:toggle' && press('stop').to === 'reading:stop'
        && press('next').to === 'reading:next' && press('prev').to === 'reading:prev' && p.last().type === 'afnav');
    ok('− and + ask for the speed one step either side', press('rate:1').to === 'reading:rate:1' && press('rate:3').to === 'reading:rate:3');
    send({ type: 'afui', afui: { sound: H.soundHeader({ ...base, reading: B.readingBadge({ sessionId: 'aaaa1111-x', surface: 'transcript', turn: 3 }, at({ paused: true, rate: 10 }), 'developer #3') }) } });
    ok('a push repaints it in place: paused shows ▶, and + stops at the fastest', /data-afrp="toggle"[^>]*>▶</.test(box())
        && /data-afrp="rate:11"[^>]*disabled/.test(box()));
    send({ type: 'afui', afui: { sound: H.soundHeader(base) } });
    ok('the reading over: the player closes and the 🔊 is a link to the Sound page again', !P.isOpen() && btn().getAttribute('data-afsound') === 'on');
    btn().dispatchEvent(new p.sandbox.Event('click'));
    ok('…so its click navigates', p.last().type === 'afnav' && p.last().to === 'sound');
    ok('the 🔊\'s own hover stays shut while the player is open', /data-aftip-mute="body\.af-rp-open"/.test(read('media', 'pageHeader.js')));
}

// ---------------------------------------------------------------- 5. the paragraph found in the step's text
{
    const vm = require('vm');
    const sb = { window: {}, document: {} };
    vm.createContext(sb);
    vm.runInContext(read('media', 'afReadAloud.js'), sb);
    const R = sb.window.AFRead;
    const text = '## Plan\n\nThe view is **derived once** in the `core`.\n\n- first item\n- second item\n\n```ts\nconst v = 1;\n```\n\nŞimdi İstanbul’a gidiyoruz, dedi.';
    const cut = r => (r ? text.slice(r[0], r[1]) : null);
    ok('the markdown the speech dropped does not stop the match', cut(R.blockOf(text, 'The view is derived once in the core.')) === 'The view is **derived once** in the `core`.');
    ok('a list said as one paragraph marks the whole list', cut(R.blockOf(text, 'first item. second item.')) === '- first item\n- second item');
    ok('Turkish letters are matched as letters', cut(R.blockOf(text, 'Şimdi İstanbul’a gidiyoruz, dedi.')) === 'Şimdi İstanbul’a gidiyoruz, dedi.');
    ok('a code block said by its size matches nothing', R.blockOf(text, 'A code block of 1 line.') === null);
    ok('a first word the speech re-said still finds the paragraph', cut(R.blockOf(text, 'Look: the view is derived once in the core.')) === 'The view is **derived once** in the `core`.');
    ok('too few letters to be sure is no match', R.blockOf(text, 'a b') === null && R.blockOf('', 'anything at all') === null);
}

// ---------------------------------------------------------------- 6. marked and followed, in a real Chrome
let bin;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) {
    console.log('  (no Chrome here — the highlight and the follow are not measured)');
} else {
    const { headlessFlags } = require('./headless_chrome');
    const para = n => `Paragraph ${n} says something about the plan, line after line, so the row is tall enough to scroll.`;
    const long = [1, 2, 3, 4, 5, 6, 7, 8].map(para).join('\n\n');
    const rows = ['k1', 'k2', 'k3', 'k4'].map(k => `<div class="msg"><button data-read="${k}" data-read-sid="S"></button>`
        + `<div class="body">${k === 'k3' ? long : 'A short step ' + k + '.'}</div></div>`).join('');
    const MARK = 'AF-FOLLOW';
    const run = script => {
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>#msgs{height:220px;overflow:auto;width:420px}'
            + '.body{white-space:pre-wrap}</style></head><body><div id="msgs">' + rows + '</div><script>'
            + read('media', 'afReadAloud.js').replace(/<\/script/gi, '<\\/script') + '</script><script>' + script
            + '</script></body></html>';
        const file = path.join(os.tmpdir(), 'af-follow-' + process.pid + '.html');
        fs.writeFileSync(file, html, 'utf8');
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-follow-'));
        try {
            // a smooth scroll does not advance on virtual time; the page scrolls at once for a reader who asked for less motion
            const dom = execFileSync(bin, headlessFlags(profile).concat(['--window-size=600,400', '--virtual-time-budget=4000', '--force-prefers-reduced-motion',
                '--dump-dom', 'file:///' + file.replace(/\\/g, '/')]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
            const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
            return m ? JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
        } finally {
            fs.rmSync(file, { force: true });
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
        }
    };
    const report = 'function report(o){document.body.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";document.getElementById("' + MARK + '").textContent=JSON.stringify(o);}'
        + 'function seen(){var h=CSS.highlights.get("af-reading");var r=h&&[...h][0];var box=document.getElementById("msgs").getBoundingClientRect();'
        + 'var b=r&&r.getBoundingClientRect();return {text:r?String(r):"",top:document.getElementById("msgs").scrollTop,inView:!!b&&b.top>=box.top&&b.bottom<=box.bottom,'
        + 'styled:[...document.styleSheets].some(function(s){return [...s.cssRules].some(function(c){return /::highlight\\(af-reading\\)/.test(c.cssText)&&/background/.test(c.cssText);});})};}';
    const live = run(report + 'AFRead.init(function(){}, {sessionId:"S",key:"k3",paused:false,head:"Paragraph 6 says something about the plan, line after line, so"});'
        + 'setTimeout(function(){var a=seen();AFRead.set({sessionId:"S",key:"k3",paused:false,head:"Paragraph 8 says something about the plan"});'
        + 'setTimeout(function(){report({a:a,b:seen()});},600);},600);');
    if (process.argv.includes('--show')) { console.log(JSON.stringify(live)); }
    ok('the paragraph being read is marked — that paragraph, whole, and nothing else', !!live && live.a.text === para(6));
    ok('…in a colour of its own: the page carries the highlight\'s rule', !!live && live.a.styled === true);
    ok('…and brought into view inside the box that scrolls it', !!live && live.a.inView && live.a.top > 0);
    ok('the reading moves on: the mark and the view follow', !!live && live.b.text === para(8) && live.b.inView && live.b.top > live.a.top);
    const away = run(report + 'AFRead.init(function(){}, {sessionId:"S",key:"k3",paused:false,head:"Paragraph 2 says something about the plan"});'
        + 'setTimeout(function(){window.dispatchEvent(new WheelEvent("wheel",{deltaY:-50}));document.getElementById("msgs").scrollTop=0;'
        + 'AFRead.set({sessionId:"S",key:"k3",paused:false,head:"Paragraph 8 says something about the plan"});'
        + 'setTimeout(function(){report({b:seen(),following:AFRead.following()});},600);},600);');
    ok('‼️ the reader scrolls by hand: the mark still moves, the page does not', !!away && away.b.text === para(8)
        && away.b.top === 0 && away.following === false);
    const gone = run(report + 'AFRead.init(function(){}, {sessionId:"S",key:"k3",paused:false,head:"Paragraph 2 says something about the plan"});'
        + 'setTimeout(function(){AFRead.set(null);setTimeout(function(){report(seen());},300);},300);');
    ok('the reading over: nothing stays marked', !!gone && gone.text === '');
}

console.log(`test_reading_follow: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
