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
const fs = require('fs');

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
    // ‼️ P-14 — three figures, and none of them made up. See below for the case
    // that made this necessary.
    ok('…and it says how many SESSIONS separately from how many turns',
        s.sessions === 2 && s.turnsUnknown === 0);
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

// ---------- ‼️ X-357: a code born straight in the file gets a birth ----------
{
    // the snapshot of the LAST read: K-9 was not in the file then
    const before = new Map([['K-8', 'x'], ['K-10', 'x'], ['K-11', 'x']]);
    const saved = T0 + 5 * DAY;
    const found = T.reconcileOutside(items, RECORDS, T0 + 9 * DAY, before, saved);
    const born = found.find(r => r.code === 'K-9');
    ok('‼️ X-357: a code that was not in the last read is born', !!born && born.event === 'opened');
    ok('…from outside, with no session to name', born && born.by === 'outside' && born.uncertain === 'none');
    ok('…dated by the file\'s last save, the latest it can have been written', born && born.ts === saved);
    ok('…and says how it was dated', born && /file's last save/.test(born.note));
    ok('a save time LATER than now is not trusted — now is used',
        T.reconcileOutside(items, RECORDS, T0 + 9 * DAY, before, T0 + 99 * DAY)
            .find(r => r.code === 'K-9').ts === T0 + 9 * DAY);
    ok('no save time → when it was noticed',
        /when it was noticed/.test(T.reconcileOutside(items, RECORDS, T0 + 9 * DAY, before).find(r => r.code === 'K-9').note));
    ok('‼️ no snapshot (a first read) stamps nothing — old undated lines are not "new today"',
        !T.reconcileOutside(items, RECORDS, T0 + 9 * DAY).some(r => r.event === 'opened'));
    ok('a code the last read already had is not re-born',
        !T.reconcileOutside(items, RECORDS, T0 + 9 * DAY, new Map([...before, ['K-9', 'x']])).some(r => r.code === 'K-9'));
    ok('it is born once: with its birth on the ledger nothing more is written',
        !T.reconcileOutside(items, RECORDS.concat(found), T0 + 10 * DAY, before).some(r => r.code === 'K-9'));
    ok('an item born already ticked is recorded as closed, not opened',
        found.find(r => r.code === 'K-11').event === 'done');

    // ‼️ the exclusion trap: a NOTICED record is kept out of the dates — but a
    // birth is the only date such a line will ever have
    const sum = T.summarizeCode('K-9', [born]);
    ok('‼️ X-357: summarizeCode dates the item by its birth', sum.firstTs === saved && sum.lastTs === saved);
    const done = { code: 'K-9', event: 'done', ts: saved + DAY, by: 'outside', uncertain: 'none' };
    ok('…while a noticed CLOSING is still kept out of the dates (X-135 unchanged)',
        T.summarizeCode('K-9', [born, done]).lastTs === saved);

    // the wiring: the pass hands the file's own save time, and a record it
    // appends reaches an open page
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('X-357: refreshBacklogLog hands the backlog\'s mtime to the reconciler',
        /reconcileOutside\(items, records, Date\.now\(\), outsideSeen\.get\(folder\), backlog\.mtimeMs\)/.test(src));
    ok('X-357: a pass that appended records tells the open page',
        /appendTrack\(trackLedgerOf\(folder\), missed\);\s*records = records\.concat\(missed\);[\s\S]{0,200}projectDocWritten\(projectId\);/.test(src));
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
// ‼️ P-14 (reopened) — "EITHER MAKE THE TURN WORK OR TAKE IT AWAY."
//
// The badge said "turn?" on rows that named their session, gave its id and
// linked to it — and the same row's summary said "1 turn". Both halves were
// wrong in the same way: nobody was ASKING which turn, and where the answer was
// missing a 1 was invented to fill the column.
// ---------------------------------------------------------------------------
{
    const T0 = Date.UTC(2026, 7, 1, 9, 0);
    const MIN = 60000;

    // (1) An unknown turn is not one turn.
    {
        const recs = [
            { code: 'K-8', event: 'done', ts: T0, by: 'agent', session: 'sess-a', uncertain: 'turn' }
        ];
        const s = T.summarizeCode('K-8', recs);
        ok('‼️ a session whose turn is unknown contributes NO turns to the count',
            s.turns === 0);
        ok('…but it is still a session that touched the item',
            s.sessions === 1 && s.turnsUnknown === 1);
        // The line that made the contradiction visible: "[turns:: 1]" printed
        // next to a row that also said the turn was not recorded.
        const log = T.renderBacklogLog({
            project: 'Demo',
            items: [{
                code: 'K-8', text: 'bir şey', state: 'done', line: 3, area: 'K',
                section: 'K — Console', kinds: [], priority: 'normal', blockedBy: [], children: []
            }],
            records: recs
        });
        // Scoped to the item's own DATA line: the header comment carries an
        // example block that mentions [turns:: 5] on purpose.
        const dataLine = (log.match(/^- \*\*K-8\*\*.*$/m) || [''])[0];
        ok('‼️ …and the log stops printing a turn count it does not have',
            !/\[turns::/.test(dataLine) && /\[sessions:: 1\]/.test(dataLine));
    }

    // (2) The repair. Most "turn?" rows were never unknowable — the session is
    // on the record and the transcript timestamps every turn, so the turn that
    // was open at that moment is a lookup. Anything the lookup cannot answer
    // keeps its doubt: that is the difference between resolving and guessing.
    {
        const recs = [
            { code: 'K-8', event: 'touch', ts: T0 + 5 * MIN, by: 'agent', session: 'sess-a', uncertain: 'turn' },
            { code: 'K-8', event: 'done', ts: T0 + 25 * MIN, by: 'agent', session: 'sess-a', uncertain: 'turn' },
            // no session at all — genuinely unknowable, and it stays that way
            { code: 'K-8', event: 'reopen', ts: T0 + 30 * MIN, by: 'panel', uncertain: 'none' },
            // a different doubt, about something else entirely
            { code: 'K-8', event: 'touch', ts: T0 + 35 * MIN, by: 'agent', session: 'sess-b', uncertain: 'multi' }
        ];
        // Turn 1 opened at T0, turn 2 at +20min.
        const boundaries = { 'sess-a': [T0, T0 + 20 * MIN] };
        const resolve = (session, ts) => {
            const list = boundaries[session];
            if (!list) { return undefined; }
            let n = 0;
            for (let i = 0; i < list.length; i++) { if (list[i] <= ts) { n = i + 1; } }
            return n || undefined;
        };
        const fixed = T.repairTurns(recs, resolve);
        ok('‼️ a row whose session and moment are both known gets its real turn',
            fixed[0].turn === 1 && fixed[1].turn === 2);
        ok('…and stops being uncertain, because it is not',
            !fixed[0].uncertain && !fixed[1].uncertain);
        ok('‼️ a row with no session is left exactly as it was',
            fixed[2].uncertain === 'none' && fixed[2].turn === undefined);
        ok('‼️ …and a doubt about something ELSE is never touched',
            fixed[3].uncertain === 'multi');
        ok('the summary then counts two real turns in one session',
            T.summarizeCode('K-8', fixed).turns === 2);

        // A lookup that answers nothing must change nothing — including the
        // array identity, so a repair pass on every read costs nothing.
        ok('a repair that finds nothing returns the very same list',
            T.repairTurns(recs, () => undefined) === recs);
        // A moment before the first turn opened is not turn 1.
        ok('‼️ a record older than the session it names is not forced into turn 1',
            T.repairTurns(
                [{ code: 'K-8', event: 'done', ts: T0 - MIN, by: 'agent', session: 'sess-a', uncertain: 'turn' }],
                resolve)[0].uncertain === 'turn');
        // A record that already knows its turn is not re-derived.
        const already = [{ code: 'K-8', event: 'done', ts: T0 + 25 * MIN, by: 'agent', session: 'sess-a', turn: 7 }];
        ok('…and one that already carries a turn is left alone',
            T.repairTurns(already, resolve)[0].turn === 7);

        // ‼️ P-14 (V2) — THE MISSING TURN AND THE REASON FOR THE DOUBT ARE TWO
        // AXES. The repair used to run only on rows labelled `turn`, so a row
        // labelled `stale` or `multi` that was ALSO missing its turn was skipped
        // for a reason that says nothing about turns.
        const other = [
            { code: 'K-8', event: 'done', ts: T0 + 25 * MIN, by: 'agent', session: 'sess-a', uncertain: 'stale' },
            { code: 'K-8', event: 'touch', ts: T0 + 5 * MIN, by: 'agent', session: 'sess-a', uncertain: 'multi' }
        ];
        const both = T.repairTurns(other, resolve);
        ok('‼️ P-14: a row doubted for ANOTHER reason still gets the turn it was missing',
            both[0].turn === 2 && both[1].turn === 1);
        ok('‼️ …and keeps that doubt, because a turn read out of a session says'
            + ' nothing about whether it was the right session',
            both[0].uncertain === 'stale' && both[1].uncertain === 'multi');
    }
}

// ---------------------------------------------------------------------------
// ‼️ P-14 (V2) — THE CLOSING-NOTE CONTRACT LIVES ON THE LEDGER
//
// It was written into `projects.backlog.check` — the door an agent SHOULD use —
// while `projects.track { event: "done" }` wrote the same closing event into the
// same ledger with `note` optional. A rule one op enforces and the next one
// beside it does not is not a rule.
// ---------------------------------------------------------------------------
{
    const refusal = o => T.closingNoteRefusal(o);
    ok('‼️ an agent closing an item with no note is refused',
        /needs a .note./.test(refusal({ by: 'agent', event: 'done' }) || ''));
    ok('…and cancelling counts as closing', !!refusal({ by: 'agent', event: 'cancelled' }));
    ok('…a note too short to say anything is still no note',
        !!refusal({ by: 'agent', event: 'done', note: 'bitti' }));
    ok('…and a real one goes through',
        refusal({ by: 'agent', event: 'done', note: 'Kapandı: kök neden X, düzeltme Y.' }) === undefined);
    ok('a touch is not a closing and is never asked for one',
        refusal({ by: 'agent', event: 'touch' }) === undefined
        && refusal({ by: 'agent', event: 'reopen' }) === undefined
        && refusal({ by: 'agent', event: 'doing' }) === undefined);
    ok('‼️ …and only an AGENT is held to it: a person ticking the box in the panel'
        + ' is looking at the thing they just did',
        refusal({ by: 'panel', event: 'done' }) === undefined
        && refusal({ by: 'outside', event: 'done' }) === undefined
        && refusal({ by: 'backfill', event: 'done' }) === undefined);
    ok('the floor is stated once, where the rule is',
        T.CLOSING_NOTE_MIN === 15);
}

// ---------------------------------------------------------------------------
// ‼️ X-36 (V2) — A ROUND WHOSE WORDING WAS CUT CAN BE GIVEN IT BACK
//
// The ledger is append-only, so the correction is its OWN record pointing at
// the reopen it completes. The reopen line is never rewritten; every reader
// applies the pair and marks the round as recovered rather than captured.
// ---------------------------------------------------------------------------
{
    const T0 = Date.UTC(2026, 7, 1, 9, 0);
    const reopenTs = T0 + 1000;
    const recs = [
        { code: 'X-9', event: 'done', ts: T0, by: 'agent', note: 'ilk tur kapandı, kök neden bulundu' },
        {
            code: 'X-9', event: 'reopen', ts: reopenTs, by: 'panel',
            prevText: 'ilk turda istenen şey buydu ve cümle tam burada…', prevCut: true
        },
        {
            code: 'X-9', event: 'touch', ts: T0 + 5000, by: 'agent',
            restoresTs: reopenTs,
            prevText: 'ilk turda istenen şey buydu ve cümle tam burada bitiyordu, hepsi bu.',
            note: 'restored the wording of round 1'
        }
    ];
    const sum = T.summarizeCode('X-9', recs);
    ok('‼️ X-36: the round now carries the whole wording',
        sum.rounds.length === 1 && /hepsi bu\.$/.test(sum.rounds[0].prevText));
    ok('…the cut mark is gone, because that is what was fixed', !sum.rounds[0].prevCut);
    ok('‼️ …and it says the words were RECOVERED, not captured at the time',
        sum.rounds[0].prevRestored === true);
    ok('‼️ the stored reopen record is untouched — the ledger is append-only',
        recs[1].prevText.endsWith('…') && recs[1].prevCut === true
        && recs[1].prevRestored === undefined);

    const rendered = T.renderBacklogLog({
        project: 'Demo',
        items: [{
            code: 'X-9', text: 'bir şey', state: 'open', line: 8,
            section: 'X — Cross', kinds: [], indent: 0, raw: '- [ ] X-9 bir şey'
        }],
        records: recs
    });
    ok('…and the log says so where the round is drawn',
        /recovered later from the file/.test(rendered) && /hepsi bu\./.test(rendered));

    ok('a correction survives a round trip through the ledger format',
        T.parseTrack(T.serializeTrack(recs[2]))[0].restoresTs === reopenTs);
    ok('‼️ …while the derived mark is never written down — it is a statement'
        + ' ABOUT a pair of records, not a fact either of them carries',
        !/prevRestored/.test(T.serializeTrack(sum.rounds[0])));
    ok('an ordinary reopen with nothing pointing at it is unchanged',
        T.summarizeCode('X-9', recs.slice(0, 2)).rounds[0].prevRestored === undefined);
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

        // ‼️ X-36 (reopened) — AND IT SAYS THAT IT MIGHT BE THE NEW WORDING.
        // With no snapshot, the file is read AFTER the edit: if the box was
        // un-ticked and the line rewritten in one save, what we find IS the
        // new request. It is still kept (the ordinary case is an un-ticked box
        // and untouched words) but it is kept SAID, never as a plain fact.
        ok('‼️ a reopen read with nothing to compare against is flagged, not asserted',
            back[0].prevGuess === true);
    }

    // (1b) ‼️ X-36 (reopened) — THE SNAPSHOT CLOSES THE RACE THE AUDIT FOUND.
    // The reconciler now gets the line as it was on the previous pass, so
    // un-ticking AND rewriting in one Obsidian save files the OLD wording.
    {
        const closed = [{ code: 'K-8', event: 'done', ts: T0, by: 'agent' }];
        const before = T.snapshotBacklog([item('done', 'İLK İSTEĞİM: arama bulmuyor')]);
        const after = [item('open', 'BU TURUN YENİ SÖZLERİ: hâlâ bulmuyor')];
        const back = T.reconcileOutside(after, closed, T0 + 1000, before);
        ok('‼️ the round kept is what the line said BEFORE the edit, not after',
            back.length === 1 && back[0].prevText === 'İLK İSTEĞİM: arama bulmuyor');
        ok('…and with a snapshot behind it, it is not a guess any more',
            !back[0].prevGuess);
        ok('the snapshot is by code, and skips what has none',
            before.get('K-8') === 'İLK İSTEĞİM: arama bulmuyor' && before.size === 1);
        // The snapshot must not resurrect a code that is not being reopened.
        ok('…and it changes nothing about an item the ledger already explains',
            T.reconcileOutside([item('done', 'x')], closed, T0, before).length === 0);
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

        // ‼️ X-36 (reopened) — A DOUBTFUL ROUND SAYS SO IN THE LOG. A history
        // that hides which of its lines it is unsure of is worse than a shorter
        // one: the reader takes all of it on the same trust.
        const doubted = T.renderBacklogLog({
            project: 'Demo', items,
            records: recs.slice(0, 3).concat([{
                code: 'K-8', event: 'reopen', ts: T0 + 3000, by: 'outside',
                prevText: 'belki yeni belki eski', prevGuess: true
            }])
        });
        ok('‼️ a round that may be the new wording is marked in the log',
            /may be the new wording/.test(doubted));
        const cut = T.renderBacklogLog({
            project: 'Demo', items,
            records: recs.slice(0, 3).concat([{
                code: 'K-8', event: 'reopen', ts: T0 + 3000, by: 'outside',
                prevText: 'çok uzundu…', prevCut: true
            }])
        });
        ok('…and one that hit the ledger ceiling says that instead of trailing off',
            /cut — the request was longer/.test(cut));
        ok('…nor a third', T.renderBacklogLog({ project: 'Demo', items, records: recs, existing: twice }) === twice);
        ok('…and an item nobody reopened says nothing about rounds',
            !/\[round::/.test(T.renderBacklogLog({
                project: 'Demo', items: [item('done', 'tek seferde bitti')],
                records: [{ code: 'K-8', event: 'done', ts: T0, by: 'agent' }]
            })));
    }
}

// ---- X-36 (V3): the CLOSED-WINDOW edit, which is what the cache is for ------
//
// The snapshot was made to survive the window, and then start-up never held it
// against the file: it loaded the cache, baselined the projects it had never
// seen, armed the watcher and compared nothing. So the exact case the
// persistence exists for — VS Code closed, a box re-opened and rewritten in
// Obsidian, VS Code opened again — still recorded no round.
//
// The comparison itself is `reconcileOutside` and is proved above; what is
// asserted here is the WIRING, which lives inside activate() and has no seam a
// unit test can reach. Two facts, both exact: the start-up path calls the
// reconciler, and it is handed the list of folders that were just baselined so
// a fresh install cannot invent a round by comparing a file with itself.
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ X-36: start-up reconciles the persisted snapshot against the file on disk',
        /reconcileBacklogOnStart\(baselineBacklogSeen\(\)\)/.test(src));
    const fn = src.slice(src.indexOf('const reconcileBacklogOnStart'),
        src.indexOf('loadOutsideSeen();'));
    ok('…by calling the same rebuild every other door calls',
        /refreshBacklogLog\(p\.id\)/.test(fn));
    ok('‼️ …and a project baselined a moment ago is SKIPPED — its "previous" text is'
        + ' the file itself, and comparing those would invent a round out of a fresh install',
        /skip\.has\(folder\)/.test(fn));
}

// ---------- ‼️ X-135: an item's own birth is an event ----------
//
// ‼️ THE HOLE, AND THE VISIBLE COST. Every event this ledger had was something
// that happens to an item that ALREADY EXISTS; nothing recorded one coming into
// existence. So a freshly written item was a code the ledger had never heard of
// — `openedAt` and `touchedAt` both null — and both time orderings put the
// newest thing in the file BELOW work last touched months ago. Measured on this
// project: 43 open items, 5 with any history, so "last touched" answered the
// same code (`X-97`) every single time it was asked, for months.
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ X-135: `opened` is an event the ledger knows, and it comes first',
        T.TRACK_EVENTS[0] === 'opened' && T.TRACK_EVENTS.length === 6);

    // It is not a closing, so it carries no note requirement — an opening has
    // nothing to report yet, and demanding one would block the write.
    ok('…and it is not a closing, so no closing note is demanded of it',
        !T.closingNoteRefusal({ by: 'agent', event: 'opened', note: '' }));

    // ONE record is enough to date an item at both ends: `touchedAt` falls back
    // to the opening (`lastTs || firstTs`), so a brand-new item sorts as new on
    // BOTH axes rather than sinking to the bottom of both.
    const born = T.summarizeCode('K-1', [
        { code: 'K-1', event: 'opened', ts: T0, by: 'agent', session: 's1', turn: 1 }
    ]);
    ok('‼️ …and one opening record dates the item at BOTH ends — touched falls back to it',
        born.firstTs === T0 && born.lastTs === T0);
    const worked = T.summarizeCode('K-1', [
        { code: 'K-1', event: 'opened', ts: T0, by: 'agent', session: 's1', turn: 1 },
        { code: 'K-1', event: 'touch', ts: T0 + DAY, by: 'agent', session: 's2', turn: 3 }
    ]);
    ok('…while real work still moves "touched" and leaves "opened" where it was',
        worked.firstTs === T0 && worked.lastTs === T0 + DAY);

    // ‼️ X-135 — AND THE STAMP THAT WAS QUIETLY THROWING THE DATE AWAY.
    // `uncertain: 'none'` says "no session could be named", which is a fact
    // about AUTHORSHIP. It was read as a fact about TIME and every record
    // wearing it was dropped from firstTs/lastTs — so a first-hand write from a
    // session Agent Farm did not spawn (routine: a terminal, an external CLI)
    // produced an item the ledger held a record of and still reported as never
    // recorded. Narrowed to what the reason describes: records NOTICED
    // afterwards.
    const unattributed = T.summarizeCode('K-2', [
        { code: 'K-2', event: 'opened', ts: T0, by: 'agent', uncertain: 'none' }
    ]);
    ok('‼️ X-135: a first-hand write with no session still has an exact TIME',
        unattributed.firstTs === T0 && unattributed.lastTs === T0);
    const noticed = T.summarizeCode('K-3', [
        { code: 'K-3', event: 'done', ts: T0, by: 'outside', uncertain: 'none' }
    ]);
    ok('‼️ …while a box ticked in Obsidian and found out about later still does NOT — '
        + 'that time is the noticing, and printing it as "when the work started" is a lie',
        noticed.firstTs === 0 && noticed.lastTs === 0);

    // The wiring lives inside activate() and has no seam a unit test can reach,
    // so the facts asserted are exact: every door that CREATES a code writes the
    // record, it is written once, and it never breaks the write it follows.
    ok('‼️ the bridge add writes the opening record',
        /if \(code\) \{ trackOpened\(project\.id, folder, code, 'agent'\); \}/.test(src));
    ok('‼️ …and so does the panel add — a person typing an item is an opening too',
        /trackOpened\(id, \(projectStore\.get\(id\)\?\.folder \?\? ''\)\.trim\(\), code, 'panel'\)/.test(src));
    const fnOpen = src.slice(src.indexOf('const trackOpened = ('),
        src.indexOf('Reconstruct the history of items that were closed'));
    ok('‼️ …ONCE: a code that already has any history is not re-opened by a second call',
        /readTracks\(folder\)\.some\(r => r\.code === want\)/.test(fnOpen));
    ok('‼️ …and never fatally: an item that reached the file is an item, stamped or not',
        /catch \{ \/\* the item is written; the stamp is the convenience \*\/ \}/.test(fnOpen));

    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'projects.js'), 'utf8');
    ok('the Track page draws the new event rather than showing a blank chip',
        /\{ id: 'opened', icon: '🌱'/.test(page));
    ok('‼️ …and all three time orderings widen the state axis, not just "closed"',
        /if \(BL_TIME_SORTS\[blSort\]\) \{/.test(page));
}

// ---- ‼️ X-130 (second half): the watcher's own echo -------------------------
//
// Every mutation Agent Farm makes writes Backlog.md and runs the reconcile pass
// inline. The directory watcher then hears that same write 1.5 s later and runs
// the whole pass again — measured on the real vault at a 41 ms parse plus a
// ledger read, a log render and a 454 KB cache write, per mutation, for a file
// nobody has touched since.
//
// What is defended here is the pair of things that could go wrong with the fix.
// A suppressor that is too EAGER silently eats an edit the user made in
// Obsidian, which is the one thing this whole mechanism exists to catch; a
// suppressor that PERSISTS answers "unchanged since my last pass" to the
// closed-window edit, which is what X-36 (V3) was built for. So: unknown folder
// is never an echo, one changed byte is never an echo, and the state lives in a
// plain in-memory class with no path to disk anywhere in it.
{
    const echo = new T.BacklogEcho();
    const text = '- [ ] K-9 something nobody has touched\n';

    ok('‼️ X-130: a folder never seen is not an echo — the first thing a window'
        + ' hears about a file it has not read is real news',
        echo.isEcho('/vault/demo', text) === false);

    echo.mark('/vault/demo', text);
    ok('…the text the pass just ran against IS an echo — that is our own write',
        echo.isEcho('/vault/demo', text) === true);

    ok('‼️ …ONE BYTE of difference is not an echo — an edit made outside must'
        + ' always reach the reconciler',
        echo.isEcho('/vault/demo', text.replace('K-9', 'K-8')) === false);
    ok('…nor is a box ticked in Obsidian, which is the same length',
        echo.isEcho('/vault/demo', text.replace('[ ]', '[x]')) === false);
    ok('…nor is trailing whitespace, because the test is the bytes and not a parse',
        echo.isEcho('/vault/demo', text + '\n') === false);

    ok('‼️ …and it is PER FOLDER: one project going quiet says nothing about another',
        echo.isEcho('/vault/other', text) === false);

    echo.forget('/vault/demo');
    ok('…a folder that is forgotten is heard again',
        echo.isEcho('/vault/demo', text) === false);

    const source = require('fs').readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'backlogTrack.ts'), 'utf8');
    const cls = source.slice(source.indexOf('export class BacklogEcho'),
        source.indexOf('function digestOf'));
    ok('‼️ …and it NEVER touches disk: an echo suppressor that survived the window'
        + ' would silence the closed-window edit the snapshot cache exists for',
        !/fs\.|readFile|writeFile|globalStorage/.test(cls));
}

