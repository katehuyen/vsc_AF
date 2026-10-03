/**
 * S-122 — the "Chains" page, built from the REAL board (`chainBoard`) and the
 * REAL page builder (`chainsPageData`, `chainLegLines`), with the spread a busy
 * night has: a relay working at leg 13 of 29, one idle past the hang threshold,
 * one whose session nothing knows, one waiting too long, one parked on a reset,
 * one braked on its last leg, finished, stopped by the ceiling, failed, and one
 * the store keeps only as links. Titles in Turkish, as the user writes them.
 */
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'out', 'core');
const B = require(path.join(OUT, 'chainBoard.js'));
const P = require(path.join(OUT, 'chainsPage.js'));
const M = require(path.join(OUT, 'chainMembership.js'));

const T = Date.now();
const MIN = 60000;
const TH = { hangMs: 30 * MIN, waitMs: 30 * MIN };
let n = 0;
const from = (sessionId, agent = 'developer', projectId = 'prj_af') => ({ sessionId, agentId: 'D:/zone/agent/ajanlar/' + agent, engine: 'claude', cwd: 'D:\\zone', projectId, launchId: 'l' });
const bat = (chainId, hop, state, sid, to, age, extra = {}) => ({
    id: 'b' + (++n), chainId, hop, state, prompt: hop ? `Devir ${hop}: S-122 sayfasının tablosu bitti, sıradaki iş bacak şeridi ve çekimler.\nAyrıntılar worklog'da.` : '',
    why: extra.why || `${state} — leg ${hop + 1}`, from: from(sid, extra.agent, extra.projectId),
    inherit: { surface: 'console', model: 'opus', effort: 'xhigh' }, want: { surface: 'inherit', account: '@emptiest' },
    ...(to ? { toSessionId: to } : {}), createdAt: T - age, updatedAt: T - age, ...extra
});
/** A chain of `legs` started legs, leg i in session `${p}${i}`, each 40 minutes long, ending `age` ago. */
const chain = (id, p, legs, age, top, extra = {}) => {
    const out = [bat(id, 0, 'started', p + 1, p + 1, age + legs * 40 * MIN, { maxLegs: extra.maxLegs ?? 12, ...extra })];
    for (let h = 1; h < legs; h++) { out.push(bat(id, h, 'started', p + h, p + (h + 1), age + (legs - h) * 40 * MIN, extra)); }
    if (top) { out.push(bat(id, legs, top.state, p + legs, top.to, age, { ...extra, ...top })); }
    return out;
};

const batons = [
    ...chain('chn_night', 'n', 13, 2 * MIN, null, { maxLegs: 29 }),
    ...chain('chn_idle', 'i', 4, 75 * MIN, null, { agent: 'asistan', projectId: 'prj_life' }),
    ...chain('chn_ghost', 'g', 2, 9 * 24 * 60 * MIN, null),
    ...chain('chn_wait', 'w', 3, 50 * MIN, { state: 'waiting-end', why: 'waiting for session w3 to end — its card is still open' }),
    ...chain('chn_park', 'p', 5, 20 * MIN, { state: 'parked', wakeAt: T + 95 * MIN, why: 'parked: every account is full until the next reset' }, { agent: 'asistan', projectId: 'prj_life' }),
    ...chain('chn_last', 'l', 6, 10 * MIN, null, { lastLeg: { at: T - 5 * MIN, by: 'the user (Chains page)' } }),
    ...chain('chn_done', 'd', 7, 300 * MIN, { state: 'done', why: 'leg 7 wrote the handover note — the work is finished', prompt: '' }),
    ...chain('chn_ceil', 'c', 6, 600 * MIN, { state: 'stopped', brake: 'ceiling', why: 'the chain reached its ceiling of 6 legs' }, { maxLegs: 6 }),
    ...chain('chn_fail', 'f', 2, 900 * MIN, { state: 'failed', why: 'the crash-loop guard stopped the chain: three legs ended within minutes' })
];
// S-128 — the night's legs ended for every reason the record can hold: the context line, the quota line,
// a plan limit, the user's ⑂ Pass now, a failsafe rescue, a flagged conversation, an early pass
const night = h => batons.find(b => b.chainId === 'chn_night' && b.hop === h);
const cause = (kind, why) => ({ cause: { kind, quotaPct: 52, quotaFrom: 'agent-farm', why } });
const ENDS = {
    1: cause('context', 'the context window was at 41%, at or past the context handover line 40% (claude-kateanhkim at 52% of its five-hour window (Agent Farm))'),
    2: cause('quota', 'claude-murvietnam was at 91% of its five-hour window (Agent Farm), at or past the quota handover line 90%'),
    3: cause('limit', 'claude-hesap3 hit its plan limit'),
    5: cause('early', 'an early pass — no handover line was reached (claude-hesap3 at 52% of its five-hour window (Agent Farm), context 22%)'),
    6: { rescue: 'leg 6 ended without passing the baton: CONTEXT HANDOVER 41% had reached it; it left uncommitted changes' },
    7: { fault: 'flagged', ...cause('flagged', 'the engine flagged the conversation and Agent Farm passed for it (claude-kateanhkim at 30% of its five-hour window (Agent Farm))') }
};
for (let h = 1; h < 13; h++) { Object.assign(night(h), ENDS[h] || cause('context', `the context window was at 40%, at or past the context handover line 40% (leg ${h})`)); }
Object.assign(night(3), { passNow: { at: night(4).createdAt - MIN, by: 'the user (Console card)' } });
const SLOTS = ['claude-murvietnam', 'claude-kateanhkim', 'claude-hesap3'];
const slotOf = sid => (/^n\d+$/.test(sid) ? SLOTS[Number(sid.slice(1)) % 3] : undefined);

