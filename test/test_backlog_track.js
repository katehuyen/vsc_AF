// The backlog track (compiled core/backlogTrack.js, pure): the join between a
// backlog CODE and the sessions and turns it was actually worked in.
//
// What is actually being defended here:
//   - the human's prose in Backloglog.md SURVIVES a rebuild. That is the whole
//     contract of the file: the machine owns the data rows, the person owns the
//     note, and a regeneration that ate somebody's closing paragraph would make
//     the feature worse than nothing.
//   - a block whose code we cannot place is CARRIED THROUGH, never dropped.
//   - uncertainty is written down with its REASON, never guessed away. A wrong
//     session id looks exactly like a right one.
//   - a torn ledger line costs one record, not the history.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const T = require(path.join(__dirname, '..', 'out', 'core', 'backlogTrack.js'));
const B = require(path.join(__dirname, '..', 'out', 'core', 'projectBacklog.js'));

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 7, 4, 14, 2).getTime();   // local, like everything here

const BACKLOG = [
    '---', 'af-role: backlog', '---', '',
    '# Demo — Backlog', '',
    '## K — Console', '',
    '- [x] K-8 history search is case sensitive #bug',
    '- [ ] K-9 something nobody has touched',
    '- [/] K-10 half done',
    '- [x] K-11 closed in Obsidian ✅ 2026-07-30', ''
].join('\n');

const items = B.parseBacklog(BACKLOG).items;

const RECORDS = [
    { code: 'K-8', event: 'doing', ts: T0, session: '3f2a1b2c-aaaa', turn: 11, agent: 'developer', by: 'agent' },
    { code: 'K-8', event: 'touch', ts: T0 + 60000, session: '3f2a1b2c-aaaa', turn: 12, agent: 'developer', by: 'agent', note: 'root cause not found' },
    { code: 'K-8', event: 'touch', ts: T0 + 120000, session: '3f2a1b2c-aaaa', turn: 13, agent: 'developer', by: 'agent' },
    { code: 'K-8', event: 'done', ts: T0 + DAY, session: '9c4d1f2a-bbbb', turn: 3, agent: 'developer', by: 'agent' },
    { code: 'K-10', event: 'doing', ts: T0 + 2 * DAY, session: '77778888-cccc', turn: 5, agent: 'developer', by: 'agent', uncertain: 'multi' }
];

// ---------- the ledger ----------
{
    const text = RECORDS.map(T.serializeTrack).join('\n');
    const back = T.parseTrack(text);
    ok('a record round-trips through the ledger', back.length === 5
        && back[0].code === 'K-8' && back[0].turn === 11 && back[3].event === 'done');
    ok('the doubt code survives the round trip', back[4].uncertain === 'multi');
    ok('records come back in time order',
        T.parseTrack([text.split('\n')[3], text.split('\n')[0]].join('\n'))
            .map(r => r.turn).join() === '11,3');

    const torn = text.split('\n');
    torn.splice(2, 0, '{"code":"K-8","event":"do');       // power went out mid-write
    ok('a torn line costs one record, not the file', T.parseTrack(torn.join('\n')).length === 5);
    ok('a line that is not a record at all is skipped',
        T.parseTrack('# a comment somebody typed\n' + text).length === 5);
    ok('a record with no code is refused', T.parseTrack('{"event":"done","ts":1}').length === 0);
    ok('an unknown event is refused rather than stored',
        T.parseTrack('{"code":"K-1","event":"pondered","ts":1}').length === 0);
}

// ---------- summarising ----------
{
    const s = T.summarizeCode('K-8', RECORDS);
    ok('the sessions are grouped, oldest first',
        s.runs.length === 2 && s.runs[0].session === '3f2a1b2c-aaaa');
    ok('a session collects its turns', s.runs[0].turns.join() === '11,12,13');
    ok('the turn count is across every session', s.turns === 4);
    ok('the closing event is found', s.closed && s.closed.turn === 3);
    ok('the stamp is what goes on the backlog line', T.closingStamp(s) === '9c4d1f2a#3');
    ok('an item nobody touched summarises to nothing',
        T.summarizeCode('K-9', RECORDS).runs.length === 0);

    // Closed, reopened, closed again: the LAST close is where it closed.
    const again = RECORDS.concat([
        { code: 'K-8', event: 'reopen', ts: T0 + 2 * DAY, session: 'ffff0000', turn: 1, by: 'panel' },
        { code: 'K-8', event: 'done', ts: T0 + 3 * DAY, session: 'eeee1111', turn: 9, by: 'agent' }
    ]);
    ok('a reopen moves the closing point forward',
        T.closingStamp(T.summarizeCode('K-8', again)) === 'eeee1111#9');
    const reopenedOnly = RECORDS.concat([
        { code: 'K-8', event: 'reopen', ts: T0 + 5 * DAY, session: 'ffff0000', turn: 1, by: 'panel' }
    ]);
    ok('an item reopened and not closed again has no closing stamp',
        T.closingStamp(T.summarizeCode('K-8', reopenedOnly)) === undefined);
    ok('a closing event with no session and no history before it gets no stamp — '
        + 'a pointer to nowhere is worse than none',
        T.closingStamp(T.summarizeCode('K-11',
            [{ code: 'K-11', event: 'done', ts: T0, by: 'outside' }])) === undefined);
}

