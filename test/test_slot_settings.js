// Slot behaviour files (X-269) — the settings file a captured account's
// sessions actually read.
//
// What is measured here is the whole reason the module exists:
//   1. the contract is applied over the USER'S file, not instead of it — their
//      model, permission mode and live hooks travel, the guarantee wins;
//   2. a slot that already says it is NOT written to, so the three gates
//      (activation · capture · before a launch) cost a read;
//   3. a file changed by another hand is put back — the fault this closes was a
//      copy taken once at capture and never looked at again;
//   4. ‼️ an engine with nothing to guarantee gets nothing written, so a Codex
//      slot never grows a `settings.json` it has never heard of.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    renderSlotSettings, slotEnvGaps, reproduceSlotSettings, slotSettingsGaps
} = require(path.join(__dirname, '..', 'out', 'core', 'slotSettings.js'));
const { adapterFor } = require(path.join(__dirname, '..', 'out', 'core', 'engineAccounts.js'));

/** A disk that is a map, so what was written can be read back and asserted. */
function fakeFs(seed) {
    const files = { ...(seed || {}) };
    return {
        files,
        existsSync: (p) => Object.prototype.hasOwnProperty.call(files, norm(p)),
        readFileSync: (p) => files[norm(p)],
        writeFileSync: (p, data) => { files[norm(p)] = data; },
        mkdirSync: () => undefined
    };
}
const norm = (p) => String(p).replace(/\\/g, '/');

const HOME = 'C:/Users/x';
const SLOT = 'C:/slots/claude-one';
const userFile = HOME + '/.claude/settings.json';
const slotFile = SLOT + '/settings.json';

