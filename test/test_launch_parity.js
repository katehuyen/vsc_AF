// K-34 — SESSION LAUNCH PARITY: one dimension, every door that starts a session.
//
// ‼️ WHY THIS FILE EXISTS, AND WHY IT IS NOT ONLY ABOUT SUPERPOWERS.
//
// X-133 gave the Console composer a ⚡ chip. That is ONE of ten ways a session
// gets started in this extension, and the other nine went on deciding the
// discipline from a per-agent setting the person starting the session could not
// see — so the same agent worked one way in the panel and another way in a
// terminal, and a saved profile reproduced everything about a launch except
// that. `_REF/agentfarm-dev.md` names this exact failure ("adding an option to
// the Console composer alone and forgetting the launcher, profiles, or tree
// menus is a structural failure") and this suite is the measurement of it.
//
// THE RULE BEING PINNED: a launch dimension is carried by `LaunchOptions`, and
// EVERY surface that starts a session builds one. So a dimension present on the
// type and absent from a surface is the bug — and the surfaces that cannot be
// called from a test (they live inside quickpick loops in `extension.ts`) are
// measured against their source, which is the only handle there is.
//
// AND THE THIRD STATE IS THE WHOLE DIFFICULTY. `undefined` means "the agent's
// own default decides" — what every launch made before K-34 said. A surface
// that collapsed absent into `false` would have switched the discipline off for
// everyone the day it shipped, silently, because nothing about their setup
// changed.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const L = require(path.join(ROOT, 'out', 'core', 'launch.js'));
const P = require(path.join(ROOT, 'out', 'core', 'launchProfiles.js'));

const extTs = read('src', 'extension.ts');
const launchTs = read('src', 'core', 'launch.ts');

// ---------- the three words, and the first one is not "off" ----------
{
    eq('the picker offers exactly three answers', L.SUPERPOWERS_CHOICES.length, 3);
    eq('…and the first is the agent default, not off',
        L.SUPERPOWERS_CHOICES.map(c => c.id), ['', 'on', 'off']);
    // ‼️ ANYTHING UNREADABLE IS THE DEFAULT, NEVER "OFF". A value nobody can
    // parse must land on the behaviour every launch had before this existed;
    // falling back to `false` would turn a typo into a silent policy change.
    eq('on becomes true', L.normSuperpowers('on'), true);
    eq('off becomes false', L.normSuperpowers('off'), false);
    eq('the empty word is the default', L.normSuperpowers(''), undefined);
    eq('…and so is a word nobody recognises', L.normSuperpowers('yes please'), undefined);
    eq('…and so is nothing at all', L.normSuperpowers(undefined), undefined);
    // The inverse, so a picker can show what is currently set without a second
    // mapping that drifts from this one.
    eq('true shows as on', L.superpowersWord(true), 'on');
    eq('false shows as off', L.superpowersWord(false), 'off');
    eq('and absent shows as the empty word', L.superpowersWord(undefined), '');
}

// ---------- the preview line names it only when it IS an answer ----------
{
    ok('a launch that says nothing does not mention it',
        !/superpowers/.test(L.describeLaunch({})));
    ok('a launch told yes says so', /superpowers on/.test(L.describeLaunch({ superpowers: true })));
    // ‼️ THE ONE A TRUTHINESS TEST WOULD HAVE SWALLOWED. "off" is a decision the
    // reader of a preview line most needs to see, because it is the one that
    // differs from what they would otherwise assume.
    ok('a launch told NO says so too', /superpowers off/.test(L.describeLaunch({ superpowers: false })));
}

// ---------- a SAVED SETUP stores it, loads it, and clears it ----------
{
    const saved = P.profileFrom({ model: 'opus', superpowers: false }, 'gece', 'terminal');
    eq('a setup stores the answer it was saved with', saved.superpowers, false);
    ok('…and a setup that says nothing stores nothing',
        !('superpowers' in P.profileFrom({ model: 'opus' }, 'sade')));

    // ‼️ LOADING MEANS "THE SETUP IS NOW THIS". A discipline left over from the
    // last thing the launcher was showing is a decision the user did not make
    // and cannot see they are carrying — the same rule the model follows.
    const loaded = P.applyProfile({ model: 'haiku', superpowers: true }, saved);
    eq('loading applies what the profile says', loaded.superpowers, false);
    const silent = P.applyProfile({ superpowers: true }, P.profileFrom({}, 'bos'));
    ok('…and a profile that says nothing CLEARS it rather than leaving it standing',
        !('superpowers' in silent));

    // ‼️ AND THE "WHICH PROFILE IS THIS?" ROW HAS TO SEE IT, or it goes on
    // claiming a profile after the ⚡ row has been changed under it — which is
    // precisely the defect `matchProfile` exists to prevent.
    const list = [saved];
    ok('the launcher recognises the setup it is showing',
        P.matchProfile(list, { model: 'opus', superpowers: false }, 'terminal') !== undefined);
    ok('…and stops recognising it the moment the answer differs',
        P.matchProfile(list, { model: 'opus', superpowers: true }, 'terminal') === undefined);
    ok('…including when the launcher has gone back to the agent default',
        P.matchProfile(list, { model: 'opus' }, 'terminal') === undefined);
}