// ---------- ‼️ the tick that happens in no session (A-5) ----------
//
// Ticking the box in the Backlog panel is honestly `by: 'panel'` with no
// session — the click happened in no conversation. But the question the stamp
// exists to answer still HAS an answer, and the ledger is holding it: the agent
// session that did the work minutes earlier. Measured on the real project on
// 2026-08-10, four items closed this way had a full recorded history and no
// stamp at all, and showed up as "no session to point at" — the record looked
// as if it had lost the day's work.
{
    const worked = [
        { code: 'K-8', event: 'doing', ts: T0, session: '3f2a1b2c-aaaa', turn: 11, agent: 'developer', by: 'agent' },
        { code: 'K-8', event: 'touch', ts: T0 + 60000, session: '3f2a1b2c-aaaa', turn: 12, agent: 'developer', by: 'agent' },
        { code: 'K-8', event: 'done', ts: T0 + 120000, by: 'panel' }
    ];
    const att = T.closingAttribution(T.summarizeCode('K-8', worked));
    ok('the stamp is carried from the session that did the work',
        att && att.stamp === '3f2a1b2c#12');
    ok('…and it SAYS it was carried rather than passing itself off as observed',
        att && att.carried === true);
    ok('an observed closing is not marked carried',
        T.closingAttribution(T.summarizeCode('K-8', RECORDS)).carried === false);

    // ‼️ A run that started AFTER the item closed is later work on something
    // reopened, not the thing that finished this one.
    const later = worked.concat([
        { code: 'K-8', event: 'touch', ts: T0 + 5 * DAY, session: 'ffff9999', turn: 2, by: 'agent' }
    ]);
    ok('a session that began after the close is not credited with it',
        T.closingAttribution(T.summarizeCode('K-8', later)).stamp === '3f2a1b2c#12');

    ok('the log says WHY the pointer is where it is',
        T.renderBacklogLog({ project: 'Demo', items, records: worked })
            .includes('[uncertain:: carried]'));
}

// ---------- turn spans ----------
{
    ok('a run of turns reads as a range', T.turnSpan([11, 12, 13, 14]) === '#11–14');
    ok('two adjacent turns are listed, not ranged', T.turnSpan([11, 12]) === '#11, #12');
    ok('gaps are kept', T.turnSpan([3, 4, 5, 9]) === '#3–5, #9');
    ok('one turn is one turn', T.turnSpan([7]) === '#7');
    ok('no turns says so', T.turnSpan([]) === '—');
}

// ---------- noticing what happened without us ----------
{
    const found = T.reconcileOutside(items, RECORDS, T0 + 9 * DAY);
    const by = code => found.find(r => r.code === code);
    ok('an item closed in Obsidian is noticed', !!by('K-11') && by('K-11').by === 'outside');
    ok('and its ✅ date is used rather than the moment we looked',
        by('K-11').ts === new Date(2026, 6, 30).getTime() && by('K-11').uncertain === 'guess');
    ok('an item the ledger already explains is left alone', !by('K-8') && !by('K-10'));
    ok('an untouched open item produces nothing — a log of non-events is noise', !by('K-9'));
    ok('it is idempotent: once recorded, nothing more is written',
        T.reconcileOutside(items, RECORDS.concat(found), T0 + 10 * DAY).length === 0);
}

