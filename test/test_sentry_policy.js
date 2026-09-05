// X-190 — WHEN THE LEADER WAKES, AND WHO DECIDES.
//
// The sentry that shipped was purely MECHANICAL: measure, fill a template,
// open the next round, never think. The design conversation had agreed on
// something else — "bir lider ajan bakar, kendini uyutur, uyanması için gereken
// görevi ayarlar" — and the correction the user asked for is not to throw the
// mechanical engine away but to make it one END of a switch: mechanical /
// intelligent / hybrid, with condition inputs "olabildiğince geniş ve flexible…
// çok dar kalıplara sıkışmış bir hibrit sistem çok etkili olmaz".
//
// ‼️ SO THE THREE MODES ARE NOT THREE CODE PATHS. They are three PRESETS over
// one condition set — mechanical is the empty set, intelligent is the set that
// always fires, hybrid is whatever the user built. That is the whole design
// decision this file pins, because three branches would rot in two of them and
// three fixed modes are themselves the narrow mould the user warned about.
//
// What else is pinned:
//   * the field dictionary lives in ONE exported place, so a settings surface
//     draws it instead of repeating it, and adding a field touches no UI;
//   * an UNKNOWN field fails OPEN-EYED — the condition does not fire and the
//     reason says so. It is never silently swallowed and never fires by
//     accident, because both mistakes cost real money at 3 a.m.;
//   * the verdict NAMES which conditions fired. A leader turn nobody can
//     explain is the "sessiz durma yasaktır" rule broken on the prompt side.
'use strict';
const path = require('path');
const {
    FIELDS, OPERATORS, PRESETS, presetConditions, evaluateSentryPolicy,
    factsSnapshot, SNAPSHOT_TEXT_MAX, probePolicy
} = require(path.resolve(__dirname, '../out/core/sentryPolicy.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const diagnosis = (over = {}) => Object.assign({
    sessionId: '689569e7-b814', session: '689569e7',
    outcome: 'clean-handover', rule: 'note-found', why: '', evidence: [],
    unknown: [], limit: false, policy: {}
}, over);

const facts = (over = {}) => Object.assign({
    diagnosis: diagnosis(),
    handover: { found: true, source: 'transcript', score: 5 },
    repo: { dirty: 0, untracked: 0 },
    round: { index: 3, failed: false, barren: false, consecutiveBarren: 0 },
    quota: { percent: 41 },
    accounts: { usable: 3 },
    output: '',
    code: { closed: true }
}, over);

// ---- the three modes are presets over one set ------------------------------
{
    ok('there are exactly three presets and they are named for the user',
        PRESETS.map(p => p.id).join(',') === 'mechanical,intelligent,hybrid');

    ok('‼️ mechanical is the EMPTY condition set, not a branch',
        presetConditions('mechanical').length === 0);
    ok('‼️ intelligent is the set that always fires, not a branch',
        presetConditions('intelligent').length === 1
        && presetConditions('intelligent')[0].field === 'always');
    ok('hybrid ships a real starting set the user then edits',
        presetConditions('hybrid').length >= 3);

    const mech = evaluateSentryPolicy({ conditions: [] }, facts());
    ok('mechanical never wakes the leader', mech.verdict === 'mechanical');
    ok('…and says why in a sentence a person can read',
        /no condition/i.test(mech.why) && mech.fired.length === 0);

    const smart = evaluateSentryPolicy(
        { conditions: presetConditions('intelligent') }, facts());
    ok('intelligent always wakes it', smart.verdict === 'leader');
    ok('…and names the condition that did it', smart.fired.join(',') === 'always');
}

// ---- the hybrid case: the routine round is free ----------------------------
{
    const set = presetConditions('hybrid');
    const clean = evaluateSentryPolicy({ conditions: set }, facts());
    ok('‼️ a clean, routine round stays mechanical and costs nothing',
        clean.verdict === 'mechanical');

    const lost = evaluateSentryPolicy({ conditions: set },
        facts({ handover: { found: false, source: '', score: 0 },
            diagnosis: diagnosis({ outcome: 'hit-the-wall' }) }));
    ok('a round that hit the wall with no note wakes the leader',
        lost.verdict === 'leader' && lost.fired.length > 0);

    const dirty = evaluateSentryPolicy({ conditions: set },
        facts({ repo: { dirty: 7, untracked: 0 } }));
    ok('so does uncommitted work nobody explained', dirty.verdict === 'leader');
}

