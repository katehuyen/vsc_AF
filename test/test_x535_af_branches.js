// X-535 — A FARM BRANCH OUTLIVES ITS WORKTREE, and nothing listed it: Worktree Runs… read worktrees only,
// so an af/ branch whose worktree was gone sat on no page and under no button (measured 2026-10-10:
// af/x-kfiz in the agents' repo, no worktree, no commit of its own). Driven here with REAL git in a
// throwaway repo: a merged one goes on the next sweep, one with work of its own waits in the review,
// farm.health counts them per repo, and baton.pass names the ones a leg leaves.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const W = require(path.join(ROOT, 'out', 'core', 'worktree.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { registerBatonOps } = require(path.join(ROOT, 'out', 'core', 'batonBridge.js'));
const { BatonStore } = require(path.join(ROOT, 'out', 'core', 'batonStore.js'));

const BOX = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x535-'));
const REPO = path.join(BOX, 'repo');
const sh = (cmd, cwd = REPO) => execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
const commit = (cwd, file, msg) => { fs.writeFileSync(path.join(cwd, file), msg, 'utf8'); sh(`git add ${file}`, cwd); sh(`git -c user.name=t -c user.email=t@t commit -q -m "${msg}"`, cwd); };
const branches = () => sh('git branch --list').split('\n').map(l => l.replace(/^[*+]?\s+/, '').trim()).filter(Boolean);

