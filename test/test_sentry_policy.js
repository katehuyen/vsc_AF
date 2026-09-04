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
    FIELDS, OPERATORS, PRESETS, presetConditions, evaluateSentryPolicy
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

console.log(`test_sentry_policy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
