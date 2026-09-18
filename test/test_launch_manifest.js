// X-102 — THE IMMUTABLE LAUNCH MANIFEST: what was true at the spawn, written
// before it, and never rewritten after.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. Measured against a real transcript on
// this machine (Claude Code 2.1.251, 1373 records), the JSONL carries sessionId,
// cwd, version, gitBranch, userType, entrypoint, permissionMode and promptSource
// — and nothing about which route served it, which profile revision was in
// force, which catalog the model came from, or what was REQUESTED as opposed to
// what came back. For every one of those the manifest is the only witness, so
// the three ways it can fail are what is held here:
//
//   1. IT COLLIDES. The acceptance line is about ten launches in one folder at
//      one moment, which is exactly the case a millisecond clock cannot tell
//      apart.
//   2. IT LEAKS. A manifest is written to disk, read by agents over the bridge
//      and carried into exports. A credential reaching it reaches all three.
//   3. IT FOLDS THE REQUEST INTO THE ANSWER. A run requested at `opus` and
//      served with something else must not read, a month later, as a run that
//      requested the other thing.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const M = require(path.join(ROOT, 'out', 'core', 'launchManifest.js'));

const IDENTITY = {
    engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)',
    origin: 'agent-farm-profile', scope: 'session',
    providerProfileId: 'kimi-work', providerProfileRevision: 3,
    route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' },
    requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
};

const base = (over = {}) => M.manifestFor({
    launchId: 'lch_abc123def', at: 1700000000000, engine: 'claude',
    identity: IDENTITY, catalogRevision: 'r7',
    options: { model: 'opus', tier: 'opus', effort: 'high', permissionMode: 'plan' },
    agentId: 'dev', agentName: 'developer', projectId: 'prj_1',
    mechanism: 'session', cwd: 'D:/zone/agent/ajanlar/developer', surface: 'terminal',
    ...over
});

console.log('\n== ten launches in one millisecond are ten launches ==');
{
    // ‼️ THE ACCEPTANCE LINE, AS THE GENERATOR'S PROBLEM. Ten spawns kicked off
    // by one loop share a millisecond routinely, so a clock-only id would hand
    // the binding ten identical handles and the "which run was this" question
    // would be unanswerable at exactly the moment it is being asked.
    const ids = [];
    for (let i = 0; i < 10; i++) { ids.push(M.newLaunchId(1700000000000)); }
    eq('ten ids taken in the same millisecond are all different',
        new Set(ids).size, 10);
    // …and even with a jammed random source, because the counter is the part
    // that cannot repeat within a run.
    const jammed = [];
    for (let i = 0; i < 10; i++) { jammed.push(M.newLaunchId(1700000000000, () => 0.5)); }
    eq('‼️ …and still all different when the random source repeats itself',
        new Set(jammed).size, 10);
    ok('an id is recognisable as ours', M.isLaunchId(ids[0]) && M.isLaunchId(jammed[9]));
    ok('‼️ …and something that is not ours is not silently accepted — a hand-edited '
        + 'record or a field from a future version must fail visibly',
        !M.isLaunchId('') && !M.isLaunchId('lch_') && !M.isLaunchId('abc')
        && !M.isLaunchId(undefined) && !M.isLaunchId('LCH_ABCDEFGHI'));
    ok('ids sort by time, so a list of them reads as a history',
        M.newLaunchId(1700000000000) < M.newLaunchId(1800000000000));
}

console.log('\n== the request is kept apart from the answer ==');
{
    const m = base();
    eq('what was ASKED FOR is recorded as asked',
        m.requested, { model: 'opus', tier: 'opus', effort: 'high', permissionMode: 'plan' });
    eq('‼️ …while what the ROUTE resolved it to lives on the identity, not folded '
        + 'into the request — a run requested at "opus" that an endpoint served '
        + 'with something else must not later read as a request for that something',
        [m.requested.model, m.identity.requestedModelRef], ['opus', 'kimi-k2-thinking']);
    eq('an unstated field is ABSENT, not an empty string — nobody can ask, years '
        + 'later, which of the two was meant',
        M.requestedOf({ model: '  ', effort: 'high' }), { effort: 'high' });
    eq('the catalog revision is recorded, so an old choice can be seen to have been '
        + 'valid when it was made', m.catalogRevision, 'r7');
    ok('…and an absent revision is absent rather than invented',
        M.manifestFor({
            launchId: 'lch_x', at: 1, engine: 'codex', identity: IDENTITY,
            options: {}, agentId: 'a', agentName: 'a', mechanism: 'task',
            cwd: 'D:/x', surface: 'headless'
        }).catalogRevision === undefined);
}

