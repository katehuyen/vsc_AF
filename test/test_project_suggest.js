// The backfill engine — core/projectSuggest.ts.
//
// What is asserted here is the four rules the module exists to enforce, because
// every one of them is a way a "helpful" suggestion engine files things wrong:
//
//   * ‼️ it proposes only for sessions NOBODY has decided about — a session the
//     rules already place is settled, and one the user explicitly took OFF every
//     project is REFUSED, which is the strongest signal in the system;
//   * ‼️ every proposal carries evidence a reader can check, and the score is
//     never the argument — a list of percentages is a list people abandon;
//   * ‼️ a contested row is reported, never resolved, and is excluded from the
//     bulk approval — filing wrong at two hundred times the speed is the one
//     thing a bulk gesture must not do;
//   * the signals are built from what is ALREADY filed, so handing the engine
//     only the loose sessions would leave it with nothing to learn from.
const path = require('path');
const S = require(path.join(__dirname, '..', 'out', 'core', 'projectSuggest.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const T = Date.parse('2026-08-11T10:00:00Z');
const FARM = {
    id: 'prj_farm', name: 'Agent Farm', status: 'active',
    folder: 'D:\\vault\\projects\\Agent Farm',
    repos: ['D:\\dev\\git\\vsc_AgentFarm'],
    createdAt: T, updatedAt: T
};
const SCRIBE = {
    id: 'prj_scribe', name: 'TalkScribe', status: 'active',
    folder: 'D:\\vault\\projects\\TalkScribe',
    repos: ['D:\\dev\\git\\muvu_talkScribe'],
    createdAt: T, updatedAt: T
};
const PROJECTS = [FARM, SCRIBE];

const sess = (over) => Object.assign({
    sessionId: 's' + Math.random().toString(36).slice(2, 8),
    agentName: 'developer', cwd: 'D:\\agents\\developer',
    title: 'a session', filesEdited: [], firstTs: T, lastTs: T, cost: 1
}, over || {});

const links = (map) => ({ sessions: map || {} });

// ---------------------------------------------------------------------------
// rule 1 — only the undecided
// ---------------------------------------------------------------------------
{
    const loose = sess({ sessionId: 'loose', filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\src\\a.ts'] });
    const filed = sess({ sessionId: 'filed', filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\src\\b.ts'] });
    const refused = sess({ sessionId: 'refused', filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\src\\c.ts'] });
    const r = S.suggestProjects([loose, filed, refused], PROJECTS,
        links({ filed: 'prj_scribe', refused: '' }));
    const ids = r.suggestions.map(s => s.sessionId);
    ok('a loose session is proposed for', ids.includes('loose'));
    ok('a session somebody already filed is left alone', !ids.includes('filed'));
    ok('‼️ a session the user took OFF every project is never proposed for — the engine that keeps '
        + 'suggesting what a person refused is the one they switch off', !ids.includes('refused'));
    ok('…and it is counted separately, so the number is not mistaken for a gap', r.refused === 1);
    ok('the scan count is the loose ones only', r.scanned === 1);
}
{
    // A session the PATH rule already places is settled by the rules, not by a
    // person — and it is still not a candidate: a proposal there would be a
    // second opinion on a question already answered.
    const inRoot = sess({ sessionId: 'inroot', cwd: 'D:\\dev\\git\\vsc_AgentFarm\\src' });
    const r = S.suggestProjects([inRoot], PROJECTS, links());
    ok('a session the path rule already places is not proposed for', !r.suggestions.length);
    ok('…and it is not counted as scanned either', r.scanned === 0);
}

// ---------------------------------------------------------------------------
// rule 2 — the evidence is the argument
// ---------------------------------------------------------------------------
{
    const s = sess({
        sessionId: 'w',
        filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\src\\a.ts', 'D:\\dev\\git\\vsc_AgentFarm\\media\\b.js']
    });
    const r = S.suggestProjects([s], PROJECTS, links());
    const row = r.suggestions[0];
    ok('writing inside a declared code root proposes that project', row && row.projectId === 'prj_farm');
    ok('‼️ and the reason is a FACT, with the count and the root in it',
        /wrote 2 of 2 files under d:\/dev\/git\/vsc_agentfarm/.test(row.signals[0].detail));
    ok('the strongest signal is first — the sentence that decided it is the one a reader checks',
        row.signals[0].kind === 'files');
}
{
    // ‼️ The files signal is the one no PATH rule can see: the session STOOD in
    // the agent's own folder and wrote three directories away.
    const s = sess({ cwd: 'D:\\agents\\developer', filesEdited: ['D:\\dev\\git\\muvu_talkScribe\\ZEN\\x.js'] });
    const r = S.suggestProjects([s], PROJECTS, links());
    ok('‼️ a session that stood elsewhere and WROTE in a root is found — the path rule looks at where '
        + 'a session stood, not at what it touched', r.suggestions[0].projectId === 'prj_scribe');
}
{
    // Writing SOME files in a root is a weaker claim than writing all of them,
    // and the sentence says which.
    const s = sess({
        filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\a.ts', 'D:\\tmp\\b.txt', 'D:\\tmp\\c.txt', 'D:\\tmp\\d.txt']
    });
    const r = S.suggestProjects([s], PROJECTS, links(), { floor: 1 });
    const sig = r.suggestions[0].signals.find(x => x.kind === 'files');
    ok('a partial hit says the share, not a bare count', /wrote 1 of 4 files/.test(sig.detail));
    ok('…and weighs less than writing all of them', sig.weight < 60);
}

// ---------------------------------------------------------------------------
// the cohort signal — the user's own decision, generalised one step
// ---------------------------------------------------------------------------
{
    const CWD = 'D:\\work\\somewhere';
    const filed = [];
    for (let i = 0; i < 4; i++) {
        filed.push(sess({ sessionId: 'f' + i, cwd: CWD }));
    }
    const map = {};
    filed.forEach(f => { map[f.sessionId] = 'prj_farm'; });
    const loose = sess({ sessionId: 'loose', cwd: CWD });
    const r = S.suggestProjects([...filed, loose], PROJECTS, links(map));
    const row = r.suggestions.find(x => x.sessionId === 'loose');
    ok('four sessions filed from one folder propose the fifth', row && row.projectId === 'prj_farm');
    ok('and the sentence counts them', /4 other sessions from this exact folder are filed here/.test(
        row.signals.find(s => s.kind === 'cwd-cohort').detail));

    // ‼️ A split folder says so instead of being resolved by majority.
    const map2 = { f0: 'prj_farm', f1: 'prj_farm', f2: 'prj_scribe', f3: 'prj_scribe' };
    const r2 = S.suggestProjects([...filed, loose], PROJECTS, links(map2), { floor: 1 });
    const row2 = r2.suggestions.find(x => x.sessionId === 'loose');
    ok('‼️ a folder split between two projects is CONTESTED, not decided by a rounding error',
        row2 && row2.contested === true && !!row2.alsoName);
    ok('…and the sentence says the folder is split',
        /the folder is split/.test(row2.signals.find(s => s.kind === 'cwd-cohort').detail));
}
{
    // The cohort counts EXPLICIT filings only. A path-rule placement would make
    // the signal an echo of the rule that already ran — agreeing with itself
    // and calling that evidence.
    const inRoot = sess({ sessionId: 'byrule', cwd: 'D:\\dev\\git\\vsc_AgentFarm' });
    const loose = sess({ sessionId: 'loose', cwd: 'D:\\dev\\git\\vsc_AgentFarm' });
    const r = S.suggestProjects([inRoot, loose], PROJECTS, links());
    ok('‼️ a rule-placed session does not become evidence for the rule that placed it',
        !r.suggestions.length);
}

// ---------------------------------------------------------------------------
// the agent signal — a tendency, weighted like one
// ---------------------------------------------------------------------------
{
    const filed = [];
    for (let i = 0; i < 8; i++) {
        filed.push(sess({ sessionId: 'a' + i, agentName: 'zen-dev', cwd: 'D:\\x' + i }));
    }
    const map = {};
    filed.forEach((f, i) => { map[f.sessionId] = i < 7 ? 'prj_scribe' : 'prj_farm'; });
    const loose = sess({ sessionId: 'loose', agentName: 'zen-dev', cwd: 'D:\\elsewhere', title: '' });
    const r = S.suggestProjects([...filed, loose], PROJECTS, links(map), { floor: 1 });
    const row = r.suggestions.find(x => x.sessionId === 'loose');
    ok('an agent whose work lands mostly in one project proposes it',
        row && row.projectId === 'prj_scribe');
    ok('and the sentence is a share, which is what a tendency is',
        /88% of zen-dev's filed sessions/.test(row.signals[0].detail));
}
{
    // Below half it is noise, and a sentence saying "30% of this agent's
    // sessions" would be an argument AGAINST the proposal.
    const filed = [];
    for (let i = 0; i < 10; i++) { filed.push(sess({ sessionId: 'b' + i, agentName: 'split', cwd: 'D:\\y' + i })); }
    const map = {};
    filed.forEach((f, i) => { map[f.sessionId] = i < 4 ? 'prj_farm' : 'prj_scribe'; });
    const loose = sess({ sessionId: 'loose', agentName: 'split', cwd: 'D:\\nowhere', title: '' });
    const r = S.suggestProjects([...filed, loose], PROJECTS, links(map), { floor: 1 });
    const row = r.suggestions.find(x => x.sessionId === 'loose');
    ok('an agent below half is not evidence for the minority project',
        !row || !row.signals.some(s => s.kind === 'agent' && s.detail.includes('Agent Farm')));
}

// ---------------------------------------------------------------------------
// the name signal — a hint, and below the bar on its own
// ---------------------------------------------------------------------------
{
    const s = sess({ title: 'notes about Agent Farm', cwd: '', filesEdited: [] });
    const r = S.suggestProjects([s], PROJECTS, links());
    ok('‼️ a name in a title is NOT enough on its own — a session ABOUT a project is as likely as one FOR it',
        !r.suggestions.length);
    ok('…and it is counted as "no evidence", so the numbers still add up', r.noEvidence === 1);

    const withFloor = S.suggestProjects([s], PROJECTS, links(), { floor: 1 });
    ok('below the floor it still exists as a signal — it breaks ties',
        withFloor.suggestions[0].signals[0].kind === 'name');
}
{
    // A very short folder name matches everything.
    const tiny = { id: 'prj_x', name: 'ZEN', status: 'active', repos: [], createdAt: T, updatedAt: T };
    const s = sess({ title: 'the frozen lake', cwd: '', filesEdited: [] });
    const r = S.suggestProjects([s], [tiny], links(), { floor: 1 });
    ok('a name under four characters is not matched — it would hit every title', !r.suggestions.length);
}

// ---------------------------------------------------------------------------
// rule 3 — contested rows, and what a bulk gesture may touch
// ---------------------------------------------------------------------------
{
    const rows = [
        { sessionId: 'a', projectId: 'p1', projectName: 'A', score: 60, signals: [] },
        { sessionId: 'b', projectId: 'p1', projectName: 'A', score: 50, signals: [], contested: true },
        { sessionId: 'c', projectId: 'p2', projectName: 'B', score: 40, signals: [] }
    ];
    const report = { generatedAt: T, scanned: 3, refused: 0, noEvidence: 0, suggestions: rows };
    const clear = S.approvable(report);
    ok('‼️ "approve all" never touches a contested row', clear.length === 2
        && !clear.some(r => r.contested));
    const groups = S.byProject(clear);
    ok('a bulk apply can say what it is about to do, per project',
        groups.length === 2 && groups[0].count === 1 && groups[0].projectName === 'A');
}

// ---------------------------------------------------------------------------
// ordering and shape
// ---------------------------------------------------------------------------
{
    const strong = sess({ sessionId: 'strong', filesEdited: ['D:\\dev\\git\\vsc_AgentFarm\\a.ts'] });
    const weak = sess({ sessionId: 'weak', title: 'about TalkScribe', cwd: '', filesEdited: [] });
    const r = S.suggestProjects([strong, weak], PROJECTS, links(), { floor: 1 });
    ok('the strongest case is first — a list read top-down is approved top-down',
        r.suggestions[0].sessionId === 'strong');
    ok('a proposal carries what a row needs to be judged without opening it',
        ['sessionId', 'projectId', 'projectName', 'score', 'signals']
            .every(k => r.suggestions[0][k] !== undefined));
    const limited = S.suggestProjects([strong, weak], PROJECTS, links(), { floor: 1, limit: 1 });
    ok('the limit cuts the list, not the counts', limited.suggestions.length === 1
        && limited.scanned === 2);
}
{
    ok('nothing at all is an empty report, not a crash',
        S.suggestProjects([], [], links()).suggestions.length === 0);
    ok('projects with no sessions propose nothing',
        S.suggestProjects([], PROJECTS, links()).scanned === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
