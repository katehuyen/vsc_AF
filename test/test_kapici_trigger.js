// M-59 — Kapıcı as a trigger's precondition: off / shadow / on, the rule's
// onFailure, the cheap brakes before it, and no second firing while it is asked.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const ROOT = path.join(__dirname, '..');
const warnings = [];
class FakeEmitter { constructor() { this.l = []; this.event = f => { this.l.push(f); return { dispose() { } }; }; } fire(v) { this.l.forEach(f => f(v)); } dispose() { } }
const fakeVscode = {
    EventEmitter: FakeEmitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: m => { warnings.push(m); return Promise.resolve(undefined); }
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const A = require(path.join(ROOT, 'out/core/automation.js'));
const K = require(path.join(ROOT, 'out/core/kapiciTrigger.js'));
const { TriggerManager } = require(path.join(ROOT, 'out/core/triggers.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-trigger-'));
const verdict = o => Object.assign({ passed: true, decision: 'pass', confidence: 0.9, answers: {}, reason: 'work p=0.90',
    provider: 'jev', latencyMs: 1, ruleId: 'trigger.has-work', ruleVersion: 1, layer: 'builtin' }, o);
const hostOf = (mode, v, calls) => ({
    mode, log: () => { },
    evaluate: async (rule, state, m, actual) => {
        calls.push({ rule, state, m, actual });
        if (v instanceof Error) { throw v; }
        return typeof v === 'function' ? v() : v;
    }
});

(async () => {
    console.log('\n== the precondition: a trigger kind only, the four old kinds untouched ==');
    {
        const olds = [
            { kind: 'folderHasFiles', path: 'D:/in', except: ['_LOG_.md'], minCount: 2, recursive: false },
            { kind: 'fileMissing', path: 'D:/d/{today}.md' },
            { kind: 'pathChangedWithin', path: 'D:/x', hours: 6 },
            { kind: 'queueHasWork', minCount: 3 }
        ];
        for (const o of olds) {
            eq(`${o.kind} parses the same for a trigger`, A.parsePrecondition(o, { kapici: true }), A.parsePrecondition(o));
        }
        eq('a schedule cannot take it', A.parsePrecondition({ kind: 'kapici' }), undefined);
        eq('a trigger can, with nothing more', A.parsePrecondition({ kind: 'kapici' }, { kapici: true }), { kind: 'kapici' });
        eq('its rule and input are kept', A.parsePrecondition({ kind: 'kapici', rule: ' my.noise-rule ', input: 'diff', path: 'ignored' }, { kapici: true }),
            { kind: 'kapici', rule: 'my.noise-rule', input: 'diff' });
        eq('a malformed rule is refused, not dropped', A.parsePrecondition({ kind: 'kapici', rule: 'two words' }, { kapici: true }), undefined);
        eq('an unknown input is refused', A.parsePrecondition({ kind: 'kapici', input: 'tree' }, { kapici: true }), undefined);
        const v = A.evaluatePrecondition({ kind: 'kapici' });
        ok('the synchronous check passes it on and names the rule', v.ok && /trigger\.has-work/.test(v.detail));
        eq('the table names it', A.describePrecondition({ kind: 'kapici', rule: 'my.rule', input: 'diff' }), 'Gatekeeper my.rule (diff)');
    }

    console.log('\n== the firing is the state ==');
    {
        const f = path.join(tmp, 'gorev.md');
        fs.writeFileSync(f, 'Ödeme hatırlatmalarını gönder');
        const ctx = { title: 'inbox', reason: 'watch change', file: f, watch: tmp };
        const s1 = await K.triggerState({ kind: 'kapici' }, ctx);
        ok('file: the changed file\'s content', s1.content === 'Ödeme hatırlatmalarını gönder' && s1.file === 'gorev.md' && s1.trigger === 'inbox');
        const s2 = await K.triggerState({ kind: 'kapici', input: 'diff' }, ctx, async () => '+Ödeme');
        ok('diff: the diff, and no content beside it', s2.diff === '+Ödeme' && s2.content === undefined);
        const s3 = await K.triggerState({ kind: 'kapici', input: 'diff' }, ctx, async () => '');
        ok('diff with nothing to show: the content', s3.content === 'Ödeme hatırlatmalarını gönder' && s3.diff === undefined);
        const s4 = await K.triggerState({ kind: 'kapici', input: 'diff' }, ctx, async () => { throw new Error('no git'); });
        ok('a failing diff falls to the content', s4.content === 'Ödeme hatırlatmalarını gönder');
        const s5 = await K.triggerState({ kind: 'kapici' }, { title: 'w', reason: 'webhook', payload: { a: 1 } });
        eq('a webhook: its payload, no file', s5, { trigger: 'w', event: 'webhook', payload: { a: 1 } });
        const s6 = await K.triggerState({ kind: 'kapici' }, { title: 'w', reason: 'watch change', watch: tmp });
        ok('a folder has no content to read', s6.path === tmp && s6.content === undefined);
    }

    console.log('\n== off · shadow · on, and the rule\'s onFailure ==');
    {
        const pre = { kind: 'kapici' };
        const ctx = { title: 'inbox', reason: 'watch change' };
        let calls = [];
        let r = await K.kapiciFiring(pre, ctx, undefined);
        ok('no host (off): fires as if there were no precondition', r.fire && r.by === 'today' && /off/.test(r.detail));
        r = await K.kapiciFiring(pre, ctx, hostOf('off', verdict({ passed: false }), calls));
        ok('off: fires, and Gatekeeper is never called', r.fire && calls.length === 0);
        r = await K.kapiciFiring(pre, ctx, hostOf('shadow', verdict({ passed: false, decision: 'reject' }), calls));
        ok('shadow: fires even when Gatekeeper would not', r.fire && r.by === 'today');
        await r.shadow;
        ok('shadow: Gatekeeper is asked beside it with today\'s decision', calls.length === 1 && calls[0].m === 'shadow' && calls[0].actual === 'pass');
        calls = [];
        r = await K.kapiciFiring({ kind: 'kapici', rule: 'my.rule' }, ctx, hostOf('on', verdict({}), calls));
        ok('on, work: fires by Gatekeeper, asking the precondition\'s own rule', r.fire && r.by === 'kapici' && calls[0].rule === 'my.rule' && calls[0].m === 'on');
        r = await K.kapiciFiring(pre, ctx, hostOf('on', verdict({ passed: false, decision: 'reject', reason: 'work p=0.10' }), calls));
        ok('on, no work: skipped, and the reason names the rule', !r.fire && r.by === 'kapici' && /^Gatekeeper: trigger\.has-work — no work \(work p=0\.10; confidence 0\.90\)$/.test(r.detail));
        r = await K.kapiciFiring(pre, ctx, hostOf('on', verdict({ passed: false, decision: 'closed', fallback: 'closed', confidence: 0, reason: 'jev failed (no-key)' }), calls));
        ok('on, a failure the rule closes: skipped', !r.fire && /no-key/.test(r.detail));
        r = await K.kapiciFiring(pre, ctx, hostOf('on', verdict({ passed: true, decision: 'open', fallback: 'open', confidence: 0 }), calls));
        ok('on, a failure the rule opens: fires', r.fire && r.by === 'today');
        r = await K.kapiciFiring(pre, ctx, hostOf('on', verdict({ passed: false, decision: 'fallback', fallback: 'fallback', confidence: 0 }), calls));
        ok('on, no rule / the caller\'s path: fires', r.fire);
        r = await K.kapiciFiring(pre, ctx, hostOf('on', verdict({ passed: false, decision: 'reject', fallback: 'mechanical', confidence: 0.3 }), calls));
        ok('on, not sure: fires, as without it', r.fire && /could not decide/.test(r.detail));
        r = await K.kapiciFiring(pre, ctx, hostOf('on', new Error('boom'), calls));
        ok('on, Gatekeeper throws: fires', r.fire && r.by === 'today');
    }

    console.log('\n== the brakes come first, and a pending question holds the next firing ==');
    {
        const skips = [];
        let gateBlock;
        const trig = {
            id: 't1', title: 'gelen', type: 'webhook', token: 'tok', enabled: true, debounceSec: 1, cooldownSec: 60, maxPerHour: 2,
            recentFirings: [], fireIf: { kind: 'kapici' }, action: { kind: 'task', agentId: 'a', title: 'x', prompt: 'p', mode: 'headless' }
        };
        const plain = Object.assign({}, trig, { id: 't2', title: 'düz', token: 'tok2', fireIf: undefined });
        const mgr = {
            triggers: [trig, plain], workflows: [], outputsDir: path.join(tmp, 'out'),
            onDidChange: () => ({ dispose() { } }),
            automationGate: () => gateBlock,
            checkPrecondition: p => A.evaluatePrecondition(p),
            markTriggerSkipped: (t, r) => skips.push(r),
            markTriggerFired: () => { }
        };
        let calls = [];
        let release;
        let answer = verdict({});
        const host = {
            mode: 'on', log: () => { },
            evaluate: (rule, state, m, actual) => { calls.push({ rule, m, actual }); return new Promise(res => { release = () => res(answer); }); }
        };
        let current = host;
        const tm = new TriggerManager(mgr, () => [], undefined, undefined, () => current);
        const fired = [];
        tm.fire = (t, reason) => { fired.push(t.id + ':' + reason); return true; };
        const settle = () => new Promise(r => setTimeout(r, 20));

        trig.lastFiredAt = Date.now();
        ok('cooldown: refused before Gatekeeper', tm.tryFire(trig, 'webhook') === false && calls.length === 0);
        trig.lastFiredAt = undefined;
        trig.recentFirings = [Date.now(), Date.now()];
        ok('hourly cap: refused before Gatekeeper', tm.tryFire(trig, 'webhook') === false && calls.length === 0 && warnings.length === 1);
        trig.recentFirings = [];
        gateBlock = { kind: 'quiet', reason: 'quiet hours (23:30–04:30)' };
        ok('the farm gate: skipped before Gatekeeper, with its reason', tm.tryFire(trig, 'webhook') === false && calls.length === 0 && skips[0] === 'quiet hours (23:30–04:30)');
        gateBlock = undefined;

        ok('the brakes passed: accepted, Gatekeeper asked', tm.tryFire(trig, 'webhook') === true);
        await settle();
        ok('…once', calls.length === 1 && calls[0].m === 'on');
        ok('a second firing while it is asked: skipped, and says why', tm.tryFire(trig, 'webhook') === false && skips[1] === 'Gatekeeper is still deciding the previous firing');
        await settle();
        ok('…and never asks twice', calls.length === 1 && fired.length === 0);
        release(); await settle();
        eq('work: the trigger fires once', fired, ['t1:webhook']);

        answer = verdict({ passed: false, decision: 'reject', reason: 'work p=0.05' });
        ok('the next firing is asked again', tm.tryFire(trig, 'webhook') === true);
        await settle(); release(); await settle();
        ok('no work: skipped, never fired, the reason recorded', fired.length === 1 && /^Gatekeeper: trigger\.has-work — no work/.test(skips[2]));

        answer = verdict({});
        tm.tryFire(trig, 'webhook'); await settle();
        trig.enabled = false; release(); await settle();
        ok('a trigger switched off while Gatekeeper was asked neither fires nor skips', fired.length === 1 && skips.length === 3);
        trig.enabled = true;

        calls = [];
        ok('a trigger with no Gatekeeper precondition fires at once, Gatekeeper untouched', tm.tryFire(plain, 'webhook') === true && fired[1] === 't2:webhook' && calls.length === 0);
        current = undefined;
        tm.tryFire(trig, 'webhook'); await settle();
        ok('Gatekeeper off: the precondition fires as if it were not there', fired[2] === 't1:webhook' && calls.length === 0);
        tm.dispose();
    }

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