console.log('\n== whose plan paid for it ==');
{
    // ‼️ X-251 — THE ACCOUNT IS A RESOLVED FACT, so it sits beside `cwd` and
    // `identity` rather than inside `requested`.
    //
    // Measured why it has to be recorded at all: a Claude account slot's
    // `projects` folder is a JUNCTION onto one shared directory, so five
    // accounts write their transcripts into the same place and the file cannot
    // say whose it is. The launch is the only moment the answer exists — and
    // "as it was asked for" is the wrong half to keep, because an empty box
    // means the standing choice answered, and THAT is the account that paid.
    const m = base({ account: 'claude-work' });
    eq('the slot the process really ran under is on the record', m.account, 'claude-work');
    ok('‼️ …and it is not folded into the request, which is what was ASKED for',
        m.requested.account === undefined);
    ok('‼️ an unnamed account is ABSENT rather than empty — "nothing was injected" '
        + 'and "we do not know" must not become the same reading',
        base().account === undefined && base({ account: '   ' }).account === undefined);
}

console.log('\n== it records the spawn, not a later opinion of it ==');
{
    const m = base();
    eq('the mechanism and the surface are two different questions and both are kept',
        [m.mechanism, m.surface], ['session', 'terminal']);
    ok('‼️ there is NO sessionId field — it is not knowable before the spawn on any '
        + 'engine here, so it belongs to the binding, which is the record that is '
        + 'allowed to learn. A mutable field on an immutable record is how '
        + '"immutable" quietly stops being true',
        !('sessionId' in m));
    ok('the folder is the one the process was spawned in, carried verbatim',
        m.cwd === 'D:/zone/agent/ajanlar/developer');
    eq('the discipline is recorded when it was decided, and absent when it was not',
        [base({ superpowers: true }).superpowers, m.superpowers], [true, undefined]);
}

console.log('\n== and nothing that could be a credential can reach it ==');
{
    eq('‼️ a well-formed manifest leaks nothing — every field is a name, an id, a '
        + 'revision or a KIND', M.manifestLeaks(base()), []);
    // ‼️ THE EXCEPTION, NAMED. `authKind` is the KIND of sign-in, which X-100
    // kept precisely so nobody has to look at the credential to answer "how does
    // this route authenticate". A blanket name rule would flag it and teach the
    // next person to weaken the rule instead of trusting it.
    ok('…and `authKind` is not mistaken for one',
        M.manifestLeaks({ route: { authKind: 'api-key' } }).length === 0);
    eq('‼️ a field that COULD hold one is named, wherever it is nested — a record '
        + 'can arrive from an older version or a hand-edited file, which is exactly '
        + 'what a type cannot catch',
        M.manifestLeaks({ identity: { route: { apiKey: 'sk-live' } } }),
        ['identity.route.apiKey']);
    eq('…and the whole family of names is caught, not just the obvious one',
        M.manifestLeaks({
            token: 1, secret: 1, password: 1, authorization: 1, bearer_token: 1,
            'anthropic-api-key': 1, credentials: 1
        }).sort(),
        ['anthropic-api-key', 'authorization', 'bearer_token', 'credentials',
            'password', 'secret', 'token'].sort());
    ok('an ordinary field is not flagged just for sounding technical',
        M.manifestLeaks({ providerId: 'kimi', keyboard: 1, monkey: 1 }).length === 0);
}

