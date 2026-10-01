// U-181 — A SESSION'S SOUND, ON ITS CONSOLE CARD. The composer's status line
// carries one speaker that says the session's state and opens the shared
// session panel; a ■ follows it while its answer is being read aloud; the card
// carries a mark ONLY when the session sounds different from the rest, in the
// line-2 badge group, and the card does not grow a line for it (measured).
// The host must SEND the view, repaint when a preference changes (never on the
// lastSeenAt touch every refresh makes), know WHOSE answer is being read, and
// stop it through the function `alerts.read stop` runs.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// ---- the core: one view, three states, the reading on top ----
const { soundCardView, ReadingNow } = require(path.join(ROOT, 'out', 'core', 'soundCard.js'));
const base = { sound: 'like-all', ownTone: false, read: false, reading: false };
const v0 = soundCardView(base);
ok('like all: the speaker is 🔊 and the card carries no mark', v0.icon === '🔊' && v0.badge === '');
ok('…and its hover says Label: value lines', v0.lines.join('|') === 'Sound: Like all|Tone: the fleet\'s|Read aloud: off');
ok('silent: 🔇 on both', soundCardView({ ...base, sound: 'silent' }).icon === '🔇' && soundCardView({ ...base, sound: 'silent' }).badge === '🔇');
ok('always: 🔔 on both', soundCardView({ ...base, sound: 'always' }).icon === '🔔' && soundCardView({ ...base, sound: 'always' }).badge === '🔔');
ok('a tone of its own marks the card 🔔 while the speaker stays 🔊',
    soundCardView({ ...base, ownTone: true }).badge === '🔔' && soundCardView({ ...base, ownTone: true }).icon === '🔊');
ok('Read aloud switched on but idle draws no mark of its own', soundCardView({ ...base, read: true }).badge === '');
const rs = soundCardView({ ...base, sound: 'silent', read: true, reading: true });
ok('‼️ the reading outranks Silent on the card (Silent does not stop a reading)', rs.badge === '🔊■' && rs.icon === '🔇');
ok('…and says so first', rs.head === 'Reading its answer aloud now' && rs.lines[2] === 'Read aloud: reading now');

