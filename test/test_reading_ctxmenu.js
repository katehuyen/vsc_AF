// The reading surfaces' right-click contract: Turns, the session viewer, the
// search results and the Console's two waiting states.
//
// The claim these tests exist to protect is the one that is easiest to break
// and impossible to see break: a row that is TWO objects at once. A turn row
// and a search hit are each a session as well as themselves, so they publish a
// section that belongs to the session family — and if that family ever stops
// including them, the session menu quietly disappears from the two surfaces
// where a session is most often read.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const NOW = Date.now();

/** Does a when-clause draw on this section? */
function draws(when, section) {
    const m = /^webviewSection =~ \/(.+)\/$/.exec(String(when || ''));
    if (m) { return new RegExp(m[1]).test(section); }
    return when === `webviewSection == '${section}'`;
}

// ---------- the family, read off the catalogue itself ----------
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    const FULL = ['agentfarm.openSession', 'agentfarm.pinSession', 'agentfarm.interruptSession'];
    for (const section of ['afTurnRow', 'afSearchHit']) {
        ok(`‼️ ${section} is in the session family — a turn/hit IS a session`,
            FULL.every(c => web.some(e => e.command === c && draws(e.when, section))));
    }
    ok('…and the new session items are declared for the whole family',
        ['agentfarm.copySessionPath', 'agentfarm.openSessionAgent', 'agentfarm.sessionToQueue']
            .every(c => web.some(e => e.command === c && draws(e.when, 'afSessionRow'))));
    ok('‼️ the two folder items are drawn only where there IS a folder',
        web.some(e => e.command === 'agentfarm.revealSessionFolder' && /&& cwd$/.test(e.when))
        && web.some(e => e.command === 'agentfarm.copySessionCwd' && /&& cwd$/.test(e.when)));
    ok('a viewer step is NOT a session — it is a step', !web.some(e =>
        e.command === 'agentfarm.endSession' && draws(e.when, 'afViewerStep')));
}

// ============================================================ TURNS
{
    const p = runPage('turns.js', {
        generatedAt: NOW,
        rows: [
            {
                file: 'D:/t/s1.jsonl', sessionId: 'S1', n: 3, of: 7, ts: NOW - 1000,
                agent: 'dev', agentName: 'dev', session: 'fixing the parser',
                title: 'fixing the parser', cwd: 'D:/repo',
                label: 'why does it drop the last line?', models: ['claude-opus-5'],
                tokens: 1200, cost: 0.02, tools: 2, errors: 0, steps: 5, apiCalls: 3
            },
            {
                file: 'D:/t/s2.jsonl', sessionId: 'S2', n: 1, of: 1, ts: NOW - 5000,
                agent: 'ops', agentName: 'ops', session: 'backup', title: 'backup',
                label: 'run the backup', models: [], tokens: 0, cost: 0, tools: 0, errors: 0
            }
        ],
        agents: ['dev', 'ops'], models: [], origins: []
    });

    ok('the Turns page lists its turns', p.html().includes('why does it drop the last line?'));

    const t1 = p.contexts().find(c => c.sessionId === 'S1');
    ok('‼️ a turn row publishes itself as afTurnRow — a member of the session family',
        !!t1 && t1.webviewSection === 'afTurnRow');
    ok('…carrying what a SESSION menu needs',
        !!t1 && t1.file === 'D:/t/s1.jsonl' && t1.agentName === 'dev' && t1.cwd === 'D:/repo');
    ok('…and what a TURN menu needs', !!t1 && t1.turnN === 3 && typeof t1.turnKey === 'string');
    ok('a turn with no working folder does not claim one',
        !!p.contexts().find(c => c.sessionId === 'S2' && c.cwd === ''));

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'tnOpen', ctx: t1 });
    ok('opening at this turn is the row click\'s own message',
        p.last().type === 'openSession' && p.last().file === 'D:/t/s1.jsonl' && p.last().ts === t1.turnTs);

    // ‼️ A copy asked for before the turn has been read must FETCH it, not put
    // an empty string on the clipboard and look like it worked.
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'tnCopy:prompt', ctx: t1 });
    ok('‼️ copying an unread turn fetches it instead of copying nothing',
        p.posted.some(m => m.type === 'turnDetail' && m.file === 'D:/t/s1.jsonl' && m.n === 3));

    // The second row is untouched, so folding it is the first thing that asks
    // for ITS content.
    const t2 = p.contexts().find(c => c.sessionId === 'S2');
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'tnFold', ctx: t2 });
    ok('unfolding a turn asks the host for its content',
        p.posted.some(m => m.type === 'turnDetail' && m.file === 'D:/t/s2.jsonl' && m.n === 1));
}

