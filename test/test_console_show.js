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
    generatedAt: NOW, selected, presetAgent: '',
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
ok('…and the picker says so', r.ms.label('c-kinds') === 'show: 2/7');
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
    r.ms.label('c-kinds') === 'show: 2/7');
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
    && r.ms.label('c-kinds') === 'show: 2/7');
ok('…and the card that never left kept its own', (() => {
    go('cs2', ['cs1', 'cs2']);
    return rows().join() === 'cs2-t';
})());

// ------------------------------------------------------- K-38: opening cold
// The card's answer lives in the webview's state, and that state does not
// survive the panel closing or the window reloading — nor do the session ids it
// is keyed by. So the panel takes the reading the reader last chose from the
// HOST, on a page that has no state of its own, and never over a card already
// on screen.
const posted = (type) => r.posted.filter(m => m && m.type === type);
ok('‼️ K-38 — moving the picker tells the host what was chosen',
    posted('rememberKinds').length > 0);
ok('…carrying the choice itself, "everything" included', (() => {
    const all = posted('rememberKinds');
    return all.some(m => m.kinds === null) && all.some(m => Array.isArray(m.kinds));
})());
ok('…and the last one is the reading a card was left on', (() => {
    const all = posted('rememberKinds');
    return String(all[all.length - 1].kinds) === 'tool';
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
    rowsOf(c0).join() === 'cs1-u,cs1-a' && c0.ms.label('c-kinds') === 'show: 2/7');

const c1 = cold({ kinds: null });
ok('‼️ K-38 — "everything" survives the panel being closed',
    rowsOf(c1).join() === 'cs1-u,cs1-t,cs1-r,cs1-a'
    && c1.ms.label('c-kinds') === 'show: everything');

const c2 = cold({ kinds: ['tool'] });
ok('…and so does any other reading', rowsOf(c2).join() === 'cs1-t');
ok('…on every card, because none of them has been filtered yet', (() => {
    c2.send({ type: 'data', data: shell('cs2', ['cs1', 'cs2'], { kinds: ['tool'] }) });
    return rowsOf(c2).join() === 'cs2-t';
})());

// ‼️ The state a page DOES have is its own answer: the seed is for the cold
// open only, so a panel that remembers its cards is not rewritten behind them.
const warm = cold({ kinds: ['tool'] },
    { afConsole: { kinds: null, kindsSeeded: true, kindsBy: {} } });
ok('‼️ K-38 — a page with its own state is not re-seeded by the host',
    rowsOf(warm).join() === 'cs1-u,cs1-t,cs1-r,cs1-a');

// An install from before the mark stored `null` meaning "nobody has chosen".
// It is read that way ONCE, and the page settles the question from then on.
const legacy = cold(undefined, { afConsole: { kinds: null, kindsBy: {} } });
ok('‼️ K-38 — the migration runs once, on a record written before the mark',
    rowsOf(legacy).join() === 'cs1-u,cs1-a');
ok('…and the page has settled it, so the next load leaves `null` alone',
    legacy.state().afConsole.kindsSeeded === true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