(async () => {
    try {
        fs.mkdirSync(REPO);
        sh('git init -q');
        commit(REPO, 'a.txt', 'first');

        // ---------- a worktree in use is never touched ----------
        const live = (await W.createWorktree(REPO, 'live run')).wt;
        ok('a parallel run makes its af/ branch and worktree', !!live && fs.existsSync(live.path));
        let s = await W.sweepAfBranches(REPO);
        ok('a branch still in its worktree is counted and left alone', s.worktrees === 1 && !s.removed.length && !s.left.length
            && branches().includes(live.branch));

        // ---------- ‼️ KABUL 1: merged, worktree gone -> removed by the next sweep ----------
        const merged = (await W.createWorktree(REPO, 'merged run')).wt;
        fs.rmSync(merged.path, { recursive: true, force: true });
        const listed = (await W.listAfBranches(REPO)).find(b => b.branch === merged.branch);
        ok('before the sweep git still lists the deleted folder as its worktree', !!listed && listed.path !== '');
        s = await W.sweepAfBranches(REPO);
        ok('‼️ the deleted folder\'s worktree is pruned and its merged branch removed', s.pruned === 1 && s.removed.includes(merged.branch)
            && !branches().includes(merged.branch));

        // ---------- ‼️ KABUL 2: work of its own, worktree gone -> waits in the review ----------
        const own = (await W.createWorktree(REPO, 'own work')).wt;
        commit(own.path, 'b.txt', 'work on the branch');
        fs.rmSync(own.path, { recursive: true, force: true });
        s = await W.sweepAfBranches(REPO);
        const left = s.left.find(b => b.branch === own.branch);
        ok('‼️ a branch with work of its own is NOT removed', !s.removed.includes(own.branch) && branches().includes(own.branch));
        ok('…it is left for the review, with no worktree', !!left && left.path === '' && left.merged === false);
        const st = left ? await W.worktreeStatus(REPO, left) : null;
        ok('the review reads its commits with no folder to read from', !!st && st.commits === 1 && st.dirty === false && /1 file changed/.test(st.diffStat));

        // ---------- the orphan the item measured: no worktree, no commit of its own ----------
        sh('git branch af/x-kfiz');
        s = await W.sweepAfBranches(REPO);
        ok('a bare af/ branch with nothing of its own goes on the sweep', s.removed.includes('af/x-kfiz') && !branches().includes('af/x-kfiz'));
        ok('a branch outside af/ is never the farm\'s to touch', (sh('git branch keep-me'), (await W.sweepAfBranches(REPO)), branches().includes('keep-me')));

        // ---------- baton.pass names what a leg leaves ----------
        const named = await W.afBranchesIn([REPO, path.join(REPO, 'nope'), REPO]);
        ok('the repos of a leg\'s folders are each read once', named.length === 2);
        ok('…each branch said with what holds it', named.some(l => l.startsWith(own.branch) && /no worktree, work of its own/.test(l))
            && named.some(l => l.startsWith(live.branch) && /worktree /.test(l)));
        const store = new BatonStore();
        const reg = new BridgeRegistry();
        const manifest = { launchId: 'lch_x535', at: 1, engine: 'claude', identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
            requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer', mechanism: 'session', cwd: REPO, surface: 'console' };
        const seen = [];
        registerBatonOps(reg, {
            store, caller: async () => ({ ok: true, sessionId: 'sess-A', source: 'env' }), launchIdOf: () => 'lch_x535',
            manifests: () => [manifest], now: () => 1790000000000,
            afLeftOf: place => { seen.push(place); return W.afBranchesIn([REPO]); }
        });
        const r = await reg.dispatch('baton.pass', { prompt: 'Continue X-535.' }, { sessionId: 'sess-A' });
        ok('‼️ the pass answers the branches the leg leaves, by name', r.ok && Array.isArray(r.result.afBranches)
            && r.result.afBranches.some(l => l.startsWith(own.branch)));
        ok('…and its sentence says so and where to review them', /Farm branches are left in this leg's repositories/.test(r.result.sentence)
            && /Worktree Runs/.test(r.result.sentence));
        ok('…asked with the leg\'s own place', seen.length === 1 && !!seen[0]);
        const quiet = new BridgeRegistry();
        registerBatonOps(quiet, { store: new BatonStore(), caller: async () => ({ ok: true, sessionId: 'sess-A', source: 'env' }), launchIdOf: () => 'lch_x535',
            manifests: () => [manifest], now: () => 1790000000000, afLeftOf: async () => [] });
        const q = await quiet.dispatch('baton.pass', { prompt: 'x' }, { sessionId: 'sess-A' });
        ok('a leg that leaves none hears nothing about branches', q.ok && !('afBranches' in q.result) && !/Farm branches/.test(q.result.sentence));

        // ---------- the wiring ----------
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const cmd = ext.slice(ext.indexOf("registerCommand('agentfarm.worktreeRuns'"), ext.indexOf("registerCommand('agentfarm.worktreeRuns'") + 5000);
        ok('Worktree Runs… sweeps first and lists the branches left beside the worktrees',
            /const swept = await sweepAfBranches\(/.test(cmd) && /const wts = \[\.\.\.await listAfWorktrees\(agent\.dir\), \.\.\.swept\.left\];/.test(cmd));
        ok('…offers no folder to open where the worktree is gone', /\.\.\.\(pick\.stat\.wt\.path \? \[\{ label: '\$\(folder-opened\) Open worktree folder', id: 'open' \}\] : \[\]\)/.test(cmd));
        ok('every agent repo is swept a minute after activation', /setTimeout\(\(\) => \{ void sweepAgentRepos\(\)\.catch\(\(\) => undefined\); \}, 60_000\)/.test(ext)
            && /for \(const repo of await reposOf\(agents\.map\(a => a\.dir\)\)\) \{ noteAfSweep\(await sweepAfBranches\(repo\)\); \}/.test(ext));
        ok('farm.health carries each repo\'s last sweep', /parallelRuns: \[\.\.\.afSweeps\.values\(\)\]/.test(ext) && /`parallelRuns` — X-535/.test(ext));
        ok('baton.pass is handed the leg\'s folder and its project\'s repos', /afLeftOf: place => afBranchesIn\(legRoots\(place, id => projectStore\.get\(id\)\?\.repos\)\)/.test(ext));
    } finally {
        try { sh('git worktree prune'); } catch { /* the box goes anyway */ }
        fs.rmSync(BOX, { recursive: true, force: true });
        fs.rmSync(W.worktreeBase(REPO), { recursive: true, force: true });
    }
    console.log(`\nx-535 af branches: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