// ============================================================ SEARCH
{
    const p = runPage('search.js', {
        agents: ['dev', 'ops'], preset: null,
        semantic: { provider: 'off', sessions: 0, chunks: 0 }
    });

    p.send({
        type: 'results', seq: 0, result: {
            filesScanned: 2, hits: [
                {
                    kind: 'transcript', file: 'D:/t/s1.jsonl', sessionId: 'S1', ts: NOW - 1000,
                    agentName: 'dev', title: 'fixing the parser', role: 'user', turn: 3,
                    before: 'why does it ', match: 'drop', after: ' the last line?'
                },
                {
                    kind: 'memory', file: 'D:/a/memory/notes.md', ts: NOW - 2000,
                    agentName: 'dev', title: 'notes', role: 'memory',
                    before: 'a ', match: 'drop', after: ' of rain'
                }
            ]
        }
    });

    ok('the search page renders its hits', p.html().includes('the last line?'));
    const ctxs = p.contexts();
    const hit = ctxs.find(c => c.webviewSection === 'afSearchHit');
    ok('‼️ a transcript hit publishes itself as afSearchHit — it is a session too',
        !!hit && hit.file === 'D:/t/s1.jsonl' && hit.agentName === 'dev');
    ok('…and knows which hit it is', !!hit && hit.hitIndex === 0);
    ok('‼️ a memory hit is NOT a session and publishes no session context',
        ctxs.filter(c => c.webviewSection === 'afSearchHit').length === 1);

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'shOpen', ctx: hit });
    ok('opening a hit lands on that moment',
        p.last().type === 'openSession' && p.last().file === 'D:/t/s1.jsonl' && p.last().ts === hit.hitTs);

    p.send({ type: 'afctx', act: 'shOnly:agent', ctx: hit });
    ok('"search only this agent" narrows the page\'s own scope',
        p.html().includes('Agent: dev'));
    p.send({ type: 'afctx', act: 'shOnly:session', ctx: hit });
    ok('…and "only this session" does the same with the session',
        p.html().includes('Session: fixing the parser'));
}