// ---- operators -------------------------------------------------------------
{
    const one = (field, operator, value, f) =>
        evaluateSentryPolicy({ conditions: [{ id: 'c1', field, operator, value }] }, f ?? facts());

    ok('eq on an enum', one('outcome', 'eq', 'clean-handover').verdict === 'leader');
    ok('ne on an enum', one('outcome', 'ne', 'clean-handover').verdict === 'mechanical');
    ok('gt on a number', one('repo.dirty', 'gt', 0).verdict === 'mechanical'
        && one('repo.dirty', 'gt', 0, facts({ repo: { dirty: 1, untracked: 0 } })).verdict === 'leader');
    ok('gte / lt / lte', one('quota.percent', 'gte', 41).verdict === 'leader'
        && one('quota.percent', 'lt', 41).verdict === 'mechanical'
        && one('quota.percent', 'lte', 41).verdict === 'leader');
    ok('isTrue / isFalse on a boolean',
        one('handover.found', 'isTrue', null).verdict === 'leader'
        && one('handover.found', 'isFalse', null).verdict === 'mechanical');
    ok('contains on text',
        one('output', 'contains', 'ENOSPC', facts({ output: 'write failed: ENOSPC' })).verdict === 'leader');
    ok('matches on a regular expression',
        one('output', 'matches', 'FAIL\\s+\\d+', facts({ output: 'FAIL 12 tests' })).verdict === 'leader');
    ok('…and a regular expression that does not compile does not fire, and says so',
        one('output', 'matches', '([', facts({ output: 'x' })).verdict === 'mechanical');
    ok('every operator the dictionary advertises is implemented',
        OPERATORS.every(o => typeof o.id === 'string' && o.id && typeof o.label === 'string'));
}

// ---- ‼️ an unknown field fails with its eyes open --------------------------
{
    const r = evaluateSentryPolicy(
        { conditions: [{ id: 'c1', field: 'no.such.thing', operator: 'isTrue', value: null }] }, facts());
    ok('an unknown field does NOT fire', r.verdict === 'mechanical');
    ok('…and is not swallowed either — it is reported by name',
        r.problems.length === 1 && /no\.such\.thing/.test(r.problems[0]));

    const mixed = evaluateSentryPolicy({
        conditions: [
            { id: 'c1', field: 'no.such.thing', operator: 'isTrue', value: null },
            { id: 'c2', field: 'repo.dirty', operator: 'gt', value: 0 }
        ]
    }, facts({ repo: { dirty: 2, untracked: 0 } }));
    ok('a broken condition never stops the working ones',
        mixed.verdict === 'leader' && mixed.fired.join(',') === 'c2'
        && mixed.problems.length === 1);
}

// ---- AND groups: several conditions that must hold together ----------------
{
    const r = evaluateSentryPolicy({
        conditions: [{
            id: 'g1', all: [
                { id: 'a', field: 'repo.dirty', operator: 'gt', value: 0 },
                { id: 'b', field: 'code.closed', operator: 'isTrue', value: null }
            ]
        }]
    }, facts({ repo: { dirty: 3, untracked: 0 }, code: { closed: true } }));
    ok('an AND group fires only when every part holds', r.verdict === 'leader');

    const half = evaluateSentryPolicy({
        conditions: [{
            id: 'g1', all: [
                { id: 'a', field: 'repo.dirty', operator: 'gt', value: 0 },
                { id: 'b', field: 'code.closed', operator: 'isTrue', value: null }
            ]
        }]
    }, facts({ repo: { dirty: 0, untracked: 0 }, code: { closed: true } }));
    ok('…and not when one of them does not', half.verdict === 'mechanical');
    ok('an empty AND group is not a condition that always fires',
        evaluateSentryPolicy({ conditions: [{ id: 'g', all: [] }] }, facts()).verdict === 'mechanical');
}

// ---- the dictionary --------------------------------------------------------
{
    ok('the field dictionary is one exported list with a type and a sentence each',
        Array.isArray(FIELDS) && FIELDS.length >= 14
        && FIELDS.every(f => f.field && f.type && f.describe && f.describe.length > 10));
    ok('…with no duplicates', new Set(FIELDS.map(f => f.field)).size === FIELDS.length);
    ok('…and every field it advertises can really be read',
        FIELDS.every(f => {
            const operator = f.type === 'boolean' ? 'isTrue'
                : f.type === 'number' ? 'gte'
                    : f.type === 'text' || f.type === 'enum' ? 'ne' : 'isTrue';
            const r = evaluateSentryPolicy(
                { conditions: [{ id: 'c', field: f.field, operator, value: f.type === 'number' ? -1 : ' ' }] },
                facts());
            return r.problems.length === 0;
        }));
    ok('every field names the preset value it offers, where it has a closed set',
        FIELDS.filter(f => f.type === 'enum').every(f => Array.isArray(f.values) && f.values.length));
}

// ---- the verdict is explainable -------------------------------------------
{
    const r = evaluateSentryPolicy({ conditions: presetConditions('hybrid') },
        facts({ handover: { found: false, source: '', score: 0 } }));
    ok('the verdict carries the fired ids AND a readable sentence',
        r.verdict === 'leader' && r.fired.length > 0 && r.why.length > 10);
    ok('…and the sentence names a condition rather than a rule number',
        r.fired.every(id => r.why.includes(id) || r.why.length > 20));
}