// ---------- backfill: a clue, or nothing ----------
{
    // The evidence a transcript search produces: the code was WRITTEN in that turn.
    const HITS = [
        { code: 'K-11', session: 'aaaa0000', turn: 4, ts: new Date(2026, 6, 30, 11, 0).getTime(), agent: 'developer' },
        { code: 'K-11', session: 'aaaa0000', turn: 7, ts: new Date(2026, 6, 30, 15, 0).getTime(), agent: 'developer' },
        { code: 'K-11', session: 'bbbb1111', turn: 2, ts: new Date(2026, 3, 2, 9, 0).getTime() },
        { code: 'K-8', session: 'cccc2222', turn: 1, ts: T0, agent: 'developer' }
    ];
    const made = T.backfillFromHits(items, RECORDS, HITS);
    const mine = code => made.filter(r => r.code === code);

    ok('a code with an observed record is never rebuilt over the top of it', mine('K-8').length === 0);
    ok('a code with no history at all gets one row per turn it was written in', mine('K-11').length === 3);
    ok('every reconstructed row says so, so it can be told from an observed one',
        mine('K-11').every(r => r.by === 'backfill' && r.uncertain === 'guess'));
    const closer = mine('K-11').find(r => r.event === 'done');
    ok('the mention nearest the ✅ date becomes the closing row',
        closer && closer.session === 'aaaa0000' && closer.turn === 7);
    ok('…and the mention months away stays a touch, not a second closing',
        mine('K-11').filter(r => r.event === 'done').length === 1
        && mine('K-11').find(r => r.session === 'bbbb1111').event === 'touch');
    ok('an item nobody ever quoted gets nothing — the blank is the honest answer',
        !made.some(r => r.code === 'K-9'));

    // Nothing near the date: no closing row is invented, the touches still stand.
    const far = T.backfillFromHits(items, RECORDS,
        [{ code: 'K-11', session: 'dddd3333', turn: 1, ts: new Date(2025, 0, 1).getTime() }]);
    ok('with no mention anywhere near the date, nothing is called a closing',
        far.length === 1 && far[0].event === 'touch');

    // No ✅ date on the line: the last mention is the best evidence there is.
    const undated = B.parseBacklog('- [x] K-20 closed with no date').items;
    const guessed = T.backfillFromHits(undated, [], [
        { code: 'K-20', session: 'eeee4444', turn: 1, ts: T0 },
        { code: 'K-20', session: 'eeee4444', turn: 6, ts: T0 + DAY }
    ]);
    ok('with no date, the LAST mention is read as the closing',
        guessed.length === 2 && guessed[1].event === 'done' && guessed[1].turn === 6);
    const cancelled = T.backfillFromHits(
        B.parseBacklog('- [-] K-21 abandoned').items, [],
        [{ code: 'K-21', session: 'ffff5555', turn: 2, ts: T0 }]);
    ok('a cancelled item is reconstructed as cancelled, not as done',
        cancelled[0].event === 'cancelled');
    ok('an OPEN item gets its touches and no ending',
        T.backfillFromHits(B.parseBacklog('- [ ] K-22 still open').items, [],
            [{ code: 'K-22', session: 'ffff5555', turn: 2, ts: T0 }])[0].event === 'touch');
}