(async () => {
    let changed = 0;
    const rn = new ReadingNow(() => { changed++; });
    let finish;
    rn.start('s1', new Promise(r => { finish = r; }));
    ok('a reading names its session at once', rn.is('s1') && !rn.is('s2') && changed === 1);
    let finish2;
    rn.start('s2', new Promise(r => { finish2 = r; }));
    finish();
    await new Promise(r => setTimeout(r, 0));
    ok('‼️ an older reading ending does not clear the newer one', rn.is('s2') && !rn.is('s1'));
    finish2();
    await new Promise(r => setTimeout(r, 0));
    ok('…and the newer one clears itself when its player exits', rn.current === '' && changed === 3);
    rn.start('s3', new Promise(() => { }));
    rn.stop();
    ok('stop clears it by hand', rn.current === '' && !rn.is('s3'));
    const before = changed;
    rn.stop();
    ok('…and a stop with nothing being read repaints nothing', changed === before);
    const rejected = new ReadingNow();
    rejected.start('s4', Promise.reject(new Error('player failed')));
    await new Promise(r => setTimeout(r, 0));
    ok('a failed player clears the reading too', rejected.current === '');

    // ---- the store repaints on a preference, never on the touch ----
    const { TurnAlertStore } = require(path.join(ROOT, 'out', 'core', 'turnAlerts.js'));
    let fired = 0;
    const store = new TurnAlertStore({
        read: () => ({}), write: () => undefined, readMigration: () => 1, writeMigration: () => undefined,
        changed: () => { fired++; }
    });
    store.setMuted('sid-1', true);
    ok('‼️ a preference written fires changed', fired === 1);
    store.seen(['sid-1']);
    ok('‼️ …and the lastSeenAt touch every refresh makes does not', fired === 1);
    store.setReadAloud('sid-1', true);
    ok('every setter goes through the same door', fired === 2);

    // ---- the page ----
    const fixture = require(path.join(__dirname, 'fixtures', 'console.js'));
    const data = fixture.data();
    const r = runPage('console.js', data);
    const doc = r.sandbox.document;
    const status = (doc.getElementById('c-status') || {}).innerHTML || '';
    const list = (doc.getElementById('c-list') || {}).innerHTML || '';
    const cardOf = sid => {
        const at = list.indexOf(`data-cdot="live|${sid}"`);
        return at < 0 ? '' : list.slice(list.lastIndexOf('class="srow', at), at);
    };
    const sel = data.sessions.find(s => s.id === data.selected);
    ok('the fixture reads the selected card aloud', sel.soundView.reading === true);
    ok('‼️ the status line carries the speaker, between ⑂+ and Open transcript',
        /id="c-sound"[^>]*>🔊<\/button>/.test(status)
        && status.indexOf('id="c-sound"') < status.indexOf('id="c-transcript"'));
    ok('…and the ■ follows it while the answer is read', /id="c-sound"[\s\S]*id="c-readstop"[^>]*>■<\/button>/.test(status));
    ok('…with a hover in Label: value lines', /Sound: Like all/.test(status) && /Read aloud: reading now/.test(status));
    const silent = data.sessions.find(s => s.soundView && s.soundView.sound === 'silent');
    const always = data.sessions.find(s => s.soundView && s.soundView.sound === 'always');
    const plain = data.sessions.find(s => s.sessionId && s.soundView && !s.soundView.badge);
    ok('the fixture carries a Silent, an Always and a plain card', !!(silent && always && plain));
    ok('‼️ a Silent card is marked 🔇 in its line-2 badge group',
        new RegExp(`<div class="h2">[\\s\\S]*data-csound="${silent.sessionId}"[^>]*>🔇<`).test(cardOf(silent.sessionId)));
    ok('an Always card is marked 🔔', new RegExp(`data-csound="${always.sessionId}"[^>]*>🔔<`).test(cardOf(always.sessionId)));
    ok('the card being read is marked 🔊■', new RegExp(`data-csound="${sel.sessionId}"[^>]*>🔊■<`).test(cardOf(sel.sessionId)));
    ok('‼️ a card that sounds like the rest carries no mark at all', !/data-csound=/.test(cardOf(plain.sessionId)));
    ok('a card with no session yet carries none either', data.sessions.some(s => !s.sessionId)
        && (list.match(/data-csound=/g) || []).length === 3);

    const fire = (el, type) => (el && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));
    r.posted.length = 0;
    fire(doc.querySelectorAll('[data-csound]').find(e => e.dataset.csound === silent.sessionId), 'click');
    ok('‼️ a press on the mark opens THAT session\'s panel and does not select the card',
        r.posted.some(m => m.type === 'alertSessionOpen' && m.sessionId === silent.sessionId)
        && !r.posted.some(m => m.type === 'select'));
    r.posted.length = 0;
    fire(doc.getElementById('c-sound'), 'click');
    ok('the speaker opens the selected session\'s panel', r.posted.some(m => m.type === 'alertSessionOpen' && m.sessionId === sel.sessionId));
    r.posted.length = 0;
    fire(doc.getElementById('c-readstop'), 'click');
    ok('the ■ asks the host to stop reading', r.posted.some(m => m.type === 'alertReadStop'));

    // ---- the host half ----
    const { handleAlertMessage } = require(path.join(ROOT, 'out', 'panels', 'alertMessages.js'));
    let stopped = 0;
    const handled = await handleAlertMessage({ type: 'alertReadStop' }, { alertsStopReading: async () => { stopped++; } },
        { error() { }, refresh() { } });
    ok('‼️ alertReadStop is answered by the shared handler, through alertsStopReading', handled === true && stopped === 1);
    const ext = src('src/extension.ts');
    const panel = src('src/panels/consolePanel.ts');
    ok('the panel SENDS each card its sound view', /soundView: s\.sessionId \? \(this\.deps\.soundCard\?\.\(s\.sessionId\) \?\? null\) : null/.test(panel));
    ok('…built by the core from the same store reads alerts.session uses',
        /const consoleSoundCard = \(id: string\) => soundCardView\(\{\s*sound: soundOf\(turnAlerts\.actionsFor\(id\), turnAlerts\.mutedFor\(id\)\)/.test(ext));
    ok('‼️ the reader names whose answer it reads', /readingNow\.start\(s\.sessionId, dialogue\.speak\(/.test(ext));
    ok('‼️ alerts.read stop and the ■ are ONE function', /const was = alertsStopReading\(\);/.test(ext)
        && /alertsStopReading: async \(\) => \{ alertsStopReading\(\); \}/.test(ext)
        && !/dialogue\.stop\(\);\s*\n\s*\/\/ Reported honestly/.test(ext));
    ok('…and turning a reading off stops it the same way', /if \(!next\) \{ alertsStopReading\(\); \}/.test(ext));
    ok('the store repaints the Console on a preference change', /changed: soundRepaint,/.test(ext));
    ok('‼️ the palette picks a session and opens its panel in the Console',
        /if \(ConsolePanel\.openSound\(id\)\) \{ return; \}/.test(ext)
        && /static openSound\(sessionId: string\): boolean/.test(panel)
        && /act: 'soundPop', ctx: \{ sessionId \}/.test(panel));

    // ---- measured: the mark costs the card no line ----
    const CANDIDATES = [process.env.AF_CHROME,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
        console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
    } else {
        const node = args => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });
        node([path.join('test', 'render_page.js'), 'console']);
        const EXPR = "(()=>{const h=e=>Math.round(e.getBoundingClientRect().height*10)/10;"
            + "const rows=[...document.querySelectorAll('.srow:not([data-resume])')].filter(r=>r.querySelector('.h2'));"
            + "return rows.map(r=>({mark:!!r.querySelector('[data-csound]'),h2:h(r.querySelector('.h2'))}));})()";
        let rows;
        try { rows = JSON.parse(node([path.join('test', 'measure_page.js'), 'console', EXPR])); } catch { rows = null; }
        const marked = (rows || []).filter(x => x.mark), bare = (rows || []).filter(x => !x.mark);
        ok('the page was measured, with marked and unmarked cards', marked.length > 0 && bare.length > 0);
        // A card with no session id yet has an emptier line 2 (16 against 17),
        // so the guard is "the mark adds nothing", not "every card is alike".
        const top = xs => Math.max(...xs.map(x => x.h2));
        ok('‼️ A CARD WITH A SOUND MARK IS NO TALLER: its line 2 is no higher than an unmarked card\'s'
            + (rows ? ` (marked ${top(marked)} · unmarked ${top(bare)})` : ''),
            marked.length > 0 && bare.length > 0 && top(marked) <= top(bare) + 0.5);
    }

    console.log(`\ntest_console_sound: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