// ============================================================ SESSION VIEWER
{
    const msg = (turn, role, extra) => Object.assign({
        turn, role, ts: NOW - (10 - turn) * 1000, text: role + ' text of turn ' + turn,
        turnStart: false
    }, extra || {});
    const p = runPage('sessionViewer.js', {
        title: 'fixing the parser', sessionId: 'S1', cwd: 'D:/repo', permissionMode: '',
        firstTs: NOW - 9000, lastTs: NOW, models: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        totalTokens: 0, cost: 0, errors: 0, toolCalls: 1,
        context: { tokens: 0, limit: 0 },
        turnCount: 2, messageCount: 4, truncatedCount: 0, turnTotals: {},
        messages: [
            msg(1, 'user', { turnStart: true }),
            msg(1, 'assistant'),
            msg(2, 'user', { turnStart: true }),
            msg(2, 'tool', { tool: 'Edit', input: '{"file_path": "D:/repo/src/a.ts", "old_string": "x"}' })
        ],
        turns: [{ n: 1, label: 'first', ts: NOW - 9000 }, { n: 2, label: 'second', ts: NOW - 8000 }],
        files: [{ file: 'D:/repo/src/a.ts', edits: 2, added: 3, removed: 1, turns: [2], written: false, failed: 0 }]
    });

    const ctxs = p.contexts();
    const band = ctxs.find(c => c.webviewSection === 'afViewerTurn' && c.turnN === 1);
    // The viewer opens fully folded, so the fold state is whatever it is — what
    // must be true is that the row SAYS which, or the menu cannot choose
    // between "fold" and "unfold".
    ok('a turn band publishes its number, its fold state and its export state',
        !!band && typeof band.afClosed === 'boolean' && band.afExport === true);
    const rows = ctxs.filter(c => c.webviewSection === 'afViewerTurn' && c.turnN === 1);
    ok('‼️ the band and the breakdown row publish the SAME thing — one menu, two places',
        rows.length === 2 && JSON.stringify(rows[0]) === JSON.stringify(rows[1]));

    p.send({ type: 'afctx', act: 'vtExport:0', ctx: band });
    ok('leaving a turn out of the export is remembered',
        p.contexts().find(c => c.webviewSection === 'afViewerTurn' && c.turnN === 1).afExport === false);
    p.send({ type: 'afctx', act: 'vtFold:0', ctx: band });
    ok('unfolding it from the menu unfolds it',
        p.contexts().find(c => c.webviewSection === 'afViewerTurn' && c.turnN === 1).afClosed === false);
    p.send({ type: 'afctx', act: 'vtFold:1', ctx: band });
    ok('…and folding it folds it again',
        p.contexts().find(c => c.webviewSection === 'afViewerTurn' && c.turnN === 1).afClosed === true);
    p.send({ type: 'afctx', act: 'vtOnly', ctx: band });
    const after = p.contexts().filter(c => c.webviewSection === 'afViewerTurn');
    ok('"only this turn open" folds every other one',
        after.filter(c => c.turnN === 1).every(c => c.afClosed === false)
        && after.filter(c => c.turnN === 2).every(c => c.afClosed === true));

    // The viewer opens on Dialog, which hides tool steps entirely — switch to
    // Everything before asking what a tool step publishes.
    const all = p.query('.chip[data-preset="all"]')[0];
    ok('the viewer offers the Everything preset', !!all);
    if (all) { all.click(); }
    const step = p.contexts().find(c => c.webviewSection === 'afViewerStep' && c.stepTool === 'Edit');
    ok('‼️ a tool step recovers the file it touched from its own input',
        !!step && step.stepFile === 'D:/repo/src/a.ts');
    const plain = p.contexts().find(c => c.webviewSection === 'afViewerStep' && c.stepRole === 'user');
    ok('…and a step that touched no file says so, so the item is not drawn',
        !!plain && plain.stepFile === '');

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'vsFile', ctx: step });
    ok('the file a step touched opens',
        p.last().type === 'openEditedFile' && p.last().file === 'D:/repo/src/a.ts' && p.last().diff === false);

    const file = p.contexts().find(c => c.webviewSection === 'afViewerFile');
    ok('a changed file publishes its path', !!file && file.filePath === 'D:/repo/src/a.ts');
    p.send({ type: 'afctx', act: 'vfDiff', ctx: file });
    ok('"diff against HEAD" is the row button\'s own message',
        p.last().type === 'openEditedFile' && p.last().diff === true);
    p.send({ type: 'afctx', act: 'vfHunks', ctx: file });
    ok('showing what the session changed asks the host for the hunks',
        p.posted.some(m => m.type === 'sessionFileEdits' && m.file === 'D:/repo/src/a.ts'));
    p.send({ type: 'afctx', act: 'vfReveal', ctx: file });
    ok('revealing it goes through the host, with the path the ROW carries',
        p.last().type === 'revealFile' && p.last().file === 'D:/repo/src/a.ts');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
