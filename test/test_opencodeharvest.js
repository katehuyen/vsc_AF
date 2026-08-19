// S-33 — the half that costs a process, driven against an injected CLI.
//
// ‼️ THE WHOLE POINT OF THIS CLASS IS RESTRAINT. `SessionSource.scan()` runs on
// every repaint and OpenCode's history is only reachable by spawning, so the two
// are separated by a cache directory and this thing runs on its own slow clock.
// What is asserted below is therefore mostly about what does NOT happen: an
// unchanged conversation is not exported again, a folder that answers nothing is
// not an error, two harvests do not overlap, and the quiet floor holds back the
// automatic caller without ever holding back the user's own refresh.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { OpencodeHarvester, HARVEST_MIN_MS } =
    require(path.join(__dirname, '..', 'out', 'core', 'opencodeharvest.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const REPO = 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm';
const AGENT = 'D:\\zone\\agent\\ajanlar\\developer';
const SES = 'ses_ffae93e06ffe3OOx0X42HLDzT2';
const OTHER = 'ses_ffae85422ffev4asDVFfc6QHCX';

const exportDoc = (id, updated) => JSON.stringify({
    info: { id, title: 't', directory: REPO, time: { created: 1, updated } }, messages: []
});

/** A CLI that answers from a script and records every call it was given. */
function cli(answers) {
    const calls = [];
    return {
        calls,
        run(args, cwd) {
            calls.push({ args: args.join(' '), cwd });
            const key = args[0] === 'export' ? 'export:' + args[1] : 'list:' + cwd;
            const a = answers[key];
            if (a === undefined) { return Promise.resolve({ stdout: '', error: 'no such answer' }); }
            return Promise.resolve(typeof a === 'string' ? { stdout: a } : a);
        }
    };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'af-harvest-'));

// ---------- the walk, and what it learns ----------
{
    const dir = tmp();
    const h = new OpencodeHarvester({
        dir: () => dir, roots: () => [REPO, REPO.toLowerCase(), '', AGENT],
        cli: cli({}), enabled: () => true
    });
    const roots = h.roots();
    ok('the same folder in two spellings is one folder', roots.length === 2);
    ok('…and an empty root is not a folder', !roots.includes(''));
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- one pass: list everywhere, export what moved ----------
{
    const dir = tmp();
    // ‼️ MEASURED: the listing is cwd-SCOPED — the repo answers with six
    // conversations and the agent folder one step away answers with nothing.
    const c = cli({
        ['list:' + REPO]: JSON.stringify([
            { id: SES, title: 'NONCE', updated: 200, created: 100, projectId: 'p', directory: REPO },
            { id: OTHER, title: 'tools', updated: 300, created: 100, projectId: 'p', directory: REPO }
        ]),
        ['list:' + AGENT]: '',
        ['export:' + SES]: exportDoc(SES, 200),
        ['export:' + OTHER]: 'Exporting session: ' + OTHER + '\n' + exportDoc(OTHER, 300)
    });
    const h = new OpencodeHarvester({
        dir: () => dir, roots: () => [REPO, AGENT], cli: c, enabled: () => true
    });
    return h.harvest().then(async r => {
        ok('every folder is listed from', r.roots === 2 && c.calls.filter(x => /session list/.test(x.args)).length === 2);
        ok('‼️ a folder that answers nothing is NOT a failure — that is the cwd scoping working',
            r.failed === 0);
        ok('the two conversations are one list', r.listed === 2 && r.exported === 2);
        ok('both exports are on disk under their own ids',
            fs.existsSync(path.join(dir, SES + '.json')) && fs.existsSync(path.join(dir, OTHER + '.json')));
        const written = fs.readFileSync(path.join(dir, OTHER + '.json'), 'utf8');
        ok('‼️ a build that prints its banner on STDOUT must not leave a file that will not parse',
            written[0] === '{' && JSON.parse(written).info.id === OTHER);
        ok('the export is taken in the conversation\'s OWN folder, not in whichever root came first',
            c.calls.filter(x => /^export/.test(x.args)).every(x => x.cwd === REPO));

        // ---------- the second pass exports nothing ----------
        const before = c.calls.length;
        const again = await h.harvest(true);
        ok('‼️ an unchanged conversation is never exported twice — the whole cost control',
            again.exported === 0 && again.listed === 2);
        ok('…and the listing still ran, so a NEW conversation would have been seen',
            c.calls.length === before + 2);

        // ---------- …until it moves ----------
        c.calls.length = 0;
        const moved = new OpencodeHarvester({
            dir: () => dir, roots: () => [REPO], cli: cli({
                ['list:' + REPO]: JSON.stringify([
                    { id: SES, title: 'NONCE', updated: Date.now() + 60_000, created: 100, projectId: 'p', directory: REPO }
                ]),
                ['export:' + SES]: exportDoc(SES, 999)
            }), enabled: () => true
        });
        const after = await moved.harvest(true);
        ok('a conversation that has moved since we read it IS exported again', after.exported === 1);

        fs.rmSync(dir, { recursive: true, force: true });
        finish();
    });
}

function finish() {
    // ---------- the quiet floor, and the refresh that ignores it ----------
    {
        const dir = tmp();
        let clock = 1_000_000;
        const c = cli({ ['list:' + REPO]: '[]' });
        const h = new OpencodeHarvester({
            dir: () => dir, roots: () => [REPO], cli: c, enabled: () => true, now: () => clock
        });
        h.harvest().then(async () => {
            const held = await h.harvest();
            ok('‼️ the automatic caller is held back by the floor — nothing is spawned',
                held.ran === false);
            const forced = await h.harvest(true);
            ok('…and the user\'s own refresh ignores it, because a button that might do nothing is worse than none',
                forced.ran === true);
            clock += HARVEST_MIN_MS + 1;
            const later = await h.harvest();
            ok('once the floor has passed, the automatic caller runs again', later.ran === true);

            // ---------- switched off ----------
            const off = new OpencodeHarvester({
                dir: () => dir, roots: () => [REPO], cli: c, enabled: () => false
            });
            const none = await off.harvest(true);
            ok('the setting switches the whole errand off without unwiring it',
                none.ran === false && none.exported === 0);

            // ---------- a CLI that is not there ----------
            const broken = new OpencodeHarvester({
                dir: () => dir, roots: () => [REPO],
                cli: cli({ ['list:' + REPO]: { stdout: '', error: 'ENOENT' } }), enabled: () => true
            });
            const b = await broken.harvest(true);
            ok('a CLI that cannot be run is a counted failure, never a throw',
                b.ran === true && b.failed === 1 && b.listed === 0);

            // ---------- S-39: a failure that is only counted cannot be fixed ----
            //
            // ‼️ MEASURED BEFORE ANY OF THIS WAS WRITTEN, through the bridge on
            // the running build: `roots 24 · listed 63 · exported 0 · failed
            // 20`. Twenty failures, one number, four possible causes, and no way
            // from inside the extension to tell which — the diagnosis had to be
            // done by hand, outside it. That is the defect; the two fixes below
            // fall out of what the diagnosis found.
            ok('‼️ a failure carries WHERE it happened and WHY, not just a count',
                b.failures.length === 1
                && b.failures[0].stage === 'list'
                && b.failures[0].where === REPO
                && b.failures[0].reason === 'ENOENT');

            // ---------- S-39: a folder that is gone is not a failure ----------
            //
            // ‼️ `learned` grows from the `directory` of every conversation a
            // listing names, and a conversation OUTLIVES its folder: nine of
            // this machine's roots were `%TEMP%/af-oc-contract-*` directories a
            // previous measuring run had deleted. Each cost a two-second spawn
            // that could only fail, and — because the walk stops at
            // HARVEST_MAX_ROOTS — pushed a live folder off the end of the list.
            {
                const gonePath = path.join(os.tmpdir(), 'af-harvest-gone-' + Date.now());
                const d2 = tmp();
                const c2 = cli({ ['list:' + REPO]: '[]' });
                const h2 = new OpencodeHarvester({
                    dir: () => d2, roots: () => [REPO, gonePath], cli: c2, enabled: () => true
                });
                const r2 = await h2.harvest(true);
                ok('‼️ a root that no longer exists is skipped, not spawned in and not failed',
                    r2.roots === 1 && r2.skippedRoots === 1 && r2.failed === 0
                    && !c2.calls.some(x => x.cwd === gonePath));
                fs.rmSync(d2, { recursive: true, force: true });
            }

            // ---------- S-39: an export does not need its own folder ----------
            //
            // ‼️ MEASURED against the real binary: OpenCode's store is
            // machine-wide, and `opencode export <id>` run from an unrelated
            // LIVE folder returns a conversation whose own directory has been
            // deleted, in full (exit 0, valid JSON). The cwd only has to EXIST.
            // Handing the spawn the dead directory the listing named is the
            // whole of this machine's `exported: 0`.
            {
                const d3 = tmp();
                const dead = path.join(os.tmpdir(), 'af-harvest-dead-' + Date.now());
                const c3 = cli({
                    ['list:' + REPO]: JSON.stringify([
                        { id: SES, title: 't', updated: 9e12, created: 1, directory: dead }
                    ]),
                    ['export:' + SES]: exportDoc(SES, 9e12)
                });
                const h3 = new OpencodeHarvester({
                    dir: () => d3, roots: () => [REPO], cli: c3, enabled: () => true
                });
                const r3 = await h3.harvest(true);
                const call = c3.calls.find(x => /^export /.test(x.args));
                ok('‼️ an export whose conversation folder is gone runs from a live root instead',
                    r3.exported === 1 && r3.failed === 0 && !!call && call.cwd === REPO);
                fs.rmSync(d3, { recursive: true, force: true });
            }

            // ---------- S-39: and BOTH surfaces say the reason ----------
            //
            // ‼️ The panel–bridge equivalence rule (`_REF/agentfarm-dev.md`) cuts
            // both ways here: the command's toast and `sessions.opencodeSync`
            // report the same harvest, so a reason added to one and not the
            // other leaves whichever surface you happen to be on saying "20
            // call(s) failed" and nothing else.
            {
                const ext = fs.readFileSync(
                    path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
                ok('‼️ the bridge hands the reasons back, not just the count',
                    /failures: r\.failures/.test(ext) && /skippedRoots: r\.skippedRoots/.test(ext));
                ok('…and the command\'s own message quotes one of them',
                    /const why = r\.failures\[0\]/.test(ext)
                    && /folder\(s\) skipped \(gone\)/.test(ext));
            }

            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`${pass} passed, ${fail} failed`);
            process.exit(fail ? 1 : 0);
        });
    }
}
