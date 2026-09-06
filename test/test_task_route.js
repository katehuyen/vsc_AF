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
        return {
            Uri: {}, window: {}, ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } },
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
    ok('‼️ a retry runs on the route the original ran on',
        /copy\.providerId = task\.providerId;/.test(src)
        && /copy\.tier = task\.tier;/.test(src));
    ok('…and an override clears the tier rather than carrying it onto a new route',
        /copy\.tier = over\.providerId \? over\.tier : undefined;/.test(src));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