console.log('\n== the line a person reads names the route AND the request ==');
{
    ok('‼️ both, because that pair is what the manifest exists to keep apart: a line '
        + 'saying only "opus" is true of two runs on two endpoints costing two '
        + 'different amounts',
        M.describeManifest(base()) === 'claude · Kimi (work) · tier opus · opus · high · terminal');
    const bare = base({
        identity: {
            engine: 'claude', providerId: '', origin: 'legacy', scope: 'session',
            requestedModelRef: '', proof: 'none'
        },
        options: {}
    });
    // ‼️ NO ROUTE READS AS INHERITED, NEVER AS "DEFAULT". Nothing was injected
    // and nothing was cleared, so the run took whatever the window carried — and
    // that may already have named an endpoint. The MODEL is separately allowed
    // to say "default model", which is why this asserts the exact line rather
    // than hunting for the word anywhere in it.
    eq('‼️ no route reads as INHERITED, and the word "default" is left to the model',
        M.describeManifest(bare), 'claude · inherited route · default model · terminal');
    const none = base({
        engine: 'gemini',
        identity: {
            engine: 'gemini', providerId: '', origin: 'not-applicable', scope: 'session',
            requestedModelRef: '', proof: 'none'
        }
    });
    ok('‼️ …but an engine with NO provider axis spends no column on saying so — that '
        + 'is a permanent state of four of the five engines',
        /inherited route/.test(M.describeManifest(none)) === false);
}

console.log('\n== the join to the run that was identified ==');
{
    const a = base({ launchId: 'lch_aaa' });
    const b = base({ launchId: 'lch_bbb', cwd: 'D:/other' });
    eq('a binding carrying a launchId finds its own manifest',
        M.manifestOf([a, b], { launchId: 'lch_bbb' }).cwd, 'D:/other');
    ok('‼️ a binding with NO launchId gets undefined, not the nearest or the newest — '
        + 'every binding written before X-102 is in that state, and a run whose setup '
        + 'is genuinely unknown must read as unknown. An invented certainty is worse '
        + 'than a gap, because a gap is visible',
        M.manifestOf([a, b], {}) === undefined
        && M.manifestOf([a, b], undefined) === undefined
        && M.manifestOf([a, b], { launchId: '   ' }) === undefined);
    ok('…and an id nothing matches is undefined too',
        M.manifestOf([a, b], { launchId: 'lch_zzz' }) === undefined);
    ok('an empty store answers nothing rather than throwing',
        M.manifestOf([], { launchId: 'lch_aaa' }) === undefined);

    /**
     * ‼️ X-252 — THE BULK FORM IS THE SAME RULE, AND IT IS PINNED AGAINST THE
     * SINGLE ONE RATHER THAN AGAINST A LIST OF ITS OWN ANSWERS.
     *
     * `manifestIndex` exists because asking `manifestOf` per session is a walk
     * of the whole historical record per row, and X-252 asks it of every
     * session on the machine on every repaint. Written as two functions they
     * can drift — so what is asserted is the IDENTITY of their answers, over
     * every shape the single one was just proved on plus a duplicated id.
     */
    const dup = base({ launchId: 'lch_bbb', cwd: 'D:/later' });
    const store = [a, b, dup];
    const at = M.manifestIndex(store);
    const runs = [
        { launchId: 'lch_aaa' }, { launchId: 'lch_bbb' }, { launchId: 'lch_zzz' },
        { launchId: '   ' }, {}, undefined
    ];
    ok('‼️ THE BULK LOOKUP AND THE SINGLE ONE ANSWER IDENTICALLY, run for run',
        runs.every(r => at(r) === M.manifestOf(store, r)));
    ok('…including a duplicated launchId, where both take the first record',
        at({ launchId: 'lch_bbb' }).cwd === 'D:/other');
    ok('…and an empty store', M.manifestIndex([])({ launchId: 'lch_aaa' }) === undefined);

    // ‼️ THE REASON THE JOIN IS NOT `taskId`. A task can be retried, and a retry
    // is a NEW spawn with its own route resolution and its own manifest under
    // the same task — keyed off the task, the second run would silently claim
    // the first one's setup and the record would say two runs shared a route
    // they never shared.
    const fs = require('fs');
    const bind = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launchBinding.ts'), 'utf8');
    ok('‼️ the binding carries the launchId, and says why it is not the task id',
        /launchId\?: string;/.test(bind) && /NOT A SECOND `taskId`/.test(bind));
}

