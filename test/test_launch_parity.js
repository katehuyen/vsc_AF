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
        /if \(opts\?\.launch\) \{[\s\S]{0,400}?c\.composerSeed\+\+;/.test(panelTs));
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

    // ---- and what gets written back ----
    const kept = L.launchToRemember(
        { engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
            superpowers: true, name: 'nightly', prompt: 'go', resume: 'abc', continueLast: true },
        'console');
    eq('the five dimensions and the surface are kept',
        [kept.engine, kept.model, kept.effort, kept.permissionMode, kept.superpowers, kept.surface].join(),
        'claude,opus,high,plan,true,console');
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

    // ---- the doors ----
    // ▶ on an agent's row / the command palette / the tree menus.
    ok('▶ seeds from the record',
        /const o = seedLastLaunch\(agent\.id, \{ engine: chosen\.engine as EngineId \}\);/.test(extTs));
    ok('…and carries it into the Console composer as well as the terminal',
        /launch: \{\s*\n\s*model: o\.model, effort: o\.effort,\s*\n\s*permissionMode: o\.permissionMode, superpowers: o\.superpowers\s*\n\s*\}/.test(extTs));
    // "Talk to agent" — the door with the fewest questions, which is exactly why
    // it must not be the one that answers them all with the fleet defaults.
    ok('"Talk to agent" opens the composer on the record',
        /const o = seedLastLaunch\(agent\.id\);\s*\n\s*ConsolePanel\.show\(consoleDeps, \{\s*\n\s*agentId: agent\.id, pinAgent: true,/.test(extTs));
    // The Projects page: a different reason to start a session, not a different
    // session — only the project is new.
    //
    // ‼️ S-34 (reopened) — AND THAT INCLUDES THE ENGINE. This assertion used to
    // pin the opposite, and the opposite was the bug: the door stated the FLEET
    // default engine as its own answer, which beats the memory (`withLastLaunch`
    // takes what the caller said first) — and then RECORDED it. So starting an
    // agent from a project page silently reset that agent's remembered engine,
    // and the ▶ beside it opened on a different one afterwards. That is the
    // whole of "sometimes it insists on Antigravity and then suddenly it is
    // Claude again": two doors writing one record, one of them with an answer
    // nobody gave.
    ok('the Projects page starts the agent as it last ran, engine included',
        /is a different reason to start a session[\s\S]{0,1200}?const o = seedLastLaunch\(agent\.id\);/.test(extTs));
    ok('…and states no engine of its own, so the record is not overwritten',
        !/seedLastLaunch\(agent\.id, \{\s*\n\s*engine: \(launchDefaults\(\)\.engine \|\| 'claude'\) as EngineId/.test(extTs));
    // The launcher, which always did — through the shared recorder now.
    ok('the launcher records through the same recorder',
        /await rememberLaunch\(agent\.id, o, where\);/.test(extTs));

    // ‼️ THE BRIDGE RECORDS AND DOES NOT INHERIT, AND THE ASYMMETRY IS THE
    // DESIGN. The record means "what this agent was last RUN with", so a
    // headless start that skipped the write would leave ▶ offering a setup that
    // has been overtaken. Inheriting is the other direction: an unattended call
    // that says nothing means the documented defaults.
    ok('the bridge records both surfaces',
        /void rememberLaunch\(agent\.id, o, 'console'\);/.test(extTs)
        && /void rememberLaunch\(agent\.id, o, 'terminal'\);/.test(extTs));
    const startOp = extTs.slice(extTs.indexOf("op: 'sessions.start'"),
        extTs.indexOf("op: 'sessions.start'") + 12000);
    ok('…and never seeds itself from it', !/seedLastLaunch/.test(startOp));
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
        /const last = c\.deps\.lastLaunch\(opts\.agentId\);/.test(panelTs)
        && /c\.composerEngine = \(opts\.engine \?\? last\?\.engine \?\? d\.engine \?\? ''\)/.test(panelTs));
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
    ok('…and changing the agent reseeds the boxes from it',
        /function seedFromAgent\(agentId\) \{/.test(consoleJs)
        && /st\.model = \(last && last\.model\) \|\| d\.model \|\| '';/.test(consoleJs));
    ok('…engine and discipline through the host, which owns them',
        /vscode\.postMessage\(\{ type: 'setEngine', id: eng \}\)/.test(consoleJs)
        && /type: 'setSuperpowers', on: want === '' \? null : want === 'on'/.test(consoleJs));
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
    ok('‼️ …and a kept model is not cleared by a catalog that does not list it',
        /const keepModel = !!st\.model && kept\.model === st\.model;/.test(consoleJs)
        && /if \(!keepModel && !models\.some/.test(consoleJs));
    ok('‼️ …nor a kept effort, which used to go with the model',
        /const keepEffort = !preferModelDefault && !!st\.effort && kept\.effort === st\.effort;/.test(consoleJs));
    ok('a handed-over setup is kept', /reconcileComposer\(engineNow\(\), false, seeded \?/.test(consoleJs));
    ok('…and so is the agent picker\'s own record',
        /reconcileComposer\(nextEngine, false,\s*\n\s*last \?/.test(consoleJs));
    // ‼️ AND THE BOX HAS TO DRAW WHAT SURVIVED, or the select shows its first
    // row while the state says something else — a control that lies.
    ok('the select carries the current value even when the catalog does not',
        /function withCurrent\(list, current\) \{/.test(consoleJs)
        && /opts\(withCurrent\(modelsFor\(engineNow\(\)\), st\.model\), st\.model\)/.test(consoleJs)
        && /opts\(withCurrent\(effortsForModel\(engineNow\(\), st\.model\), st\.effort\), st\.effort\)/.test(consoleJs));
    // ‼️ AN ENGINE CHANGE IS STILL A RESET. The keep is per-engine by
    // construction (the caller passes a record that names this engine), and the
    // engine-change handler passes none.
    ok('changing the engine still clears what that engine cannot run',
        /reconcileComposer\(next, false\);/.test(consoleJs));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
