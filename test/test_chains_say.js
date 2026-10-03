// U-189 — WHAT A CHAINS-PAGE PRESS CAME TO, IN THE INTERFACE LANGUAGE.
//
// What must not go wrong quietly: the English sentence a producer composes
// (continue, end, the brake, stop, start now) stays exactly what the bridge and
// the agents read; its `say` parts join back to that same English; every part's
// template has its Turkish, and the Turkish asks only for values the parts
// carry; and no bridge answer grows a `say`.
//
//   node test/test_chains_say.js
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const U = require(path.join(OUT, 'uiSentence.js'));
const K = require(path.join(OUT, 'chainControl.js'));
const L = require(path.join(OUT, 'batonLastLeg.js'));
const LO = require(path.join(OUT, 'batonLastLegOp.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const TR = require(path.join(ROOT, 'media', 'afI18n.tr.chains.js'));

// ---------- the parts ----------
{
    const p = [U.say('Chain {chain} stopped.', { chain: 'chn_1' }), U.say('Its session was closed.')];
    ok('say(): a template and its values as strings', p[0].key === 'Chain {chain} stopped.' && p[0].vars.chain === 'chn_1' && Object.keys(p[1].vars).length === 0);
    ok('sayText(): the parts filled and joined by one space', U.sayText(p) === 'Chain chn_1 stopped. Its session was closed.');
    const w = U.saidWhy('leg {leg} is gone', { leg: 3 });
    ok('saidWhy(): a refusal whose why is its say in English', w.ok === false && w.why === 'leg 3 is gone' && w.say[0].vars.leg === '3');
    ok('saidSentence(): a sentence from parts', U.saidSentence(...p).sentence === U.sayText(p));
}

// ---------- every producer path ----------
const NOW = 1790000000000, MIN = 60000;
const from = (sessionId) => ({ sessionId, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sessionId });
const mk = (id, hop, state, sid, to, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'words of ' + id, why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console', model: 'opus' }, want: { surface: 'inherit', account: '@pool' },
    ...(to ? { toSessionId: to } : {}), createdAt: NOW - 50 * MIN, updatedAt: NOW - 50 * MIN, ...extra
});
const seal = (max) => mk('s0', 0, 'started', 'L1', 'L1', { prompt: '(first leg)', maxLegs: max, createdAt: NOW - 90 * MIN });
const b1 = mk('b1', 1, 'started', 'L1', 'L2', { createdAt: NOW - 60 * MIN });
const done2 = mk('c2', 2, 'done', 'L2', undefined, { prompt: '', from: { ...from('L2'), launchId: '' }, createdAt: NOW - 10 * MIN, updatedAt: NOW - 10 * MIN });
const w3 = mk('w3', 2, 'waiting-end', 'L2', undefined, { createdAt: NOW - 5 * MIN, updatedAt: NOW - 5 * MIN });
const lists = [[], [seal(6), b1, done2], [seal(3), b1, done2], [b1, done2], [seal(6), b1, w3], [seal(6), b1],
    [seal(6), mk('b1', 1, 'started', 'L1', undefined, { createdAt: NOW - 60 * MIN })], [done2]];
const answers = [];
for (const list of lists) {
    for (const q of [{}, { running: 'working' }, { running: 'idle' }, { maxLegs: 'x' }, { maxLegs: 2 }, { prompt: 'mine' }, { fallbackMax: 3 }]) {
        answers.push(K.continueChain(list, { chainId: list.length ? 'chn_1' : '', by: 'the user', fallbackMax: 6, now: NOW, rnd: () => 0.5, ...q }));
    }
    for (const why of [undefined, 'done for now']) { answers.push(K.endChain(list, { chainId: 'chn_1', by: 'the user', why, now: NOW, rnd: () => 0.5 })); }
    for (const sid of ['', 'zzz', 'L1', 'L2']) { answers.push(L.setLastLeg(list, sid, true, 'u', NOW)); }
}
answers.push(LO.lastLegSaid(true, 2, 'chn_1'), LO.lastLegSaid(false, 2, 'chn_1'));
const texts = answers.filter(a => a.why !== undefined || a.sentence !== undefined);
const keys = new Set(texts.flatMap(a => (a.say || []).map(p => p.key)));
ok('every answer of continue, end and the brake carries its say', texts.every(a => Array.isArray(a.say) && a.say.length > 0));
ok('…which joins back to the very English the bridge returns', texts.every(a => U.sayText(a.say) === (a.sentence !== undefined ? a.sentence : a.why)));
ok('the paths walked reach every template these producers hold', keys.size >= 23);

// the page's and the host's own sentences (src/panels/chainsPanel.ts, the Chains page's deps in src/extension.ts)
const src = file => fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
const ext = src('extension.ts');
const deps = ext.slice(ext.indexOf('const chainsDeps: ChainsDeps'), ext.indexOf('onDidChange: chainsEmitter.event'));
for (const s of [src('panels/chainsPanel.ts'), deps]) {
    for (const m of s.matchAll(/(?:say|saidWhy)\('((?:[^'\\]|\\.)*)'/g)) { keys.add(m[1].replace(/\\'/g, '\'')); }
}
ok('the page\'s own sentences are found (stop ×3, start now ×2, session closed/kept)', keys.size >= 30);
const vars = k => [...k.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const missing = [...keys].filter(k => typeof TR[k] !== 'string');
ok('every template has its Turkish' + (missing.length ? ': ' + missing.join(' · ') : ''), missing.length === 0);
const strays = [...keys].filter(k => typeof TR[k] === 'string' && vars(TR[k]).some(v => !vars(k).includes(v)));
ok('a Turkish template asks only for values its English carries' + (strays.length ? ': ' + strays.join(' · ') : ''), strays.length === 0);

// ---------- the exact English, pinned where the parts changed its shape ----------
{
    const tail = K.continueChain([seal(3), b1, done2], { chainId: 'chn_1', by: 'the user', fallbackMax: 6, now: NOW, rnd: () => 0.5 });
    ok('continue with the ceiling tail reads as before', tail.sentence === 'Chain chn_1 reopened: leg 3 opens on its own setup once session L2 has ended.'
        + ' Leg 3 is the chain\'s last under its ceiling of 3; give maxLegs for more.' && tail.say.length === 2);
    const end = K.endChain([seal(6), b1, w3], { chainId: 'chn_1', by: 'the user', why: ' done for now ', now: NOW });
    ok('end with a reason reads as before, the reason trimmed', end.sentence === 'Chain chn_1 ended — its waiting successor was stopped (ended by the user: done for now).'
        + ' Session L2 keeps running unless you close it.' && end.say[0].vars.reason === 'done for now');
}

// ---------- the bridge answers stay as they were ----------
(async () => {
    const store = new BatonStore();
    store.put(seal(6), b1);
    const reg = new BridgeRegistry();
    LO.registerLastLegOp(reg, { store, now: () => NOW });
    const r = await reg.dispatch('baton.lastLeg', { session: 'L2', on: true });
    ok('baton.lastLeg answers its sentence and no say', r.ok && r.result.sentence === LO.lastLegSaid(true, 2, 'chn_1').sentence && !('say' in r.result));
    const no = await reg.dispatch('baton.lastLeg', { session: 'zzz' });
    ok('…and a refusal is its English why', !no.ok && /is not a leg of a baton relay/.test(no.error));
    console.log(`test_chains_say: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
