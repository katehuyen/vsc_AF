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

const shell = (selected, ids) => ({
    generatedAt: NOW, selected, presetAgent: '',
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
ok('a card nobody has filtered shows everything', rows().join() === 'cs1-u,cs1-t,cs1-r,cs1-a');
ok('…and the picker says so', r.ms.label('c-kinds') === 'show: everything');
ok('…with nothing hidden to report', note() === '');

// ---------------------------------------------------------------- set one card
r.ms.preset('c-kinds', 'dialog');
ok('‼️ K-21 — Dialog filters the card it was pressed on',
    rows().join() === 'cs1-u,cs1-a');
ok('…and the card says what it is holding back', /2 line\(s\) hidden/.test(note()));

// ---------------------------------------------------------------- the next card
go('cs2');
ok('‼️ K-21 — the OTHER card is untouched by it',
    rows().join() === 'cs2-u,cs2-t,cs2-r,cs2-a');
ok('…and its picker describes itself, not the one you came from',
    r.ms.label('c-kinds') === 'show: everything');
ok('…and it has nothing hidden', note() === '');

// A second, different reading on the second card.
r.ms.clickName('c-kinds', 'tool');
ok('the second card takes its own filter', rows().join() === 'cs2-t');

// ---------------------------------------------------------------- and back
go('cs1');
ok('‼️ K-21 — coming back finds the card exactly as it was left',
    rows().join() === 'cs1-u,cs1-a');
ok('…including its picker', r.ms.label('c-kinds') === 'show: 2/7');

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
    rows().join() === 'cs1-u,cs1-t,cs1-r,cs1-a'
    && r.ms.label('c-kinds') === 'show: everything');
ok('…and the card that never left kept its own', (() => {
    go('cs2', ['cs1', 'cs2']);
    return rows().join() === 'cs2-t';
})());

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