// The wiring lives inside activate() and has no seam a unit test can reach, so
// the facts asserted are exact: the watcher reads before it pays, the pass
// records what it ran against, and the 454 KB snapshot is not rewritten when it
// has not changed.
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    const arm = src.slice(src.indexOf('const armBacklogWatch'),
        src.indexOf('const baselineBacklogSeen'));
    ok('‼️ X-130: the watcher reads the file and stops there when it is our own echo',
        /backlogEcho\.isEcho\(folder, fs\.readFileSync\(target, 'utf8'\)\)/.test(arm)
        && /\{ return; \}/.test(arm));
    ok('…and an unreadable file still falls through to the pass, which reports it properly',
        arm.indexOf('catch { /* fall through to the pass') < arm.indexOf('refreshBacklogLog(project.id)'));

    const refresh = src.slice(src.indexOf('const refreshBacklogLog = ('),
        src.indexOf('SOMEBODY IS WATCHING THE BACKLOG FILE'));
    ok('‼️ …because the pass marks the exact text it was run against',
        /backlogEcho\.mark\(folder, backlog\.text \?\? ''\)/.test(refresh));
    ok('…and the baseline marks too, or the first edit after a fresh install pays twice',
        /backlogEcho\.mark\(folder, doc\.text \?\? ''\)/.test(src));

    const save = src.slice(src.indexOf('const saveOutsideSeen'),
        src.indexOf('const refreshBacklogLog = ('));
    ok('‼️ …and the 454 KB snapshot is not rewritten by a pass that changed no wording',
        /if \(blob === outsideSeenBlob\) \{ return; \}/.test(save)
        && save.indexOf('if (blob === outsideSeenBlob)') < save.indexOf('writeFileSync'));
    ok('…with the blob remembered only after the write actually succeeded',
        save.indexOf('fs.writeFileSync') < save.indexOf('outsideSeenBlob = blob'));
}


