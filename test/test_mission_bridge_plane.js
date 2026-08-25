/**
 * ‼️ B-13 — ADAPTIVE MISSIONS ON THE SAME `missions.*` CONTROL PLANE.
 *
 * The item's rule is that an AGENT can do everything a person can do on the
 * Missions page, through the ops that were already there — no second
 * `objectives.*` namespace, no op that reimplements what the page does. What
 * was missing was not a door, it was WHAT THE DOORS SAID: a caller could start
 * an adaptive run and then not read back that it was one, could not see the
 * strategy in force, the steers it had sent, whether the journal was sound, or
 * what the run had started and not finished. And two ops answered without a
 * ceiling — a run's whole history, a conversation's every message, body text
 * read off disk per message.
 *
 * Measured here are the two SHARED CORE pieces those handlers were built out
 * of, because a handler that inlines its own paging is a handler that drifts
 * from the next one (the parity gate's whole subject):
 *
 *   · `bridgePage` — one pagination contract for the whole bridge. KEYSET, so
 *     a page is stable while the list grows underneath it, and an unknown
 *     cursor is an ERROR rather than a silent second serving of page one.
 *   · `selectTraceEvents` — the journal read FORWARDS, filtered by kind before
 *     the page is cut.
 *
 * …plus the contracts the extension's own handlers have to keep, read off the
 * source, because they live inside `activate()` and cannot be imported.
 */
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const { bridgePage } = require(out('core', 'bridge.js'));
const { selectTraceEvents, MISSION_TRACE_TYPES } = require(out('core', 'missionTrace.js'));

// ================================================ 1. one pagination contract
{
    console.log('\n-- bridgePage: keyset, so the page survives the list growing under it');
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: 'r' + (i + 1) }));

    const first = bridgePage(rows, r => r.id, { limit: 3 });
    ok('a first page is the first `limit` rows',
        first.rows.map(r => r.id).join(',') === 'r1,r2,r3');
    ok('…and says how many there are in all', first.total === 7);
    ok('…names both ends of the page', first.from === 'r1' && first.last === 'r3');
    ok('…and says there is more', first.more === true);

    const second = bridgePage(rows, r => r.id, { limit: 3, after: first.last });
    ok('the next page continues after the cursor',
        second.rows.map(r => r.id).join(',') === 'r4,r5,r6');

    const third = bridgePage(rows, r => r.id, { limit: 3, after: second.last });
    ok('…and the last one is short', third.rows.map(r => r.id).join(',') === 'r7');
    ok('‼️ …and says there is NO more', third.more === false);

    /**
     * ‼️ THE CASE `rows.length === limit` GETS WRONG. A caller that infers
     * "there is more" from a full page asks for one more and is handed nothing;
     * `more` is computed from the position, so a page that exactly finishes the
     * list says so.
     */
    const exact = bridgePage(rows.slice(0, 6), r => r.id, { limit: 3, after: 'r3' });
    ok('‼️ a FULL final page still says there is no more',
        exact.rows.length === 3 && exact.more === false);

    // ‼️ KEYSET, NOT OFFSET. Rows arrive at the END while a caller pages — a
    // mission appends a message, a run finishes — and an offset would re-read
    // or skip one every time. The cursor is an id, so it does not move.
    const grown = [{ id: 'r0' }, ...rows];
    const after = bridgePage(grown, r => r.id, { limit: 3, after: 'r3' });
    ok('‼️ a row inserted before the cursor does not shift the page',
        after.rows.map(r => r.id).join(',') === 'r4,r5,r6');

    let threw = '';
    try { bridgePage(rows, r => r.id, { after: 'gone', what: 'run' }); }
    catch (e) { threw = String(e.message || e); }
    ok('‼️ an unknown cursor is REFUSED, never answered from the top',
        /No run "gone" here/.test(threw));
    ok('…and the refusal says what to pass instead',
        /the id of the last one you read/.test(threw));

    ok('an empty list is an empty page, not an error',
        (() => { const p = bridgePage([], r => r.id, {});
            return p.rows.length === 0 && p.total === 0 && p.from === null
                && p.last === null && p.more === false; })());
    ok('the limit is clamped, so a caller cannot ask for the whole history',
        bridgePage(rows, r => r.id, { limit: 99999, max: 4 }).rows.length === 4);
    ok('…and garbage falls back to the default rather than to zero rows',
        bridgePage(rows, r => r.id, { limit: 'lots', fallback: 2 }).rows.length === 2);
    ok('…as does a limit of 0, which would otherwise be an infinite loop for a pager',
        bridgePage(rows, r => r.id, { limit: 0, fallback: 2 }).rows.length === 2);
}