console.log('\n== the store is bounded before the first row is written ==');
{
    // ‼️ A manifest is written on EVERY spawn, and this farm spawns on schedules,
    // triggers, workflow steps and mission members. Unbounded, that is a file
    // that grows for as long as the install lives — X-127's whole subject, and
    // the cheapest moment not to have it is before the first one exists.
    let list = [];
    for (let i = 0; i < 12; i++) { list = M.rememberManifest(list, base({ launchId: 'lch_' + i }), 5); }
    eq('the cap holds', list.length, 5);
    eq('‼️ …and it is the OLDEST that go: a manifest matters while its run is still '
        + 'being asked about',
        list.map(m => m.launchId), ['lch_7', 'lch_8', 'lch_9', 'lch_10', 'lch_11']);
    // ‼️ TEN AT ONCE ALL SURVIVE THEIR OWN TURN — the acceptance line's case, and
    // they do because they are the newest.
    let ten = [];
    const ids = [];
    for (let i = 0; i < 10; i++) {
        const id = M.newLaunchId(1700000000000);
        ids.push(id);
        ten = M.rememberManifest(ten, base({ launchId: id }));
    }
    eq('ten spawns in one millisecond are ten rows', ten.length, 10);
    ok('…and each one finds its own manifest back',
        ids.every(id => M.manifestOf(ten, { launchId: id })));

    const twice = M.rememberManifest(
        M.rememberManifest([], base({ launchId: 'lch_same', cwd: 'D:/first' })),
        base({ launchId: 'lch_same', cwd: 'D:/second' }));
    eq('‼️ writing the same launchId twice REPLACES rather than adding a second row — '
        + 'two rows under one id would make the lookup depend on array order',
        [twice.length, twice[0].cwd], [1, 'D:/second']);
}

