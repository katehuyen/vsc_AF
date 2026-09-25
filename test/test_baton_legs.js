// S-103 — A RUNNING CHAIN'S LEG CEILING, CHANGED AFTER IT STARTED.
//
// What must not go wrong quietly: the number is written where every pass reads
// it (the seal), so the ceiling brake follows it at once; it never drops below
// the leg that is running; an ended or seal-less chain is refused by name; the
// menu, the status bar and the op are one body; the card and the bar say it.
//
//   node test/test_baton_legs.js
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const G = require(path.join(OUT, 'batonLegs.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const { chainMaxLegs } = require(path.join(OUT, 'batonSeal.js'));
const V = require(path.join(OUT, 'batonView.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { registerLegsOp, applyChainLegs } = require(path.join(OUT, 'batonLegsOp.js'));

const NOW = 1790000000000;
const from = (sessionId) => ({ sessionId, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' });
const mk = (id, hop, state, sid, to, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w', from: from(sid),
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
    ...(to ? { toSessionId: to } : {}), createdAt: NOW - 5000, updatedAt: NOW - 5000, ...extra
});
const seal = mk('s0', 0, 'started', 'L1', 'L1', { maxLegs: 12 });
const b1 = mk('b1', 1, 'started', 'L1', 'L2');
const base = [seal, b1];
const draftOf = (sid, hop) => mk('d' + hop, hop, 'waiting-end', sid);

// ---------- where a chain stands ----------
{
    const r = G.chainLegs(base, 'chn_1', 6);
    ok('a running chain: leg 2 of its own 12, floor 2, the running session', r.ok && r.legs.leg === 2 && r.legs.max === 12
        && r.legs.own && r.legs.min === 2 && r.legs.sessionId === 'L2' && r.legs.lastLeg === false && r.seal.id === 's0');
    const bare = G.chainLegs([{ ...seal, maxLegs: undefined }, b1], 'chn_1', 6);
    ok('no number of its own: the setting\'s, and it says so', bare.ok && bare.legs.max === 6 && !bare.legs.own
        && /the setting's ceiling/.test(G.legsTitle(bare.legs)));
    ok('the title is the MIRROR line', G.legsTitle(r.legs) === 'Chain chn_1 — leg 2 of 12');
    const waiting = G.chainLegs([...base, mk('p2', 2, 'waiting-end', 'L2')], 'chn_1', 6);
    ok('a successor waiting: the leg it opens, no running session', waiting.ok && waiting.legs.leg === 3 && waiting.legs.min === 3 && !waiting.legs.sessionId);
    const braked = G.chainLegs([seal, { ...b1, lastLeg: { by: 'u', at: NOW } }], 'chn_1', 6);
    ok('a braked leg is read as last', braked.ok && braked.legs.lastLeg && / · last leg$/.test(G.legsTitle(braked.legs)));
    const none = G.chainLegs(base, 'chn_404', 6);
    ok('an unknown chain: refused, pointing at baton.status', !none.ok && /no chain chn_404 — baton\.status/.test(none.why));
    const unsealed = G.chainLegs([b1], 'chn_1', 6);
    ok('a chain with no seal: refused, naming the setting', !unsealed.ok && /no seal.*agentFarm\.batonMaxHops/.test(unsealed.why));
    const ended = G.chainLegs([...base, mk('e2', 2, 'done', 'L2')], 'chn_1', 6);
    ok('an ended chain: refused with its state', !ended.ok && /has ended \(done: w\)/.test(ended.why));
}

// ---------- the number ----------
ok('a typed number is read', (() => { const p = G.parseLegs(' 15 ', 2); return p.ok && p.n === 15; })());
ok('0 is no ceiling', (() => { const p = G.parseLegs('0', 9); return p.ok && p.n === 0; })());
ok('the floor is allowed: it makes the running leg the last', (() => { const p = G.parseLegs(2, 2); return p.ok && p.n === 2; })());
ok('below the floor: refused, naming the leg and ⑂⊣', (() => { const p = G.parseLegs(1, 2); return !p.ok && /leg 2 is already running — the lowest ceiling is 2/.test(p.why) && /⑂⊣/.test(p.why); })());
for (const bad of ['', 'x', '2.5', -1, null, undefined]) {
    ok(`not a whole number (${JSON.stringify(bad)}): refused`, !G.parseLegs(bad, 1).ok);
}

// ---------- setting it ----------
{
    const up = G.setChainLegs(base, 'chn_1', 15, 6);
    ok('raised: only the seal\'s maxLegs moves, updatedAt untouched', up.ok && up.changed && up.before === 12 && up.seal.id === 's0'
        && up.seal.maxLegs === 15 && up.seal.updatedAt === seal.updatedAt && up.seal.state === 'started'
        && up.sentence === 'Chain chn_1: 12 legs → 15 legs — leg 2 is running; the next pass reads the new ceiling.');
    const same = G.setChainLegs(base, 'chn_1', '12', 6);
    ok('the same number again changes nothing', same.ok && !same.changed);
    const adopt = G.setChainLegs([{ ...seal, maxLegs: undefined }, b1], 'chn_1', 6, 6);
    ok('the setting\'s number written as its own IS a change (it stops following the setting)', adopt.ok && adopt.changed && adopt.seal.maxLegs === 6);
    const last = G.setChainLegs(base, 'chn_1', 2, 6);
    ok('down to the floor: the sentence says the running leg is now the last', last.ok && /leg 2 is now its last — its pass opens nothing\.$/.test(last.sentence));
    const free = G.setChainLegs(base, 'chn_1', 0, 6);
    ok('0: no ceiling, said in words', free.ok && free.seal.maxLegs === 0 && /12 legs → no ceiling — it runs until the work is done/.test(free.sentence));
    const low = G.setChainLegs(base, 'chn_1', 1, 6);
    ok('below the floor: refused with the chain named', !low.ok && /^chain chn_1: leg 2 is already running/.test(low.why));

    // ‼️ the brake reads the new number at the next pass — that is the whole feature
    const at2 = [up.seal, b1];
    ok('the seal is where every pass reads it', chainMaxLegs(at2, 'chn_1', 6) === 15);
    const tight = [G.setChainLegs(base, 'chn_1', 2, 6).seal, b1];
    const k = batonBrake(draftOf('L2', 2), tight, chainMaxLegs(tight, 'chn_1', 6));
    ok('‼️ lowered to the running leg: its pass is braked by the ceiling', k && k.kind === 'ceiling' && /has run 2 of its 2 legs/.test(k.why));
    ok('‼️ raised again: the same pass opens', batonBrake(draftOf('L2', 2), at2, chainMaxLegs(at2, 'chn_1', 6)) === undefined);
    const off = [free.seal, b1];
    ok('no ceiling: even leg 99 opens', batonBrake(draftOf('L2', 99), off, chainMaxLegs(off, 'chn_1', 6)) === undefined);
}

// ---------- the menu ----------
{
    const l = G.chainLegs(base, 'chn_1', 6).legs;
    const c = G.legsChoices(l);
    const n = c.filter(x => typeof x.n === 'number').map(x => x.n);
    ok('12 of 12 at leg 2: +1, +3, −1, no ceiling', JSON.stringify(n) === '[13,15,11,0]');
    ok('each row says the ceiling it moves to', c[0].detail === 'ceiling 12 legs → 13 legs' && c.find(x => x.n === 0).detail === 'ceiling 12 legs → no ceiling');
    ok('a number can be typed, its floor named', c.some(x => x.act === 'type' && /^2 or more — 0 for no ceiling$/.test(x.detail)));
    ok('the running leg can be made the last from the same menu', c.some(x => x.act === 'lastLeg' && /leg 2 writes the handover note/.test(x.detail)));
    const floor = G.legsChoices({ ...l, max: 2 });
    ok('at the floor there is no −1', !floor.some(x => /fewer/.test(x.label)));
    const free = G.legsChoices({ ...l, max: 0 });
    ok('no ceiling: +1/+3 count from the leg it is on, and no "no ceiling" row', JSON.stringify(free.filter(x => typeof x.n === 'number').map(x => x.n)) === '[3,5]');
    ok('a braked leg offers the release instead', G.legsChoices({ ...l, lastLeg: true }).some(x => x.act === 'release'));
    ok('nothing running: no last-leg row', !G.legsChoices({ ...l, sessionId: undefined }).some(x => x.act === 'lastLeg' || x.act === 'release'));
}

// ---------- the card and the bar say it ----------
{
    const card = V.batonCardView(base, 'L2', 6);
    ok('the card carries the ceiling and where to change it', card.max === 12 && card.lines.some(x => /^Ceiling: 12 legs — change it: right-click ⑂⊣/.test(x)));
    ok('a caller that gives no setting gets the card it always got', !('max' in V.batonCardView(base, 'L2')));
    const bar = V.batonBarView(base, 6, () => true);
    ok('the bar reads the chain\'s own ceiling and says a click changes it', bar.text === '⑂ 2/12' && /Click: the chain's legs .*baton\.setLegs chain=chn_1/.test(bar.tooltip));
    const js = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('the ⑂⊣ button carries its own right-click section', /AFCtx\.obj\('afConsoleLastLeg', \{ afChainId: v\.chainId, afSessionId: s\.sessionId \}\)/.test(js));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    ok('the command is contributed', pkg.contributes.commands.some(x => x.command === 'agentfarm.batonLegs' && x.title === 'Chain Legs…'));
    ok('and drawn on the ⑂⊣ right-click', pkg.contributes.menus['webview/context'].some(x => x.command === 'agentfarm.batonLegs' && /afConsoleLastLeg/.test(x.when)));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the status bar opens the legs menu for its chain', /batonBar\.command = \{ command: 'agentfarm\.batonLegs'.*arguments: \[\{ chainId: v\.chainId \}\]/.test(ext));
}

// ---------- the op ----------
(async () => {
    const store = new BatonStore();
    store.put(...base);
    let repainted = 0;
    const deps = { store, fallback: () => 6, changed: () => { repainted++; } };
    const reg = new BridgeRegistry();
    registerLegsOp(reg, deps);
    const d = (args) => reg.dispatch('baton.setLegs', args);
    const read = await d({ chain: 'chn_1' });
    ok('without a number it only reads', read.ok && read.result.leg === 2 && read.result.max === 12 && read.result.min === 2 && repainted === 0);
    const bySession = await d({ session: 'L2', maxLegs: 14 });
    ok('session= finds its chain; maxLegs= is stored on the seal and repaints', bySession.ok && bySession.result.changed && bySession.result.before === 12
        && store.get('s0').maxLegs === 14 && repainted === 1);
    const typed = await d({ chain: 'chn_1', maxLegs: '16' });
    ok('a typed maxLegs (the CLI\'s word) is read', typed.ok && store.get('s0').maxLegs === 16);
    const add = await d({ chain: 'chn_1', add: -3 });
    ok('add= moves it from where it is', add.ok && store.get('s0').maxLegs === 13);
    const same = await d({ chain: 'chn_1', maxLegs: 13 });
    ok('the same number: answered, not stored, not repainted', same.ok && !same.result.changed && repainted === 3);
    const low = await d({ chain: 'chn_1', maxLegs: 1 });
    ok('below the floor: refused through the op too', !low.ok && /leg 2 is already running/.test(low.error) && store.get('s0').maxLegs === 13);
    const badAdd = await d({ chain: 'chn_1', add: 'x' });
    ok('a broken add= is refused by name', !badAdd.ok && /add must be a whole number/.test(badAdd.error));
    const nobody = await d({});
    ok('no chain and no session: refused, naming both', !nobody.ok && /say which: chain/.test(nobody.error));
    const stranger = await d({ session: 'nobody' });
    ok('a session in no relay: refused by name', !stranger.ok && /session nobody runs no leg of a relay/.test(stranger.error));
    ok('the legs menu calls the same body', applyChainLegs(deps, 'chn_1', 20).ok && store.get('s0').maxLegs === 20);
    const ops = await reg.dispatch('farm.ops', {});
    const listed = ops.ok && JSON.stringify(ops.result).includes('baton.setLegs');
    ok('baton.setLegs is in the catalogue', listed);

    console.log(`test_baton_legs.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
