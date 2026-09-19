// X-333 — READING THE ENGINES' OWN RECORDS OFF A SLOT DIRECTORY.
//
// The rules live in `accountAttribution.js` and are measured next door. What is
// pinned here is the collecting, and the two questions it must ask the ADAPTER
// rather than answer for itself:
//
//   · `sessions` under a Claude slot is the slot's own, so a record in it
//     places a session; under Codex the same folder name is a junction into the
//     common pool, and reading it as the slot's would attribute the whole
//     machine's work to one sign-in. The file name is identical either way —
//     only the adapter knows the difference.
//   · a touch is the newest mtime across the slot's OWN files. A shared path's
//     mtime belongs to the machine, and using it would make every sign-in look
//     busy whenever any one of them ran.
//
// ‼️ The fixture is built in os.tmpdir() with an `af-` prefix, never inside
// test/: a test that throws never reaches its cleanup, and the leftover walks
// into the next `git add -A`.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const E = require(path.join(__dirname, '..', 'out', 'core', 'accountEvidence.js'));
const A = require(path.join(__dirname, '..', 'out', 'core', 'accountAttribution.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evidence-'));
const mk = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const write = (p, o) => { fs.writeFileSync(p, JSON.stringify(o), 'utf8'); return p; };

try {
    // ---------- a Claude slot with both records ----------
    const a = mk(path.join(root, 'claude-a'));
    write(path.join(a, '.claude.json'), {
        projects: {
            'D:/one': { lastSessionId: 'sess-own', lastStartTime: 1700 },
            'D:/two': { lastSessionId: 'sess-copied', lastStartTime: 1500 },
            'D:/three': { lastCost: 4 }
        }
    });
    write(path.join(mk(path.join(a, 'sessions')), '1234.json'), { pid: 1234, sessionId: 'sess-live' });
    write(path.join(mk(path.join(a, 'sessions')), 'junk.txt'), {});
    write(path.join(a, '.credentials.json'), { t: 1 });

    const b = mk(path.join(root, 'claude-b'));
    write(path.join(b, '.claude.json'), {
        projects: { 'D:/two': { lastSessionId: 'sess-copied', lastStartTime: 1500 } }
    });

    // Codex: `sessions` is a SHARED path, so a record under it says nothing
    // about the slot even though the folder looks identical.
    const c = mk(path.join(root, 'codex-c'));
    write(path.join(mk(path.join(c, 'sessions')), '99.json'), { sessionId: 'not-ours' });
    write(path.join(c, 'auth.json'), { t: 1 });

    const slots = [
        { id: 'claude-a', engine: 'claude', dir: a },
        { id: 'claude-b', engine: 'claude', dir: b },
        { id: 'codex-c', engine: 'codex', dir: c }
    ];
    const ev = E.readSlotEvidence(slots);

    ok('a live registry record places its session on the slot that holds it',
        ev.registry.length === 1
        && ev.registry[0].slot === 'claude-a' && ev.registry[0].sessionId === 'sess-live');
    ok('‼️ THE SAME FOLDER NAME UNDER CODEX IS A JUNCTION AND IS NOT READ',
        !ev.registry.some(r => r.slot === 'codex-c'));
    ok('a file in the registry folder that is not a record is ignored',
        ev.registry.length === 1);

    ok('every project the CLI wrote a last session for becomes a record',
        ev.slotRecords.filter(r => r.slot === 'claude-a').length === 2);
    ok('a project with no last session is not a record',
        !ev.slotRecords.some(r => !r.sessionId));
    ok('the start time travels when the CLI wrote one',
        ev.slotRecords.find(r => r.sessionId === 'sess-own').at === 1700);

    // ‼️ THE COLLECTOR DOES NOT FILTER THE COPY. It is only detectable ACROSS
    // slots, and that comparison has one owner — doing half of it here would
    // leave two places deciding one question.
    ok('‼️ THE COPY IS COLLECTED HERE AND REFUSED THERE, in one place not two',
        ev.slotRecords.filter(r => r.sessionId === 'sess-copied').length === 2
        && !A.uniqueSlotRecords(ev.slotRecords).some(r => r.sessionId === 'sess-copied'));
    ok('…and the record that is really its own survives the guard',
        A.uniqueSlotRecords(ev.slotRecords).some(
            r => r.sessionId === 'sess-own' && r.slot === 'claude-a'));

    ok('every slot with an own file of its own reports a touch',
        ev.touches.length === 3 && ev.touches.every(t => t.at > 0));
    ok('a Codex slot has no session records but is still known to have been touched',
        !ev.slotRecords.some(r => r.slot === 'codex-c')
        && ev.touches.some(t => t.slot === 'codex-c'));

    // ---------- nothing here is fatal ----------
    {
        const broken = path.join(root, 'claude-missing');
        const got = E.readSlotEvidence([{ id: 'gone', engine: 'claude', dir: broken }]);
        ok('‼️ A SLOT DIRECTORY THAT IS NOT THERE YIELDS LESS EVIDENCE, NEVER AN EXCEPTION',
            got.registry.length === 0 && got.slotRecords.length === 0 && got.touches.length === 0);
        const half = mk(path.join(root, 'claude-half'));
        fs.writeFileSync(path.join(half, '.claude.json'), '{not json', 'utf8');
        const g2 = E.readSlotEvidence([{ id: 'half', engine: 'claude', dir: half }]);
        ok('a half-written file is read as no records, and the touch still counts',
            g2.slotRecords.length === 0 && g2.touches.length === 1);
        ok('a slot with no id or no directory is not read at all',
            E.readSlotEvidence([{ id: '', engine: 'claude', dir: a },
                { id: 'x', engine: 'claude', dir: '' }]).touches.length === 0);
    }

    // ---------- the capture time travels so a capture is not a run ----------
    {
        const got = E.readSlotEvidence([{ id: 'claude-a', engine: 'claude', dir: a, capturedAt: 42 }]);
        ok('the slot\'s capture time rides on the touch, where the rule can use it',
            got.touches[0].capturedAt === 42);
    }
} finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(`test_account_evidence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
