/**
 * ‼️ A-17 — WHAT ORCHESTRATION HAS OBSERVED, AND THE FENCES AROUND IT.
 *
 * The feature is a counting feature, so the things worth measuring are the
 * places where counting lies:
 *
 *   · the SIGNATURE has to make two runs that took the same approach at two
 *     sizes the same group, or nothing ever aggregates and the feature looks
 *     like it works while answering nothing;
 *   · a group under the sample floor must be reported and must never be
 *     BRIEFED — one run's accident read as a pattern is worse than silence;
 *   · the classic/adaptive comparison must refuse to draw a number when one
 *     side has no denominator;
 *   · the scope fence must hold, including for "no project", which is a scope
 *     and not a wildcard;
 *   · the same run recorded twice must count once, while a RERUN counts twice
 *     because it really is a second attempt;
 *   · and the store must keep the persistence discipline X-62/X-87/X-64 had to
 *     be opened for: missing is not corrupt, syntax is not schema, a file from
 *     the future is read-only, and a failed rename never writes directly.
 *
 * ‼️ AND THE ONE THAT IS NOT ARITHMETIC: cost is recorded and nothing routes on
 * it. That is asserted against the source, because it is a promise about what
 * the code does NOT do and no fixture can show its absence.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const O = require(out('core', 'missionOutcomes.js'));

const src = (over = {}) => Object.assign({
    runId: 'r1', specId: 's1', mode: 'adaptive', projectId: 'p1',
    verdict: 'success', stopReason: 'criteria-satisfied',
    actions: ['delegate', 'evaluate', 'finish'],
    strategyVersion: 1,
    criteria: [{ id: 'c1', required: true }, { id: 'c2', required: false }],
    verdicts: { c1: 'pass', c2: 'pass' },
    counts: {
        rounds: 3, tasks: 4, evaluations: 1, conversations: 0, councils: 0,
        messages: 0, questionsAnswered: 0, guidanceDelivered: 0, independentReviews: 0
    },
    startedAt: 1000, endedAt: 61000, costUSD: 0.5, tokens: 12000
}, over);

// ================================================= 1. the strategy signature
{
    console.log('\n-- the signature: same approach at two sizes is one group');
    const a = O.strategySignature(['delegate', 'delegate', 'delegate', 'evaluate', 'finish'], []);
    const b = O.strategySignature(['delegate', 'evaluate', 'finish'], []);
    ok('‼️ consecutive repeats collapse, so size is not identity', a === b);
    ok('…and how big it was is kept separately, in the counts',
        O.toOutcome(src({ counts: { ...src().counts, tasks: 9 } })).counts.tasks === 9);

    ok('a different ORDER is a different approach',
        O.strategySignature(['evaluate', 'delegate'], []) !== b);
    ok('‼️ the terminal is part of it — an abort did not take the same approach as a finish',
        O.strategySignature(['delegate', 'finish'], []) !== O.strategySignature(['delegate', 'abort'], []));
    ok('features are a SET — discovering them in another order is the same approach',
        O.strategySignature(['delegate'], ['council', 'replan'])
        === O.strategySignature(['delegate'], ['replan', 'council']));
    ok('…and a duplicated feature is still one feature',
        O.strategySignature(['delegate'], ['review', 'review'])
        === O.strategySignature(['delegate'], ['review']));
    ok('an invented feature is dropped rather than smuggled into the key',
        O.strategySignature(['delegate'], ['review', 'nonsense'])
        === O.strategySignature(['delegate'], ['review']));
    ok('‼️ an UNKNOWN primitive is kept, so a new one shows as a new shape',
        /teleport/.test(O.strategySignature(['delegate', 'teleport'], [])));
    ok('the version is in the string, so a rule change cannot pool with old rows',
        b.startsWith('s' + O.STRATEGY_SIGNATURE_V + '|'));
    ok('blank actions are not decisions', O.strategySignature(['', '  ', 'finish'], []) === O.strategySignature(['finish'], []));
    ok('it is deterministic — same input, same string',
        O.strategySignature(['delegate', 'evaluate'], ['review'])
        === O.strategySignature(['delegate', 'evaluate'], ['review']));
}

// ============================================ 2. features are DERIVED, never claimed
{
    console.log('\n-- a lead cannot claim a council it did not hold');
    const f = (over) => O.strategyFeatures(src(over)).sort().join(',');
    ok('a plain run has no features', f({}) === '');
    ok('parallel work is branching', f({ actions: ['parallel', 'finish'] }).includes('branching'));
    ok('a moved strategy is replan, even with no `replan` action',
        f({ strategyVersion: 3 }).includes('replan'));
    ok('…and a `replan` action is too, even at version 1',
        f({ actions: ['replan', 'finish'] }).includes('replan'));
    ok('a second agent judging is review',
        f({ counts: { ...src().counts, independentReviews: 1 } }).includes('review'));
    ok('real messages are a conversation',
        f({ counts: { ...src().counts, messages: 4 } }).includes('conversation'));
    ok('‼️ a council counts only when one was really opened',
        !f({}).includes('council')
        && f({ counts: { ...src().counts, councils: 1 } }).includes('council'));
    ok('a person answering or steering is `human`',
        f({ counts: { ...src().counts, guidanceDelivered: 1 } }).includes('human'));
    ok('…and a steer that never LANDED is not, because it changed nothing',
        !f({ counts: { ...src().counts, guidanceDelivered: 0 } }).includes('human'));
}

// ================================================ 3. the outcome itself
{
    console.log('\n-- one finished run, normalised');
    const o = O.toOutcome(src());
    ok('required criteria are counted apart from every criterion',
        o.criteria.required === 1 && o.criteria.total === 2 && o.criteria.requiredMet === 1);
    ok('a criterion that is not `pass` is not met',
        O.toOutcome(src({ verdicts: { c1: 'fail', c2: 'pass' } })).criteria.requiredMet === 0);
    ok('strategy changes are versions MINUS one', O.toOutcome(src({ strategyVersion: 3 })).counts.strategyChanges === 2);
    ok('…and never negative', O.toOutcome(src({ strategyVersion: 0 })).counts.strategyChanges === 0);
    ok('duration is real', o.durationMs === 60000);
    ok('‼️ a clock that went backwards is 0, not a negative in an average',
        O.toOutcome(src({ startedAt: 9000, endedAt: 1000 })).durationMs === 0);
    ok('‼️ "" and undefined are the SAME scope, so one project cannot become two',
        O.toOutcome(src({ projectId: '' })).projectId === null
        && O.toOutcome(src({ projectId: undefined })).projectId === null);
    ok('cost and tokens are carried as observation', o.costUSD === 0.5 && o.tokens === 12000);
    ok('no prompt, artefact or message text is anywhere in it',
        !/prompt|artefact|excerpt|text|summary|thought/.test(Object.keys(o).join(',')));
}

// =========================================== 4. aggregation, and what it refuses
{
    console.log('\n-- counting, and refusing to count');
    const many = (n, over = {}) => Array.from({ length: n }, (_, i) =>
        O.toOutcome(src({ runId: 'r' + i + JSON.stringify(over).length, ...over })));

    const few = O.aggregateOutcomes(many(2), { projectId: 'p1' });
    ok('‼️ a group under the floor is REPORTED — hiding it would be its own lie',
        few.groups.length === 1 && few.groups[0].runs === 2);
    ok('…but marked `enough: false`', few.groups[0].enough === false);
    ok('‼️ …and is never briefed to a lead', O.outcomePatterns(few).length === 0);

    const enough = O.aggregateOutcomes(many(O.MIN_SAMPLE), { projectId: 'p1' });
    ok('at the floor the group is enough', enough.groups[0].enough === true);
    ok('…and IS briefed', O.outcomePatterns(enough).length === 1);
    ok('‼️ …as evidence, never as an instruction',
        !/should|use this|recommend|best/i.test(O.outcomePatterns(enough)[0])
        && /run\(s\) here took the shape/.test(O.outcomePatterns(enough)[0]));

    const mixed = O.aggregateOutcomes([
        ...many(3),
        ...many(2, { mode: 'classic', criteria: [], verdicts: {} })
    ], { projectId: 'p1' });
    ok('‼️ classic and adaptive never share a group, whatever their shape',
        mixed.groups.length === 2 && mixed.groups.every(g => g.mode === 'classic' || g.mode === 'adaptive'));
    ok('‼️ the comparison is REFUSED while one side has no denominator',
        mixed.compare.successRate === null && /Insufficient sample/.test(mixed.compare.note));
    ok('…and says what is missing rather than implying they are equal',
        /Nothing is being claimed about which works better/.test(mixed.compare.note));

    const both = O.aggregateOutcomes([
        ...many(3),
        ...many(3, { mode: 'classic', criteria: [], verdicts: {} })
    ], { projectId: 'p1' });
    ok('with a denominator on both sides it is drawn', both.compare.successRate !== null);
    ok('…and a group with NO criteria says null rather than 0% satisfaction',
        both.groups.find(g => g.mode === 'classic').requiredSatisfaction === null);

    // ‼️ THE SCOPE FENCE.
    const across = [...many(3), ...many(3, { projectId: 'p2' })];
    ok('‼️ one project never sees another\'s runs',
        O.aggregateOutcomes(across, { projectId: 'p1' }).total === 3);
    ok('‼️ …and "no project" is a scope, not a wildcard',
        O.aggregateOutcomes([...across, ...many(2, { projectId: null })], { projectId: null }).total === 2);
    ok('only a caller asking for EVERY scope gets every scope',
        O.aggregateOutcomes(across, {}).total === 6);

    // A signature rule change must be visible as two groups, not one average.
    const twoRules = O.aggregateOutcomes([
        ...many(3),
        ...many(3).map(o => ({ ...o, signatureV: 99 }))
    ], { projectId: 'p1' });
    ok('‼️ two signature versions are two groups, never one wrong average',
        twoRules.groups.length === 2 && twoRules.signatureVersions.join(',') === '1,99');
}

// ============================================ 5. the store
{
    console.log('\n-- the persistence discipline, restated because a new store does not inherit it');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-a17-'));
    const file = path.join(dir, 'mission-outcomes.json');

    const s = new O.MissionOutcomeStore(file);
    s.load();
    ok('‼️ a file that never existed is `empty`, not corrupt', s.health === 'empty');
    ok('…and saves freely', s.save().saved === true);

    s.record(O.toOutcome(src({ runId: 'a' })));
    s.record(O.toOutcome(src({ runId: 'a' })));
    ok('‼️ the SAME run recorded twice counts once', s.outcomes.length === 1);
    s.record(O.toOutcome(src({ runId: 'b', specId: 's1' })));
    ok('‼️ …while a RERUN is a second attempt and counts twice',
        s.outcomes.length === 2 && s.outcomes.every(o => o.specId === 's1'));
    ok('a verdict correction REPLACES rather than appends', (() => {
        s.record(O.toOutcome(src({ runId: 'a', verdict: 'failed' })));
        return s.outcomes.length === 2
            && s.outcomes.find(o => o.runId === 'a').verdict === 'failed';
    })());
    ok('forgetting a run drops exactly it', s.forget('b') === true && s.outcomes.length === 1);
    ok('…and forgetting one that is not there is not an error', s.forget('nope') === false);
    s.save();

    const back = new O.MissionOutcomeStore(file);
    back.load();
    ok('what was saved reads back', back.health === 'ok' && back.outcomes.length === 1);

    // ‼️ SYNTAX IS NOT SCHEMA (X-87).
    for (const [name, body] of [
        ['an array', '[]'], ['an empty object', '{}'],
        ['a document with no version', '{"outcomes":[]}'],
        ['a document whose list is a string', '{"v":1,"outcomes":"broken"}']
    ]) {
        const f2 = path.join(dir, 'bad.json');
        fs.writeFileSync(f2, body, 'utf8');
        const bad = new O.MissionOutcomeStore(f2);
        bad.load();
        ok('‼️ ' + name + ' parses but is NOT a healthy empty history',
            bad.health === 'empty' && !!bad.quarantine && /unreadable/.test(bad.degraded || ''));
        ok('…and the bytes are kept as evidence', fs.existsSync(bad.quarantine));
        try { fs.unlinkSync(bad.quarantine); } catch { /* ignore */ }
    }

    // ‼️ A FILE FROM THE FUTURE IS READ-ONLY (X-64).
    const f3 = path.join(dir, 'future.json');
    fs.writeFileSync(f3, JSON.stringify({ v: 99, outcomes: [O.toOutcome(src())] }), 'utf8');
    const future = new O.MissionOutcomeStore(f3);
    future.load();
    ok('‼️ a newer schema is read as far as we understand it…',
        future.health === 'future' && future.outcomes.length === 1);
    ok('‼️ …and is NEVER written back', future.save().saved === false && future.recoveryRequired === true);
    ok('…with the reason said out loud', /newer version/.test(future.degraded || ''));

    // A row that is not one is dropped rather than allowed to poison an average.
    const f4 = path.join(dir, 'junk.json');
    fs.writeFileSync(f4, JSON.stringify({ v: 1, outcomes: [O.toOutcome(src()), { runId: 'x' }, null, 7] }), 'utf8');
    const junk = new O.MissionOutcomeStore(f4);
    junk.load();
    ok('a malformed row is dropped, not loaded as NaN',
        junk.health === 'ok' && junk.outcomes.length === 1);

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ==================================== 6. the promise that is an ABSENCE
{
    console.log('\n-- cost is recorded and decides nothing');
    const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missionOutcomes.ts'), 'utf8');
    /**
     * ‼️ THIS IS THE ONE ASSERTION NO FIXTURE CAN MAKE. A-17's hardest line is
     * that cost and duration are observation and are NOT connected to model
     * choice, escalation, a budget reserve or an expected-value stop — a
     * promise about what the code does NOT do. So it is read off the source:
     * the module may MENTION a price only to record it.
     */
    const body = core.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // The lookbehind is load-bearing: `=> o.costUSD` is an arrow function, not
    // a comparison, and a naive `[<>]` reads the arrow's own `>` as one.
    ok('‼️ nothing in the module compares a cost',
        !/(costUSD|tokens)\s*(?<!=)[<>]=?/.test(body)
        && !/(?<!=)[<>]=?\s*(o\.)?costUSD/.test(body));
    ok('‼️ nothing sorts or picks by price',
        !/sort\([^)]*cost/i.test(body) && !/cheap|escalat|reserve|expected.?value/i.test(body));
    ok('…and the file says so where a future writer will read it',
        /COST DECIDES NOTHING/.test(core));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the history is a SEPARATE file, so it outlives the run store\'s rollover',
        /mission-outcomes\.json/.test(ext));
    ok('‼️ the lead is briefed within its OWN project scope and nothing wider',
        /experience: \(\) => outcomePatterns\(\s*\n?\s*aggregateOutcomes\(outcomeStore\.outcomes, \{ projectId: spec\.projectId \?\? null \}\)\)/.test(ext));
    ok('recording walks every terminal run and is idempotent by run id',
        /const syncMissionOutcomes = \(\): void => \{/.test(ext)
        && /outcomeStore\.record\(toOutcome\(src\)\);/.test(ext));
    ok('…and it is built from the RUN RECORD, so a deleted or damaged trace cannot break it',
        !/readTrace|reconcileRun/.test(ext.slice(
            ext.indexOf('const missionOutcomeSource'),
            ext.indexOf('const syncMissionOutcomes'))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
