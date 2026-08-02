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
    ok('‼️ notices and queue items are named as not-yet-filed rather than faked',
        UNFILED_EVENT_KINDS.includes('notice') && UNFILED_EVENT_KINDS.includes('queue'));
    // …but the slot works the moment something fills it
    const withDocs = buildProjectFeed({ docs: [
        { kind: 'decision', ts: T, title: 'file channel', path: 'D:\\v\\p\\20_Decisions\\x.md' }] });
    ok('a document event plugs in with no change to the merge',
        withDocs.events.length === 1 && withDocs.events[0].link.to === 'file');
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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
