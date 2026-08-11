// S-7 — the sessions table's own page.
//
// The point of the page is that it is NOT a new table: the same component, the
// same columns, the same filters, the same right-click contract — with the whole
// window and a default of 200 rows instead of a corner of a board capped at
// twenty. So the assertions here are mostly about that: what it does NOT
// reimplement, and the three things it adds (the count line, the opening scope,
// and the host contract behind the Show box).
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const NOW = Date.now();
const row = (n, extra) => Object.assign({
    file: 'f' + n, sessionId: 'sid' + n, agent: 'dev', agentName: 'dev', cwd: 'D:/a/dev',
    title: 'session ' + n, autoTitle: '', ts: NOW - n * 60000, firstTs: NOW - n * 120000,
    durationMin: 2, turns: 3, toolCalls: 4, errors: 0, tokens: 100, wTokens: 120, ctx: 900,
    cost: 0.5, sidechain: false, origin: 'user', pinned: false, tags: [], project: 'AgentFarm',
    projectIcon: '', projectColor: '', files: 1, active: false, models: ['claude-opus-5'],
    apiCalls: 6, usage: { input: 20, output: 20, cacheRead: 50, cacheWrite: 10 }, topTools: []
}, extra || {});

const data = (extra) => Object.assign({
    generatedAt: NOW,
    agents: ['dev'],
    totals: { sessions: 412, active: 2 },
    scope: { project: '', agentName: '' },
    sessions: [row(1), row(2)],
    sessionTableN: 200
}, extra || {});

// ---------- it is the shared table, with the page to itself ----------
{
    const r = runPage('sessionsPage.js', data());
    ok('the page hosts the shared sessions table', /id="sessblock"/.test(r.html()));
    // ‼️ The reason the page exists: 200 rows, not the Dashboard's twenty.
    ok('…seeded with the page default rather than a corner\'s',
        /value="200"/.test(r.html()));
    // Every column the component has — on this page nothing competes for width.
    ok('it carries every column the component has',
        ['Agent', 'Project', 'Title', 'When', 'Duration', 'Turns', 'Tools', 'Files',
            'Err', 'Tokens', 'Ctx now', 'Cost'].every(h => r.html().includes('>' + h + '<')));
    // A table capped at 200 that does not say how many exist cannot be trusted.
    ok('the header says what the 200 is a slice OF', /412 sessions on this machine/.test(r.html()));
    ok('…and how many are running now', /2 running now/.test(r.html()));
    // The right-click contract comes with the component, not with the page.
    ok('rows publish the shared session context', r.contexts().some(c => c.sessionId === 'sid1'));
    ok('…and the hint is said once, above the table, not in every cell',
        (r.html().match(/right-click for session actions/g) || []).length <= 3);
}

// ---------- the opening scope is applied once, not on every push ----------
// The host repaints this page on its own beat (every index update). Re-applying
// the opening filter each time would quietly undo whatever the reader narrowed
// it to in between — which reads as "the page keeps resetting itself".
{
    const plain = runPage('sessionsPage.js', data());
    ok('with no scope the filter panel stays shut', !/class="af-fpanel"/.test(plain.html()));

    const r = runPage('sessionsPage.js', data({ scope: { project: 'AgentFarm', agentName: '' } }));
    ok('a project scope lands in the component\'s own project filter, and opens the panel',
        /class="af-fpanel"/.test(r.html()));
    ok('…and the page says out loud what it is scoped to when it is an agent',
        /scoped to dev/.test(
            runPage('sessionsPage.js', data({ scope: { project: '', agentName: 'dev' } })).html()));
    // ‼️ The guard itself, in the source: the host repaints this page on every
    // index update, and re-applying the opening filter on each push would undo
    // whatever the reader had narrowed it to in between.
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionsPage.js'), 'utf8');
    ok('‼️ the opening scope is applied once, not on every host push',
        /let scopeApplied = false/.test(page)
        && /if \(!scopeApplied && DATA\.scope && DATA\.scope\.project\)/.test(page));
}

// ---------- the host contract ----------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'sessionsPanel.ts'), 'utf8');
    ok('the page answers the Show box host-side, so the top-N is genuine',
        /case 'setTableN'/.test(src) && /this\.tableN = n/.test(src));
    // ‼️ The webview must not be able to point the host at an arbitrary path.
    // ‼️ X-27 — the same guard, over the list the page actually SHOWS. The page
    // lists every engine now, so a guard over the claude-only list would refuse
    // to expand a Codex row and read as a hang; it still refuses a path the
    // index has never seen, which is the whole point of it.
    ok('…and only files the index knows are readable through sessionTurns',
        /this\.deps\.index\.allWithExternal\(\)\.some\(s => s\.file === file\)/.test(src));
    ok('‼️ …and the page itself is fed every engine, not only Claude',
        /deps\.index\.allWithExternal\(\)/.test(src));
    ok('the pin passes the state it wants, never a toggle',
        /wantPinned: msg\.pinned === true/.test(src));
    ok('the page default is 200 rows', /SESSIONS_PAGE_TABLE_N = 200/.test(src));

    // The three doors the backlog item asked for.
    const dash = fs.readFileSync(path.join(__dirname, '..', 'media', 'dashboard.js'), 'utf8');
    ok('the Dashboard opens it from beside the Sessions heading',
        /id="opensessions"/.test(dash) && /to: 'sessions'/.test(dash));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the status-bar project tooltip links straight to that project\'s sessions',
        /Its sessions.*agentfarm\.openSessions/.test(ext));
    ok('…and the no-project tooltip links to all of them',
        /All sessions.*agentfarm\.openSessions/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('the command is in the manifest with an icon',
        pkg.contributes.commands.some(c => c.command === 'agentfarm.openSessions' && c.icon));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
