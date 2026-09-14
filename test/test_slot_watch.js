// X-294 — the sixth gate: the fleet's own file changed and nobody pressed anything.
//
// What is measured here is the part that can actually go wrong:
//   1. WHICH files are watched is derived from the adapters, so an engine that
//      grows a behaviour file is watched without this file being edited;
//   2. ‼️ the loop rule — the return leg writes the very files this watches, so
//      a sweep that re-fires on its own write would spin for ever. Quiet by
//      COMPARISON, never by a flag or a timer;
//   3. a deletion is a change (absent is not empty), because a settings file the
//      user removed has to reach the slots too.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const { watchedFiles, watchedStamps, fingerprint, changedSince } = require(path.join(ROOT, 'out/core/slotWatch.js'));
const { adapterFor } = require(path.join(ROOT, 'out/core/engineAccounts.js'));

const HOME = 'C:/Users/x';
const norm = (p) => String(p).replace(/\\/g, '/');
function fakeFs(seed) {
    const files = { ...(seed || {}) };
    return {
        files,
        existsSync: (p) => Object.prototype.hasOwnProperty.call(files, norm(p)),
        readFileSync: (p) => files[norm(p)]
    };
}
const at = (list, rel) => list.find(w => norm(w.file) === norm(HOME + '/' + rel));

// ---------- 1. which files, and where they really live ----------
{
    const claude = watchedFiles(HOME, ['claude'], adapterFor).map(w => norm(w.file));
    ok('the behaviour file is watched', claude.includes(HOME + '/.claude/settings.json'));
    ok('‼️ …and so is the identity file AT THE HOME ROOT, not under the engine dir',
        claude.includes(HOME + '/.claude.json'));
    ok('…which is exactly the set, no more', claude.length === 2);

    // ‼️ X-279 gave Codex two behaviour files on the same day this was written.
    // Nothing here names them: the set is the contract's own fleet-side reads.
    const codex = watchedFiles(HOME, ['codex'], adapterFor).map(w => norm(w.file));
    ok('‼️ an engine that grew behaviour files is watched without this file knowing their names',
        codex.includes(HOME + '/.codex/config.toml') && codex.includes(HOME + '/.codex/hooks.json'));

    const both = watchedFiles(HOME, ['claude', 'codex', 'claude'], adapterFor);
    ok('an engine named twice is watched once', both.length === 4);
    ok('…and an engine with nothing to project is not watched at all',
        watchedFiles(HOME, ['gemini'], adapterFor).length === 0);

    // fs.watch is only reliable on a directory, so each file carries its own.
    ok('every watched file names the directory to watch and the name to filter by',
        both.every(w => w.dir && w.name && norm(path.join(w.dir, w.name)) === norm(w.file)));
    ok('‼️ …and the root identity file watches the HOME directory, not the engine\'s',
        norm(at(both, '.claude.json').dir) === HOME);
}

// ---------- 2. ‼️ THE LOOP RULE ----------
// The promotion leg writes ~/.claude.json. That write arrives here as an event.
// If the sweep answered it by calling the gate, the gate would promote again.
{
    const files = watchedFiles(HOME, ['claude'], adapterFor);
    const settings = HOME + '/.claude/settings.json';
    const identity = HOME + '/.claude.json';
    const fs = fakeFs({ [settings]: '{"model":"opus"}', [identity]: '{"userID":"u1"}' });

    let seen = fingerprint(fs, files);
    ok('a first fingerprint knows both files', Object.keys(seen).length === 2);

    // an event with nothing behind it — the file system reports plenty of these
    let r = changedSince(fs, files, seen);
    ok('an event on a file that still says the same thing is NOT a change', r.changed.length === 0);

    // the user really edits the main settings file
    fs.files[settings] = '{"model":"opus","permissions":{"allow":["Bash"]}}';
    r = changedSince(fs, files, seen);
    ok('…while a real edit is', r.changed.length === 1 && norm(r.changed[0].file) === settings);
    seen = r.now;

    // ‼️ now the gate runs and the RETURN LEG writes the identity file back.
    // Re-fingerprinting after the gate is what makes that write already known.
    fs.files[identity] = '{"userID":"u1","projects":{"D--p":{"allowedTools":["Bash"]}}}';
    seen = fingerprint(fs, files);
    r = changedSince(fs, files, seen);
    ok('‼️ the gate\'s OWN write does not come back as a change — no second gate, no loop',
        r.changed.length === 0);

    // …and the watcher is not deaf afterwards: the next real edit still lands.
    fs.files[identity] = '{"userID":"u1","mcpServers":{"x":{}}}';
    r = changedSince(fs, files, seen);
    ok('…and a real change right after a self-write is still heard',
        r.changed.length === 1 && norm(r.changed[0].file) === identity);
}

