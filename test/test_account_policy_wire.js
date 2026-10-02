/**
 * ‼️ X-305 (2/4) — THE POLICY SEAM REALLY LIVES IN THE PRODUCT.
 *
 * `test_account_policies.js` proves the CORE decides correctly. That is not the
 * same claim as "a launch asks it", and the difference is the whole of A-02.10:
 * X-169 closed green against mocks with its live wire never connected, and the
 * Engines card shipped four fields that reached no running page. So this file
 * never asks the core what it would answer — it asks `src/extension.ts` whether
 * the answer can reach a spawn.
 *
 * Four things are held, and each one is a defect that has actually shipped:
 *
 *   1. THE SEAM IS SINGULAR. `launchAccountFor` / `launchAccountSlot` /
 *      `launchAccountEnv` all resolve through `launchAccountPick`, so the
 *      account a door SHOWS and the account a process GETS cannot differ.
 *   2. A REFUSAL IS NEVER AN EMPTY STRING. `''` on this seam means "inject no
 *      variable", and no variable means the machine's main sign-in — which is
 *      exactly the plan a rule was written to protect (X-302). The spawn seam
 *      throws instead.
 *   3. THE WORLD IS SUPPLIED BY THE SHAPE, not by a hand-written field list.
 *      `PolicyWorld` is read out of the core's own source and every field of it
 *      must be supplied by `policyWorldFor`. A rule that silently decided
 *      against an unsupplied `pool` or `cursor` would answer confidently and
 *      wrongly, and no string test would notice.
 *   4. THE ROTATION IS COMMITTED WHERE A LAUNCH IS REAL. A readout that merely
 *      describes a setup must not advance `@round-robin`, or the picker moves
 *      the rotation every time a page is drawn.
 *
 *   node test/test_account_policy_wire.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'src', 'core', 'accountPolicy.ts'), 'utf8');
// X-475 — the resolver, its world and the account doors live in the placement surface; the host wires its deps
const place = fs.readFileSync(path.join(ROOT, 'src', 'launch', 'accountPlacement.ts'), 'utf8');

/** The text between the bracket that opens at `open` and its match. */
function span(src, open) {
    const shut = { '{': '}', '[': ']' }[src[open]];
    if (!shut) { return ''; }
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === src[open]) { depth++; }
        else if (c === shut) { depth--; if (!depth) { return src.slice(open, i + 1); } }
    }
    return '';
}
/** The text between the brace that opens at `from` and its match. */
const block = (src, from) => span(src, src.indexOf('{', from));
/**
 * ‼️ THE BODY, NOT THE TYPE. A declaration's first `{` is very often a type
 * literal (`o?: { model?: string }`) or a return type (`: { id: string }[]`), so
 * this walks to the ARROW first and takes what it points at — which is also how
 * it reads a function whose body is an array literal rather than a block.
 */
const fnBlock = (name) => {
    const src = ext.includes('const ' + name + ' = (') ? ext : place;
    const at = src.indexOf('const ' + name + ' = (');
    if (at < 0) { return ''; }
    const arrow = src.indexOf('=>', at);
    if (arrow < 0) { return ''; }
    const open = src.slice(arrow + 2).search(/\S/) + arrow + 2;
    return span(src, open);
};

