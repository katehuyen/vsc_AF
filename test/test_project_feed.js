// The project feed and the project cost rollup (compiled core/projectFeed.js,
// pure — no vscode, no filesystem).
//
// What is pinned here is the part that is easy to get quietly wrong:
//   * one row per session, not two (started/ended is one fact);
//   * turns and sessions must never be summed together — a turn's cost is
//     already inside its session's;
//   * a model breakdown may only claim what the transcript actually bills, so a
//     turn served by two models is reported apart rather than split;
//   * ties sort deterministically, or the page reshuffles on every repaint.
const path = require('path');
const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const {
    buildProjectFeed, buildProjectCost, feedSpend, humanSpan, costDay,
    PROJECT_EVENT_KINDS, UNFILED_EVENT_KINDS, FEED_DEFAULT_LIMIT
} = require(out('core', 'projectFeed.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const DAY = 86400000;
const T = new Date(2026, 7, 2, 12, 0, 0).getTime();      // local noon, 2 Aug 2026

const session = {
    sessionId: 'sid-1', file: 'D:\\t\\sid-1.jsonl', title: 'rebuild the project axis',
    agentName: 'developer', firstTs: T - 2 * 3600000, lastTs: T, cost: 3,
    turns: [
        { n: 1, label: 'start', ts: T - 2 * 3600000, cost: 1, tokens: 900, models: ['opus'] },
        { n: 2, label: 'keep going', ts: T - 3600000, cost: 1.5, tokens: 1200, models: ['opus'] },
        { n: 3, label: 'wrap up', ts: T - 600000, cost: 0.5, tokens: 400, models: ['opus', 'haiku'] }
    ],
    filesEdited: { 'D:\\c\\a.ts': 3, 'D:\\c\\b.ts': 1, 'D:\\c\\d\\c.ts': 1, 'D:\\c\\d.ts': 1, 'D:\\c\\e.ts': 1 },
    daily: { [costDay(T - DAY)]: 1, [costDay(T)]: 2 },
    models: ['opus', 'haiku']
};

// ---------- the merge ----------
{
    const feed = buildProjectFeed({
        sessions: [session],
        tasks: [
            { id: 't1', title: 'run the suite', agentName: 'basit', status: 'done', costUSD: 0.2,
                createdAt: T - 5000, startedAt: T - 4000, endedAt: T - 1000 },
            { id: 't2', title: 'nightly scan', agentName: 'basit', status: 'failed',
                createdAt: T - 2 * DAY, startedAt: T - 2 * DAY, endedAt: T - 2 * DAY + 60000 }
        ],
        missions: [{
            id: 'm1', title: 'ship 3.55', status: 'done', startedAt: T - DAY, endedAt: T - DAY + 7200000,
            totalCostUSD: 1.25, rounds: [{ n: 1, at: T - DAY + 600000, thought: 'split the work', action: 'delegate' }]
        }],
        commits: [{ repo: 'D:\\code\\app', hash: 'abc1234def', ts: T - 3000, author: 'miropharm', subject: 'fix the thing' }]
    });

    ok('a session is ONE row, not a start and an end',
        feed.events.filter(e => e.kind === 'session').length === 1);
    ok('…stamped where it finished, because the list is read newest-first',
        feed.events.find(e => e.kind === 'session').ts === session.lastTs);
    ok('…and it carries the span and the turn count',
        /2h · 3 turns/.test(feed.events.find(e => e.kind === 'session').detail));

    ok('file writes are ONE row per session, never one per file',
        feed.events.filter(e => e.kind === 'files').length === 1);
    const files = feed.events.find(e => e.kind === 'files');
    ok('…which still names files instead of just counting them',
        /a\.ts/.test(files.detail) && /\+1 more/.test(files.detail));

    ok('a task is one row at its latest state', feed.counts.task === 2);
    const t1 = feed.events.find(e => e.link && e.link.to === 'task' && e.link.id === 't1');
    ok('…saying what it reached and how long it took', /done/.test(t1.detail) && /3s/.test(t1.detail));
    ok('…and a failure is toned as one',
        feed.events.find(e => e.link && e.link.id === 't2').tone === 'bad');

    ok('a mission brings its rounds with it', feed.counts.mission === 2);
    ok('a commit says which repo and which hash',
        /abc1234/.test(feed.events.find(e => e.kind === 'commit').detail));

    // newest first, and stable
    const ts = feed.events.map(e => e.ts);
    ok('newest first', ts.every((v, i) => i === 0 || ts[i - 1] >= v));
    const again = buildProjectFeed({ sessions: [session], tasks: [], missions: [], commits: [] });
    const twice = buildProjectFeed({ sessions: [session], tasks: [], missions: [], commits: [] });
    ok('‼️ the same input gives the same order every time',
        JSON.stringify(again.events) === JSON.stringify(twice.events));

    // filtering
    const onlyCommits = buildProjectFeed({ sessions: [session], commits: [
        { repo: 'D:\\code\\app', hash: 'abc', ts: T, subject: 's' }] }, { kinds: ['commit'] });
    ok('a kind filter returns only that kind',
        onlyCommits.events.every(e => e.kind === 'commit') && onlyCommits.events.length === 1);
    ok('‼️ …but the COUNTS still describe everything, so a chip can show a real number',
        onlyCommits.counts.session === 1 && onlyCommits.counts.turn === 3);

    const windowed = buildProjectFeed({ sessions: [session], tasks: [
        { id: 'old', title: 'ancient', status: 'done', createdAt: T - 40 * DAY, endedAt: T - 40 * DAY }] },
    { since: T - 7 * DAY });
    ok('a time window drops what is older', !windowed.events.some(e => e.title === 'ancient'));

    const capped = buildProjectFeed({ sessions: [session] }, { limit: 2 });
    ok('a limit cuts and says so', capped.events.length === 2 && capped.truncated === true);
    ok('the default limit is a real number', FEED_DEFAULT_LIMIT > 0);
}

// ---------- ‼️ filter BEFORE the cap, or the cap hides the answer ----------
// The one that justifies the whole host-side filter. A cap applied to the
// merged list and a filter applied afterwards are NOT interchangeable: turns
// outnumber everything else by an order of magnitude, so the newest 300 events
// are almost all turns, and a reader who has switched turns off is left
// looking at a fraction of the sessions while the page tells them the rest is
// merely "older".
{
    const many = [];
    for (let i = 0; i < 50; i++) {
        const last = T - i * 3600000;
        many.push({
            sessionId: 's' + i, file: 'F' + i, title: 'session ' + i,
            firstTs: last - 1800000, lastTs: last, cost: 1,
            turns: Array.from({ length: 20 }, (_, t) => ({
                n: t + 1, label: 'turn', ts: last - t * 60000, cost: 0.05, tokens: 10, models: ['opus']
            }))
        });
    }
    const capThenFilter = buildProjectFeed({ sessions: many }, { limit: 300 })
        .events.filter(e => e.kind === 'session').length;
    const filterThenCap = buildProjectFeed({ sessions: many }, { kinds: ['session'], limit: 300 })
        .events.filter(e => e.kind === 'session').length;

    ok('‼️ capping first loses most of the sessions (this is the bug, pinned)',
        capThenFilter < 20 && capThenFilter > 0);
    ok('‼️ filtering first keeps every one of them', filterThenCap === 50);
    const feed = buildProjectFeed({ sessions: many }, { kinds: ['session'], limit: 300 });
    ok('…and the counts still describe the whole project, so the chip is honest',
        feed.counts.turn === 1000 && feed.counts.session === 50);
}

// ---------- no double counting ----------
{
    const feed = buildProjectFeed({ sessions: [session] });
    ok('‼️ turns are NOT added to their own session\'s cost', feedSpend(feed.events) === 3);
    const both = buildProjectFeed({ sessions: [session, { ...session, sessionId: 'sid-2' }] });
    ok('…and two sessions do add up', feedSpend(both.events) === 6);
}

// ---------- the vocabulary is honest about what it cannot file ----------
{
    ok('the unfiled kinds are a subset of the vocabulary',
        UNFILED_EVENT_KINDS.every(k => PROJECT_EVENT_KINDS.includes(k)));
    // Faz 5 emptied it: notices and queue items carry a projectId of their own
    // now, and every other kind already did. The LIST stays because the honesty
    // mechanism is what is worth keeping — the next half-wired source goes in
    // here rather than quietly drawing a chip that can never light up.
    ok('‼️ nothing is unfiled any more — every kind can say which project it belongs to',
        UNFILED_EVENT_KINDS.length === 0);
    ok('‼️ notices and queue items are filed by their own stamp, not named as a gap',
        !UNFILED_EVENT_KINDS.includes('notice') && !UNFILED_EVENT_KINDS.includes('queue'));
    ok('‼️ decisions, deliverables and plan items come out of the project\'s own documents',
        !UNFILED_EVENT_KINDS.includes('decision') && !UNFILED_EVENT_KINDS.includes('deliverable')
        && !UNFILED_EVENT_KINDS.includes('plan'));

    // ---------- the two new sources ----------
    const feed = buildProjectFeed({
        notices: [
            { id: 'n1', ts: T, title: 'shipped 3.107.0', type: 'update', level: 1, agentName: 'developer' },
            { id: 'n2', ts: T - DAY, title: 'which folder?', type: 'question', status: 'answered', answeredAt: T - DAY / 2 }
        ],
        queue: [
            { id: 'q1', ts: T - 2 * DAY, text: 'fix the badge', status: 'done', handledAt: T - DAY, author: 'user' },
            { id: 'q2', ts: T - 3 * DAY, text: 'blocked on you', status: 'blocked', author: 'user' }
        ]
    });
    ok('a notice reaches the feed as its own kind',
        feed.events.filter(e => e.kind === 'notice').length === 3);
    ok('‼️ an ANSWERED question is a second event at the moment it was answered — the user acting is not the same fact as the agent asking',
        feed.events.some(e => e.kind === 'notice' && e.ts === T - DAY / 2 && e.title.startsWith('answered:')));
    ok('a queue item is stamped at the latest thing that happened to it',
        feed.events.some(e => e.kind === 'queue' && e.ts === T - DAY && e.tone === 'ok'));
    ok('a blocked item reads as needing you', feed.events.some(e =>
        e.kind === 'queue' && e.tone === 'warn' && e.title === 'blocked on you'));
    ok('both rows link back to the board they live on', feed.events
        .filter(e => e.kind === 'notice' || e.kind === 'queue')
        .every(e => e.link && (e.link.to === 'notice' || e.link.to === 'queue')));
    ok('an unanswered question carries no phantom second row', buildProjectFeed({
        notices: [{ id: 'n3', ts: T, title: 'still waiting', type: 'question', status: 'answered' }]
    }).events.length === 1);

    const withDocs = buildProjectFeed({
        docs: [
            { kind: 'decision', ts: T, title: 'file channel', path: 'D:\\v\\p\\20_Decisions\\x.md' },
            { kind: 'deliverable', ts: T - DAY, title: 'VSIX 3.57.0', detail: '3.57.0 · local' },
            { kind: 'plan', ts: T - 2 * DAY, title: 'Faz 3', detail: 'Milestones' }
        ]
    });
    ok('a document event plugs in with no change to the merge',
        withDocs.events.length === 3 && withDocs.events[0].link.to === 'file');
    ok('…and it takes its place in the one chronology, newest first',
        withDocs.events.map(e => e.kind).join() === 'decision,deliverable,plan');
    ok('…and each kind is counted so its chip can show a real number',
        withDocs.counts.decision === 1 && withDocs.counts.deliverable === 1 && withDocs.counts.plan === 1);

    // ‼️ A document event with no real date is DROPPED. Sorting it to 1970 or
    // to "now" both put it somewhere it did not happen, and the reader has no
    // way to tell which rows were guesses.
    const undated = buildProjectFeed({
        docs: [
            { kind: 'deliverable', ts: 0, title: 'ships in Q3' },
            { kind: 'plan', ts: 0, title: 'ticked, but the document records no date' },
            { kind: 'decision', ts: T, title: 'dated, so it appears' }
        ]
    });
    ok('‼️ an undated document event is left OUT rather than stamped with a guess',
        undated.events.length === 1 && undated.events[0].title === 'dated, so it appears');
    ok('…and it is not counted either, so no chip promises a row that is not there',
        !undated.counts.deliverable && !undated.counts.plan);
    ok('a document event carries no cost — it is a record, not a spend',
        feedSpend(withDocs.events) === 0);
}

// ---------- cost ----------
{
    const c = buildProjectCost({
        sessions: [session, {
            sessionId: 'sid-2', agentName: 'basit', firstTs: T - DAY, lastTs: T - DAY, cost: 1,
            daily: { [costDay(T - DAY)]: 1 }
            // no turns at all — an external CLI or an old index
        }],
        budgetUSD: 5, budgetTotalUSD: 100, dueAt: T + 10 * DAY, now: T
    });

    ok('the total is the sum of the sessions', c.total === 4);
    ok('today is today\'s bucket, not the whole thing', c.today === 2);
    ok('the day series is oldest first', c.days.length === 2 && c.days[0].day < c.days[1].day);

    ok('by agent, biggest first',
        c.byAgent[0].agent === 'developer' && c.byAgent[0].cost === 3 && c.byAgent[0].sessions === 1);

    // opus served turns 1 and 2 alone (1 + 1.5); turn 3 was opus+haiku and
    // cannot be split, so it is reported apart instead of guessed at
    ok('‼️ per-model cost claims only single-model turns',
        c.byModel.length === 1 && c.byModel[0].model === 'opus' && c.byModel[0].cost === 2.5);
    ok('‼️ a turn served by two models is named, not split', c.mixedTurnCost === 0.5);
    ok('a session with no turn detail is named too, not silently dropped', c.unattributed === 1);
    ok('and the three add back up to the total',
        Math.round((c.byModel[0].cost + c.mixedTurnCost + c.unattributed) * 100) / 100 === 4);

    ok('burn is a per-day rate over a window', c.burn.perDay7 > 0 && c.burn.perDay7 <= c.total);
    ok('a due date gives a projection', typeof c.burn.projectedAtDue === 'number'
        && c.burn.projectedAtDue >= c.total);
    ok('a total budget gives a runway and a percentage',
        c.burn.budgetUsedPct === 4 && typeof c.burn.daysToBudget === 'number');
    ok('a daily budget gives today\'s share', c.burn.todayPct === 40);

    const bare = buildProjectCost({ sessions: [], now: T });
    ok('an empty project does not divide by zero',
        bare.total === 0 && bare.burn.perDay7 === 0 && bare.burn.projectedAtDue === undefined);
}

// ---------- small things that print ----------
{
    ok('a span reads as a person would say it',
        humanSpan(45000) === '45s' && humanSpan(90 * 60000) === '1h 30m' && humanSpan(3600000) === '1h');
    // ‼️ local, like every other date in the project axis: a UTC day boundary
    // files the evening's work under tomorrow east of UTC.
    const evening = new Date(2026, 7, 2, 23, 30).getTime();
    ok('‼️ a cost day is the USER\'s day, not UTC\'s', costDay(evening) === '2026-08-02');
}

// ---------- the timeline's git source ----------
{
    const { parseGitLog } = require(out('core', 'gitfile.js'));
    const NUL = String.fromCharCode(0);
    const row = (h, at, who, subj) => [h, at, who, subj].join(NUL);
    const rows = parseGitLog([
        // ‼️ a real subject contains the separators everyone else would have
        // picked: spaces, pipes, colons, tabs. That is why the format is NUL.
        row('abc1234', '1785600000', 'miropharm', 'fix: a | b\tc — everything at once'),
        '',
        row('bad', 'not-a-number', 'x', 'y'),          // dropped, not half-read
        'two' + NUL + 'fields',                         // dropped
        row('def5678', '1785700000', 'someone else', 'second')
    ].join('\n'));

    ok('git: two good rows out of five lines', rows.length === 2);
    ok('git: the subject survives its own punctuation',
        rows[0].subject === 'fix: a | b\tc — everything at once');
    ok('git: the timestamp becomes milliseconds', rows[0].ts === 1785600000000);
    ok('git: an author with a space is one author', rows[1].author === 'someone else');
    ok('git: a row missing fields is dropped rather than guessed at',
        !rows.some(r => r.hash === 'bad' || r.hash === 'two'));
}

// ---------- X-112: a project's money says what it added ----------
{
    const { billingOf } = require(out('core', 'billing.js'));
    const b = v => billingOf(Object.assign({ engine: 'claude', binding: 'declared' }, v));
    const now = Date.now();
    const s = (id, cost) => ({ sessionId: id, agentName: 'dev', firstTs: now, lastTs: now, cost });
    const B = { p: b({ providerId: '' }), k: b({ providerId: 'kimi', providerLabel: 'Kimi' }) };
    const mixed = buildProjectCost({ sessions: [s('p', 4), s('k', 1)], billing: x => B[x.sessionId], now });
    ok('X-112: a project run on the plan AND through Kimi carries its kinds of dollar',
        mixed.total === 5 && Array.isArray(mixed.dollars) && mixed.dollars.length === 2
        && mixed.dollars[0].dollar === 'equivalent' && mixed.dollars[1].dollar === 'arithmetic');
    const plain = buildProjectCost({ sessions: [s('p', 4)], billing: x => B[x.sessionId], now });
    ok('X-112: …a one-kind project carries none — the figure is ordinary', plain.dollars === undefined);
    ok('X-112: …and without a reader the module states nothing it was not told',
        buildProjectCost({ sessions: [s('p', 4), s('k', 1)], now }).dollars === undefined);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