// ---------- 3. absent is not empty ----------
{
    const files = watchedFiles(HOME, ['claude'], adapterFor);
    const settings = HOME + '/.claude/settings.json';
    const fs = fakeFs({ [settings]: '' });
    const seen = fingerprint(fs, files);
    delete fs.files[settings];
    const r = changedSince(fs, files, seen);
    ok('‼️ deleting a file the fleet had is a change, not the same as it being empty',
        r.changed.length === 1 && norm(r.changed[0].file) === settings);

    // and a file that was never there stays quiet rather than reading as a change
    const bare = fakeFs({});
    const quiet = changedSince(bare, files, fingerprint(bare, files));
    ok('…and a file neither side ever had says nothing', quiet.changed.length === 0);
}

// ---------- 4. the gate name is the one the journal can tell apart ----------
{
    const src = require('fs').readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    // ‼️ X-301 — the gate is now reached through `runContractGate`, which keeps
    // the "never fails its caller" promise and drops the silence: a throw lands
    // in the repair journal as `clause: 'contract'` instead of vanishing.
    ok('‼️ the watcher calls the EXISTING gate, not a second code path of its own',
        /runContractGate\('watch'\)/.test(src));
    ok('…and it re-fingerprints after the gate, which is the loop rule at the call site',
        /runContractGate\('watch'\)[\s\S]{0,400}?slotWatchState\.seen = fingerprint/.test(src));
    // ‼️ One of the watched directories is the HOME directory — 42 other children
    // on this machine — so the `name` a watched file carries has to be USED, not
    // merely computed. Without the filter every stray home event would cost a
    // sweep and a 60 KB read of the identity file.
    ok('‼️ an event naming a file we do not watch is dropped before it costs a read',
        /if \(name && !names\.has\(/.test(src));
    ok('…and the watch is armed from the gate, so the FIRST account of a new engine is heard at once',
        /'capture', slot\.id\);[\s\S]{0,600}?armSlotWatch\(\)/.test(src));
}

/* =========================================================================
 * ‼️ X-301 — THE OTHER DIRECTION: A SLOT THAT WAS WHOLE AND THEN BROKE.
 *
 * Everything above watches the FLEET, and everything it hears travels one way —
 * the user edited a file, so the slots must follow. The sixth gate had nothing
 * to say about a slot breaking on its own, and slots do break on a schedule:
 * the engine prunes its own scratch directories, and on a relocated config
 * directory those are junctions, so a recursive remove unlinks them instead of
 * walking into them. Counted on this machine over 24 comparable repairs,
 * `link:todos` and `link:shell-snapshots` followed a housekeeping run 24 times
 * out of 24 while every other clause followed one 0 times.
 *
 * The stamp is the engine SAYING it has just been through the directory, so
 * watching it makes the event that breaks the slot the event that repairs it.
 * ========================================================================= */
{
    const slots = [
        { id: 'claude-a', engine: 'claude', dir: 'C:/slots/claude-a' },
        { id: 'claude-b', engine: 'claude', dir: 'C:/slots/claude-b' }
    ];
    const rows = watchedStamps(slots, adapterFor);
    ok('‼️ every slot whose engine stamps its housekeeping is watched',
        rows.length === 2 && rows.every(r => r.name === '.last-cleanup'));
    ok('…each under its OWN directory, because the stamp is per slot and not per engine',
        rows.map(r => r.dir).join('|') === 'C:/slots/claude-a|C:/slots/claude-b'
            .split('|').map(p => path.normalize(p)).join('|')
        || rows.every((r, i) => path.normalize(r.dir) === path.normalize(slots[i].dir)));
    ok('…and the row carries the whole path the fingerprint reads',
        rows.every((r, i) => path.normalize(r.file)
            === path.normalize(path.join(slots[i].dir, '.last-cleanup'))));

    // ‼️ AN ENGINE THAT STAMPS NOTHING CONTRIBUTES NOTHING — the same refusal
    // `keptAt` makes. Inventing a filename would put a watcher on a path no
    // engine writes and report "nothing ever changes" for ever.
    const quiet = watchedStamps([{ id: 'x-1', engine: 'nosuchengine', dir: 'C:/slots/x-1' }],
        () => ({}));
    ok('‼️ an engine with no housekeeping stamp is not given an invented one',
        quiet.length === 0);
    ok('…and a slot with no directory is skipped rather than watched at the root',
        watchedStamps([{ id: 'y', engine: 'claude', dir: '' }], adapterFor).length === 0);
    ok('…and two slots that somehow resolve to one path are watched once',
        watchedStamps([slots[0], { ...slots[0], id: 'dup' }], adapterFor).length === 1);

    // ---- the two lists reach ONE sweep ----
    const src = require('fs').readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('‼️ the sweep watches the fleet AND the slots, in one list',
        /const slotWatchFiles = \(\) => \[\s*\n\s*\.\.\.watchedFiles\(os\.homedir\(\)[^\n]*\n\s*\.\.\.watchedStamps\(storedAccounts\(\), accountAdapterFor\)/.test(src));
    // ‼️ NO LOOP, and it is a fact about the contract rather than a hope: the
    // repair writes junctions and files the contract names, never the engine's
    // own stamp. A gate that wrote it would wake itself for ever.
    ok('‼️ the contract never writes the stamp it now watches — no feedback loop',
        !/writeFileSync\([^)]*housekeeping/.test(src)
        && /const keptAt = housekeepingAt\(fs, slot\.dir/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