// ------------------------------------------------- 1. one resolver, one truth
{
    ok('launchAccountPick exists — the one resolver, and the host takes it from the placement surface',
        /const launchAccountPick = \(/.test(place) && !/const launchAccountPick = \(/.test(ext)
        && /policyWorldFor, launchAccountPick, launchAccountFor, launchAccountSlot,[\s\S]{0,120}?\} = accountPlacement\(\{/.test(ext));
    ok('launchAccountPick asks the core',
        /const launchAccountPick[\s\S]{0,900}?resolvePolicy\(stated, policyWorldFor\(/.test(place));

    const forBlk = fnBlock('launchAccountFor');
    ok('launchAccountFor resolves through launchAccountPick', /launchAccountPick\(/.test(forBlk));
    ok('launchAccountFor no longer calls resolveAccount directly',
        !/resolveAccount\(/.test(forBlk));
    ok('resolveAccount is not imported any more — the seam owns the order',
        !/\bresolveAccount\b/.test(ext.slice(0, ext.indexOf('from \'./core/accountStore\';'))));

    const slotBlk = fnBlock('launchAccountSlot');
    ok('launchAccountSlot resolves through launchAccountPick', /launchAccountPick\(/.test(slotBlk));

    const envBlk = fnBlock('launchAccountEnv');
    ok('launchAccountEnv resolves through launchAccountPick', /launchAccountPick\(/.test(envBlk));
}

// ------------------------------------- 2. a refusal is loud, never an empty id
{
    const forBlk = fnBlock('launchAccountFor');
    ok('launchAccountFor throws on a refusal rather than answering \'\'',
        /if \(r\.refusal\) \{ throw new Error\(r\.refusal\); \}/.test(forBlk));

    const envBlk = fnBlock('launchAccountEnv');
    ok('launchAccountEnv refuses the spawn rather than injecting nothing',
        /if \(pick\.refusal\) \{ throw new Error\(pick\.refusal\); \}/.test(envBlk));
    // ‼️ The order matters: the throw must come BEFORE the slot is looked up,
    // or a refusing policy reaches `accountEnv(undefined)` — the main sign-in.
    ok('…and it refuses BEFORE it looks the slot up',
        envBlk.indexOf('pick.refusal') < envBlk.indexOf('findSlot(storedAccounts(), pick.id)'));

    const refBlk = fnBlock('launchAccountRefusal');
    ok('launchAccountRefusal hands the named rules to accountRefusal (a typo is caught at the door)',
        /accountRefusal\(o\.account, storedAccounts\(\), o\.engine, accountPolicies\(\)\)/.test(refBlk));
    ok('…and asks the rule itself, so a rule that exists but cannot choose is caught too',
        /isPolicyId\([\s\S]{0,80}?\)\) \{[\s\S]{0,120}?launchAccountPick\(o\)\.refusal/.test(refBlk));
}

// ------------------------------------------ 3. the world is built by the SHAPE
{
    const at = core.indexOf('export interface PolicyWorld');
    const shape = block(core, at);
    ok('PolicyWorld was found in the core', !!shape);

    // Field names as the interface declares them, comments and types stripped.
    const fields = [...shape.matchAll(/^\s{4}(\w+)\??\s*:/gm)].map(m => m[1]);
    ok('PolicyWorld declares a real list of fields', fields.length >= 8);

    const world = fnBlock('policyWorldFor');
    ok('policyWorldFor exists', !!world);

    /**
     * ‼️ ONE NAMED EXEMPTION, and it is the honest one: `now` is deliberately
     * NOT supplied. The core defaults it to the real clock, and a host that
     * froze it would be handing every launch a moment that is already past.
     * Anything else added to `PolicyWorld` must be supplied here or this fails —
     * which is the point: the list is derived, not declared.
     */
    const EXEMPT = { now: 'the core reads the real clock; a host-supplied moment would be stale' };
    for (const f of fields) {
        if (EXEMPT[f]) { continue; }
        // `:` is a written key, `,`/`}` is the shorthand `{ model }` form.
        ok(`policyWorldFor supplies PolicyWorld.${f}`,
            new RegExp('(^|[^\\w.])' + f + '\\s*(:|,|\\})').test(world));
    }
}

// --------------------------------------- 4. the rotation moves only on a spawn
{
    const pickBlk = fnBlock('launchAccountPick');
    ok('launchAccountPick never writes the cursor — it only answers',
        !/workspaceState\.update|setCursor/.test(pickBlk));

    const forBlk = fnBlock('launchAccountFor');
    ok('launchAccountFor writes the cursor only when the caller commits (the host\'s setCursor is the workspace state)',
        /if \(o\?\.commit && r\.cursor\)[\s\S]{0,200}?d\.setCursor\(/.test(forBlk)
        && /setCursor: \(k, v\) => \{ void context\.workspaceState\.update\(k, v\); \}/.test(ext));

    const envBlk = fnBlock('launchAccountEnv');
    ok('launchAccountEnv commits the cursor — a slot really became an environment',
        /if \(pick\.cursor\)[\s\S]{0,200}?workspaceState\.update\(/.test(envBlk));

    // The doors that pre-resolve the account must commit; the ones that only
    // REPORT or CHECK must not, or one launch advances the rotation three times.
    // X-106 (2) made the Console task door (`consoleTaskStart`) the fourth: a
    // task handed to the Console really starts a process there.
    const commits = [...ext.matchAll(/launchAccountFor\([\s\S]{0,200}?commit: (true|surface === 'terminal')/g)].length;
    ok('exactly the four pre-resolving spawn doors commit', commits === 4);
    // S-102 — a saved setup opened in the Console hands its RULE to the composer, which commits at Send
    ok('…a saved setup commits only when it spawns a terminal itself',
        /launchAccountFor\(o\.engine, o\.account, agent\.id,\s*\{ model: o\.model \|\| '', commit: surface === 'terminal' \}\)/.test(ext));
    ok('…the fourth is the Console task door', /consoleTaskStart = spec => \{[\s\S]{0,1500}?launchAccountFor\(engine, spec\.account, spec\.agentId, \{ model, commit: true \}\)/.test(ext));

    /**
     * ‼️ THE DOOR AND THE SPAWN ASK THE SAME QUESTION. A named rule may carry a
     * model-filtered step, so a `launchAccountRefusal` that checks without the
     * model is guarding a launch it did not describe: the door would pass and
     * the spawn throw, or the door refuse something that would have worked.
     * Every call that has a launch shape in hand must hand the model over.
     */
    for (const m of ext.matchAll(/launchAccountRefusal\(/g)) {
        const arg = span(ext, ext.indexOf('{', m.index));
        if (!/merged\.|wantAccount/.test(arg)) { continue; }   // no launch shape, no model to give
        ok('launchAccountRefusal passes the model where the door has one: '
            + arg.replace(/\s+/g, ' ').slice(0, 58), /model:/.test(arg));
    }

    // The readout seam must stay quiet: `nextLaunchReadout` describes a setup.
    const readout = (() => {
        const at = ext.indexOf('const nextLaunchReadout = (');
        return at < 0 ? '' : block(ext, at);
    })();
    ok('nextLaunchReadout does not commit the rotation',
        !!readout && !/commit: true/.test(readout));
}

// ------------------------------------- 5. every rule the core knows is offered
{
    /**
     * ‼️ THE WHOLE DECLARATION, not a bracket group. `policyRowsFor`'s body is
     * `[...].map(p => ({…}))` — an array literal followed by a call — so taking
     * what the arrow points at stops at the `]` and misses every field the map
     * builds. Read to the next declaration instead.
     */
    const pRows = ext.slice(ext.indexOf('const policyRowsFor'),
        ext.indexOf('const accountRowsFor'));
    ok('policyRowsFor offers the built-in policies', /BUILT_IN_POLICIES/.test(pRows));
    ok('…and the user\'s own named rules', /accountPolicies\(\)/.test(pRows));
    // MIRROR — a control that names a rule says what the rule means RIGHT NOW,
    // and `picks` / `refusal` travel APART from the standing `detail` so the
    // page can draw the first over the second rather than a joined sentence.
    ok('…and each row carries what it would pick now, kept apart from its description',
        /launchAccountPick\(\{ engine, account: p\.id/.test(pRows)
        && /picks: r\.refusal \?/.test(pRows) && /refusal: r\.refusal \|\| ''/.test(pRows));
    // ‼️ ONE derivation behind both kinds of picker, or the QuickPicks and the
    // webviews become two answers to "what does @emptiest mean right now".
    const rows = fnBlock('accountRowsFor');
    ok('accountRowsFor is that same reader, shaped for a QuickPick',
        /policyRowsFor\(engine\)\.map\(/.test(rows));

    const label = fnBlock('accountRowLabel');
    ok('accountRowLabel prints the rule AND what it picks',
        /isPolicyId\(/.test(label) && /→/.test(label));

    /**
     * ‼️ A RULE SAYS WHY. The row's description can only carry `@emptiest →
     * Work`; the REASON that slot won is the one line the core already wrote,
     * and a launcher that drops it leaves the reader unable to tell a rule that
     * is working from one that is about to refuse.
     */
    const launcherRow = (() => {
        const at = ext.indexOf('which sign-in of this engine the session runs as');
        return at < 0 ? '' : ext.slice(at - 900, at);
    })();
    ok('the launcher\'s Account row asks the rule', /launchAccountPick\(\{/.test(launcherRow));
    ok('…and prints the rule\'s own note, or its refusal, first',
        /p\.refusal \|\| p\.note/.test(launcherRow));

    // The profile editor must not hand-roll the lookup: `findSlot` alone printed
    // "@emptiest (not on this machine)" for the one answer always available.
    const profileRow = ext.slice(ext.indexOf('which sign-in a session started from this profile') - 900,
        ext.indexOf('which sign-in a session started from this profile'));
    ok('the profile editor asks accountRowLabel rather than findSlot',
        /accountRowLabel\(spec\.id, draft\.account\.trim\(\)\)/.test(profileRow));
}

// ------------------ 6. EVERY picker that offers slots also offers the rules
/**
 * ‼️ THE FAILURE `_REF/agentfarm-dev.md` NAMES BY NAME: a dimension added to the
 * Console composer alone and forgotten on the launcher, the profiles and the
 * trees. `AFAccount.options` is the account picker — every site that calls it is
 * a box a person chooses a sign-in in, so every one of them must now call
 * `grouped` instead. The list is DERIVED from the pages, not written here, so a
 * sixth picker cannot be added without this noticing.
 */
{
    const PAGES = ['console.js', 'missions.js', 'tasksPage.js', 'queue.js'];
    for (const f of PAGES) {
        const src = fs.readFileSync(path.join(ROOT, 'media', f), 'utf8');
        // The Console builds its own rows for `axisBox` (a native <select> may
        // not nest optgroups), so it groups there instead of through `grouped`.
        const groups = f === 'console.js'
            ? /AFAccount\.policyRow\(/.test(src) && /AFAccount\.POLICY_GROUP/.test(src)
            : /AFAccount\.grouped\(/.test(src);
        ok(`media/${f} offers the rules beside the slots`, groups);
        ok(`media/${f} has no ungrouped AFAccount.options left in a picker`,
            !/AFAccount\.options\(/.test(src));
    }
    // …and the host really sends them: a page asking for rows nothing supplies
    // draws the flat list for ever and every string test above still passes.
    ok('the Console is handed the composer\'s rules', /composerPolicies:/.test(
        fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8')));
    ok('…and each live card its OWN engine\'s rules', /policyRows:/.test(
        fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8')));
    for (const p of ['tasksPanel.ts', 'queuePanel.ts']) {
        ok(`src/panels/${p} sends the rules to its form`,
            /policies: deps\.enginePolicies/.test(
                fs.readFileSync(path.join(ROOT, 'src', 'panels', p), 'utf8')));
    }
    ok('Missions is sent the rules too', /policies: enginePolicyMatrix\(\)/.test(ext));
    ok('‼️ the matrix and the per-engine reader are ONE derivation',
        /const enginePolicyMatrix[\s\S]{0,700}?policyRowsFor\(e\.engine\)/.test(ext)
        && /policiesFor: \(engine: string\) => policyRowsFor\(engine\)/.test(ext));

    // ‼️ AND THE SCENE EXISTS, or the two groups ship unphotographed.
    const fix = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'console.js'), 'utf8');
    ok('a fixture scene really sets the account box to a RULE',
        /composerPolicies:/.test(fix) && /account: '@emptiest'/.test(fix));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