const links = [
    { chainId: 'chn_old', hop: 0, from: 'o1', to: 'o1', state: 'started', createdAt: T - 30 * 24 * 60 * MIN, updatedAt: T - 30 * 24 * 60 * MIN },
    { chainId: 'chn_old', hop: 1, from: 'o1', to: 'o2', state: 'started', createdAt: T - 29 * 24 * 60 * MIN, updatedAt: T - 29 * 24 * 60 * MIN },
    { chainId: 'chn_old', hop: 2, from: 'o2', state: 'done', createdAt: T - 29 * 24 * 60 * MIN, updatedAt: T - 29 * 24 * 60 * MIN }
];
const titles = { n1: 'Gece mesaisi: zincir yönetim sayfası (S-119)', i1: 'Haftalık plan ve takvim temizliği', w1: 'TalkScribe ZEN mağaza sürümü',
    p1: 'Fotoğraf arşivi etiketleme — Airtable', l1: 'Android eşlikçi: bildirim kanalları', d1: 'Kapıcı kural motoru denetimi',
    c1: 'Ses motoru karşılaştırması', f1: 'Bridge zaman aşımı araştırması', g1: 'Eski konsol yer tutucusuyla açılmış zincir' };
const facts = sid => {
    if (/^g2|^o/.test(sid)) { return undefined; }
    const p = sid[0];
    const i = Number(sid.slice(1));
    const alive = (p === 'n' && i === 13) || (p === 'i' && i === 4) || (p === 'l' && i === 6) || (p === 'w' && i === 3);
    return {
        alive, ...(p === 'i' && i === 4 ? { idleSince: T - 75 * MIN } : {}),
        title: titles[sid] || `${titles[p + 1] || 'Bacak'} — bacak ${i}`, agentName: p === 'i' || p === 'p' ? 'asistan' : 'developer',
        firstTs: T - (i + 1) * 40 * MIN, lastTs: T - i * 40 * MIN + 38 * MIN, cost: 4 + i * 1.7, tokens: 2.1e6 + i * 4e5
    };
};
const faults = [{ sessionId: 'w3', cardId: 'c', chainId: 'chn_wait', leg: 3, kind: 'outage', said: 'API Error: 529 overloaded', since: T - 12 * MIN, nudges: 2, state: 'waiting', why: 'nudging the leg every few minutes' }];
const projects = [{ id: 'prj_af', name: 'Agent Farm', icon: 'rocket', color: 'charts.blue' }, { id: 'prj_life', name: 'Hayat Planı', icon: 'heart', color: 'charts.purple' }];

const rows = (o = {}) => B.chainBoard({ batons: o.batons || batons, links: o.links || links, facts, faults, now: T, maxLegs: 6, thresholds: TH });
const data = (o = {}) => ({ ...P.chainsPageData(rows(o), o.batons || batons, TH, T), projects });
const legsOf = id => P.chainLegLines(M.chainIndex([...links, ...batons.map(M.linkOf)]), id, batons, facts, slotOf);
const openNight = r => { const row = r.query('.ch-row').find(e => e.dataset.chain === 'chn_night'); if (row) { row.click(); } r.send({ type: 'legs', chainId: 'chn_night', legs: legsOf('chn_night') }); };

module.exports = {
    script: 'chains.js',
    data,
    legsOf,
    batons: () => batons,
    variants: () => [
        { id: 'chains', label: 'Chains — every relay chain, one row each: running, idle past the threshold, known nowhere, waiting, parked, braked, done, stopped, failed, links only (S-122)', data: data() },
        { id: 'chains-legs', label: 'Chains — a running chain opened: its legs strip with each leg\'s run, cost and handover words', data: data(), act: openNight },
        { id: 'chains-leg-cause', label: 'Chains — a leg\'s number hover: why it ended (the user pressed Pass now) and the record it stands on (S-128)', data: data(), act: openNight, tip: 'ch-ln:4' },
        { id: 'chains-leg-account', label: 'Chains — a leg\'s title hover: its session, and the account rule it was placed by → the slot it ran on (S-128)', data: data(), act: openNight, tip: 'ch-lt:2' },
        {
            id: 'chains-continue', label: 'Chains — ↻ Continue pressed on a finished chain: the form under its row', data: data(),
            act: r => { const btn = r.query('[data-act="continue"]').find(e => e.dataset.chain === 'chn_done'); if (btn) { btn.click(); } }
        },
        {
            id: 'chains-attention', label: 'Chains — the ⚠ chip: only the chains that need attention, with a refusal said on the page', data: data(),
            act: r => { const c = r.query('[data-chip="attention"]')[0]; if (c) { c.click(); } r.send({ type: 'done', chainId: 'chn_ghost', ok: false, text: 'leg 2 of chain chn_ghost is running (its state is not known) — it passes at its own line; continue a chain whose leg is idle, gone or ended.' }); }
        },
        { id: 'chains-signals', label: 'Chains — a waiting chain\'s state hover: its record\'s reason, since when, and both signals (stuck wait, engine fault)', data: data(), tip: 'ch-st:3' },
        { id: 'chains-empty', label: 'Chains — no relay chain on record yet', data: data({ batons: [], links: [] }) }
    ]
};
