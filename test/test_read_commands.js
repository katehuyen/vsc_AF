// U-201 — READING FROM THE KEYBOARD AND THE RIGHT-CLICK. "Sound: Read Last Answer" reads the row
// it was pressed on, else the page in front (the Console's card, then a transcript; the tab the
// user is in before one merely on screen), else asks which live session — and its reading is
// alerts.readNow's own body. The five reading commands share ONE chord prefix that VS Code's own
// defaults (test/fixtures/vscode_default_keys.json, tools/vscode_default_keys.js) leave free.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { rowRef, readLastRef, readLastAnswer } = require(path.join(ROOT, 'out', 'core', 'readLast.js'));

// 1. which conversation
{
    ok('a row hands its session in any of its shapes', rowRef({ sessionId: ' s1 ' }) === 's1' && rowRef({ session: { sessionId: 's2' } }) === 's2'
        && rowRef('s3') === 's3' && rowRef(undefined) === '' && rowRef({ webviewSection: 'x' }) === '');
    const con = (active, visible, ref = 'c1') => ({ from: 'console', ref, active, visible });
    const tr = (active, visible, ref = 'D:/t/x.jsonl') => ({ from: 'transcript', ref, active, visible });
    ok('‼️ the row wins over everything in front', readLastRef('row1', [con(true, true)]).ref === 'row1' && readLastRef('row1', []).from === 'row');
    ok('the tab the user is in: the Console\'s card', readLastRef('', [con(true, true), tr(false, true)]).from === 'console');
    ok('…or the transcript, when that is the tab in front', readLastRef('', [con(false, true), tr(true, true)]).from === 'transcript');
    ok('nothing focused: the Console on screen before a transcript on screen', readLastRef('', [con(false, true), tr(false, true)]).from === 'console'
        && readLastRef('', [con(false, false), tr(false, true)]).from === 'transcript');
    ok('nothing on screen and no row: nothing chosen here', readLastRef('', [con(false, false), tr(false, false)]) === undefined
        && readLastRef('', [con(true, true, '')]) === undefined);
}

