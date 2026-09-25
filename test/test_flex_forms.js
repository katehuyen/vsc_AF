// X-370 — THE SMART FLEX FORMS (media/afFlexForms.js): range, tri, soft/hard
// cap, suggestion chip, honest dead option — each pure, and two of them in real
// use: the retry supervisor's money cap is a HARD cap decided by capVerdict, and
// its "if it is not sure" box is a TRI select drawn from the flex registry.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const F = require(path.join(ROOT, 'media', 'afFlexForms.js'));
const door = require(path.join(ROOT, 'out', 'core', 'flexForms.js'));
const { supervisorRefusal, normalizeSupervisor } = require(path.join(ROOT, 'out', 'core', 'retrySupervisor.js'));

/* ---------- RANGE ---------- */
{
    const L = ['haiku', 'sonnet', 'opus'];
    const r = { lo: 'sonnet', hi: 'opus' };
    eq('a sound range', F.rangeError(L, r), '');
    ok('a floor above the ceiling is refused', /above the ceiling/.test(F.rangeError(L, { lo: 'opus', hi: 'haiku' })));
    ok('a value off the ladder is refused', /from the list/.test(F.rangeError(L, { lo: 'gpt', hi: 'opus' })));
    eq('below the floor rises to it', F.clampToRange(L, r, 'haiku'), 'sonnet');
    eq('inside stays', F.clampToRange(L, r, 'opus'), 'opus');
    eq('unknown starts at the floor', F.clampToRange(L, r, '?'), 'sonnet');
    eq('one step up inside the range', F.stepInRange(L, r, 'sonnet', 1), { value: 'opus', moved: true, why: 'sonnet → opus, inside sonnet–opus' });
    eq('at the ceiling it stays and says why', F.stepInRange(L, r, 'opus', 1), { value: 'opus', moved: false, why: 'opus is the ceiling you set' });
    eq('at the floor, down stays', F.stepInRange(L, r, 'sonnet', -1).why, 'sonnet is the floor you set');
}

/* ---------- TRI ---------- */
{
    const states = { ask: 'park', auto: 'smart', never: 'stop' };
    eq('each stored value names its state', ['park', 'smart', 'stop', 'x'].map(v => F.triState(states, v)), ['ask', 'auto', 'never', '']);
}

/* ---------- CAP ---------- */
{
    eq('a sound cap', F.capError({ soft: 3, hard: 5 }), '');
    ok('soft above hard is refused', /soft cap is above/.test(F.capError({ soft: 6, hard: 5 })));
    ok('a negative cap is refused', /0 or more/.test(F.capError({ hard: -1 })));
    const c = { soft: 3, hard: 5 };
    eq('under both', F.capVerdict(c, 1).level, 'ok');
    eq('…said with both caps', F.capVerdict(c, 1).sentence, '$1.00 of soft $3.00 · hard $5.00');
    eq('past soft = ask', [F.capVerdict(c, 3).level, F.capVerdict(c, 3).sentence], ['soft', '$3.00 passed the soft cap of $3.00 — ask before going on']);
    eq('at hard = stop', [F.capVerdict(c, 5).level, F.capVerdict(c, 5).sentence], ['hard', '$5.00 reached the hard cap of $5.00 — stop']);
    eq('no cap at all', F.capVerdict({}, 2).sentence, '$2.00, no cap');
    eq('another unit', F.capVerdict({ hard: 3 }, 3, ' calls').sentence, '3 calls reached the hard cap of 3 calls — stop');
}

/* ---------- SUGGESTION ---------- */
{
    const pt = { id: 'judge.video', suggest: ctx => (ctx.video ? { value: 'gemini', why: 'Claude cannot open video' } : undefined) };
    const s = F.suggestionFor(pt, { video: true }, 'claude', []);
    eq('a reasoned proposal', [s.value, s.why], ['gemini', 'Claude cannot open video']);
    eq('nothing to propose when the facts do not call for it', F.suggestionFor(pt, {}, 'claude', []), null);
    eq('nothing when it is already the value', F.suggestionFor(pt, { video: true }, 'gemini', []), null);
    eq('‼️ a turned-down proposal is not offered again', F.suggestionFor(pt, { video: true }, 'claude', [F.rejectKey('judge.video', 'gemini')]), null);
    eq('a point with no suggest proposes nothing', F.suggestionFor({ id: 'x' }, {}, 1, []), null);
}

