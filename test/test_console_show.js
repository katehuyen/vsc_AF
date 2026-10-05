// K-21 — `show` BELONGS TO THE CARD, NOT TO THE PANEL.
//
// Two sessions side by side are two different readings: one you are following
// line by line, one you only want the dialogue of. The filter used to be a
// single panel-wide value, so pressing a card silently re-filtered it to
// whatever the last card had been left on — and the lines that vanished looked
// like lines that had never arrived.
//
// What is under test is only that: which conversation the picker is describing,
// and what survives a switch. The picker's own behaviour (ticking, presets,
// "only this") is test_filter_controls.js's subject.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = Date.parse('2026-08-14T09:00:00Z');

/** One of each kind, so every filter has something to take away. */
const messages = (tag) => ([
    { id: tag + '-u', ts: NOW - 5000, role: 'user', text: 'soru ' + tag },
    { id: tag + '-t', ts: NOW - 4000, role: 'tool', kind: 'local', tool: { name: 'Read', detail: 'x.ts' } },
    { id: tag + '-r', ts: NOW - 3000, role: 'tool', kind: 'local', text: 'sonuc ' + tag },
    { id: tag + '-a', ts: NOW - 2000, role: 'agent', kind: 'say', text: 'cevap ' + tag }
]);

const session = (id, messages) => ({
    id, agentId: 'a-dev', agentName: 'developer', sessionId: 'S-' + id,
    cwd: 'D:\\repo', title: 'oturum ' + id, status: 'idle', cost: 0, turns: 1,
    queued: [], tokens: 0, wTokens: 0, engine: 'claude', engineLabel: 'Claude Code',
    turnShape: 'persistent', steerable: true, reportsCost: true,
    model: '', effort: '', permissionMode: '', contextTokens: 0, lastTs: NOW,
    turnStartedAt: 0, turnTokens: 0, turnWTokens: 0, turnApiCalls: 0, turnSteps: 0,
    turnThinking: 0, turnCost: 0, turnModel: '', turnEffort: '', lastTurn: null,
    pendingPermission: null, pendingAsk: null, exitReason: '',
    projectId: '', projectName: '', projectIcon: '', messages
});

const shell = (selected, ids, prefs) => ({
    generatedAt: NOW, selected,
    // K-38 — the host's memory of the last `show`; absent key = never chosen.
    prefs: prefs || {},
    sessions: ids.map(id => session(id, messages(id))),
    agents: [{ id: 'a-dev', name: 'developer', dir: 'D:\\ajan' }],
    models: [{ id: '', label: 'Default' }], efforts: [{ id: '', label: 'Default' }],
    engineModels: {}, permissions: [{ id: '', label: 'Default' }],
    livePermissions: [{ id: '', label: 'Default' }], grants: [],
    engines: [{
        id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription',
        shape: 'persistent', steerable: true, reportsCost: true, billing: '', next: '', note: ''
    }],
    engine: 'claude', defaults: { engine: '', model: '', effort: '', permissionMode: '' },
    dropZone: true, attachMax: 20, owned: [], lastWindow: [], projects: [],
    activeProjectId: '', chipProjectId: '', projectContext: '', pinnedAgent: '',
    resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: 60,
    resumeDefaultN: 15, resumeFiltered: false
});

const r = runPage('console.js', shell('cs1', ['cs1', 'cs2']));
const go = (selected, ids) => r.send({ type: 'data', data: shell(selected, ids || ['cs1', 'cs2']) });

/** Which rows the conversation is actually drawing, by message id. */
const rows = () => {
    const inner = r.sandbox.document.getElementById('talkinner');
    return ((inner.innerHTML || '').match(/data-mid="([^"]*)"/g) || []).map(s => s.slice(10, -1));
};
const note = () => (r.sandbox.document.getElementById('c-hidden').innerHTML || '');

// ---------------------------------------------------------------- the default
ok('a card nobody has filtered shows dialog', rows().join() === 'cs1-u,cs1-a');
ok('…and the picker says so', r.ms.label('c-kinds') === 'show: 3/7');
ok('…with hidden lines reported', /2 line\(s\) hidden/.test(note()));