// ---------- ‼️ IT IS NOT A LAUNCH DEFAULT, and that is deliberate ----------
{
    // This dimension ALREADY has a user-level default, per agent
    // (`agentFarm.superpowersDefaults`). A second one in `launchDefaults` would
    // give two settings the same job and no rule for which wins.
    const out = L.withDefaults({}, { model: 'opus', effort: 'high' });
    ok('withDefaults does not invent an answer for it', !('superpowers' in out));
    ok('…and the type says why, in so many words',
        /NOT\s*\n\s*\* in `LaunchDefaults`/.test(launchTs));
    ok('an explicit answer survives withDefaults untouched',
        L.withDefaults({ superpowers: false }, { model: 'opus' }).superpowers === false);
}

// ---------- the doors, measured against their source ----------
//
// These live inside quickpick loops and message handlers in `extension.ts`,
// which nothing can call. The source IS the handle, and a missing door here is
// the structural failure `_REF/agentfarm-dev.md` names.
{
    // 1 · THE TERMINAL — the door K-34 was opened for.
    ok('a terminal launch honours an explicit answer, and falls back when there is none',
        /merged\.superpowers \?\? superpowersOnFor\(agent\.name\)/.test(extTs));
    // 2 · THE CONSOLE, reached from the launcher, a tree row or a profile —
    //     not the composer, which X-133 already wired.
    ok('a hosted session started from a setup carries it too',
        /superpowers: merged\.superpowers \?\? superpowersOnFor\(agent\.name\)/.test(extTs));
    // 3 · THE MULTI-DIMENSION LAUNCHER — a row, or the dimension exists on the
    //     type and nowhere a person can reach.
    ok('the launcher draws a row for it', /act: 'sp'/.test(extTs));
    ok('…and both pickers behind that row are wired',
        (extTs.match(/pick\.act === 'sp'/g) || []).length === 2);
    // ‼️ 4 · REMEMBERED. Left out of `lastLaunch`, the launcher reopens on the
    //     agent's default after a session deliberately started without the
    //     discipline — the S-34 defect, on a newer row.
    // ‼️ S-34 (reopened) — what is kept is now `launchToRemember`'s call, in the
    // core, and every door writes through the one recorder. The dimension is
    // remembered because the SHAPE remembers it, not because one call site
    // happened to list it.
    ok('the launcher remembers it for next time',
        /await rememberLaunch\(agent\.id, o, where\);/.test(extTs)
        && /o\.superpowers === undefined \? \{\} : \{ superpowers: o\.superpowers \}/.test(launchTs));
    // 5 · THE PROFILE EDITOR — a setup that cannot store it drops it silently
    //     every time somebody loads the profile they saved it into.
    ok('the profile editor offers it as a row',
        /How should a session from this profile work\?/.test(extTs));
    // 6 · THE BRIDGE — X-133 already carried it on `session.start`, with the
    //     same three states. Pinned here so the two cannot drift apart.
    ok('the bridge keeps its own tri-state, unchanged',
        /args\.superpowers === undefined\s*\n\s*\? \(resume \? undefined : superpowersOnFor\(agent\.name\)\)/.test(extTs));
}

