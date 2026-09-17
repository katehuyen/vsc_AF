// X-106 — THE ROUTE AN UNATTENDED RUN IS SERVED BY.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. Every other launch dimension on a
// stored automation is there because of one sentence: an automation fires with
// nobody at a window, so anything about the run has to be stated when the
// automation is WRITTEN or it is not stated at all. The endpoint the process
// really talks to was the one dimension that could not be stated anywhere — a
// nightly job took whichever standing route the agent happened to have at 3 a.m.
//
// Four ways that can be got wrong, and each is held here:
//
//   1. THE DIMENSION REACHES THE OBJECT AND NOT THE SPAWN. A field stored on a
//      schedule that never reaches `engineRuntime` is a picker that does
//      nothing — worse than no picker, because it reads as a decision.
//   2. THE TIER TRAVELS WITHOUT ITS ROUTE. `opus` is `kimi-k2-thinking` on one
//      route and `MiniMax-M2` on another (X-101). A tier that survives a route
//      change, or is stored with no route at all, is one word meaning two
//      things depending on which row happened to be selected.
//   3. IT IS DROPPED INSTEAD OF REFUSED. A composer redraws and can afford to
//      narrow; an automation is written once and read months later, so a value
//      silently discarded at write time is a decision that never happens and
//      never says so.
//   4. A ROUTE BESIDE A CLI PROFILE. A CLI profile is a command template for a
//      binary this extension knows nothing about — there is no endpoint to
//      point at it, and nothing afterwards could say what served the run.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const throws = (n, fn, re) => {
    try { fn(); ok(n, false); } catch (e) { ok(n + ` (said "${String(e.message).slice(0, 60)}")`, re.test(String(e.message))); }
};

