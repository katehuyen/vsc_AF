// U-206 (b) — THE STATUS BAR ITEM THAT EXISTS ONLY WHILE A READING LASTS: whose words, where the
// player is, paused or not; a click pauses, the hover carries the reading's four commands.
//
//   node test/test_reading_bar.js
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const B = require(path.join(ROOT, 'out', 'core', 'readingBadge.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

// --- the badge ---
const at = (o) => Object.assign({ paragraph: 2, paragraphs: 9, sentence: 0, word: 0, wordLen: 0, paused: false, rate: 0, live: true }, o);
ok('nothing read: no badge — the item is hidden (A-22: no idle icon)', B.readingBadge(null, null, 'x') === null);
const a = B.readingBadge({ sessionId: 'aaaa1111-full', surface: 'auto', turn: 4 }, at(), 'developer #3');
eq('a conversation: its label and the paragraph, counted from 1', a.text, '$(unmute) developer #3 · 3/9');
eq('…the hover says whose turn and where', a.lines, ['Reading: developer #3 — turn 4\'s answer', 'Paragraph 3 of 9']);
const p = B.readingBadge({ sessionId: 'aaaa1111-full', surface: 'bridge' }, at({ paused: true, rate: 3 }), '');
ok('paused: the pause sign, Paused, the speed — and an unknown label is the id\'s first 8',
    p.paused && p.text === '$(debug-pause) aaaa1111 · 3/9' && p.lines[0] === 'Paused: aaaa1111' && p.lines.includes('Speed 3'));
ok('one paragraph says no count; before the player speaks it is starting',
    B.readingBadge({ sessionId: '', surface: 'bridge' }, at({ paragraph: 0, paragraphs: 1 }), '').text === '$(unmute) a text'
    && B.readingBadge({ sessionId: '', surface: 'bridge' }, null, '').lines[0] === 'Starting to read: a text');
eq('free text is named by who asked', ['selection', 'sound', 'page'].map(s => B.readingWho({ sessionId: '', surface: s }, '')),
    ['your selection', 'the sample', 'a text']);

// --- the item, against a stand-in vscode ---
const items = [];
class MarkdownString {
    constructor(v, icons) { this.value = v || ''; this.supportThemeIcons = icons; }
    appendText(t) { this.value += t.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&'); return this; }
    appendMarkdown(t) { this.value += t; return this; }
}
const fakeVscode = {
    StatusBarAlignment: { Left: 1, Right: 2 }, MarkdownString,
    window: { createStatusBarItem: (align, prio) => { const it = { align, prio, shown: false, show() { this.shown = true; }, hide() { this.shown = false; }, dispose() { this.disposed = true; } }; items.push(it); return it; } }
};
const load = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? fakeVscode : load.call(this, req, ...rest); };
const { ReadingStatusBar, READING_BAR_COMMANDS } = require(path.join(ROOT, 'out', 'views', 'readingBar.js'));
Module._load = load;
let view = null;
const bar = new ReadingStatusBar({ view: () => view });
const it = items[0];
ok('one item, left of the bar beside the mute, hidden while nothing is read, a click pauses',
    items.length === 1 && it.align === 1 && it.prio === 85 && !it.shown && it.command === 'agentfarm.pauseReading');
view = a;
bar.update();
ok('a reading shows it with the badge\'s text', it.shown && it.text === '$(unmute) developer #3 · 3/9');
const tip = it.tooltip.value;
ok('the hover: the lines, then Pause · Previous · Next · Stop as command links',
    /^Reading: developer \\#3 — turn 4's answer {2}\nParagraph 3 of 9\n\n/.test(tip)
    && READING_BAR_COMMANDS.every(c => tip.includes(`(command:${c})`)) && /\$\(debug-pause\) Pause\]/.test(tip));
ok('…trusted for exactly those four commands', JSON.stringify(it.tooltip.isTrusted.enabledCommands) === JSON.stringify(READING_BAR_COMMANDS));
view = p;
bar.update();
ok('paused: the first link resumes', /\$\(debug-start\) Resume\]\(command:agentfarm\.pauseReading\)/.test(it.tooltip.value));
view = null;
bar.update();
ok('the reading over: hidden again', !it.shown);
bar.dispose();
ok('disposed with the extension', it.disposed === true);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cmds = new Set(pkg.contributes.commands.map(c => c.command));
ok('every command it links is a real command', READING_BAR_COMMANDS.every(c => cmds.has(c)));

// --- the wiring ---
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('every reading change repaints it — start, end, pause, paragraph, rate', /const readingRepaint = \(\): void => \{[^}]*readingBar\?\.update\(\);/.test(ext)
    && /new DialogueSpeaker\(\{ onChange: readingRepaint \}\)/.test(ext) && /new ReadingNow\(readingRepaint\)/.test(ext));
ok('made once, from the one reading state, with the live label', (ext.match(/new ReadingStatusBar\(/g) || []).length === 1
    && /readingBadge\(s\.source, s\.at, lv \? live\.labelOf\(lv\) : ''\)/.test(ext) && /context\.subscriptions\.push\(readingBar\)/.test(ext));

console.log(`test_reading_bar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