// ---------- ‼️ THE LAUNCHER NO LONGER SPAWNS BEHIND THE USER ----------
//
// The other half of K-34. "Where: the Console panel" used to call
// `startConsoleSession` the instant Start was pressed: the session spawned with
// the setup baked in, and every dimension became unchangeable at the exact
// moment the person finally had a window to change one in. A wrong model picked
// in a quickpick could only be fixed by ending the session and starting again.
{
    const panelTs = read('src', 'panels', 'consolePanel.ts');
    const consoleJs = read('media', 'console.js');

    ok('the launcher hands the setup to the composer instead of spawning',
        /ConsolePanel\.show\(consoleDeps, \{[\s\S]{0,400}?launch: \{/.test(extTs));
    ok('…and the terminal branch is untouched, because a terminal has no composer',
        /startClaudeSession\(agent, o, undefined, undefined, project\)/.test(extTs));
    // ‼️ THE SEED IS WHAT MAKES THE PAGE READ IT. `applyComposerSeed` is
    // edge-driven, so a setup delivered without a bumped seed is ignored by an
    // already-open Console — which is the case this whole path exists for.
    ok('handing a setup over bumps the seed the page reads',
        // ‼️ X-103 widened the window: the block now also carries the route the
        // calling door picked (composerRoute). ‼️ X-169 widened it again for the
        // account, which is the same shape of carried answer one axis over.
        /if \(opts\?\.launch\) \{[\s\S]{0,2000}?c\.composerSeed\+\+;/.test(panelTs));
    // ‼️ X-103 — AND THE ROUTE IS CARRIED RATHER THAN DROPPED. Dropped, the
    // launcher would draw a route row, take the pick, and start a card on a
    // completely different endpoint without a word. There is no control for it
    // on the page (X-105 draws one), so the start must read the carried value
    // and NOT an empty box.
    ok('‼️ a handed-over route survives into the card that starts',
        /c\.composerRoute = /.test(panelTs)
        && /\.\.\.\(this\.composerRoute \?\? \{\}\)/.test(panelTs)
        && /providerId: started\.providerId, tier: started\.tier/.test(panelTs));
    ok('…and is cleared on start, so the NEXT session inherits no endpoint nobody chose',
        /this\.composerRoute = undefined;/.test(panelTs));
    ok('…and the page prefers a handed-over setup to the user\'s defaults',
        /const seeded = DATA\.composerLaunch \|\| null;/.test(consoleJs)
        && /const d = seeded \|\| DATA\.defaults \|\| \{\};/.test(consoleJs));
    // ‼️ ONE-SHOT, like `presetAgent`. A setup left standing would silently
    // reapply itself to the NEXT session, which nobody launched from it.
    ok('the setup is let go on the next start',
        /this\.composerLaunch = undefined;/.test(panelTs));
    // null vs {} — "nothing was handed over" and "a setup that says nothing"
    // are different answers, and only the first falls through to the defaults.
    ok('no setup is null, not an empty object',
        /composerLaunch: this\.composerLaunch \?\? null,/.test(panelTs));
    // ‼️ THE PROMPT IS PUT IN THE BOX, NOT SENT. The whole point is that nothing
    // runs until the person presses Send — and a draft they have already started
    // is not overwritten by it.
    ok('a first prompt lands in the box rather than being sent',
        /if \(seeded && seeded\.prompt && !st\.draft\)/.test(consoleJs));
}

// ---------- and the shared list is SHARED, not copied ----------
{
    // Two pickers, one list. Two literals would part company the first time a
    // fourth word was added — which is how the composer and the launcher came
    // to disagree in the first place.
    // One import and two uses — three mentions, and never a second literal.
    ok('one choice list feeds both pickers',
        (extTs.match(/SUPERPOWERS_CHOICES/g) || []).length === 3);
    ok('…and neither picker builds its own words',
        !/label: 'Agent default'/.test(extTs));
    ok('…and it is defined once, in core',
        /export const SUPERPOWERS_CHOICES: LaunchChoice\[\]/.test(launchTs));
}

// ---------- ‼️ S-34 (reopened) — THE MEMORY IS EVERY DOOR'S, NOT THE LAUNCHER'S
//
// K-34 above pins ONE dimension across ten doors. S-34 pins the thing that
// carries every dimension at once: what an agent was LAST started with. The
// record existed and was read in exactly one place — `runLauncher` — so the ▶
// on an agent's row, the Console composer, "Talk to agent", the Projects page
// and the tree menus all started the same agent on the fleet defaults, whatever
// it had actually been running as ten minutes earlier. A memory nine doors out
// of ten cannot see is not a memory; it is a feature of one picker.
//
// THE RULE BEING PINNED: reading is `seedLastLaunch` / `lastLaunch(agentId)`,
// writing is `rememberLaunch` / `launchToRemember`, and there is no second copy
// of either. A door that inherits by hand is a door that will be forgotten the
// next time a dimension is added — which is the failure this item is named for.
{
    const panelTs = read('src', 'panels', 'consolePanel.ts');
    const consoleJs = read('media', 'console.js');
    // ---- the layer itself, as a value ----
    const last = { engine: 'codex', model: 'opus', effort: 'high', permissionMode: 'plan' };
    eq('what the launch states wins over the record',
        L.withLastLaunch({ model: 'sonnet' }, last).model, 'sonnet');
    eq('…and what it does not state comes from the record',
        L.withLastLaunch({ model: 'sonnet' }, last).effort, 'high');
    eq('…including the engine', L.withLastLaunch({}, last).engine, 'codex');
    eq('no record at all changes nothing',
        JSON.stringify(L.withLastLaunch({ model: 'x' }, undefined)), '{"model":"x"}');
    // ‼️ THE TRI-STATE. `false` is a person saying "not this session"; `||`
    // would promote it into "nobody said" and quietly turn the discipline back
    // on for a launch that deliberately turned it off.
    eq('a remembered OFF stays off', L.withLastLaunch({}, { superpowers: false }).superpowers, false);
    eq('…and an explicit ON beats a remembered OFF',
        L.withLastLaunch({ superpowers: true }, { superpowers: false }).superpowers, true);
    eq('…while a record that never mentioned it leaves the question open',
        L.withLastLaunch({}, last).superpowers, undefined);

    // ‼️ S-34 (reopened) — A REMEMBERED MODEL BELONGS TO THE ENGINE IT RAN ON.
    //
    // The memory layer inherited the model and the effort from the record
    // whatever engine the launch stated, and `gemini-3-pro` is not something
    // Claude can be asked to be. Switching the engine on the launcher and
    // pressing Start therefore opened a Console whose engine box said Claude
    // and whose model box said the Antigravity model underneath it — a setup
    // that cannot run, shown as if it would.
    //
    // The model and the effort are the engine's own vocabulary and are dropped
    // with it; the permission mode and the discipline are this extension's own
    // words, are spelled the same on every engine, and stay. A record with no
    // engine on it predates the engine being recorded — it cannot contradict
    // anything, so it is inherited, which is what it did yesterday.
    eq('a remembered model does not cross to another engine',
        L.withLastLaunch({ engine: 'claude' }, last).model, '');
    eq('…and the effort goes with it, being read off the model',
        L.withLastLaunch({ engine: 'claude' }, last).effort, '');
    /**
     * ‼️ X-145 — AND THE PERMISSION MODE FALLS WITH THEM.
     *
     * S-34 kept it across the switch on the grounds that `plan` is Agent Farm's
     * word rather than any CLI's. True about the spelling, false about the
     * effect: it becomes a FLAG, and a flag beats the engine's own settings
     * file. The user's measured case — OpenCode started in `manual`, then ▶ on
     * the same agent with Claude — produced a Claude session carrying an
     * explicit `--permission-mode manual` that overrode the
     * `bypassPermissions` in their own `~/.claude/settings.json`. Nobody said
     * `manual` about Claude; the one box there was still had it.
     *
     * Silence is what lets that file decide, so silence is what an engine with
     * no row of its own gets.
     */
    eq('…and so does the permission mode, which becomes a flag on the new engine',
        L.withLastLaunch({ engine: 'claude' }, last).permissionMode, '');
    eq('…while the discipline stays: it is the agent\'s word, not an engine\'s',
        L.withLastLaunch({ engine: 'claude' }, { ...last, superpowers: true }).superpowers, true);
    eq('the same engine restated still inherits everything',
        L.withLastLaunch({ engine: 'codex' }, last).model, 'opus');
    eq('a record from before the engine was recorded is still inherited',
        L.withLastLaunch({ engine: 'claude' }, { model: 'opus', effort: 'high' }).model, 'opus');
    eq('what THIS launch states on the new engine is never dropped',
        L.withLastLaunch({ engine: 'claude', model: 'sonnet' }, last).model, 'sonnet');

    /**
     * ‼️ X-145 — AND THE ANSWER IS NO LONGER "NOTHING": THE ENGINE HAS A ROW.
     *
     * Dropping was half the fix. An agent used on two engines has two setups,
     * and emptying the boxes on every switch made the user retype the one they
     * had chosen on that engine an hour earlier. `byEngine` holds one row per
     * engine and it is read FIRST — the flat fields only answer for an engine
     * that has no row, and then only if they do not name a different one.
     */
    const twoEngines = {
        engine: 'opencode', model: 'ling', effort: '', permissionMode: 'manual',
        byEngine: {
            opencode: { model: 'ling', effort: '', permissionMode: 'manual' },
            claude: { model: 'opus', effort: 'xhigh', permissionMode: 'bypassPermissions' }
        }
    };
    eq('the engine\'s own row is what a switch recalls',
        L.withLastLaunch({ engine: 'claude' }, twoEngines).model, 'opus');
    eq('…including the effort',
        L.withLastLaunch({ engine: 'claude' }, twoEngines).effort, 'xhigh');
    eq('…and its own permission mode, not the other engine\'s',
        L.withLastLaunch({ engine: 'claude' }, twoEngines).permissionMode, 'bypassPermissions');
    eq('…and switching back finds the first one untouched',
        L.withLastLaunch({ engine: 'opencode' }, twoEngines).permissionMode, 'manual');
    eq('an engine with no row of its own still gets silence',
        L.withLastLaunch({ engine: 'codex' }, twoEngines).permissionMode, '');
    eq('what THIS launch states still beats the row',
        L.withLastLaunch({ engine: 'claude', model: 'sonnet' }, twoEngines).model, 'sonnet');

    // ---- and what gets written back ----
    const kept = L.launchToRemember(
        { engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
            superpowers: true, name: 'nightly', prompt: 'go', resume: 'abc', continueLast: true },
        'console');
    eq('the five dimensions and the surface are kept',
        [kept.engine, kept.model, kept.effort, kept.permissionMode, kept.superpowers, kept.surface].join(),
        'claude,opus,high,plan,true,console');
    // ‼️ X-103 — SIX, NOT THREE: the route, the tier and the variant joined the
    // row because they belong to the engine more plainly than the model does (a
    // Claude profile id means nothing to OpenCode). They are written as '' when
    // this launch chose none, exactly like the three before them — the empty
    // string IS the record that this launch picked no route, which is what stops
    // the next one inheriting yesterday's.
    // ‼️ X-150 — ASKED OF THE DIMENSION LIST, NOT OF SIX NAMES TYPED HERE.
    // Pinning the row's key ORDER was pinning something that was never a
    // guarantee (the record is read by name), and pinning the six names in a
    // test is the same habit this item exists to break: a seventh engine-owned
    // dimension has to make this line red BY ARRIVING, not by somebody editing
    // it. The set is the list's; the values are still stated by hand.
    const D = require(path.join(ROOT, 'media', 'afDimensions.js'));
    const perEngine = D.idsWhere('perEngine');
    const row = kept.byEngine.claude;
    eq('…and the row filed under the engine holds exactly the engine-owned dimensions',
        Object.keys(row).slice().sort().join(), perEngine.slice().sort().join());
    eq('…with what this launch actually ran on, and \'\' where it chose none',
        perEngine.map(k => `${k}=${row[k]}`).sort().join(),
        ['model=opus', 'effort=high', 'permissionMode=plan',
            'providerId=', 'tier=', 'variant='].sort().join());
    // ‼️ X-145 — AND THE OTHER ENGINES' ROWS SURVIVE THE LAUNCH. Writing the map
    // from scratch would make every start erase what the agent runs as on the
    // engines it was not started on — a memory that only remembers the last
    // engine, which is the one it already had.
    const merged = L.launchToRemember(
        { engine: 'claude', model: 'sonnet', effort: '', permissionMode: '' },
        'terminal', twoEngines);
    // ‼️ Reached with `?.`, not with a dot: a lost row is exactly what this
    // checks for, and a gate that CRASHES on the defect it is watching for
    // reports a broken test rather than a broken behaviour.
    eq('a launch rewrites its own engine\'s row',
        merged.byEngine?.claude?.model, 'sonnet');
    eq('…and leaves the other engine\'s alone',
        merged.byEngine?.opencode?.permissionMode, 'manual');
    // A launch that names no engine writes no row: this module cannot read the
    // fleet default, and guessing `claude` would file another engine's setup
    // under Claude's name. The recorder in extension.ts resolves it first.
    ok('a launch with no engine files no row',
        L.launchToRemember({ model: 'x' }, 'terminal').byEngine === undefined);
    ok('…and does not destroy the rows already there',
        L.launchToRemember({ model: 'x' }, 'terminal', twoEngines).byEngine?.claude?.model === 'opus');
    /**
     * ‼️ X-145 — THE REPORTED FAULT, WALKED END TO END THROUGH THE TWO REAL
     * FUNCTIONS RATHER THAN ASSERTED ABOUT.
     *
     * The user's own sequence: start OpenCode from the launcher without
     * permissions (manual), then press ▶ on the same agent and choose Claude —
     * whose default in their `~/.claude/settings.json` is `bypassPermissions`.
     * The Claude session came up `manual`. Nobody had said `manual` about
     * Claude; the record had one permission box for the whole agent, and an
     * explicit flag beats a settings file.
     */
    {
        const afterOpenCode = L.launchToRemember(
            { engine: 'opencode', model: 'ling', permissionMode: 'manual' }, 'console');
        eq('the OpenCode launch is filed under OpenCode',
            afterOpenCode.byEngine?.opencode?.permissionMode, 'manual');
        eq('‼️ and Claude does not inherit it — silence lets its own file decide',
            L.withLastLaunch({ engine: 'claude' }, afterOpenCode).permissionMode, '');
        eq('…nor the model it cannot run',
            L.withLastLaunch({ engine: 'claude' }, afterOpenCode).model, '');
        // …and going back to OpenCode still finds what was actually chosen there.
        const afterClaude = L.launchToRemember(
            { engine: 'claude', model: '', effort: 'xhigh', permissionMode: '' },
            'console', afterOpenCode);
        eq('returning to OpenCode finds its own answer intact',
            L.withLastLaunch({ engine: 'opencode' }, afterClaude).permissionMode, 'manual');
        eq('…while Claude keeps the effort Farm Settings gave it',
            L.withLastLaunch({ engine: 'claude' }, afterClaude).effort, 'xhigh');
    }

    ok('the recorder resolves the engine before it writes, so no door can leave one out',
        /const engine = \(\(o\.engine \?\? launchDefaults\(\)\.engine \?\? ''\) \|\| 'claude'\) as EngineId;\s*\n\s*await context\.globalState\.update\(LAST_LAUNCH_KEY/.test(extTs));
    // ‼️ …AND THE PER-LAUNCH ONES ARE NOT. Re-applying them would give the next
    // session the same name and send the same opening message on the user's
    // behalf — the one thing a "remembered setup" must never do.
    ok('a name, a first prompt and a resume are NOT remembered',
        kept.name === undefined && kept.prompt === undefined
        && kept.resume === undefined && kept.continueLast === undefined);

    // ---- one reader, one writer, no second copy ----
    ok('the extension reads the record through one function',
        /const lastLaunchOf = \(agentId: string\): LastLaunch \| undefined => lastLaunch\(\)\[agentId\];/.test(extTs));
    ok('…and layers it through one more',
        /const seedLastLaunch = \(agentId: string, o: LaunchOptions = \{\}\): LaunchOptions =>\s*\n\s*withLastLaunch\(o, lastLaunchOf\(agentId\)\);/.test(extTs));
    ok('…and writes it through exactly one recorder',
        (extTs.match(/context\.globalState\.update\(LAST_LAUNCH_KEY/g) || []).length === 1);
    ok('…whose shape is decided in core, not at the call site',
        /export function launchToRemember/.test(launchTs)
        && /export function withLastLaunch/.test(launchTs));

    /* ---- the doors: MOVED, NOT DELETED ----------------------------------
     *
     * ‼️ X-151 — WHAT EACH DOOR COLLECTS IS MEASURED BY CALLING IT NOW, IN
     * `test/test_launch_matrix.js`. Eight assertions stood here, each a regular
     * expression thrown at `extension.ts` to prove that one door read the record
     * (or deliberately did not). They are gone because their subject is gone
     * from the source: the doors are modules (`src/launch/doors/`), and the
     * matrix hands each one EVERY dimension there is and reports what survives
     * the call.
     *
     * That is strictly stronger in both directions the old measurement was
     * weak in. A door that passed a whole `LaunchOptions` through named none of
     * its fields and could only be pinned by matching the shape of the call; a
     * door that merely MENTIONED a dimension in a comment read as carrying it.
     * And neither could say anything at all about a dimension nobody had
     * thought to write a regex for — which is how `providerId` and `tier`
     * reached the type, reached the launcher, and never reached the composer.
     *
     * Specifically, the matrix now states as facts about the doors:
     *   ▶ resolves from Farm Settings and not from the record  (treeRow)
     *   "Talk to agent" opens on the record                    (webviews)
     *   the Projects page starts the agent as it last ran      (projects)
     *   the bridge collects from its ARGUMENTS and never seeds (bridge)
     *   the launcher and the surface picker drop nothing       (launcher · surfacePick)
     * ------------------------------------------------------------------- */
    ok('‼️ Claude\'s per-agent EFFORT reaches a command line',
        /model: \(o\.model \?\? ''\)\.trim\(\) \|\| \(engine === 'claude' \? '' : own\.model\) \|\| '',\s*\n\s*effort: \(o\.effort \?\? ''\)\.trim\(\) \|\| own\.effort \|\| ''/.test(extTs));
    // ‼️ RECORDING IS NOT COLLECTING, AND ONLY THE FIRST IS LEFT HERE. The
    // matrix asks what a door hands ON; these two ask what it writes BACK, which
    // is the other direction and has no cell in it.
    ok('the launcher records through the same recorder',
        /await rememberLaunch\(agent\.id, o, where\);/.test(extTs));
    // ‼️ THE BRIDGE RECORDS AND DOES NOT INHERIT, AND THE ASYMMETRY IS THE
    // DESIGN. The record means "what this agent was last RUN with", so a
    // headless start that skipped the write would leave ▶ offering a setup that
    // has been overtaken. Inheriting is the other direction: an unattended call
    // that says nothing means the documented defaults. (The not-inheriting half
    // is now measured by calling the door — see the matrix.)
    ok('the bridge records both surfaces',
        /void rememberLaunch\(agent\.id, o, 'console'\);/.test(extTs)
        && /void rememberLaunch\(agent\.id, o, 'terminal'\);/.test(extTs));
    ok('…and says so, where an agent calling it will read it',
        /recorded as this agent\\'s last setup/.test(extTs));

    // ---- the Console panel, both directions ----
    ok('the panel is handed the record rather than keeping a copy',
        /lastLaunch\(agentId: string\): LastLaunch \| undefined;/.test(panelTs)
        && /rememberLaunch\(agentId: string, o: LaunchOptions, surface: RunSurface\): void;/.test(panelTs));
    ok('…and the extension wires both to the same two functions',
        /lastLaunch: \(agentId: string\) => lastLaunchOf\(agentId\),/.test(extTs)
        && /rememberLaunch: \(agentId: string, o: LaunchOptions, surface: RunSurface\) =>\s*\n\s*void rememberLaunch\(agentId, o, surface\),/.test(extTs));
    ok('a composer opened for an agent opens on that agent\'s last setup',
        /const remembered = c\.deps\.lastLaunch\(opts\.agentId\);/.test(panelTs)
        && /\(opts\.engine \?\? remembered\?\.engine \?\? d\.engine \?\? ''\)/.test(panelTs));
    ok('…and a caller that handed over its own setup still wins',
        /if \(!opts\.launch && last\) \{/.test(panelTs));
    ok('‼️ and Send is a launch, so it is remembered like one',
        /this\.deps\.rememberLaunch\(agent\.id, started, 'console'\);/.test(panelTs));
    // ‼️ THE BOXES ARE NOT RE-LAYERED AT SEND. They were SEEDED from the record
    // and they are on screen: an empty one is a person asking for the default,
    // and re-filling it would be the panel arguing with a control they cleared.
    ok('…without the record arguing with a box the user just cleared',
        /Seeding is the mechanism; a second layer at the last moment/.test(panelTs));

    // ---- and the one door the host never hears about ----
    // The agent picker changes page-side and repaints; without this the boxes
    // describe the PREVIOUS agent, which is the X-133 defect one row along.
    ok('the record rides on the agent row, for the picker to resolve',
        /lastLaunch: this\.deps\.lastLaunch\(a\.id\) \?\? null/.test(panelTs));
    // ‼️ S-49 — AND THE PICKER DOES NOT SPEND IT. A DOOR seeds this composer;
    // the picker sitting in front of the boxes is not a door. Changing the
    // agent after the model, the effort and the permission mode have been set
    // by hand used to replace all three with a stranger's record — the last
    // decision of a launch silently undoing the first three.
    ok('…and changing the agent reseeds NOTHING: the boxes are the user\'s',
        !/seedFromAgent/.test(consoleJs)
        && /byId\('c-agent', 'change', e => \{\s*\n\s*st\.agentId = e\.target\.value;\s*\n\s*save\(\);\s*\n\s*paint\(\);\s*\n\s*\}\)/.test(consoleJs));
    ok('…and the seeding that remains belongs to the door, host-side',
        /composerLaunch: this\.composerLaunch \?\? null/.test(panelTs)
        && /const seeded = DATA\.composerLaunch \|\| null;/.test(consoleJs));

    // ‼️ S-34 (reopened) — AND THE PANEL SCOPES THE RECORD BY THE ENGINE IT IS
    // ABOUT TO SHOW. This door reads `lastLaunch` directly instead of going
    // through `withLastLaunch`, so the engine rule in core did not reach it:
    // told to open on Claude for an agent whose record says Antigravity, it
    // handed the composer the Antigravity model with the Claude engine.
    ok('the panel drops a model the engine it is opening on cannot run',
        /rememberedOn\(c\.composerEngine, remembered\)/.test(panelTs)
        && /export function rememberedOn/.test(launchTs));

    // ‼️ …AND THE SETUP SAYS WHICH ENGINE IT IS FOR, so the page can check it.
    // `keep` compared the seeded value against itself (`kept.model === st.model`
    // where `st.model` had just been assigned from the same object), which is a
    // check that cannot fail — it silenced the catalog reconcile completely
    // instead of narrowing it. The engine the setup was built for is the fact
    // that decides, and it has to travel with the setup to be readable here.
    ok('the handed-over setup names the engine it was built for',
        /model\?: string; effort\?: string; permissionMode\?: string; prompt\?: string; engine\?: string;/
            .test(panelTs));
    ok('…and the page keeps it only while that engine is the one on screen',
        /seeded && \(!seeded\.engine \|\| seeded\.engine === engineNow\(\)\)/.test(consoleJs));
}

/* =========================================================================
 * S-34 (reopened) — "IT REMEMBERS, BUT NOT ALL OF IT"
 *
 * ‼️ THE DEFECT, AND IT WAS ONE LINE IN THE PAGE. Every door seeds the boxes
 * from the record; the composer then RECONCILED them against the engine's
 * published catalog and cleared anything the catalog does not list. A catalog
 * is what an engine is OFFERING, not what it can run — an alias typed into the
 * launcher's "Other…" box, a model added to `agentFarm.modelAliases` and later
 * removed, a level a catalog stopped advertising. So the model vanished; and
 * because the effort list is looked up BY model, an emptied model then landed
 * on a different list and took the effort with it. Which is exactly how it was
 * reported: "sometimes it forgets the effort, sometimes the model".
 *
 * THE RULE: a value a real launch on THIS engine used survives the check. An
 * engine CHANGE still drops both — those values belong to a different program,
 * which is the case the reconcile exists for.
 * ========================================================================= */
{
    const consoleJs = read('media', 'console.js');
    ok('the reconcile takes what a real launch on this engine used',
        /function reconcileComposer\(engineId, preferModelDefault, keep\) \{/.test(consoleJs));
    // ‼️ X-149 — THIS GUARANTEE IS NOW RUN, NOT READ.
    //
    // These two used to be regexes over `reconcileComposer`'s body, and the
    // body has moved: the narrowing rule lives in `media/afLaunch.js`, which
    // the page and the extension host both load. A regex could only have been
    // repointed at the new file's source — the same measurement with the same
    // blind spot. The rule is a pure function of a catalogue and a pair, so it
    // is CALLED here instead, which is what X-148 says a guard has to be.
    const AFL = require(path.join(ROOT, 'media', 'afLaunch.js'));
    const stale = AFL.catalog({
        known: true,
        // the catalog is OFFERING sonnet — it has never heard of the alias the
        // launcher's "Other…" box put in, nor of the level that stopped being
        // advertised, which is precisely S-34's shape
        em: { models: [{ id: '' }, { id: 'sonnet' }], efforts: { '': [{ id: '' }, { id: 'low' }] }, defaultEffort: {} },
        efforts: []
    });
    const keptPair = AFL.narrow(stale, { model: 'my-alias', effort: 'xhigh' },
        { keep: { model: 'my-alias', effort: 'xhigh' } });
    ok('‼️ …and a kept model is not cleared by a catalog that does not list it',
        keptPair.model === 'my-alias');
    ok('‼️ …nor a kept effort, which used to go with the model',
        keptPair.effort === 'xhigh');
    // ‼️ AND THE ENGINE CHANGE STILL DROPS BOTH — the case the reconcile exists
    // for. Without this the assertions above would pass on a rule that keeps
    // everything, which is the failure S-34 was the correction TO.
    const moved = AFL.narrow(stale, { model: 'my-alias', effort: 'xhigh' }, { keep: null });
    ok('…while an engine change drops what belonged to the other program',
        moved.model === '' && moved.effort === '');
    ok('…and the Console is what hands the keep in',
        /window\.AFLaunch\.narrow\(composerCatalog\(engineId\),/.test(consoleJs)
        && /\{ keep: keep \|\| null, preferModelDefault: !!preferModelDefault \}/.test(consoleJs));
    ok('a handed-over setup is kept',
        /reconcileComposer\(engineNow\(\), false,\s*\n\s*forThisEngine \?/.test(consoleJs));
    // ‼️ S-49 — the agent picker reconciles nothing, because it writes nothing.
    // The ENGINE switch still does, and it is the one that has to: a model
    // belongs to one engine, so moving between them is the case this exists for.
    ok('…and so is the engine switch\'s own record',
        /reconcileComposer\(next, false,\s*\n\s*mem \? \{ model: st\.model, effort: st\.effort \} : null\)/.test(consoleJs));
    // ‼️ AND THE BOX HAS TO DRAW WHAT SURVIVED, or the select shows its first
    // row while the state says something else — a control that lies.
    // ‼️ X-105 — THE COMPOSER'S MODEL LIST IS `composerModels`, NOT `modelsFor`,
    // and the difference is the point rather than a rename: on an engine whose
    // provider sub-axis IS the model (OpenCode names one `provider/model`) the
    // chosen route narrows this box, because a second Model box beside it would
    // be two controls for one subject. `modelsFor` still answers for a RUNNING
    // card, whose route was settled when it started. The guarantee below is
    // unchanged — whatever list is drawn, it is wrapped in `withCurrent`.
    // ‼️ B-03.21 — `opts` became `axisBox` for these two (the box carries its
    // own axis now and opens a panel instead of a native title), and `axisBox`
    // builds its options with `axisOpts`. The guarantee is untouched and is
    // what is read here: whatever list is drawn, it is wrapped in `withCurrent`.
    ok('the select carries the current value even when the catalog does not',
        /function withCurrent\(list, current\) \{/.test(consoleJs)
        && /axisBox\('model', 'c-model', withCurrent\(composerModels\(engineNow\(\)\), st\.model\), st\.model,/.test(consoleJs)
        && /axisBox\('effort', 'c-effort', withCurrent\(effortsForModel\(engineNow\(\), st\.model\), st\.effort\), st\.effort,/.test(consoleJs));
    // ‼️ AN ENGINE CHANGE IS STILL A RESET, AND THAT IS WHAT THIS FUNCTION IS
    // FOR. The claim used to be that the keep was per-engine "by construction",
    // and it was not: `applyComposerSeed` handed it values it had itself just
    // read out of the setup, so the comparison could not fail on any engine.
    // Being per-engine is a thing that has to be CHECKED — the setup names the
    // engine it was built for and the seeder tests it — and the engine-change
    // handler, which is the plain case, passes no keep at all.
    /**
     * ‼️ X-145 — AND THE ENGINE YOU MOVE TO BRINGS ITS OWN SETUP BACK.
     *
     * Clearing was right and was only half the answer. The page is now the
     * mirror of `rememberedOn`: the engine's own row, else the flat record when
     * it names this engine or names none, else nothing — and nothing is what
     * leaves that engine's own settings file in charge. The permission box moves
     * with the other two, because it was the one carrying a value across.
     */
    ok('changing the engine recalls THAT engine\'s row',
        /const mem = memoryOn\(rec, next\);\s*\n\s*st\.model = \(mem && mem\.model\) \|\| '';\s*\n\s*st\.effort = \(mem && mem\.effort\) \|\| '';\s*\n\s*st\.permissionMode = \(mem && mem\.permissionMode\) \|\| '';/.test(consoleJs));
    ok('…through the page\'s mirror of the core rule, not a second guess',
        /function memoryOn\(last, engineId\) \{[\s\S]{0,400}last\.byEngine\[eng\][\s\S]{0,300}was === eng\) \{ return last; \}\s*\n\s*return null;/.test(consoleJs));
    ok('…and an engine with no row still ends up empty, which is what silence means',
        /reconcileComposer\(next, false,\s*\n\s*mem \? \{ model: st\.model, effort: st\.effort \} : null\);/.test(consoleJs));
}

/* ---------- the setup line: what is about to start, on the row that starts it */
//
// ‼️ `describeLaunch` names what was CHANGED — it drops the engine when it is
// Claude and the model when nothing was typed. On the Start row that rule is
// backwards: the reader is checking the launch they are about to press, and the
// two facts that decide what a session IS were the two it left out. It read
// `effort high · auto · superpowers on`.
{
    eq('the setup line answers with the engine and the model first, always',
        L.launchSummary({}), 'Claude Code · default model · no project');
    eq('…then effort, permissions, discipline and the project',
        L.launchSummary(
            { engine: 'codex', model: 'gpt-5', effort: 'high', permissionMode: 'auto' },
            { superpowers: true, project: '◧ Agent Farm' }),
        'Codex · gpt-5 · high · auto · ⚡on · ◧ Agent Farm');
    ok('the engine is named even when it is the default one',
        L.launchSummary({ model: 'opus' }).startsWith('Claude Code · opus'));
    // ‼️ IT SAYS THE RESOLVED ANSWER, NOT THE WORD "DEFAULT". The discipline is
    // a tri-state on the options and a plain yes/no in the session that runs; a
    // row reading "agent default" makes the reader open a second screen to find
    // out what will happen, which is what a summary exists to prevent.
    eq('the discipline is the resolved answer, short',
        L.launchSummary({ model: 'opus' }, { superpowers: false }),
        'Claude Code · opus · ⚡off · no project');
    ok('…and a field nobody stated does not spend a column on "default"',
        !/effort|permission/.test(L.launchSummary({ model: 'opus' })));
    eq('no project is an answer, not a blank', L.launchSummary({}).endsWith('no project'), true);

    // The launcher and the ▶ picker both print it, off the same memory.
    ok('the launcher Start row shows the setup rather than the changes',
        /const summary = launchSummary\(merged, \{/.test(extTs)
        && /description: where === 'console' \? summary : command,/.test(extTs));
    ok('…and the terminal row gets it too, beside the command line it must print',
        /\+ \(where === 'console' \? '' : summary \+ ' · '\)/.test(extTs));
    ok('‼️ the ▶ picker says what it will start, not only where',
        /placeHolder: `\$\{what\} — where should it run\?\$\{setup\}`/.test(extTs));
    // ‼️ AND WHERE THE ENGINE CAME FROM. It has always been "this agent's last,
    // else the fleet default" — a fixed rule, and unreadable, because the row
    // named an engine and nothing else. Two agents, two engines, nothing on
    // screen saying why, which is indistinguishable from a picker that opens on
    // whatever it feels like.
    ok('…and says where the engine it opened on came from',
        /const engineFrom = opts\.last\?\.engine/.test(extTs)
        && /' • your default'/.test(extTs));
}

// ---------- THE ELEVENTH DOOR — resuming a session off the shelf ----------
// The ten doors above start a NEW session. This one picks a recorded one back
// up, and it drifted for exactly the reason this file exists: it builds its
// `host.start` from a hand-written field list, so every dimension added since
// had to be remembered here by somebody, and `account` never was. The user
// reported the consequence in one sentence — "why did it now open with Machine
// Global" — for a conversation that had been running on a slot all along.
//
// Measured against the source, like every surface in this file that lives
// inside a message handler and cannot be called from a test.
{
    const panelTs = read('src', 'panels', 'consolePanel.ts');
    const at = panelTs.indexOf("case 'resume': {");
    const door = at < 0 ? '' : panelTs.slice(at, panelTs.indexOf("case 'forgetLastWindow'", at));
    ok('the shelf\'s resume door was found in the source', door.length > 500);
    ok('‼️ …and it STATES the account the session ran under',
        /account: this\.deps\.sessionAccount\?\.\(sessionId\)/.test(door));
    ok('…through the one reader every other surface asks, not a second resolver',
        /sessionAccount\?\(sessionId: string\)/.test(panelTs)
        && /sessionAccount: \(sessionId: string\) => sessionAccountOf\(sessionId\)\?\.id/.test(extTs));
    // The dimensions this door was already carrying, pinned so the next one
    // removed is a failure rather than a silence.
    for (const f of ['engine', 'model', 'effort', 'permissionMode', 'projectId', 'account']) {
        // `engine,` is passed by shorthand, the rest by name — both are carrying it.
        ok(`…and still carries ${f}`, new RegExp(`(^|[^\\w])${f}\\s*[:,]`, 'm').test(door));
    }
    // ‼️ A FRESH session started FROM that door is a different question: it is
    // not that conversation, so it takes the composer's choice rather than a
    // slot read off somebody else's run.
    ok('‼️ …while "new session in the same folder" does NOT inherit it — it is not that session',
        (door.match(/account: this\.deps\.sessionAccount/g) || []).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