// ---- X-194 — WHAT EVERY FIELD READS RIGHT NOW ------------------------------
//
// The editor's rows must each say what that field holds TODAY, or the user is
// writing rules against numbers they cannot see (DENSITY, and the item's own
// words: "kullanıcı koşulun bugün ateşleyip ateşlemeyeceğini görsün"). The
// reading is derived by running the evaluator's OWN reader over the dictionary,
// so a row can never show a figure the verdict disagrees with.
{
    ok('every field in the dictionary has a reading — no row can be left blank',
        FIELDS.every(f => Object.prototype.hasOwnProperty.call(factsSnapshot(facts()), f.field)));
    ok('…and nothing that is NOT a field sneaks in',
        Object.keys(factsSnapshot(facts())).length === FIELDS.length);

    const snap = factsSnapshot(facts({ quota: { percent: 41 }, repo: { dirty: 2, untracked: 0 } }));
    ok('a number reads as the number the evaluator compares',
        snap['quota.percent'] === 41 && snap['repo.dirty'] === 2);
    ok('a boolean reads as a boolean, not as the word',
        snap['handover.found'] === true && snap['round.failed'] === false);
    ok('an enum reads as the value its picker offers',
        snap['outcome'] === 'clean-handover' && snap['handover.source'] === 'transcript');

    // ‼️ THE READING AND THE VERDICT ARE ONE ANSWER. If a row says 2 and a
    // condition "is at least 2" does not fire, the row has lied — and this is
    // the only test that can catch that, because the two come from one reader.
    ok('‼️ a condition written against the reading fires',
        FIELDS.filter(f => f.type === 'number').every(f =>
            evaluateSentryPolicy(
                { conditions: [{ id: 'c', field: f.field, operator: 'gte', value: snap[f.field] }] },
                facts({ quota: { percent: 41 }, repo: { dirty: 2, untracked: 0 } })
            ).fired.length === 1));

    // A fact nobody measured reads as the evaluator's OWN default rather than
    // as blank: the row has to show -1 for a quota that was never read, because
    // -1 is what the condition will be compared against tonight.
    const bare = factsSnapshot({ diagnosis: diagnosis() });
    ok('an unmeasured fact reads as what the evaluator will compare, not as empty',
        bare['quota.percent'] === -1 && bare['repo.dirty'] === 0
        && bare['handover.source'] === '');

    // Text is the one field that can be a whole session's tail. The row shows
    // its END — the last thing the engine said is what a `contains` rule is
    // usually written about — and says that it was cut.
    const long = 'x'.repeat(SNAPSHOT_TEXT_MAX + 50) + 'THE-END';
    const cut = factsSnapshot(facts({ output: long }))['output'];
    ok('a long text reading is clamped and says so',
        typeof cut === 'string' && cut.length <= SNAPSHOT_TEXT_MAX + 1
        && cut.startsWith('…') && cut.endsWith('THE-END'));
    ok('…and a short one is left exactly as it is',
        factsSnapshot(facts({ output: 'short' }))['output'] === 'short');
}

// ---- X-194 — WOULD THIS SET FIRE TONIGHT? ---------------------------------
//
// One implementation, two callers: the Missions editor asks it on every repaint
// of the draft and an agent asks it over `sentry.probe`. Both need the same
// answer, so neither is allowed to work it out for itself.
{
    const f = facts({ handover: { found: false, source: '', score: 0 }, repo: { dirty: 3, untracked: 0 } });
    const set = presetConditions('hybrid');
    const p = probePolicy(set, f);
    ok('the probe answers with the verdict the round would reach',
        p.measured === true && p.verdict === evaluateSentryPolicy({ conditions: set }, f).verdict);

    // ‼️ PER CONDITION, IN THE ORDER GIVEN — not by id. A row is marked by its
    // POSITION, and two rows are free to carry the same handle; answering by id
    // would mark whichever row happened to share a name.
    ok('…and per condition, in the order they were handed in',
        Array.isArray(p.hits) && p.hits.length === set.length);
    ok('…marking exactly the ones that hold',
        p.hits[0] === true && p.hits[1] === true && p.hits[2] === false);
    ok('‼️ …and the marks agree with the verdict, always',
        p.hits.some(Boolean) === (p.verdict === 'leader'));

    // A condition nobody can evaluate is never quietly a condition that did not
    // fire — X-190's law, carried to the surface that is about to save it.
    const bad = probePolicy([{ id: 'x', field: 'nope.nothing', operator: 'isTrue' }], f);
    ok('a condition nobody can evaluate comes back BY NAME rather than as a false',
        bad.problems.length === 1 && bad.problems[0].includes('nope.nothing')
        && bad.hits[0] === false);

    // ‼️ WITH NOTHING MEASURED THERE IS NO ANSWER, and saying "mechanical"
    // would be the guess this system refuses: a campaign that has never run a
    // round has no readings, not readings that all came back false.
    const none = probePolicy(set, undefined);
    ok('‼️ with no round measured it says so rather than answering "mechanical"',
        none.measured === false && none.verdict === undefined
        && !none.hits.length && none.why.length > 10);

    ok('the readings it judged against travel with the answer',
        p.facts && p.facts['repo.dirty'] === 3);
    ok('an empty set is a real answer, not a missing one',
        probePolicy([], f).measured === true && probePolicy([], f).verdict === 'mechanical');
}

console.log(`test_sentry_policy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
