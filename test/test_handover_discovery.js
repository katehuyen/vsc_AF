// X-189 — THE HANDOVER NOTE IS LOOKED FOR WHERE IT WAS ACTUALLY WRITTEN.
//
// The defect: the sentry looked for a handover note in ONE hard-coded folder
// (`extension.ts` `cevapDir()`) under ONE millimetric name pattern
// (`sessionDiagnosis.ts` NAME_RE — date + `_devir_` + two digits + eight hex +
// topic, every part mandatory). An agent that wrote its note anywhere else, or
// named it anything else, was invisible — and the campaign then diagnosed
// `hit-the-wall` about a session that had handed over perfectly well. A false
// measurement is worse than a missing one: it sends the next round after the
// wrong thing.
//
// The rules this file pins:
//
//   * FOUR SOURCES, IN ORDER, and the order is the argument: `transcript` (the
//     files the finished session itself wrote — the most truthful source,
//     because where the agent actually wrote beats where a setting says it
//     should have), then `configured`, then `projectNotes`, then `fallback`
//     — the legacy vault folder, LAST and only there.
//   * ‼️ SCORING REPLACES THE ALL-OR-NOTHING PATTERN, NOT THE IDENTITY CHECK.
//     id-in-name +3 · authored-by-this-session +3 · devir/handover word +2 ·
//     a date near today +1 · the full canonical pattern +2. But a candidate
//     that establishes NEITHER identity (no id in the name, not authored by
//     this session) is never adopted at any score: taking another session's
//     handover note is a worse failure than finding none, and `devir` + today
//     + canonical describes every note in the folder.
//   * ‼️ NOT LISTED IS NOT EMPTY (X-174's law, unchanged). A source that could
//     not be read goes on `unknown`; a source that was read and had nothing in
//     it is evidence.
//   * the canonical name is still PREFERRED — it just is not required.
//   * two notes from one session: the higher daily counter is the live one.
'use strict';
const path = require('path');
const {
    HANDOVER_SOURCES, DEFAULT_HANDOVER_THRESHOLD, scoreHandover, discoverHandover
} = require(path.resolve(__dirname, '../out/core/handoverDiscovery.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SID = '689569e7-94b4-45f9-bb60-4c0f33b2bb5a';
const TODAY = '2026-09-05';
// 2026-09-05 06:30 local — so "recent" is decided against a fixed clock
const NOW = new Date(2026, 8, 5, 6, 30, 0).getTime();
const AT = (o) => ({ sessionId: SID, today: TODAY, now: NOW, ...(o || {}) });

const CANON = '2026-09-05_devir_02_689569e7_x167-yeniden-acildi.md';
const OTHER = '2026-09-05_devir_07_deadbeef_bambaska-bir-oturum.md';

// ---------------------------------------------------------------- dictionary
ok('the source order is exported once, and it is the order the spec argues for',
    Array.isArray(HANDOVER_SOURCES)
    && HANDOVER_SOURCES.join(',') === 'transcript,configured,projectNotes,fallback');
ok('the threshold is a named default, not a number buried in a comparison',
    DEFAULT_HANDOVER_THRESHOLD === 3);

// -------------------------------------------------------------------- scoring
{
    const s = scoreHandover({ file: CANON, source: 'fallback' }, AT());
    ok('the canonical note naming this session scores every component', s.score === 8);
    ok('…and says which components scored',
        ['id', 'word', 'recent', 'canonical'].every(p => s.parts.includes(p)));
    ok('…and it is identified', s.identified === true);
    ok('…and the canonical fields are read out of the name', s.note && s.note.seq === 2
        && s.note.session === '689569e7' && s.note.date === TODAY);
}
{
    // THE DEFECT, in one line: off-pattern, still this session's note.
    const s = scoreHandover({ file: 'devir-689569e7.md', source: 'configured' }, AT());
    ok('a note that misses the canonical pattern but carries the id is still identified',
        s.identified === true && s.score >= DEFAULT_HANDOVER_THRESHOLD);
    ok('…and it scores lower than the canonical one, because canonical is still preferred',
        s.score < 8);
    ok('…and it has no canonical fields to read', s.note === undefined);
}
{
    const s = scoreHandover({ file: OTHER, source: 'fallback' }, AT());
    ok('a perfect canonical note that names ANOTHER session is not identified',
        s.identified === false);
    ok('…and says so in a sentence a person can read',
        typeof s.why === 'string' && /deadbeef/.test(s.why));
}
{
    const s = scoreHandover({ file: 'notes.md', source: 'transcript', authored: true }, AT());
    ok('a file the session itself wrote is identified whatever it is called',
        s.identified === true && s.parts.includes('authored'));
}
{
    const s = scoreHandover({ file: '2026-09-05_devir_01_aaaaaaaa_bir-sey.md', source: 'fallback' }, AT());
    ok('devir + today + canonical is NOT enough without identity — that is every note in the folder',
        s.identified === false);
}
{
    // ‼️ THE DANGEROUS SHAPE, and the one the canonical-name branch above does
    // NOT cover: it reads like a handover note, it is from today, and its name
    // belongs to nobody in particular — so nothing rejects it except the floor
    // itself. Score alone would adopt it and send the next round after another
    // agent's work. (Written after a mutation test showed the previous case
    // returned early and never reached the floor.)
    const s = scoreHandover({ file: 'devir-2026-09-05-gece.md', source: 'fallback' }, AT());
    ok('a name that scores at the threshold but names no session is still refused',
        s.identified === false && s.score >= DEFAULT_HANDOVER_THRESHOLD);
    const d = discoverHandover([{ source: 'fallback', files: ['devir-2026-09-05-gece.md'] }], AT());
    ok('…and discovery does not adopt it either', d.hit === undefined && d.considered.length === 0);
    ok('…but it IS reported, because a near miss is what a person wants to see',
        d.evidence.some(e => /gece/.test(e)));
}
{
    const old = scoreHandover({ file: '2026-08-01_devir_02_689569e7_eski.md', source: 'fallback' }, AT());
    const now = scoreHandover({ file: CANON, source: 'fallback' }, AT());
    ok('a stale date loses the recency point but keeps the note',
        old.identified === true && !old.parts.includes('recent') && old.score === now.score - 1);
}
{
    const y = scoreHandover({ file: '2026-09-04_devir_09_689569e7_dun.md', source: 'fallback' }, AT());
    ok('yesterday still counts as near today — a night run hands over across midnight',
        y.parts.includes('recent'));
}
{
    const s = scoreHandover({ file: '689569e7.md', source: 'transcript', mtimeMs: NOW - 60000 }, AT());
    ok('with no date in the name, a fresh mtime earns the recency point',
        s.parts.includes('recent'));
}
{
    const s = scoreHandover({ file: 'DEVIR-689569E7.MD', source: 'configured' }, AT());
    ok('matching is case-insensitive — a name is a handle, not a shibboleth',
        s.identified === true && s.parts.includes('word'));
}

// ---- ‼️ X-322 — whose file it is is not what the file is ---------------------
//
// Measured on X-309's third drill: the round's own deliverable
// `10_Notes/sentry_hello.md` was adopted at score 4 (authored + fresh mtime) and
// the next round was told to "read the handover note FIRST".
{
    const d = discoverHandover([
        { source: 'transcript', dir: '/vault/10_Notes', files: ['sentry_hello.md'],
            authored: ['sentry_hello.md'], mtimes: { 'sentry_hello.md': NOW - 60000 } }
    ], AT());
    ok('the measured case scores at the threshold — the floor is not what failed',
        d.considered.length === 1 && d.considered[0].score >= DEFAULT_HANDOVER_THRESHOLD);
    ok('‼️ …and an authored file whose name says nothing of a handover is NOT adopted',
        d.hit === undefined);
    ok('…it stays on the list, ranked, so a surface can still show it',
        d.considered[0].file === 'sentry_hello.md' && d.considered[0].identified === true);
    ok('…and the evidence says why it was passed over, by name',
        d.evidence.some(e => /sentry_hello\.md/.test(e) && /not taken/.test(e)));
    ok('…without claiming it was the best HANDOVER note that fell short',
        !d.evidence.some(e => /the best was sentry_hello/.test(e)));
}
{
    const d = discoverHandover([
        { source: 'transcript', files: ['sentry_hello.md', 'devir-notu.md'],
            authored: ['sentry_hello.md', 'devir-notu.md'] }
    ], AT());
    ok('an authored file that SAYS handover is adopted, whatever else the session wrote',
        d.hit && d.hit.file === 'devir-notu.md');
}
{
    // the measured folder: many notes of other sessions, reached through two sources
    const many = Array.from({ length: 27 }, (_, i) =>
        `2026-09-${String(10 + (i % 7)).padStart(2, '0')}_devir_${String(i + 1).padStart(2, '0')}_${(0x10000000 + i).toString(16)}_konu.md`);
    const d = discoverHandover([
        { source: 'configured', dir: '/vault/01_CEVAPLAR', files: many },
        { source: 'fallback', dir: '/vault/01_CEVAPLAR', files: many }
    ], AT());
    const lines = d.evidence.filter(e => /handover note/.test(e));
    ok('‼️ 27 notes of other sessions, seen twice, become ONE line in the evidence',
        lines.length === 2 && lines.some(e => /^27 handover notes of other sessions were passed over/.test(e)));
    ok('…which still names a few, so a person can see what kind of thing was passed over',
        lines.some(e => /among them/.test(e) && /_konu\.md/.test(e)));
    ok('…and no single rejection is recited on its own any more',
        !d.evidence.some(e => /is the handover note of session/.test(e)));

    const few = discoverHandover([
        { source: 'configured', dir: '/v', files: [OTHER] },
        { source: 'fallback', dir: '/v', files: [OTHER] }
    ], AT());
    ok('a near miss reached through two sources is reported ONCE',
        few.evidence.filter(e => /deadbeef/.test(e)).length === 1);
}
{
    const d = discoverHandover([
        { source: 'transcript', files: ['gece-notu.md'], authored: ['gece-notu.md'] }
    ], AT());
    ok('‼️ X-189 still holds: a NOTE the session called something else is adopted',
        d.hit && d.hit.file === 'gece-notu.md');
}
{
    const d = discoverHandover([{ source: 'transcript', files: ['689569e7.md'], authored: [] }], AT());
    ok('a file named after the session is about the session — the id in the name is enough',
        d.hit && d.hit.file === '689569e7.md');
}
{
    const d = discoverHandover([
        { source: 'transcript', files: ['CHANGELOG.md'], authored: ['CHANGELOG.md'],
            mtimes: { 'CHANGELOG.md': NOW - 1000 } }
    ], AT());
    ok('‼️ a developer session that edited CHANGELOG.md did not thereby hand over',
        d.hit === undefined);
}

// ------------------------------------------------------------------ discovery
{
    const d = discoverHandover([
        { source: 'transcript', files: ['scratch.md'], authored: ['scratch.md'] },
        { source: 'fallback', dir: '/vault/01_CEVAPLAR', files: [CANON, OTHER] }
    ], AT());
    ok('the best score wins across sources, not the first source that answers',
        d.hit && d.hit.file === CANON);
    ok('…and the hit says which source it came from', d.hit.source === 'fallback');
    ok('…and carries its score, so a condition can read it', d.hit.score === 8);
    ok('…and its full path, when the source knew the folder',
        d.hit.path === '/vault/01_CEVAPLAR/' + CANON);
}
{
    // Same score both sides: the earlier source is the more truthful one.
    const d = discoverHandover([
        { source: 'fallback', files: ['devir-689569e7.md'] },
        { source: 'transcript', files: ['devir-689569e7.md'], authored: [] }
    ], AT());
    ok('a tie is broken by source order, not by the order the host happened to list them',
        d.hit && d.hit.source === 'transcript');
}
{
    const d = discoverHandover([
        { source: 'fallback', files: [
            '2026-09-05_devir_01_689569e7_ilk.md',
            '2026-09-05_devir_03_689569e7_son.md',
            '2026-09-05_devir_02_689569e7_orta.md'
        ] }
    ], AT());
    ok('a session that handed over three times leaves the LAST one live',
        d.hit && d.hit.seq === 3);
}
{
    const d = discoverHandover([{ source: 'fallback', files: [OTHER] }], AT());
    ok('a folder full of other sessions\' notes finds nothing', d.hit === undefined);
    ok('…and that is a MEASUREMENT, not a blank', d.measured === true);
    ok('…and it is on the record what was rejected and why',
        d.evidence.some(e => /deadbeef/.test(e)));
}
{
    const d = discoverHandover([{ source: 'fallback', files: [] }], AT());
    ok('a listed and empty folder is measured', d.measured === true && d.hit === undefined);
    ok('…and does not claim anything is unknown', d.unknown.length === 0);
}
{
    const d = discoverHandover([
        { source: 'configured', skipped: '${vault} has nothing behind it on this machine.' }
    ], AT());
    ok('a source that could NOT be listed leaves the discovery unmeasured',
        d.measured === false && d.hit === undefined);
    ok('…and says why, in the caller\'s own sentence',
        d.unknown.some(u => /\$\{vault\}/.test(u)));
}
{
    const d = discoverHandover([
        { source: 'configured', skipped: 'no such folder' },
        { source: 'fallback', files: [CANON] }
    ], AT());
    ok('one skipped source does not make a discovery that DID read somewhere unmeasured',
        d.measured === true && d.hit && d.hit.file === CANON);
    ok('…but the skip is still reported, because a user can fix it',
        d.unknown.length === 1);
}
{
    const d = discoverHandover([], AT());
    ok('no sources at all is unmeasured, never "no note"', d.measured === false);
}
{
    const d = discoverHandover(undefined, AT());
    ok('and neither is nothing handed in at all', d.measured === false && d.hit === undefined);
}
{
    const d = discoverHandover([{ source: 'fallback', files: ['devir-689569e7.md'] }],
        AT({ threshold: 6 }));
    ok('a campaign may demand more evidence than the default', d.hit === undefined);
    ok('…and the near miss is still visible rather than thrown away',
        d.considered.length === 1 && d.considered[0].score === 5);
}
{
    const d = discoverHandover([{ source: 'fallback', files: [
        '689569e7-devir.txt', '689569e7-devir.md.bak', 'devir-689569e7.md'
    ] }], AT());
    ok('only markdown is a handover note', d.hit && d.hit.file === 'devir-689569e7.md');
}
{
    const d = discoverHandover([{ source: 'fallback', files: [CANON] }],
        AT({ sessionId: '' }));
    ok('with no session id there is nothing to look FOR, and that is unknown, not absent',
        d.measured === false && d.hit === undefined && d.unknown.length === 1);
}
{
    const d = discoverHandover([
        { source: 'fallback', files: [CANON] },
        { source: 'transcript', files: ['devir-689569e7.md'], authored: ['devir-689569e7.md'] }
    ], AT());
    ok('every identified candidate is kept, ranked, so a surface can show the runners-up',
        d.considered.length === 2 && d.considered[0].file === CANON);
    ok('…and the discovery explains itself in one sentence',
        typeof d.why === 'string' && d.why.includes(CANON));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