// `tasks.js` reaches for `vscode` at load time; nothing measured here touches
// it, so the smallest stub that lets the module load is the honest one.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        // ‼️ …AND THE MANAGER ITSELF IS BUILT HERE NOW (step (1) seals inside
        // `addTask`), so the window needs the two subscriptions its constructor
        // takes. A stub that answers `undefined` to those throws at `new`.
        const off = () => ({ dispose() { } });
        return {
            Uri: {},
            window: { onDidCloseTerminal: off, onDidOpenTerminal: off, showWarningMessage: () => { } },
            ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class {
                constructor() { this.event = () => ({ dispose() { } }); }
                fire() { }
                dispose() { }
            },
            QuickPickItemKind: { Separator: -1 },
            commands: { executeCommand: () => { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const T = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));

console.log('\n== X-106 — the route travels by the SHAPE every automation extends ==');
{
    eq('a route on the dimensions reaches the task',
        [T.runExtras({ providerId: 'kimi-work' }).providerId], ['kimi-work']);
    eq('…and the tier of that route with it',
        T.runExtras({ providerId: 'kimi-work', tier: 'opus' }).tier, 'opus');
    eq('‼️ a tier with NO route is dropped — the word has no referent until a route '
        + 'answers it, and carrying it would store a decision nothing can resolve',
        T.runExtras({ tier: 'opus' }).tier, undefined);
    eq('nothing stated writes nothing — "not stated" never becomes an empty flag',
        Object.prototype.hasOwnProperty.call(T.runExtras({}), 'providerId'), false);
}

console.log('\n== …and reaches the SPAWN, in the shape the resolver takes ==');
{
    eq('a run with no route asks for none, so the agent\'s own record decides',
        T.routeOf({}), undefined);
    eq('…and an empty string is the same answer, not an empty route',
        T.routeOf({ providerId: '  ' }), undefined);
    eq('a route becomes the resolver\'s own shape', T.routeOf({ providerId: 'kimi-work' }),
        { providerId: 'kimi-work' });
    eq('…with the tier when there is one',
        T.routeOf({ providerId: 'kimi-work', tier: 'opus' }), { providerId: 'kimi-work', tier: 'opus' });

    // ‼️ BOTH SPAWN SHAPES, because the way this regresses is one of the two
    // being given the route and the other left inheriting — and the two live
    // 400 lines apart in the same file.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const calls = (src.match(/engineRuntime\?\.\([^)]*routeOf\(task\)\)/g) || []).length;
    ok('‼️ the interactive spawn AND the headless spawn both pass the task\'s own route',
        calls === 2);
    ok('…and neither of them reads the fields by hand instead',
        !/engineRuntime\?\.\([^)]*\{\s*providerId:\s*task\./.test(src));
    // ‼️ …AND THE RETRY'S ROUTE IS DECIDED BEFORE THE ROW EXISTS, not written
    // onto it afterwards. X-106 step (1) moved it: the enqueue is where the
    // route is SEALED, so a route patched onto the returned object is a route
    // the seal never saw and a run whose own history starts blank.
    ok('‼️ a retry runs on the route the original ran on, and names it at the enqueue',
        /const retryRoute = routeOf\(over && 'providerId' in over\s*\n\s*\? \{ providerId: over\.providerId, tier: over\.tier \}\s*\n\s*: \{ providerId: task\.providerId, tier: task\.tier \}\);/.test(src)
        && /\.\.\.\(retryRoute \?\? \{\}\),/.test(src));
    ok('…and it goes through `routeOf`, which is what clears a tier left over from a cleared route',
        !/copy\.providerId = /.test(src) && !/copy\.tier = /.test(src));
}

console.log('\n== the door refuses rather than drops ==');
{
    eq('a route and its tier are read', [
        B.bridgeRunDimensions({ providerId: 'kimi-work', tier: 'opus' }).providerId,
        B.bridgeRunDimensions({ providerId: 'kimi-work', tier: 'opus' }).tier
    ], ['kimi-work', 'opus']);
    throws('‼️ a tier with no route is REFUSED at write time, not silently dropped',
        () => B.bridgeRunDimensions({ tier: 'opus' }), /tier belongs to a route/);
    throws('‼️ a route beside a CLI profile is refused — there is no endpoint to point '
        + 'at a binary Agent Farm does not know',
        () => B.bridgeRunDimensions({ providerId: 'kimi-work', cli: 'my-tool' }),
        /two answers to one question/);
    throws('…and the same contradiction is refusable about a MERGED run, which is how '
        + 'it is usually made (one argument against a stored value)',
        () => B.needRoutableEngine('my-tool', 'kimi-work'), /two answers to one question/);
    ok('…while either alone is fine', (() => {
        B.needRoutableEngine('my-tool', '');
        B.needRoutableEngine('', 'kimi-work');
        return true;
    })());

    // ‼️ WHETHER THE ROUTE EXISTS IS NOT THIS FILE'S QUESTION. It needs the
    // engine's adapter and the user's own profiles, so it arrives as a
    // callback — the same doctrine `cli` follows. A copy of the resolution
    // rules living in a file nobody thinks of as provider logic is the exact
    // shape of the bug X-98 measured.
    const asked = [];
    const dims = B.bridgeRunDimensions({ engine: 'claude', providerId: 'kimi-work', tier: 'opus' }, {
        route: (engine, providerId, tier) => { asked.push([engine, providerId, tier]); return undefined; }
    });
    eq('the door asks the adapter\'s side, with the engine the run will be on',
        asked, [['claude', 'kimi-work', 'opus']]);
    eq('…and stores what it approved', dims.providerId, 'kimi-work');
    throws('‼️ …and a refusal from it is the answer, not a note beside a success',
        () => B.bridgeRunDimensions({ providerId: 'nope' }, { route: () => 'no such route here' }),
        /no such route here/);
    eq('nothing is asked when no route was stated — most runs',
        (() => { const seen = []; B.bridgeRunDimensions({ model: 'opus' }, { route: () => { seen.push(1); return undefined; } }); return seen.length; })(),
        0);
}

console.log('\n== and it comes back out, or a round trip erases it ==');
{
    const out = B.bridgeDimsOut({ engine: 'claude', providerId: 'kimi-work', tier: 'opus' });
    eq('the route and its tier are on the way back out too', [out.providerId, out.tier],
        ['kimi-work', 'opus']);
    const bare = B.bridgeDimsOut({});
    eq('‼️ null is the real answer "no route chosen" — nothing injected, nothing cleared',
        [bare.providerId, bare.tier], [null, null]);
}

console.log('\n== one reader, and the resolver attached to it exactly once ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    /**
     * ‼️ TEN CALL SITES EACH PASSING THEIR OWN RESOLVER IS TEN PLACES TO LEAVE
     * IT OFF, and the one left off is a schedule that stores a typo'd route
     * tonight and refuses it at 3 a.m. with nobody watching — the failure
     * furthest in time from the mistake that caused it, which is the exact
     * thing `bridgeRunDimensions` was written to move forward.
     */
    eq('‼️ every door reads its dimensions through the ONE wrapper',
        (ext.match(/bridgeRunDimensions\(/g) || []).length, 1);
    ok('…and that wrapper is what the doors call', (ext.match(/runDims\(/g) || []).length >= 8);
    ok('…and it is the place the route resolver is attached',
        /const runDims = \([\s\S]{0,900}?route: \(engine, providerId, tier\) =>/.test(ext));
    ok('‼️ …and it REFUSES rather than narrowing, which is the difference between a '
        + 'composer that redraws and an automation nobody reads again',
        /is not a route \$\{engineOf\(engine\)\.id\} can be pointed at/.test(ext));
    ok('…and a tier the route does not map is refused by name too',
        /is not a tier the "\$\{providerId\}" route maps/.test(ext));

    // ‼️ THE FORM AND THE BRIDGE OFFER THE SAME THING, which is the rule
    // `_REF/agentfarm-dev.md` calls panel-bridge equivalence: a dimension that
    // reached one door and not the other is the failure that rule exists for.
    ok('the contract says which route serves the run, once, spliced into every door',
        /export const ROUTE_NOTE =/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'bridge.ts'), 'utf8')));
    ok('…and it is spliced into the doors rather than typed out per op',
        (ext.match(/ROUTE_NOTE/g) || []).length >= 5);

    const page = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    // ‼️ X-228 — ONE route row, drawn into two surfaces. It used to be written
    // out inside the task form, which is where the workflow step card would have
    // copied it from; the caller now says only which two boxes it is.
    ok('the form has a route box, drawn only where there is something to pick',
        /function ntRouteRows\(routeId, tierId, engine, providerId, tier\)/.test(page)
        && /const routeForm = ntRoutes\(engine\)/.test(page)
        && /ntRouteRows\('route', 'tier', c\.engine, c\.providerId, c\.tier\)/.test(page));
    ok('…and a tier box under it, drawn only where that route publishes tiers',
        /id="nt-\$\{tierId\}"/.test(page) && /if \(!tiers\.length\) \{ return row; \}/.test(page));
    ok('‼️ …and moving the engine or the route drops what the new one cannot carry, '
        + 'exactly as the model box already does',
        /function ntNarrowRoute\(c\)/.test(page)
        && (page.match(/ntNarrowRoute\(composer\)/g) || []).length >= 2);
    /**
     * ‼️ X-228 — AND A WORKFLOW STEP IS NARROWED BY THE SAME RULE, NOT BY A
     * SECOND ONE WEARING AN `s` PREFIX.
     *
     * A step draft names the dimensions `sengine`/`smodel`/`sproviderId`… — the
     * prefix is the only difference, and it must not become a reason to write
     * the rule again: X-149 closed exactly that failure, four copies of one
     * question answering it four ways. So the step is VIEWED as a run for the
     * length of the call and the shared answers are written back.
     */
    ok('‼️ a step card narrows through the SAME rule, in its own vocabulary',
        /function stepNarrow\(s, which\)/.test(page)
        && /ntNarrowRoute\(view\)/.test(page) && /ntNarrowAccount\(view\)/.test(page)
        && /window\.AFLaunch\.narrowModel\(ntCatalog\(view\.engine\), view\.model\)/.test(page)
        && /view\.effort = ntNarrowEffort\(view\.engine, view\.model, view\.effort\)/.test(page));
    ok('…and its engine, model and route boxes are the three that ask it',
        /byId\('nt-st-sengine', 'change'[\s\S]{0,140}?stepNarrow\(composer && composer\.step, 'engine'\)/.test(page)
        && /byId\('nt-st-smodel', 'change'[\s\S]{0,140}?stepNarrow\(composer && composer\.step, 'model'\)/.test(page)
        && /byId\('nt-st-sproviderId', 'change'[\s\S]{0,140}?stepNarrow\(composer && composer\.step, 'route'\)/.test(page));
    // ‼️ …and a tier with no route under it is not carried to the run, which is
    // the same refusal `runExtras` makes one layer down: `opus` is a different
    // model on every route, so the word answers nothing on its own.
    ok('…and a step\'s tier is stored only where that step named a route',
        /tier: str\('sproviderId'\) \? \(str\('stier'\) \|\| undefined\) : undefined/
            .test(fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8')));
}

/**
 * ‼️ X-106 step (2) — THE CONSOLE DOOR. A task with `interactiveTarget:
 * 'console'` is not spawned by the runner at all: the gate in extension.ts
 * describes the run and `consoleHost.start` opens it. Measured 2026-09-17: the
 * gate was a hand-written field list (engine · model · effort · permissionMode
 * · projectId) and `providerId`, `tier`, `account` and `superpowers` fell out —
 * a task handed to the Console opened on the agent's defaults, not on what
 * the task said. The same doctrine as X-227/X-229 (`test_retry.js`): the list
 * is `RunDimensions`, read out of the source, and the ones the Console has no
 * use for are named as EXEMPT rather than left to silence.
 */
console.log('\n== X-106 (2) — a task handed to the Console keeps every dimension it can use ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const at = tasksTs.indexOf('export interface RunDimensions');
    const fields = [...tasksTs.slice(at, tasksTs.indexOf('\n}', at))
        .matchAll(/^ {4}([a-zA-Z][\w]*)\??:/gm)].map(m => m[1]);
    ok('RunDimensions was found and has fields', at > 0 && fields.length >= 10);

    // the gate: by the shape, never a field list
    const gate = (() => {
        const a = ext.indexOf('startConsoleTask: spec => consoleTaskStart?.({');
        return a < 0 ? '' : ext.slice(a, ext.indexOf('}),', a));
    })();
    ok('the task gate into the Console was found', gate.length > 50);
    ok('‼️ the gate spreads `runExtras(spec.task)` — the shape, so the next dimension travels without this seam knowing',
        /\.\.\.runExtras\(spec\.task\)/.test(gate));
    ok('…and reads no dimension by hand beside it (projectId is not a dimension and stays explicit)',
        !/engine: spec\.task\.engine/.test(gate) && !/model: spec\.task\.model/.test(gate) && /projectId: spec\.task\.projectId/.test(gate));
    ok('…the seam\'s spec type is `Partial<RunDimensions>`, not a field list',
        /let consoleTaskStart:[\s\S]{0,400}& Partial<RunDimensions>\)/.test(ext));

    // the door: every dimension the Console can use reaches `consoleHost.start`
    const door = (() => {
        const a = ext.indexOf('consoleTaskStart = spec => {');
        const b = ext.indexOf('ConsolePanel.show(consoleDeps, { sessionId: id });', a);
        return a < 0 || b < 0 ? '' : ext.slice(a, b);
    })();
    ok('the Console door (`consoleTaskStart`) was found', door.length > 300 && /consoleHost\.start\(\{/.test(door));
    // What the Console has no use for: a CLI profile is a command template for
    // a binary the panel does not host; the interactive target/close and the
    // finish sound are the runner's terminal furniture; workDir arrives as
    // `cwd`; priority, rounds, ignoreBudget and retry are the queue's.
    const EXEMPT = ['cli', 'interactiveTarget', 'interactiveClose', 'finishSound', 'workDir', 'priority', 'rounds', 'ignoreBudget', 'retry'];
    const carried = fields.filter(f => !EXEMPT.includes(f));
    ok('‼️ X-106 — the Console door carries EVERY dimension it can use (missing: '
        + carried.filter(f => !new RegExp(`\\b${f}\\b`).test(door)).join(', ') + ')',
        carried.every(f => new RegExp(`\\b${f}\\b`).test(door)));
    ok('…the route and the account and superpowers by name — the three that were dropped',
        /providerId: spec\.providerId/.test(door) && /tier: spec\.tier/.test(door) && /\{ account \}/.test(door) && /superpowers: spec\.superpowers/.test(door));
    ok('‼️ the ACCOUNT is resolved at the door, once, with commit — a rule becomes a slot against this moment\'s figures',
        /launchAccountFor\(engine, spec\.account, spec\.agentId, \{ model, commit: true \}\)/.test(door));
    ok('‼️ …and a rule that can choose nothing REFUSES the way an absent engine does: a warning and no session, never the main sign-in',
        /try \{[\s\S]{0,200}launchAccountFor[\s\S]{0,300}catch[\s\S]{0,200}showWarningMessage[\s\S]{0,100}return undefined;/.test(door));
    ok('…a tier never travels without its route', /spec\.providerId && spec\.tier \? \{ tier: spec\.tier \}/.test(door));
    ok('…superpowers falls to the agent\'s default when the task says nothing, as the headless spawn does',
        /superpowers: spec\.superpowers \?\? superpowersOnFor\(spec\.agentName\)/.test(door));
    ok('…the exemptions are really absent from the door, so the list above is measured and not decorative',
        EXEMPT.every(f => !new RegExp(`\\b${f}: spec\\.${f}\\b`).test(door)));
}

/**
 * ‼️ X-106 step (1) — WHAT THE ROUTE WAS WHEN THE RUN WAS QUEUED.
 *
 * Everything above holds the route a stored automation NAMES. None of it says
 * what that name MEANT: a profile can be edited, re-keyed or pointed at another
 * endpoint while the row waits in the queue, and the spawn then resolves the
 * same name to a different answer. Nothing downstream could notice, because the
 * manifest records what the run resolved to and is right about that — so both
 * readings of "which endpoint served the nightly batch" were one sentence
 * written twice, with the change between them nowhere at all.
 *
 * Five ways to get the seal wrong, and each is held here:
 *   1. SEALED AT THE SPAWN. A record of the route a run already took answers
 *      nothing; the enqueue is the moment somebody made the choice.
 *   2. SEALED WHEN NOTHING WAS CHOSEN. With no route named, the agent's own
 *      standing record decides at the spawn — a seal there would report drift
 *      the first time the user changed that record, about a run that never
 *      named a route.
 *   3. TWO RESOLVERS. The seal and the spawn's reading come out of ONE symbol,
 *      or a difference between them is the two callers disagreeing with each
 *      other rather than the route having moved.
 *   4. DRIFT ON EVERY RUN. Half of an identity is filled in from what came
 *      BACK (`reportedModels`, the proof), so a deep equality would report
 *      drift on every run that actually answered.
 *   5. HALF A COMPARISON. The task seals a catalog revision and the manifest
 *      stated none for six releases (the field existed, nothing filled it),
 *      which makes the other half of the question unanswerable.
 */
console.log('\n== X-106 (1) — the route is SEALED at the enqueue, and the spawn says when it moved ==');
{
    const os = require('os');
    const ident = over => Object.assign({
        engine: 'claude', providerId: 'anthropic', origin: 'agent-farm-profile', scope: 'session',
        providerProfileId: 'work', providerProfileRevision: 3,
        route: { baseUrl: 'https://api.anthropic.com', authKind: 'api-key' },
        requestedModelRef: 'claude-opus-5', proof: 'launch-declared'
    }, over || {});
    const sealed = over => ({ at: 1000, identity: ident(over), catalogRevision: 'c1' });
    const now = (over, catalogRevision) => ({
        identity: ident(over), ...(catalogRevision === undefined ? { catalogRevision: 'c1' } : { catalogRevision })
    });

    eq('two readings that agree are not drift', T.sealDrift(sealed(), now()), undefined);
    ok('‼️ a REVISION bump is drift, and it names both numbers',
        /profile revision 3 → 4/.test(T.sealDrift(sealed(), now({ providerProfileRevision: 4 })) || ''));
    const moved = T.sealDrift(sealed(), now({ providerProfileId: 'home', providerProfileRevision: 1 })) || '';
    ok('‼️ a DIFFERENT profile is named once, not also as a revision change — one change, one clause',
        /profile work → home/.test(moved) && !/revision/.test(moved));
    ok('the endpoint behind the profile moving is drift',
        /endpoint anthropic → kimi/.test(T.sealDrift(sealed(), now({ providerId: 'kimi' })) || ''));
    ok('…so is the base url it points at',
        /base url .* → https:\/\/api\.moonshot\.cn/.test(
            T.sealDrift(sealed(), now({ route: { baseUrl: 'https://api.moonshot.cn', authKind: 'api-key' } })) || ''));
    ok('…so is the KIND of credential it now uses',
        /auth api-key → oauth/.test(
            T.sealDrift(sealed(), now({ route: { baseUrl: 'https://api.anthropic.com', authKind: 'oauth' } })) || ''));
    ok('‼️ …and so is the model the tier maps to, which is the substance of the choice',
        /model claude-opus-5 → kimi-k2-thinking/.test(
            T.sealDrift(sealed(), now({ requestedModelRef: 'kimi-k2-thinking' })) || ''));
    ok('the catalog the choice was made against moving is drift too',
        /catalog c1 → c2/.test(T.sealDrift(sealed(), now(undefined, 'c2')) || ''));
    ok('‼️ WHAT CAME BACK IS NOT DRIFT — a deep equality would have reported it on every run that answered',
        T.sealDrift(sealed(), now({
            reportedModels: ['claude-opus-5'], reportedProviderIds: [], proof: 'engine-reported'
        })) === undefined);
    eq('an unsealed task cannot drift', T.sealDrift(undefined, now()), undefined);
    eq('…and neither can one the resolver has no answer for now', T.sealDrift(sealed(), undefined), undefined);

    // …and the real manager, at the two moments that matter.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-route-seal-'));
    const agent = { id: 'a1', name: 'developer', dir };
    const asked = [];
    let reading = 0;
    const tm = new T.TaskManager(path.join(dir, 'tasks.json'), () => [agent], () => false, () => '', {
        sealRoute: (agentId, engine, route) => {
            asked.push({ agentId, engine, route });
            return { at: ++reading, identity: ident(), catalogRevision: 'c1' };
        }
    });
    const routed = tm.addTask(agent, 'nightly', 'p', 'headless', { providerId: 'work', tier: 'opus' });
    ok('‼️ a task that names a route is sealed AT THE ENQUEUE',
        !!routed.routeSeal && routed.routeSeal.at === 1 && routed.routeSeal.catalogRevision === 'c1');
    eq('…and the resolver was asked for the engine and the route the task itself named',
        asked, [{ agentId: 'a1', engine: 'claude', route: { providerId: 'work', tier: 'opus' } }]);
    const bare = tm.addTask(agent, 'plain', 'p', 'headless', {});
    ok('‼️ a task that names NO route is not sealed, and the resolver is not even asked',
        bare.routeSeal === undefined && asked.length === 1);
    const handed = tm.addTask(agent, 'handed', 'p', 'headless', { routeSeal: { at: 1, identity: ident() } });
    ok('‼️ a seal arriving on the shape is DROPPED — a seal is a fact about the enqueue happening now',
        handed.routeSeal === undefined);
    // `autoStart: false`, because the seal is taken at the ENQUEUE and letting
    // the default fire would spawn a real engine out of a temp folder.
    const copy = tm.retryTask(routed, undefined, { autoStart: false });
    ok('‼️ a retry carries the route and seals ITSELF — its own enqueue, its own reading',
        !!copy && copy.providerId === 'work' && copy.tier === 'opus'
        && !!copy.routeSeal && copy.routeSeal.at === 2);
    tm.dispose();
    // The manager watches its own store, and Windows releases that handle a tick
    // after `dispose` — measured here as an EPERM on the folder itself.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

console.log('\n== X-106 (1) — one resolver, asked twice, and the record that says so ==');
{
    const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    // ‼️ THE SEAL IS NOT A DIMENSION. Nobody picks it, so it must not be inside
    // `RunDimensions` — a record that travelled with `runExtras` would be
    // inherited by every retry and clone as a true statement about another row.
    const dims = tasksTs.slice(tasksTs.indexOf('export interface RunDimensions'));
    ok('‼️ `routeSeal` is NOT a run dimension — a record is not a choice',
        !/routeSeal/.test(dims.slice(0, dims.indexOf('\n}'))));
    const extras = tasksTs.slice(tasksTs.indexOf('export function runExtras'));
    ok('…and `runExtras` does not carry it, so no retry, clone or edit inherits another row\'s seal',
        !/routeSeal/.test(extras.slice(0, extras.indexOf('\n}'))));

    // ‼️ ONE SYMBOL, TWO MOMENTS. Exactly two calls: the enqueue seals, the
    // spawn compares. A third would be a third opinion.
    eq('‼️ the resolver is asked exactly twice in the whole module — the enqueue and the spawn',
        (tasksTs.match(/this\.opts\.sealRoute\?\.\(/g) || []).length, 2);
    ok('…the enqueue drops anything handed in before it seals what it is given',
        /delete task\.routeSeal;[\s\S]{0,200}const route = routeOf\(task\);[\s\S]{0,200}this\.opts\.sealRoute\?\.\(/.test(tasksTs));
    ok('‼️ …and the spawn writes the difference on the run\'s OWN record, as its own kind of event',
        /const drift = sealDrift\(task\.routeSeal, this\.opts\.sealRoute\?\.\(/.test(tasksTs)
        && /noteTaskEvent\(task, 'route-drift', drift\)/.test(tasksTs));
    ok('…and it does not hold the run back — an edited profile is a changed answer, not a different question',
        !/route-drift[\s\S]{0,400}(return|park|deferred)/.test(
            tasksTs.slice(tasksTs.indexOf("noteTaskEvent(task, 'route-drift'"), tasksTs.indexOf("noteTaskEvent(task, 'route-drift'") + 260)));
    ok('‼️ the retry hands the route to `addTask` instead of writing it on the copy — a route the seal never saw is a blank history',
        /const retryRoute = routeOf\(over && 'providerId' in over/.test(tasksTs)
        && /\.\.\.\(retryRoute \?\? \{\}\),/.test(tasksTs)
        && !/copy\.providerId = task\.providerId/.test(tasksTs));

    // the extension's half: the same resolver every launch door already uses
    const sealOf = (() => {
        const a = ext.indexOf('const routeSealOf = (');
        return a < 0 ? '' : ext.slice(a, ext.indexOf('\n    };', a));
    })();
    ok('`routeSealOf` was found', sealOf.length > 100);
    ok('‼️ it answers out of `resolveLaunchRoute` — the symbol the terminal, the Console and the manifest all resolve through',
        /resolveLaunchRoute\(agentId, engine, route\)/.test(sealOf));
    ok('‼️ …and it answers nothing when nothing was chosen, so an unrouted run is never sealed against a standing route',
        /if \(!resolved \|\| !resolved\.routed\) \{ return undefined; \}/.test(sealOf));
    ok('…it stamps its own moment and states the catalog revision only where the source has one',
        /at: Date\.now\(\)/.test(sealOf) && /\.\.\.\(catalogRevision \? \{ catalogRevision \} : \{\}\)/.test(sealOf));
    ok('the task manager is wired to it', /sealRoute: \(agentId, engine, route\) => routeSealOf\(agentId, engine, route\)/.test(ext));
    ok('‼️ the catalog revision is asked of the ADAPTER, never of the engine name',
        /const catalogRevisionOf = \(engine: string\): string \| undefined =>\s*\n\s*adapterFor\(engine, registryDeps\(\)\)\.catalog\(\)\.revision \|\| undefined;/.test(ext));

    // ‼️ THE OTHER HALF OF THE COMPARISON. X-102 declared `catalogRevision` on
    // the manifest and nothing ever wrote it, so a seal that states one had
    // nothing to be compared against.
    const record = (() => {
        const a = ext.indexOf('const recordLaunch = (input:');
        return a < 0 ? '' : ext.slice(a, ext.indexOf('return m.launchId;', a));
    })();
    ok('`recordLaunch` was found', record.length > 200);
    ok('‼️ the manifest states the catalog revision too, resolved at the one point every door passes through',
        /const catalogRevision = catalogRevisionOf\(input\.engine\);/.test(record)
        && /\.\.\.\(catalogRevision \? \{ catalogRevision \} : \{\}\),/.test(record));

    // and it is readable — a seal nobody can read is a record that fails silently
    ok('‼️ `tasks.get` hands the seal over, and says what a `route-drift` event means',
        /routeSeal: task\.routeSeal \?\? null,/.test(ext)
        && /`routeSeal` is what the named route RESOLVED TO when the run was queued/.test(ext));
    ok('…and the run\'s timeline has a word for the event rather than falling back to its raw name',
        /'route-drift': 'route moved under it'/.test(fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