// ============================== 2. the journal, forwards and filtered by kind
{
    console.log('\n-- selectTraceEvents: an audit record is read from the beginning');
    const ev = (seq, type) => ({ v: 2, seq, ts: seq * 1000, type });
    const events = [
        ev(1, 'strategy.changed'), ev(2, 'decision.made'), ev(3, 'action.created'),
        ev(4, 'action.settled'), ev(5, 'strategy.changed'), ev(6, 'decision.made'),
        ev(7, 'message.sent'), ev(8, 'run.finished')
    ];

    const head = selectTraceEvents(events, { limit: 3 });
    ok('‼️ the FIRST events come back, not the last — a journal is read forwards',
        head.events.map(e => e.seq).join(',') === '1,2,3');
    ok('…and the seq to continue from is handed back', head.lastSeq === 3);
    ok('…with `more` saying there is another page', head.more === true);

    const next = selectTraceEvents(events, { limit: 3, after: head.lastSeq });
    ok('`after` is a seq, so the page continues where it stopped',
        next.events.map(e => e.seq).join(',') === '4,5,6');

    /**
     * ‼️ THE FILTER RUNS BEFORE THE PAGE IS CUT. Filtering inside the first
     * `limit` events instead would answer "how many times did the approach
     * move?" with "once" on a run that changed it thirty times.
     */
    const strat = selectTraceEvents(events, { kinds: ['strategy.changed'], limit: 1 });
    ok('‼️ a kind filter gives that many MATCHING events…',
        strat.events.length === 1 && strat.events[0].seq === 1);
    ok('‼️ …and counts every match, not the ones on this page',
        strat.matched === 2 && strat.more === true);
    ok('…and the next page of the filtered stream is the second match',
        selectTraceEvents(events, { kinds: ['strategy.changed'], after: 1 })
            .events.map(e => e.seq).join(',') === '5');
    ok('several kinds are an OR',
        selectTraceEvents(events, { kinds: ['message.sent', 'run.finished'] })
            .events.map(e => e.seq).join(',') === '7,8');

    /**
     * ‼️ A TYPO MATCHES NOTHING AND SAYS SO. Falling back to "no filter" would
     * answer a misspelled kind with the whole journal, and dropping the unknown
     * name silently would let a caller conclude the run never changed strategy.
     */
    const typo = selectTraceEvents(events, { kinds: ['strategy.change'] });
    ok('‼️ an unknown kind matches nothing…', typo.events.length === 0);
    ok('‼️ …and is named back so the caller sees the typo',
        typo.unknownKinds.join(',') === 'strategy.change');
    ok('…while a real kind beside an unknown one still works',
        (() => { const m = selectTraceEvents(events, { kinds: ['run.finished', 'nope'] });
            return m.events.length === 1 && m.unknownKinds.join(',') === 'nope'; })());
    ok('empty/whitespace entries are not a filter at all',
        selectTraceEvents(events, { kinds: ['', '  '] }).events.length === 8);

    // The vocabulary is ONE list and the type is derived from it, so a kind can
    // never exist in the code and be missing from what the bridge advertises.
    ok('the kind vocabulary is a real runtime list',
        Array.isArray(MISSION_TRACE_TYPES) && MISSION_TRACE_TYPES.length === 14);
    ok('…and every kind the writer can emit is in it', (() => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
        const emitted = [...src.matchAll(/traceEvent\(\s*run,\s*'([a-z.]+)'/g)].map(m => m[1]);
        return emitted.length === 0 || emitted.every(k => MISSION_TRACE_TYPES.includes(k));
    })());
}

