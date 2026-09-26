// M-13 — the task form's supervisor boxes (media/afSupervisor.js): text in the
// draft, a policy only where the user said something, and the same rule the
// host's normalizer applies (src/core/retrySupervisor.ts) on the way back.
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afSupervisor.js'), 'utf8'), sandbox);
const S = sandbox.window.AFSupervisor;
const { normalizeSupervisor, supervisorDraft } = require(path.join(ROOT, 'out', 'core', 'retrySupervisor.js'));

console.log('\n== the draft is text, and an untouched box says nothing ==');
{
    eq('blank', S.blank(), { engine: '', model: '', maxCalls: '', budgetUsd: '', minConfidence: '', lowConfidence: 'smart' });
    eq('no engine = no policy (the host makes that smart)', S.toPolicy(S.blank()), undefined);
    eq('only the engine named', S.toPolicy({ engine: 'codex' }), { engine: 'codex', lowConfidence: 'smart' });
    eq('every box said', S.toPolicy({ engine: 'claude', model: 'haiku', maxCalls: '3', budgetUsd: '0.5', minConfidence: '0.7', lowConfidence: 'park' }),
        { engine: 'claude', model: 'haiku', maxCalls: 3, budgetUsd: 0.5, minConfidence: 0.7, lowConfidence: 'park' });
    eq('a zero budget is no money cap, not a cap of zero', S.toPolicy({ engine: 'claude', budgetUsd: '0' }), { engine: 'claude', lowConfidence: 'smart' });
}

console.log('\n== a box out of range is refused where it was typed ==');
{
    ok('no engine', /engine/.test(S.error({})));
    ok('calls past 5', /1 to 5/.test(S.error({ engine: 'claude', maxCalls: '9' })));
    ok('confidence past 1', /0 to 1/.test(S.error({ engine: 'claude', minConfidence: '1.5' })));
    ok('a word for a budget', /budget/.test(S.error({ engine: 'claude', budgetUsd: 'lots' })));
    eq('a clean draft', S.error({ engine: 'claude', maxCalls: '2', minConfidence: '0.6' }), '');
    eq('a refused draft makes no policy', S.toPolicy({ engine: 'claude', maxCalls: '9' }), undefined);
}

console.log('\n== form -> host -> form is the same policy ==');
{
    const typed = { engine: 'gemini', model: 'flash', maxCalls: '4', budgetUsd: '1.25', minConfidence: '0.8', lowConfidence: 'stop' };
    const stored = normalizeSupervisor(S.toPolicy(typed));
    eq('the host keeps what the form sent', stored, { engine: 'gemini', model: 'flash', maxCalls: 4, budgetUsd: 1.25, minConfidence: 0.8, lowConfidence: 'stop' });
    eq('‼️ and it reopens as the same boxes', supervisorDraft(stored), typed);
    ok('every fallback the form offers is one the host accepts',
        S.FALLBACKS.every(f => normalizeSupervisor({ engine: 'x', lowConfidence: f[0] }).lowConfidence === f[0]));
}

console.log('\n== read takes only the boxes on the page ==');
{
    const page = { 'nt-supengine': 'codex', 'nt-supcalls': '3' };
    eq('absent boxes keep the draft', S.read({ model: 'kept' }, id => page[id]),
        { engine: 'codex', model: 'kept', maxCalls: '3', budgetUsd: '', minConfidence: '', lowConfidence: 'smart' });
    eq('six ids, one per box', S.IDS.length, 6);
}

console.log('\n== U-151: an empty box inherits Farm Settings, the same rule on both sides ==');
{
    const { retryRefusal, normalizeRetry, resolveRetry } = require(path.join(ROOT, 'out', 'core', 'retry.js'));
    const up = { engine: 'claude', maxCalls: 4 };
    eq('no engine here, one in Farm Settings: nothing wrong', S.error({}, up), '');
    ok('no engine anywhere: refused, naming both places', /Farm Settings/.test(S.error({}, {})));
    eq('only the boxes said travel, never the inherited engine', S.toPolicy({ minConfidence: '0.7' }, up), { minConfidence: 0.7, lowConfidence: 'smart' });
    eq('no engine anywhere is still no policy', S.toPolicy({ minConfidence: '0.7' }, {}), undefined);
    const task = { max: 1, behavior: 'supervisor', supervisor: S.toPolicy({ minConfidence: '0.7' }, up) };
    eq('the bridge accepts what the form accepts', retryRefusal(task, up), '');
    ok('and refuses what the form refuses', /Farm Settings/.test(retryRefusal(task, undefined)));
    const run = resolveRetry(normalizeRetry(task), normalizeRetry({ behavior: 'smart', supervisor: up }));
    eq('‼️ the run judges with the inherited engine', [run.behavior, run.supervisor.engine, run.supervisor.maxCalls, run.supervisor.minConfidence],
        ['supervisor', 'claude', 4, 0.7]);
}

console.log('\n== U-151: the boxes draw the inherited value faint, MIRROR first ==');
{
    const box = { window: {} };
    for (const f of ['afRecipes.js', 'afFlex.js', 'afFlexForms.js', 'afSupervisor.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'), box);
    }
    const W = box.window.AFSupervisor;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const C = {
        esc, option: (v, l, o) => `<option value="${esc(v)}"${(o || {}).selected ? ' selected' : ''}${(o || {}).disabled ? ' disabled' : ''}>${esc(l)}</option>`
    };
    const engines = [{ id: 'claude', label: 'Claude Code', ready: true }, { id: 'codex', label: 'Codex', ready: true }];
    const html = W.row(W.blank(), engines, C, { engine: 'claude', maxCalls: 4 });
    ok('the empty engine names the inherited one, choosable', /<option value="" selected>↳ Claude Code — Farm Settings<\/option>/.test(html));
    ok('and is drawn faint', /<select id="nt-supengine" class="inh">/.test(html));
    ok('an inherited box shows its value as the placeholder', /id="nt-supcalls" value="" placeholder="4 — Farm Settings"/.test(html));
    ok('MIRROR: the engine tip opens with the value and its origin', /title="claude — inherited from Farm Settings\n\nThe engine/.test(html));
    const own = W.row({ engine: 'codex' }, engines, C, { engine: 'claude' });
    ok('a chosen engine is not faint', /<select id="nt-supengine">/.test(own) && /title="codex — set on this task/.test(own));
    const bare = W.row(W.blank(), engines, C, null);
    ok('nothing inherited: the empty engine cannot be chosen', /<option value="" selected disabled>choose the engine that judges/.test(bare));
    eq('built-in when nothing says', [W.valueLine('maxCalls', '', {}), W.valueLine('budgetUsd', '', {})], ['2 — built-in', 'none — built-in']);
    const label = { t: 'old\n\nThe engine…', getAttribute() { return this.t; }, setAttribute(k, v) { this.t = v; } };
    const cls = new Set(['inh']);
    const el = { id: 'nt-supengine', value: 'codex', closest: () => label, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
    W.retitle(el, { engine: 'claude' });
    eq('‼️ the tip follows the control after a change', label.t, 'codex — set on this task\n\nThe engine…');
    ok('and the faint goes with the inheritance', !cls.has('inh'));
    el.value = ''; W.retitle(el, { engine: 'claude' });
    ok('back to inherited: faint again, origin named', cls.has('inh') && label.t.startsWith('claude — inherited from Farm Settings'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