// 2. the command's body
(async () => {
    const run = async (o, arg) => {
        const said = [], reads = [], offered = [];
        const r = await readLastAnswer({
            facing: () => o.facing || [], live: () => o.live || [],
            choose: async items => { offered.push(items); return o.choose; },
            read: async ref => { reads.push(ref); if (o.refuse) { throw new Error(o.refuse); } return { label: 'developer #2' }; },
            say: t => said.push(t)
        }, arg);
        return { r, said, reads, offered };
    };
    let x = await run({ facing: [{ from: 'console', ref: 'c1', active: true, visible: true }] }, { webviewSection: 'afConsoleSession', sessionId: 'row9' });
    ok('pressed on a row: that row\'s conversation is read, no picker', x.reads.join() === 'row9' && x.r.from === 'row' && !x.offered.length);
    ok('…and the status bar says whose', /reading the last answer of developer #2/.test(x.said.join()));
    x = await run({ facing: [{ from: 'transcript', ref: 'D:/t/a.jsonl', active: true, visible: true }] });
    ok('from the palette with a transcript in front: its file is the ref readNow resolves', x.reads.join() === 'D:/t/a.jsonl' && x.r.from === 'transcript');
    x = await run({ live: [{ sessionId: 'L1', label: 'manager' }, { sessionId: 'L2', label: 'gozcu' }], choose: 'L2' });
    ok('nothing in front: the live sessions are offered and the one picked is read', x.offered.length === 1 && x.offered[0].length === 2 && x.reads.join() === 'L2' && x.r.from === 'picked');
    x = await run({ live: [{ sessionId: 'L1', label: 'manager' }], choose: undefined });
    ok('the picker closed: nothing is read, nothing is said', x.r === null && !x.reads.length && !x.said.length);
    x = await run({ live: [] });
    ok('‼️ nothing in front and nothing live: said so, no empty picker', x.r === null && !x.offered.length && /nothing to read/.test(x.said.join()));
    x = await run({ facing: [{ from: 'console', ref: 'c1', active: true, visible: true }], refuse: 'nothing in it can be spoken' });
    ok('a refusal is said by its own words and nothing is claimed', x.r === null && /Agent Farm: nothing in it can be spoken/.test(x.said.join()));

    // 3. the manifest: the command, one chord, the right-click
    const pkg = JSON.parse(read('package.json'));
    const cmd = (pkg.contributes.commands || []).find(c => c.command === 'agentfarm.readLastAnswer');
    ok('the command is declared under the Sound: family', !!cmd && cmd.title === 'Sound: Read Last Answer' && cmd.category === 'Agent Farm');
    const READING = ['agentfarm.readLastAnswer', 'agentfarm.pauseReading', 'agentfarm.stopReading', 'agentfarm.nextParagraph', 'agentfarm.previousParagraph'];
    const kb = pkg.contributes.keybindings.filter(k => READING.includes(k.command));
    const parts = k => k.split(' ');
    ok('all five reading commands have a shortcut', READING.every(c => kb.some(k => k.command === c)));
    ok('‼️ under ONE prefix: ctrl+alt+h, and ctrl+cmd+h on a Mac', kb.every(k => parts(k.key).length === 2 && parts(k.key)[0] === 'ctrl+alt+h'
        && parts(k.mac).length === 2 && parts(k.mac)[0] === 'ctrl+cmd+h'));
    ok('each second key is its own, the same on both', new Set(kb.map(k => parts(k.key)[1])).size === kb.length && kb.every(k => parts(k.key)[1] === parts(k.mac)[1]));
    ok('r reads the last answer, p pauses, s stops, → and ← move by paragraph',
        ['readLastAnswer r', 'pauseReading p', 'stopReading s', 'nextParagraph right', 'previousParagraph left']
            .every(w => kb.some(k => k.command === 'agentfarm.' + w.split(' ')[0] && parts(k.key)[1] === w.split(' ')[1])));
    const norm = k => { const p = k.toLowerCase().split('+'); const key = p.pop(); return [...p.sort(), key].join('+'); };
    const vs = JSON.parse(read('test', 'fixtures', 'vscode_default_keys.json'));
    ok('the defaults list is a real one (both systems, a version, hundreds of chords)', /^1\.\d+/.test(vs.windows.version) && vs.windows.first.length > 200 && vs.macos.first.length > 200);
    const winTaken = new Set(vs.windows.first.map(norm)), macTaken = new Set(vs.macos.first.map(norm));
    ok('‼️ VS Code binds nothing to the prefix on Windows / Linux', !winTaken.has(norm('ctrl+alt+h')));
    ok('‼️ …nor on a Mac (⌥⌘H is the system\'s Hide Others, so the Mac prefix is ⌃⌘H)', !macTaken.has(norm('ctrl+cmd+h')));
    const letter = kb.length ? parts(kb[0].key)[0].split('+').pop() : 'q';
    ok('the prefix types no character on a Turkish keyboard (AltGr+Q/E/T)', !['q', 'e', 't'].includes(letter));
    const menu = (pkg.contributes.menus['webview/context'] || []).find(m => m.command === 'agentfarm.readLastAnswer');
    ok('right-click on a Console card, a Timeline lane or agent, and a Turns row — only where a session is named',
        !!menu && ['afConsoleSession', 'afTimelineSession', 'afTimelineAgent', 'afTurnRow'].every(s => menu.when.includes(s)) && /&& sessionId$/.test(menu.when));

    // 4. the host: one body with the op, the page in front read from the tabs themselves
    const ext = read('src', 'extension.ts');
    ok('‼️ the command reads through alerts.readNow\'s own body', /registerCommand\('agentfarm\.readLastAnswer'[\s\S]{0,700}read: ref => readNow\(readerDeps, \{ sessionId: ref \}, 'command'\)/.test(ext));
    ok('the Console before the transcripts', /facing: \(\) => \[\.\.\.ConsolePanel\.facing\(\), \.\.\.SessionViewerPanel\.facing\(\)\]/.test(ext));
    ok('the controls keep alerts.reading\'s body', /registerCommand\('agentfarm\.pauseReading', \(\) => readingControl\('toggle'\)\)/.test(ext)
        && /const r = readingAct\(readerDeps, action\);/.test(ext));
    ok('the op says which command it is', /what Sound: Read Last Answer runs/.test(read('src', 'core', 'readerOps.ts')));
    ok('a Console card is in front when its tab is', /static facing\(\): Facing\[\][\s\S]{0,300}active: !!c\.surface\.active, visible: c\.surface\.visible/.test(read('src', 'panels', 'consolePanel.ts')));
    ok('a transcript tab names its own file', /static facing\(\): Facing\[\][\s\S]{0,200}ref: file, active: !!p\.host\.active, visible: p\.host\.visible/.test(read('src', 'panels', 'sessionViewer.ts')));
    ok('a VS Code tab knows whether it is the one in front', /get active\(\) \{ return panel\.active; \}/.test(read('src', 'panels', 'panelHost.ts')));

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