// ---------------------------------------------------------------------------
// ‼️ A CLOSING NOTE THAT HIT THE CEILING SAYS SO — AND A "REPAIR" THAT REPAIRS
// NOTHING IS REFUSED.
//
// The ceiling is editorial and stays: a note is a note, and a report belongs in
// the vault with the note pointing at it. What was missing is the same thing
// `prevCut` was added for on the other field — a trailing "…" cannot be told
// from a writer who stopped there, and the caller was told nothing at all.
// Measured on the live op: a 2,407-character note came back cut to the 2,000
// the closing already had, and the answer called it recovered.
// ---------------------------------------------------------------------------
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const T0 = Date.UTC(2026, 8, 9, 8, 40);

    const line = T.serializeTrack({
        code: 'S-48', event: 'done', ts: T0, by: 'agent',
        note: 'kapandı, kök sebep ölçüldü…', noteCut: true
    });
    ok('‼️ the cut travels ON the record, not only in the text',
        /"noteCut":true/.test(line));
    ok('…and it comes back off the disk', T.parseTrack(line)[0].noteCut === true);
    ok('a note that fits carries no flag at all',
        !/noteCut/.test(T.serializeTrack({
            code: 'S-48', event: 'done', ts: T0, by: 'agent', note: 'kısa ve tam'
        })));

    ok('‼️ …and every reader can say it out loud',
        / _\(cut — the note was longer than the ledger keeps\)_/
            .test(T.closingNoteSuffix({ code: 'S-48', event: 'done', ts: T0, by: 'agent', noteCut: true })));
    ok('a whole note is not marked as anything',
        T.closingNoteSuffix({ code: 'S-48', event: 'done', ts: T0, by: 'agent' }) === '');

    // Recovered AND still cut is an ordinary pair: 300 -> 2,000 is a real gain
    // and it is still not all of the words.
    const recovered = T.summarizeCode('S-48', [
        { code: 'S-48', event: 'done', ts: T0, by: 'agent', note: 'kapandı ve cümle burada…' },
        {
            code: 'S-48', event: 'touch', ts: T0 + 5000, by: 'agent',
            restoresTs: T0, restoresNote: true,
            note: 'kapandı ve cümle burada bitmiyordu, devamı da vardı ama o da uzundu…', noteCut: true
        }
    ]);
    const closed = recovered.closed;
    ok('‼️ a correction that is ITSELF cut does not read as a whole note',
        closed.noteRestored === true && closed.noteCut === true);
    ok('…and both facts are said, in that order',
        T.closingNoteSuffix(closed)
            === ' _(note recovered later — the one written at the time was cut)_'
            + ' _(cut — the note was longer than the ledger keeps)_');

    // ------------------------------------------------- the wiring, in the source
    ok('‼️ P-14 — the cap reports the cut instead of swallowing it',
        /noteCut: true \}\s*\n\s*: \{ note: one \};/.test(ext));
    ok('…and the record is built from that shape, not from a bare string',
        /\.\.\.\(o\.note \? capNote\(o\.note\) : \{\}\)/.test(ext));
    ok('‼️ a restore that would gain NOTHING is refused, with the arithmetic',
        /need\(fixed\.note\.length > had\.length,/.test(ext)
        && /that would restore nothing/.test(ext));
    ok('…and one that gains something but is still cut says so in the answer',
        /\.\.\.\(rec\.noteCut \? \{ cut: true \} : \{\}\)/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