/* ===========================================================================
 * X-102 (4/n) — THE STORE, AND THE FIRST SPAWN DOOR THAT WRITES TO IT.
 *
 * The core above is pure and was already proved. What could not be proved from
 * it is the thing that makes it worth anything: that a real spawn writes one,
 * that the record is born from the SAME route resolution the process will run
 * on, and that the id reaches something which will later learn the session id.
 * A manifest nothing can be joined to is a setup on file for a conversation
 * nobody can find.
 * ========================================================================= */
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    // ---- one resolution, two readers ----
    ok('‼️ the route is resolved ONCE, and the identity comes out of it',
        /const resolveLaunchRoute = \(/.test(ext)
        && /identity: rt\.identity,\s*\n\s*routed: !!chosen\.providerId,/.test(ext));
    ok('…and the environment half keeps the contract it always had',
        /if \(!r\?\.routed\) \{ return undefined; \}/.test(ext));
    ok('‼️ …so a routeless launch gets NO overlay but still HAS an identity',
        /\.\.\.\(chosen\.providerId && rt\.spawnEnv \? \{ spawnEnv: rt\.spawnEnv \} : \{\}\)/.test(ext)
        && /\.\.\.\(chosen\.providerId && rt\.clearEnv \? \{ clearEnv: rt\.clearEnv \} : \{\}\)/.test(ext));

    // ---- the store ----
    ok('the store is bounded by the core on every write, not swept later',
        /rememberManifest\(launchManifests\(\), m\)/.test(ext));
    ok('‼️ a manifest that would leak a credential is NOT written',
        /const leaks = manifestLeaks\(m\);/.test(ext)
        && /a launch manifest was NOT written/.test(ext));
    ok('minting, assembling and keeping are one call, so no door does two of the three',
        /const recordLaunch = \(input: Omit<ManifestInput, 'launchId' \| 'at'>\): string =>/.test(ext)
        && /manifestFor\(\{\s*\n?\s*\.\.\.input, launchId: newLaunchId\(at\), at[,\s]/.test(ext));
    // ‼️ X-251 — AND THE ACCOUNT IS RESOLVED IN THAT SAME ONE PLACE. Every door
    // reaches the spawn through `recordLaunch`, so resolving the slot here is
    // what makes "whose plan paid" true of all of them; asking ten call sites
    // to remember is the shape this whole family exists to refuse.
    // ‼️ X-255 — AND THE AGENT IS PART OF THE RESOLUTION, not a later lookup.
    // The per-agent standing sign-in is a rung of `resolveAccount`, so a record
    // written without saying whose session it is would name the machine-wide
    // account for a run that really spent the agent's own.
    ok('‼️ …and whose plan paid is resolved there too, not copied out of the options',
        /const slot = launchAccountSlot\(\{\s*\n\s*engine: input\.engine, agentId: input\.agentId, \.\.\.input\.options\s*\n\s*\}\);/.test(ext)
        && /\.\.\.\(slot\?\.id \? \{ account: slot\.id \} : \{\}\)/.test(ext));

    // ---- the terminal door ----
    const door = ext.slice(ext.indexOf('const startClaudeSession = ('),
        ext.indexOf('const startClaudeSession = (') + 9500);
    ok('‼️ the terminal door writes its manifest from the same resolution',
        /const resolved = resolveLaunchRoute\(agent\.id, spec\.id, route\);/.test(door)
        && /const launchId = resolved && recordLaunch\(\{/.test(door));
    ok('…as a session, in the folder the process is really spawned in',
        /mechanism: 'session',/.test(door) && /cwd: launchCwd,/.test(door));
    ok('‼️ …and the surface tells an external window apart from an integrated one',
        /surface: cfg\(\)\.get<boolean>\('externalTerminal', false\)\s*\n\s*\? 'external-terminal' : 'terminal',/.test(door));
    ok('…written a line BEFORE the spawn, so a launch that never ran still has a record',
        door.indexOf('const launchId = resolved && recordLaunch({')
        < door.indexOf('launchClaudeTerminal(`${spec.exe}'));

    // ---- the console door ----
    const card = ext.slice(ext.indexOf('const startConsoleSession = ('),
        ext.indexOf('const startConsoleSession = (') + 4500);
    ok('‼️ a Console card writes one too, off the same resolution',
        /const resolved = resolveLaunchRoute\(agent\.id, engineOf\(merged\.engine\)\.id, \{/.test(card)
        && /const launchId = resolved && recordLaunch\(\{/.test(card));
    ok('…as a console session, and the handle goes onto the card',
        /surface: 'console',/.test(card) && /\.\.\.\(launchId \? \{ launchId \} : \{\}\),/.test(card));
    ok('…before the process is asked for, not after it answers',
        card.indexOf('const launchId = resolved && recordLaunch({')
        < card.indexOf('const id = consoleHost.start({'));

    // ---- ‼️ X-109 R2 — the composer's Send and the bridge's fresh console.start ----
    // Measured 2026-09-18: two cards started from the composer read `legacy` to
    // the resume gate — neither door wrote a manifest, only startConsoleSession did.
    {
        const helper = ext.slice(ext.indexOf('const recordConsoleCard = ('), ext.indexOf('const recordConsoleCard = (') + 1500);
        ok('‼️ one helper writes a Console card\'s manifest, off the same resolution',
            /const resolved = resolveLaunchRoute\(o\.agentId, engine, \{/.test(helper)
            && /return resolved \? recordLaunch\(\{/.test(helper)
            && /mechanism: 'session',/.test(helper) && /surface: 'console',/.test(helper));
        const op = ext.slice(ext.indexOf("op: 'console.start'"), ext.indexOf("op: 'console.start'") + 30000);
        const rec = op.indexOf('const launchId = resume ? undefined : recordConsoleCard({');
        const start = op.indexOf('const id = consoleHost.start({');
        ok('‼️ the bridge writes it for a FRESH card, before the process is asked for, and not for a resume',
            rec > 0 && start > rec
            && /\.\.\.\(launchId \? \{ launchId \} : \{\}\),/.test(op.slice(start, start + 400)));
        ok('…and the composer is handed the same helper', /recordConsoleLaunch: recordConsoleCard,/.test(ext));
        const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
        const prec = panel.indexOf('const launchId = this.deps.recordConsoleLaunch?.({');
        const pstart = panel.indexOf('this.selected = host.start({', prec);
        ok('‼️ the composer\'s Send writes the manifest on the SLOT that runs, then starts the card with its id',
            prec > 0 && pstart > prec
            && /options: \{ \.\.\.started, account: pick\.id \|\| undefined \},/.test(panel.slice(prec, pstart))
            && /\.\.\.\(launchId \? \{ launchId \} : \{\}\),/.test(panel.slice(pstart, pstart + 300)));
    }

    // ---- and the join, on both surfaces ----
    ok('‼️ the launch id lands on the record that will learn the session id',
        /launchId\?: string;/.test(ext)
        && (ext.match(/termBindings\.push\(\{[^}]*launchId \}\);/g) || []).length === 2);
    {
        const proto = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consoleproto.ts'), 'utf8');
        const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
        ok('‼️ …and on a card it lives on the STATE, which is what survives a reload',
            /launchId\?: string;/.test(proto)
            && /\.\.\.\(o\.launchId\?\.trim\(\) \? \{ launchId: o\.launchId\.trim\(\) \} : \{\}\)/.test(proto));
        ok('…handed to every state the host builds, including the refused one',
            (host.match(/launchId: init\.launchId,/g) || []).length === 4);
    }

    // ---- the automated door: one record for three shapes of run ----
    {
        const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
        ok('‼️ the runner states the facts and does NOT resolve the route itself',
            /recordLaunch\?: \(run: \{/.test(tasks)
            && !/resolveRuntime|providerProfiles/.test(tasks));
        ok('…written once, at the point every shape of a run passes through',
            (tasks.match(/task\.launchId = this\.opts\.recordLaunch\?\.\(\{/g) || []).length === 1);
        ok('‼️ …and the Console shape is skipped, or one run would have two records',
            /const hostedHere = task\.mode !== 'headless' && target === 'console'/.test(tasks)
            && /if \(!hostedHere\) \{/.test(tasks));
        ok('the surface tells headless, an OS window and an integrated terminal apart',
            /surface: task\.mode === 'headless'\s*\n\s*\? 'headless' : target === 'external' \? 'external-terminal' : 'terminal'/.test(tasks));
        ok('‼️ the mechanism does NOT walk the retry chain — a retry is its own spawn',
            /private launchMechanismOf\(task: FarmTask\)/.test(tasks)
            && !/retryOf/.test(tasks.slice(tasks.indexOf('private launchMechanismOf'),
                tasks.indexOf('private launchMechanismOf') + 900)));
        ok('…and the run is recorded on the TASK, which is what the binding is built from',
            /launchId\?: string;/.test(tasks)
            && /\.\.\.\(t\.launchId \? \{ launchId: t\.launchId \} : \{\}\),/.test(ext));
        ok('‼️ X-296 — an automated run passes ITS OWN route, because a stored '
            + 'automation carries one and the spawn beside it resolves with it',
            /const resolved = agent \? resolveLaunchRoute\(agent\.id, run\.engine, \{\s*\n\s*providerId: run\.options\.providerId, tier: run\.options\.tier\s*\n\s*\}\) : undefined;/.test(ext));
        ok('‼️ X-296 — …and the discipline recorded is the RUN\'s first, the agent '
            + 'default only in its absence, and never for a mission member',
            /superpowers: run\.options\.superpowers\s*\n\s*\?\? \(run\.mechanism !== 'mission' && superpowersOnFor\(agent\.name\)\)/.test(ext));
        ok('…and the recorder takes the whole option shape, so a new dimension '
            + 'cannot be narrowed out of the record by its type',
            /options: LaunchOptions;/.test(ext));
        ok('…and an unfilled hole records nothing rather than throwing at a spawn',
            /recordLaunch: \(run\) => recordTaskLaunch\?\.\(run\),/.test(ext));
    }

    /* ---------------------------------------------------------------------
     * ‼️ X-296 — THE RECORD OF A TASK IS DERIVED FROM THE TASK, and this is the
     * guard that makes that sentence fail rather than rot.
     *
     * The call site used to write `{ model, effort, permissionMode }` by hand
     * while the spawn a few lines below it resolved the runtime from
     * `routeOf(task)` and the environment from `task.account`. Four dimensions
     * were therefore recorded wrong, and one of them was measured live: a
     * headless run under `claude-murvietnam` filed a manifest naming
     * `claude-aicozums`, the engine's active sign-in — X-251's own fault,
     * reappearing at the one door X-251 never read.
     *
     * So the field list is NOT written here either. It is the intersection of
     * `LaunchOptions` and `RunDimensions` read out of the two sources: a tenth
     * shared dimension added to either interface fails this line on the day it
     * is added, which is the only version of "every dimension travels" that
     * survives the person who wrote it.
     * ------------------------------------------------------------------- */
    {
        const launchTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'launch.ts'), 'utf8');
        const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
        /** The fields of one exported interface, read out of its own source —
         *  the `test_launch_dimensions.js` reader, which finds the end of a
         *  comment-heavy body at the first `}` sitting in column 0. */
        const fieldsOf = (src, name) => {
            const at = src.indexOf(`export interface ${name} {`);
            const body = at < 0 ? '' : src.slice(at, src.indexOf('\n}', at));
            const out = [];
            const re = /^ {4}(\w+)\??:/gm;
            let m;
            while ((m = re.exec(body))) { if (!out.includes(m[1])) { out.push(m[1]); } }
            return out;
        };
        // The runner is a core module, so it arrives through the same vscode
        // stand-in every other suite that loads it uses (test_task_events.js).
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request, parent, isMain) {
            if (request === 'vscode') {
                return {
                    EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } dispose() { } },
                    Disposable: { from: () => ({ dispose() { } }) },
                    window: {
                        showInformationMessage: () => Promise.resolve(undefined),
                        showWarningMessage: () => Promise.resolve(undefined),
                        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
                        onDidCloseTerminal: () => ({ dispose() { } })
                    }
                };
            }
            return origLoad.call(this, request, parent, isMain);
        };
        const T = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
        Module._load = origLoad;

        const inTasks = fieldsOf(tasksTs, 'RunDimensions');
        const shared = fieldsOf(launchTs, 'LaunchOptions').filter(f => inTasks.includes(f));
        ok('the two interfaces really do share dimensions — a reader that found '
            + 'none would pass every line below it', shared.length >= 9);
        // A task that states EVERY shared dimension — so a field that fails to
        // travel shows up as an absence rather than as a coincidence.
        const full = {
            id: 't1', agentId: 'dev', agentName: 'developer', prompt: 'p', mode: 'headless',
            engine: 'codex', model: 'gpt-5', effort: 'high', permissionMode: 'plan',
            account: 'claude-murvietnam', cli: 'codex', providerId: 'kimi', tier: 'opus',
            superpowers: false
        };
        const got = T.launchDimsOf(full);
        const missing = shared.filter(f => got[f] === undefined);
        eq('‼️ every dimension LaunchOptions and RunDimensions share reaches the record',
            missing, []);
        eq('…with the values the run was given, not a normalised guess at them', [
            got.model, got.effort, got.permissionMode, got.account, got.cli,
            got.providerId, got.tier
        ], ['gpt-5', 'high', 'plan', 'claude-murvietnam', 'codex', 'kimi', 'opus']);
        ok('…and the engine as the id the record itself files the run under',
            got.engine === 'codex');
        // ‼️ M-30 — `false` is a person answering, and an `if (x)` here would
        // have dropped it and let the record report the agent's default.
        ok('‼️ a discipline switched OFF on this job is recorded as off, not as absent',
            got.superpowers === false);

        const bare = T.launchDimsOf({ id: 't2', agentId: 'dev', agentName: 'developer',
            prompt: 'p', mode: 'headless' });
        eq('‼️ …while nothing stated stays absent — a key set to undefined would '
            + 'erase the engine the record spreads it over',
            Object.keys(bare).filter(k => bare[k] === undefined), []);
        ok('…and an unstated discipline is not answered on the run\'s behalf',
            !('superpowers' in bare));
        // ‼️ The same rule `runExtras` applies: `opus` is a different model on two
        // routes, so alone it is a claim nothing can resolve.
        const tierOnly = T.launchDimsOf({ id: 't3', agentId: 'dev', agentName: 'developer',
            prompt: 'p', mode: 'headless', tier: 'opus' });
        ok('‼️ a tier with no route is dropped, exactly as the runner drops it',
            tierOnly.tier === undefined && tierOnly.providerId === undefined);

        ok('‼️ …and the call site asks for the shape rather than listing it again',
            /options: launchDimsOf\(task\),/.test(tasksTs)
            && !/options: \{\s*\n\s*model: task\.model/.test(tasksTs));
    }

    // ---- the bridge can read it, which is what makes it evidence ----
    ok('the manifests are readable over the bridge', /op: 'launch\.manifests',/.test(ext));
    ok('‼️ …and an id with no record returns nothing rather than a nearest match',
        /const hit = manifestOf\(launchManifests\(\), \{ launchId: one \}\);\s*\n\s*return hit \? \[hit\] : \[\];/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