/* ---------- DEAD ---------- */
{
    eq('Claude cannot open video — said, not hidden', F.deadReason('claude', ['video']), 'Claude cannot open video');
    eq('two needs it cannot meet, both named', F.deadReason('codex', ['video', 'audio']), 'Codex cannot open video or audio');
    eq('an engine that can is alive', F.deadReason('gemini', ['video']), '');
    eq('‼️ an engine nobody stated anything about is never greyed', F.deadReason('opencode', ['video']), '');
    eq('the host door is the same function', door.deadReason('claude', ['audio']), 'Claude cannot open audio');
}

/* ---------- the page renderers ---------- */
{
    const C = {
        esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
        option: (v, label, o) => `<option value="${v}"${o && o.selected ? ' selected' : ''}${o && o.disabled ? ' disabled' : ''}`
            + `${o && o.detail ? ` data-detail="${o.detail}"` : ''}>${label}</option>`
    };
    const opts = F.deadOptions([{ value: 'claude', label: 'Claude Code' }, { value: 'gemini', label: 'Gemini CLI' }], ['video'], 'gemini', C);
    ok('a dead option is disabled and carries its reason', /<option value="claude" disabled data-detail="Claude cannot open video">Claude Code — Claude cannot open video<\/option>/.test(opts));
    ok('a live one is not', /<option value="gemini" selected>Gemini CLI<\/option>/.test(opts));
    const chip = F.chip({ value: 'gemini', why: 'Claude cannot open video', key: 'judge.video="gemini"' }, C);
    ok('a chip offers accept and turn-down, the reason on hover', /title="Claude cannot open video"/.test(chip)
        && /data-flex-accept="&quot;gemini&quot;"/.test(chip) && /data-flex-reject=/.test(chip));
    eq('no suggestion, no chip', F.chip(null, C), '');

    // ‼️ REAL USE: the supervisor's "if it is not sure" box, drawn from the registry's tri states.
    const sandbox = { window: {} };
    for (const f of ['afFlex.js', 'afFlexForms.js', 'afSupervisor.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'), sandbox);
    }
    const html = sandbox.window.AFSupervisor.row({ engine: 'claude', lowConfidence: 'park' }, [], C);
    const sel = (html.match(/<select id="nt-supfallback">([\s\S]*?)<\/select>/) || [])[1] || '';
    eq('the box is a tri select: ask · auto · never, storing park · smart · stop',
        (sel.match(/value="(\w+)"/g) || []).map(s => s.slice(7, -1)), ['park', 'smart', 'stop']);
    ok('…each state named first', /ask me — hold, tell me/.test(sel) && /automatic — continue \(smart\)/.test(sel) && /never — no retry/.test(sel));
    ok('…the stored value selected', /<option value="park" selected/.test(sel));
    eq('…and it reads back unchanged', sandbox.window.AFSupervisor.read({}, id => (id === 'nt-supfallback' ? 'stop' : undefined)).lowConfidence, 'stop');
}

/* ---------- ‼️ REAL USE: the supervisor's money cap is a hard cap ---------- */
{
    const p = normalizeSupervisor({ engine: 'claude', budgetUsd: 1 });
    eq('under the cap, it may be asked', supervisorRefusal(p, { calls: 0, spentUsd: 0.99 }), '');
    ok('at the cap, it stops', /budget \(\$1\.00\) is spent/.test(supervisorRefusal(p, { calls: 0, spentUsd: 1 })));
    eq('no budget = no money cap', supervisorRefusal(normalizeSupervisor({ engine: 'claude' }), { calls: 0, spentUsd: 99 }), '');
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'retrySupervisor.ts'), 'utf8');
    // M-48 — the ceiling is the supervisors' shared core now; the cap is still capVerdict's, not a comparison of its own
    const core = fs.readFileSync(path.join(ROOT, 'src', 'core', 'decisionCore.ts'), 'utf8');
    ok('…decided by capVerdict, not a comparison of its own', /ceilingRefusal\(\{/.test(src) && /capVerdict\(\{ hard: c\.budgetUSD \}/.test(core));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