// ---------------------------------------------------------------- set one card
r.ms.selectAll('c-kinds');
ok('‼️ K-21 — Select all filters the card it was pressed on',
    rows().join() === 'cs1-u,cs1-t,cs1-r,cs1-a');
ok('…and the card has nothing hidden', note() === '');

// ---------------------------------------------------------------- the next card
go('cs2');
ok('‼️ K-21 — the OTHER card is untouched by it',
    rows().join() === 'cs2-u,cs2-a');
ok('…and its picker describes itself, not the one you came from',
    r.ms.label('c-kinds') === 'show: 3/7');
ok('…and it reports hidden lines', /2 line\(s\) hidden/.test(note()));

// A second, different reading on the second card.
r.ms.clickName('c-kinds', 'tool');
ok('the second card takes its own filter', rows().join() === 'cs2-t');

// ---------------------------------------------------------------- and back
go('cs1');
ok('‼️ K-21 — coming back finds the card exactly as it was left',
    rows().join() === 'cs1-u,cs1-t,cs1-r,cs1-a');
ok('…including its picker', r.ms.label('c-kinds') === 'show: everything');

go('cs2');
ok('…and so does the other one', rows().join() === 'cs2-t'
    && r.ms.label('c-kinds') === 'show: 🔧 Tool calls');

// ---------------------------------------------------------------- letting go
// A card taken off the shelf is gone for good; keeping its filter would be
// state nobody can reach, growing in the panel's memory for ever.
go('cs2', ['cs2']);
ok('the panel survives a card being removed', rows().join() === 'cs2-t');
go('cs1', ['cs1', 'cs2']);
ok('‼️ K-21 — a card that came back is a new card, on the default again',
    rows().join() === 'cs1-u,cs1-a'
    && r.ms.label('c-kinds') === 'show: 3/7');
ok('…and the card that never left kept its own', (() => {
    go('cs2', ['cs1', 'cs2']);
    return rows().join() === 'cs2-t';
})());

// ------------------------------------------- K-38 / K-40: opening cold
// The card's answer lives in the webview's state, and that state does not
// survive the panel closing or the window reloading. So the reading a card was
// left on is kept by the HOST — under that card's CLI session id, the one thing
// about a card that survives — and a card with no record starts on Dialog.
//
// ‼️ K-40 — NEVER one value for the panel. The first cure kept the last `show`
// anybody set and seeded every unfiltered card from it, so one "everything" on
// one card put every session that arrived afterwards on everything.
const posted = (type) => r.posted.filter(m => m && m.type === type);
ok('‼️ K-38 — moving the picker tells the host what was chosen',
    posted('rememberKinds').length > 0);
ok('…carrying the choice itself, "everything" included', (() => {
    const all = posted('rememberKinds');
    return all.some(m => m.kinds === null) && all.some(m => Array.isArray(m.kinds));
})());
ok('‼️ K-40 — …and WHICH card it was set on, so the host files it under that session', (() => {
    const all = posted('rememberKinds');
    return all.every(m => typeof m.id === 'string' && m.id.length > 0)
        && all[all.length - 1].id === 'cs2' && String(all[all.length - 1].kinds) === 'tool';
})());

/** A panel opening cold: a new page, whatever the host remembers, no state. */
const cold = (prefs, state) =>
    runPage('console.js', shell('cs1', ['cs1', 'cs2'], prefs), undefined, state);
const rowsOf = (p) => {
    const inner = p.sandbox.document.getElementById('talkinner');
    return ((inner.innerHTML || '').match(/data-mid="([^"]*)"/g) || []).map(x => x.slice(10, -1));
};

const c0 = cold();
ok('a cold panel the host remembers nothing for keeps the shipped default',
    rowsOf(c0).join() === 'cs1-u,cs1-a' && c0.ms.label('c-kinds') === 'show: 3/7');