// ============ 3. the contracts the missions.* handlers keep (source-read)
{
    console.log('\n-- the control plane: what the ops now say, and what they no longer dump');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    // ‼️ NO SECOND NAMESPACE. B-13's first sentence: adaptive runs are driven
    // through the ops that were already there.
    ok('‼️ no parallel `objectives.*` namespace was opened',
        !/op: 'objectives\./.test(ext));

    // The five facts a caller could not read back.
    ok('missions.list says which mode each run is',
        /mode: adaptive \? 'adaptive' : 'classic',/.test(ext));
    ok('…and what it is filed under', /project: \{ id: proj\.id, name: proj\.name \}/.test(ext));
    ok('…and who each team id IS, beside the id itself',
        /agent: m\.agentId, role: m\.role \?\? null,[\s\S]{0,600}agentName: m\.agentName \?\? m\.agentId,/.test(ext));
    ok('…the phase and how many times the approach moved',
        /phase: adaptive \? \(r\.strategy\?\.phase \?\? null\) : null/.test(ext)
        && /strategyVersion: adaptive \? \(r\.strategy\?\.version \?\? null\) : null/.test(ext));
    ok('…and what the run is waiting for, in one object',
        /pending: \{[\s\S]{0,240}guidance: \(r\.guidance \?\? \[\]\)\.filter\(g => !g\.appliedAt\)\.length/.test(ext));

    ok('missions.status says the mode too — every adaptive field below it is null otherwise',
        /mode: adaptive \? 'adaptive' : 'classic',[\s\S]{0,400}project:/.test(ext));
    ok('…the strategy IN FORCE, with its version',
        /strategy: adaptive && r\.strategy/.test(ext));
    ok('‼️ …every steer WITH ITS DELIVERY STATE, which missions.guide could only promise',
        /state: g\.appliedAt \? 'applied' : \(g\.inflightAt \? 'inflight' : 'pending'\)/.test(ext));
    ok('…whether the journal is sound, from the SAME reconciler the reload uses',
        /health: traced\.read\.health,\s*\n\s*resume: traced\.rec\.resume,/.test(ext));
    ok('‼️ …and an unreadable journal is a stated fact, not a failed status call',
        /health: 'unreadable',\s*\n\s*resume: 'refuse'/.test(ext));
    ok('‼️ …the journal is opened ONCE for both questions',
        (ext.match(/const traced = \(\(\) => \{/g) || []).length === 1);
    /**
     * ‼️ AND ONCE FOR THE WHOLE WINDOW. A status call is what an agent POLLS
     * with, and re-parsing a JSONL that grows for the life of the run on every
     * poll is the cost curve X-126/X-127 already put this farm through. The
     * memo keys on the FILE (size + mtime), never on the snapshot's `lastSeq`:
     * the journal is appended first and saved second, so between the two the
     * file holds events `lastSeq` has not counted — and a cache keyed on it
     * served a graph missing the work that had just started.
     */
    ok('‼️ the journal read is memoised on the FILE, not on the snapshot seq',
        /const missionReconCache = new Map<string, \{ size: number; mtime: number;/.test(ext)
        && /hit\.size === key\.size && hit\.mtime === key\.mtime/.test(ext));
    ok('‼️ …and a file that cannot be stat\'ed is not remembered as broken for ever',
        /\} catch \{ key = undefined; \}/.test(ext)
        && /if \(key\) \{ missionReconCache\.set\(run\.id, \{ \.\.\.key, rec, read \}\); \}/.test(ext));
    ok('‼️ the page, missions.status and missions.trace all read through that one path',
        (ext.match(/missionReconciled\(r(un)?\)/g) || []).length === 3
        && !/const missionTraceCache = new Map/.test(ext));
    ok('…and `frontier` is what was started and not finished',
        /frontier: traced\?\.ok/.test(ext)
        && /n\.status !== 'done' && n\.status !== 'failed'/.test(ext));
    ok('a step hands back the handle to whatever it really was',
        /\.\.\.\(s\.taskId \? \{ taskId: s\.taskId \} : \{\}\),/.test(ext)
        && /\.\.\.\(s\.workflowRunId \? \{ workflowRunId: s\.workflowRunId \} : \{\}\),/.test(ext)
        && /\.\.\.\(s\.missionRunId \? \{ missionRunId: s\.missionRunId \} : \{\}\),/.test(ext));

    // ‼️ THE TWO UNBOUNDED READS, closed — and through the SHARED core, not a
    // copy of it in each handler.
    ok('‼️ missions.list is paged through the shared core',
        /bridgePage\(missionStore\.runs\.slice\(\)\.reverse\(\), r => r\.id,/.test(ext));
    ok('‼️ missions.conversation is paged through the same one',
        /bridgePage\(\s*\n?\s*conversationMessages\(r\.messages \?\? \[\], c\.id\), m => m\.id,/.test(ext));
    ok('‼️ missions.trace filters through the shared selector, not an inline copy',
        /selectTraceEvents\(read\.events, \{/.test(ext));
    ok('…and the conversation states the page and the whole apart',
        /messageCount: page\.total,/.test(ext)
        && /from: page\.from, last: page\.last, more: page\.more,/.test(ext));

    // ‼️ WHAT THIS LAYER IS NOT — said in the catalog, so an agent does not go
    // looking for a cost optimiser that was deliberately left out of the phase.
    ok('‼️ the catalog says there is NO cost optimisation in a mission',
        /THERE IS NO COST OPTIMISATION IN A MISSION/.test(ext));
    ok('…that the ceilings are mechanical and decide nothing from a price',
        /MECHANICAL CEILINGS and nothing else decides anything from a/.test(ext));
    ok('…and that the planner is Claude Code in BOTH modes, by construction',
        /is Claude Code in every mode — that is not a default, it is what the control/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
