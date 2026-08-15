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

            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`${pass} passed, ${fail} failed`);
            process.exit(fail ? 1 : 0);
        });
    }
}