// ---------- the document ----------
{
    const first = T.renderBacklogLog({ project: 'Demo', items, records: RECORDS });
    ok('the file declares its role', /^---\naf-role: backloglog\n---/.test(first));
    ok('the backlog\'s own heading is mirrored', /## K — Console/.test(first));
    ok('a tracked item gets a data line, code first',
        /- \*\*K-8\*\* \[status:: done\] \[sessions:: 2\] \[turns:: 4\]/.test(first));
    ok('the closing stamp is on it', /\[closed:: 9c4d1f2a#3\]/.test(first));
    ok('each session is a row with its turns',
        /- `3f2a1b2c` #11–13 · 2026-08-04 14:02 · developer · touch — root cause not found/.test(first));
    ok('the closing session\'s row says so', /- `9c4d1f2a` #3 .* · \*\*done\*\*/.test(first));
    ok('an uncertain attribution says WHY, on the line',
        /- \*\*K-10\*\*.*\[uncertain:: multi\]/.test(first));
    ok('an item nobody has touched and nobody closed is not in the file', !/K-9/.test(first));
    ok('a closed item with no history is still listed — that gap is the point',
        /- \*\*K-11\*\* \[status:: done\] \[sessions:: 0\]/.test(first));
    ok('the item TEXT is not copied — that lives in the backlog',
        !/history search is case sensitive/.test(first));

    // ‼️ The contract: the human writes a note, the machine rebuilds around it.
    // Written the way a person would — under the item, below its rows.
    const lines = first.split('\n');
    const at = lines.findIndex(l => l.includes('`9c4d1f2a`'));
    lines.splice(at + 1, 0,
        '    > Closed by lower-casing both sides. The memory graph has the same',
        '    > comparison and was NOT touched.');
    const edited = lines.join('\n');
    const again = T.renderBacklogLog({ project: 'Demo', items, records: RECORDS, existing: edited });
    ok('a closing note written by hand survives the rebuild',
        /> Closed by lower-casing both sides\./.test(again)
        && /> comparison and was NOT touched\./.test(again));
    ok('and the machine rows are still there, not duplicated',
        (again.match(/- `9c4d1f2a`/g) || []).length === 1);
    ok('a second rebuild is stable',
        T.renderBacklogLog({ project: 'Demo', items, records: RECORDS, existing: again }) === again);

    // ‼️ The regression this pair exists for, and it compounds: a row shape the
    // reader does not recognise is kept as the human's prose AND regenerated, so
    // the file grows one more copy of it on every single render.
    const loose = RECORDS.concat([
        { code: 'K-11', event: 'done', ts: T0, by: 'outside', uncertain: 'none', note: 'ticked in Obsidian' },
        { code: 'K-10', event: 'doing', ts: T0, by: 'panel', agent: 'you' }
    ]);
    const one = T.renderBacklogLog({ project: 'Demo', items, records: loose });
    const twice = T.renderBacklogLog({ project: 'Demo', items, records: loose, existing: one });
    ok('a row with no session to point at is not duplicated by a rebuild', one === twice);
    ok('…and a third rebuild does not either',
        T.renderBacklogLog({ project: 'Demo', items, records: loose, existing: twice }) === twice);
    ok('every row the writer can emit is one the reader calls a machine row',
        (twice.match(/ticked in Obsidian/g) || []).length === 1);

    // A block for a code the backlog no longer has: carried through, never lost.
    const orphaned = again.replace('## K — Console',
        '## K — Console\n\n- **Z-99** [status:: done]\n    > we deleted this item but the note matters\n');
    const kept = T.renderBacklogLog({ project: 'Demo', items, records: RECORDS, existing: orphaned });
    ok('a block whose code is not in the backlog is kept, under a heading that says so',
        kept.includes(T.LOG_ORPHAN_HEADING) && /we deleted this item but the note matters/.test(kept));

    ok('the legend names the ledger it is built from',
        T.renderBacklogLog({ project: 'Demo', items, records: RECORDS, ledgerRel: '90_Archive/_tracks/backlog-track.jsonl' })
            .includes('90_Archive/_tracks/backlog-track.jsonl'));
}

// ---------------------------------------------------------------------------
// ‼️ P-14 — THE TWO THINGS THAT MADE THE RECORD LOOK BROKEN WHEN IT WAS NOT
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    // (1) The turn. 40 of this project's 241 ledger rows were stamped
    // `uncertain: turn` — session certain, turn not — because the only place
    // asked was the transcript INDEX, which is a scan, while the session asking
    // to be attributed is mid-turn and has not been scanned yet. The hooks had
    // counted the prompt before the agent started; nobody was asking them.
    ok('‼️ P-14 — a LIVE session is asked for its own turn count first',
        /const alive = live\.sessions\(\)\.find\(s => s\.sessionId === sid\);/.test(ext)
        && /if \(alive && alive\.prompts > 0\) \{ return alive\.prompts; \}/.test(ext));
    ok('…and the index is still the answer for a session that has ended',
        /const row = index\.allWithExternal\(\)\.find\(r => r\.sessionId === sid\);/.test(ext));

    // (2) The note. It was cut at 300 characters, silently — so a closing note
    // arrived in the log ending mid-clause and a reader could not tell the
    // truncation from a writer who had stopped there.
    ok('‼️ P-14 — a closing note has room to be one', T.TRACK_NOTE_MAX >= 2000);
    ok('…and where it really is longer, the cut is DRAWN',
        /one\.slice\(0, TRACK_NOTE_MAX - 1\) \+ '…'/.test(ext));

    // (3) …and the page is sent BOTH of the things it was being blamed for not
    // showing: which part of the attribution is doubted, and how it was closed.
    ok('‼️ P-14 — the row carries which doubt, not just that there is one',
        /doubts: \[\.\.\.new Set\(\[\.\.\.sum\.runs, \.\.\.sum\.loose\]/.test(ext));
    ok('‼️ P-14 — …and the closer\'s own note',
        /closedNote: closed\?\.note \?\? ''/.test(ext));

    // ---- X-36: the reopen takes the words with it, from every door ----------
    ok('‼️ X-36 — a reopen through the ops reads the item\'s text BEFORE anything is written',
        /const prevText = o\.event === 'reopen' \? backlogTextOf\(o\.folder, o\.code\) : '';/.test(ext));
    ok('…and the doors that hand an item out carry the earlier askings with it',
        /round: r\.round, earlierRounds: r\.earlier/.test(ext));
}

// ---------------------------------------------------------------------------
// ‼️ X-36 — A REOPENED ITEM CARRIES ITS ROUNDS
//
// A backlog line holds one text: whatever it says now. Reopening handed the old
// words straight back, so the person doing it had to decide by hand whether to
// delete them, keep them or write around them — and whichever they chose, the
// next agent got one paragraph with no way to tell which round it belonged to.
// ---------------------------------------------------------------------------
{
    const T0 = Date.UTC(2026, 7, 1, 9, 0);
    const item = (state, text) => ({
        code: 'K-8', text, state, line: 3, area: 'K', section: 'K — Console',
        kinds: [], priority: 'normal', blockedBy: [], children: []
    });

    // (1) The commonest door: a box un-ticked in Obsidian. Nothing is running,
    // nobody records anything — the reconciler notices, and it is the only
    // moment the previous round still exists anywhere.
    {
        const closed = [{ code: 'K-8', event: 'done', ts: T0, by: 'agent' }];
        const back = T.reconcileOutside([item('open', 'ARAMA BULMUYOR: ilk isteğim')], closed, T0 + 1000);
        ok('‼️ X-36 — a box un-ticked outside is a reopen that keeps the words',
            back.length === 1 && back[0].event === 'reopen'
            && back[0].prevText === 'ARAMA BULMUYOR: ilk isteğim');
        // …and a CLOSE outside is not: there is no earlier round to keep.
        const shut = T.reconcileOutside([item('done', 'x')], [{ code: 'K-8', event: 'doing', ts: T0, by: 'agent' }], T0);
        ok('…and a close carries none — a round is a thing you ask for again',
            shut.length === 1 && !shut[0].prevText);
    }

    // (2) The summary counts the rounds however they were recorded, and can
    // only SHOW the ones that kept their words.
    {
        const recs = [
            { code: 'K-8', event: 'done', ts: T0, by: 'agent' },
            { code: 'K-8', event: 'reopen', ts: T0 + 1000, by: 'outside', prevText: 'ilk isteğim' },
            { code: 'K-8', event: 'done', ts: T0 + 2000, by: 'agent' },
            // an older reopen, from before any of this was recorded
            { code: 'K-8', event: 'reopen', ts: T0 + 3000, by: 'panel' }
        ];
        const sum = T.summarizeCode('K-8', recs);
        ok('‼️ X-36 — "this is the third go" counts every reopen', sum.round === 3);
        ok('…and only the ones that kept their wording can show it',
            sum.rounds.length === 1 && sum.rounds[0].prevText === 'ilk isteğim');
    }

    // (3) ‼️ THE DUPLICATION TRAP. Every row shape `itemBlock` emits has to be
    // recognised as a MACHINE row on the way back in, or it is read as the
    // human's prose, preserved, and written again next to the freshly generated
    // one — a file that grows a copy of every round on every single rebuild.
    // This repo has been bitten by exactly that once already.
    {
        const items = [item('open', 'ÜÇÜNCÜ İSTEĞİM: hâlâ bulmuyor')];
        const recs = [
            { code: 'K-8', event: 'done', ts: T0, by: 'agent' },
            { code: 'K-8', event: 'reopen', ts: T0 + 1000, by: 'outside', prevText: 'ilk isteğim' },
            { code: 'K-8', event: 'done', ts: T0 + 2000, by: 'agent' },
            { code: 'K-8', event: 'reopen', ts: T0 + 3000, by: 'outside', prevText: 'ikinci isteğim' }
        ];
        const one = T.renderBacklogLog({ project: 'Demo', items, records: recs });
        ok('‼️ X-36 — the earlier askings are IN the log, numbered and dated',
            /_round 1_/.test(one) && /_round 2_/.test(one)
            && one.includes('ilk isteğim') && one.includes('ikinci isteğim'));
        ok('…and the data line says which go it is on', /\[round:: 3\]/.test(one));
        const twice = T.renderBacklogLog({ project: 'Demo', items, records: recs, existing: one });
        ok('‼️ …and a rebuild does not grow a second copy of them', one === twice);
        ok('…nor a third', T.renderBacklogLog({ project: 'Demo', items, records: recs, existing: twice }) === twice);
        ok('…and an item nobody reopened says nothing about rounds',
            !/\[round::/.test(T.renderBacklogLog({
                project: 'Demo', items: [item('done', 'tek seferde bitti')],
                records: [{ code: 'K-8', event: 'done', ts: T0, by: 'agent' }]
            })));
    }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