// the host's memory is keyed by the CLI session id (`S-cs1` in this fixture)
const c1 = cold({ kindsBy: { 'S-cs1': null } });
ok('‼️ K-38 — "everything" survives the panel being closed',
    rowsOf(c1).join() === 'cs1-u,cs1-t,cs1-r,cs1-a'
    && c1.ms.label('c-kinds') === 'show: everything');
ok('‼️ K-40 — …on THAT card only: the next card starts on Dialog, not on everything', (() => {
    c1.send({ type: 'data', data: shell('cs2', ['cs1', 'cs2'], { kindsBy: { 'S-cs1': null } }) });
    return rowsOf(c1).join() === 'cs2-u,cs2-a' && c1.ms.label('c-kinds') === 'show: 3/7';
})());

const c2 = cold({ kindsBy: { 'S-cs1': ['tool'], 'S-cs2': null } });
ok('…and so does any other reading, each card its own', rowsOf(c2).join() === 'cs1-t');
ok('…a record that arrives with a later push is found too', (() => {
    c2.send({ type: 'data', data: shell('cs2', ['cs1', 'cs2'], { kindsBy: { 'S-cs1': ['tool'], 'S-cs2': null } }) });
    return rowsOf(c2).join() === 'cs2-u,cs2-t,cs2-r,cs2-a';
})());

// ‼️ The state a page DOES have wins over the host's memory for that card:
// the record is for the cold open, never rewritten over a card on screen.
const warm = cold({ kindsBy: { 'S-cs1': ['tool'] } },
    { afConsole: { kinds: ['agent', 'user'], kindsBy: { cs1: null } } });
ok('‼️ K-38 — a page with its own answer for the card is not re-seeded by the host',
    rowsOf(warm).join() === 'cs1-u,cs1-t,cs1-r,cs1-a');

// A page state from the first cure — a panel-wide `null` and its mark — is
// overwritten: the panel default is Dialog and is not a memory any more.
const legacy = cold(undefined, { afConsole: { kinds: null, kindsSeeded: true, kindsBy: {} } });
ok('‼️ K-40 — a stored panel-wide "everything" from the earlier build is not honoured',
    rowsOf(legacy).join() === 'cs1-u,cs1-a');
ok('…and the page writes Dialog back, mark gone',
    String(legacy.state().afConsole.kinds) === 'agent,user,ask'
    && !('kindsSeeded' in legacy.state().afConsole));

// ‼️ K-40 — THE HOST SIDE OF THE SAME RULE, measured on the source: the record
// is filed under the session id the HOST resolves for the card (never one the
// page claims), a card with no session is not filed at all, the store is
// bounded, and the panel-wide key of the first cure is not carried forward.
const fs = require('fs');
const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
ok('‼️ K-40 — the host files `show` under the session id it resolves itself',
    /case 'rememberKinds': \{[\s\S]{0,400}this\.deps\.host\.list\(\)\.find\(s => s\.id === String\(msg\.id \|\| ''\)\)\?\.sessionId;\s*\n\s*if \(sid\) \{ this\.deps\.rememberKinds\?\.\(sid,/.test(panel));
ok('…a card with no session is not filed, and the memory is bounded',
    /const rememberKinds = \(sessionId: string, kinds: string\[\] \| null\): void => \{\s*\n\s*if \(!sessionId\) \{ return; \}/.test(ext)
    && /const KINDS_MEMORY_MAX = 100;/.test(ext)
    && /keys\.slice\(Math\.max\(0, keys\.length - KINDS_MEMORY_MAX\)\)/.test(ext));
ok('…and the panel-wide `kinds` key of the first cure is not carried forward',
    /globalState\.update\(CONSOLE_PREFS_KEY, \{ kindsBy: next \}\)/.test(ext)
    && !/lastKinds/.test(ext) && !/lastKinds/.test(panel));
ok('…and only the cards on the shelf travel to the page',
    /const remembered = this\.deps\.rememberedKinds\?\.\(\) \?\? \{\};[\s\S]{0,900}prefs: \{ kindsBy \},/.test(panel));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