// ---------- 1. the contract is an overlay on the user's own file ----------
{
    const text = renderSlotSettings(
        JSON.stringify({ model: 'opus', permissions: { allow: ['Bash'] }, env: { FOO: 'bar' } }),
        { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' });
    const got = JSON.parse(text);
    ok('the user\'s model travels', got.model === 'opus');
    ok('…and their permissions', got.permissions.allow[0] === 'Bash');
    ok('…and an env key of their own is kept', got.env.FOO === 'bar');
    ok('‼️ …and the fleet\'s guarantee is written beside it',
        got.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0');

    const over = JSON.parse(renderSlotSettings(
        JSON.stringify({ env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '1' } }),
        { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' }));
    ok('‼️ the guarantee WINS where the two disagree',
        over.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0');

    // A machine with no main settings file still gets the guarantee: it belongs
    // to the fleet, not to the file.
    const bare = JSON.parse(renderSlotSettings(undefined, { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' }));
    ok('an absent user file still yields the contract',
        bare.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0');
    const broken = JSON.parse(renderSlotSettings('{ not json', { A: '1' }));
    ok('an unparseable user file is treated as empty, never thrown', broken.env.A === '1');
}

// ---------- 2. what a file is missing, by name ----------
{
    const vars = { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' };
    ok('an absent file is missing the whole contract',
        slotEnvGaps(undefined, vars).length === 1);
    ok('a file with no env block is missing it', slotEnvGaps('{}', vars).length === 1);
    ok('‼️ a file holding the WRONG value is missing it too (not merely absent)',
        slotEnvGaps(JSON.stringify({ env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '1' } }), vars)[0]
        === 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT');
    ok('a file carrying it is missing nothing',
        slotEnvGaps(JSON.stringify({ env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' } }), vars).length === 0);
}

// ---------- 3. the gate completes a slot that was produced without the key ----
// ‼️ THIS IS THE MEASURED FAULT. Five slots on this machine were captured with
// `carryFiles`, which copied the user's file verbatim and only when absent — so
// none of them carried the key and every session under an account ran on the
// simplified system prompt.
{
    const fs = fakeFs({
        [userFile]: JSON.stringify({ model: 'opus' }),
        [slotFile]: JSON.stringify({ model: 'opus', hooks: { Stop: [] } })
    });
    const before = slotSettingsGaps(fs, { dir: SLOT, engine: 'claude' });
    ok('‼️ a slot captured the old way is REPORTED as missing the guarantee',
        before.length === 1 && before[0] === 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT');

    const rows = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude' });
    ok('one row per carried file', rows.length === 1);
    ok('…it says it wrote', rows[0].wrote === true);
    ok('…and names what was missing before it did', rows[0].gaps[0] === 'CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT');
    ok('‼️ the gate completed the slot on its own',
        slotSettingsGaps(fs, { dir: SLOT, engine: 'claude' }).length === 0);

    // ‼️ IDEMPOTENT BY COMPARISON, NOT BY A FLAG — this runs before every launch.
    const again = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude' });
    ok('‼️ a second run writes nothing', again[0].wrote === false);

    // …and another hand changing it is put back, which is the drift itself.
    fs.files[norm(slotFile)] = JSON.stringify({ env: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '1' } });
    const third = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude' });
    ok('‼️ a file changed by another hand is reproduced', third[0].wrote === true);
    ok('…and the user\'s own choices come back with it',
        JSON.parse(fs.files[norm(slotFile)]).model === 'opus');

    // dryRun answers what WOULD be written and touches nothing.
    fs.files[norm(userFile)] = JSON.stringify({ model: 'sonnet' });
    const dry = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude', dryRun: true });
    ok('dryRun says it would write', dry[0].wrote === true);
    ok('‼️ …and did not', JSON.parse(fs.files[norm(slotFile)]).model === 'opus');
}

// ---------- 3b. an absent source never erases what the slot holds ----------
// ‼️ A machine whose main settings file has been moved or deleted must not lose
// the slots too: rendering the contract alone over a slot carrying the user's
// model, permissions and hooks would repair a guarantee by destroying a
// configuration. The same hazard reaches the suite, because a test that calls
// activate() sandboxes `USERPROFILE` to a temp dir and the slot paths stay real
// (X-265) — so with no source there, this is what stands between a test run and
// the user's own files.
{
    const rich = JSON.stringify({ model: 'opus', permissions: { allow: ['Bash'] }, hooks: { Stop: [1] } });
    const fs = fakeFs({ [slotFile]: rich });
    const rows = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude' });
    const after = JSON.parse(fs.files[norm(slotFile)]);
    ok('‼️ with no source file the slot\'s own model survives', after.model === 'opus');
    ok('…and its permissions', after.permissions.allow[0] === 'Bash');
    ok('…and its hooks', Array.isArray(after.hooks.Stop) && after.hooks.Stop.length === 1);
    ok('…and the guarantee is enforced anyway',
        after.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0' && rows[0].wrote === true);

    // …and a slot that is already right is not touched, source or no source.
    const again = reproduceSlotSettings(fs, { home: HOME, dir: SLOT, engine: 'claude' });
    ok('…and a second run with no source writes nothing', again[0].wrote === false);
}

// ---------- 4. an engine with nothing to guarantee is left alone ----------
{
    // Codex keeps no behaviour file the fleet reproduces: no carryFiles, no
    // requiredEnv. A gate that wrote one anyway would put a Claude-shaped file
    // into a directory that has never heard of it.
    const fs = fakeFs({});
    const rows = reproduceSlotSettings(fs, { home: HOME, dir: 'C:/slots/codex-one', engine: 'codex' });
    ok('nothing is reproduced for an engine that carries nothing', rows.length === 0);
    ok('…and nothing was written', Object.keys(fs.files).length === 0);
    ok('…and it reports no gaps rather than a false one',
        slotSettingsGaps(fs, { dir: 'C:/slots/codex-one', engine: 'codex' }).length === 0);
}

// ---------- 5. the contract is the ADAPTER'S, not this module's ----------
// ‼️ Derived, not declared (docs/CONVENTIONS.md — "A run's dimensions travel by
// the SHAPE"): an engine that grows a guarantee must name the file it goes in,
// or the gate would write it into a file nobody reads.
{
    const claude = adapterFor('claude');
    ok('claude\'s guarantee is the full system prompt',
        claude.requiredEnv.vars.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT === '0');
    ok('‼️ …and it names its own file',
        claude.requiredEnv.file === 'settings.json'
        && (claude.carryFiles || []).includes(claude.requiredEnv.file));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
