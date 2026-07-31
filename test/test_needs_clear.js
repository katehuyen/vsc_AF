// Needs You: the admission test (only rows that BLOCK the farm) and clearing
// (per row, by selection, all at once) with self-healing keys — plus the three
// bridge ops that expose the same behavior to agents.
'use strict';
const path = require('path');
const {
    buildNeedsQueue, blockingCount, needKey, isClearable, filterDismissedNeeds
} = require(path.join(__dirname, '..', 'out/core/needs.js'));
const { BridgeRegistry, need } = require(path.join(__dirname, '..', 'out/core/bridge.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const base = { liveSessions: [], approvals: [], insights: [] };
const permSession = (id, ts) => ({
    sessionId: id, agentName: 'dev', status: 'waiting-permission', lastEventTs: ts, transcriptPath: ''
});

// ---------- admission test: news never reaches the queue ----------
{
    const items = buildNeedsQueue({
        ...base,
        liveSessions: [
            permSession('s1', 1000),
            // an idle session is not a blocker — it used to be a "your turn" row
            { sessionId: 's2', agentName: 'dev', status: 'waiting-input', lastEventTs: 900, transcriptPath: '' }
        ],
        insights: [
            { severity: 'error', agentName: 'fleet', category: 'budget', message: 'Daily budget exceeded: $180 of $30.00 (599%).' },
            { severity: 'warning', agentName: 'dev', category: 'suggestion', message: 'rule?', suggestionId: 'sug1' },
            { severity: 'warning', agentName: 'dev', category: 'antigravity', message: 'drift', filePath: '/x/AGENTS.md', agentId: 'a1' }
        ]
    });
    const kinds = items.map(i => i.kind);
    ok('permission admitted', kinds.includes('permission'));
    ok('antigravity drift admitted (only a human clears it)', kinds.includes('conflict'));
    ok('budget is news, not work', !kinds.includes('budget'));
    ok('instruction suggestion is news', !kinds.includes('suggestion'));
    ok('idle session is news', !kinds.includes('your-turn'));
    ok('nothing but the two rows', items.length === 2);
    ok('a parked task cannot be expressed at all', !('deferredTasks' in buildNeedsQueue({ ...base })));
    ok('blocking count ignores the conflict row', blockingCount(items) === 1);
}

// ---------- keys are stable across renders, distinct per problem ----------
{
    const q = ts => buildNeedsQueue({ ...base, liveSessions: [permSession('s1', ts)] })[0];
    ok('key survives a changing timestamp', needKey(q(1000)) === needKey(q(9999)));
    const two = buildNeedsQueue({ ...base, liveSessions: [permSession('s1', 1), permSession('s2', 2)] });
    ok('two sessions, two keys', needKey(two[0]) !== needKey(two[1]));
    const stall = buildNeedsQueue({
        ...base,
        liveSessions: [{ sessionId: 's1', agentName: 'dev', status: 'stalled', lastEventTs: 5, transcriptPath: '' }]
    })[0];
    ok('same session, different problem, different key', needKey(stall) !== needKey(q(1)));
}

// ---------- clearability ----------
{
    const items = buildNeedsQueue({
        ...base,
        liveSessions: [permSession('s1', 1)],
        approvals: [{ id: 'ap1', title: 'open page', url: 'u', goal: 'g', createdAt: 2, kind: 'browser' }]
    });
    const approval = items.find(i => i.kind === 'browser-approval');
    ok('an approval holding a waiting agent is not clearable', !isClearable(approval));
    ok('a permission wait is clearable', isClearable(items.find(i => i.kind === 'permission')));
}

// ---------- filter: hide, count, and prune stale keys ----------
{
    const items = buildNeedsQueue({ ...base, liveSessions: [permSession('s1', 1), permSession('s2', 2)] });
    const k1 = needKey(items[0]);
    const r = filterDismissedNeeds(items, { [k1]: Date.now() });
    ok('cleared row is hidden', r.visible.length === 1 && needKey(r.visible[0]) !== k1);
    ok('hidden count is honest', r.hiddenCount === 1);
    ok('a key whose row still exists is not stale', r.staleKeys.length === 0);

    // ‼️ the self-healing rule: the condition ends → the key is reported stale →
    // the host drops it → the NEXT wait from the same session shows up again.
    const gone = filterDismissedNeeds(buildNeedsQueue({ ...base }), { [k1]: Date.now() });
    ok('condition over -> key goes stale', gone.staleKeys.length === 1 && gone.staleKeys[0] === k1);
    const returned = filterDismissedNeeds(items, {});
    ok('after pruning, the same session reappears', returned.visible.length === 2 && returned.hiddenCount === 0);

    // an uncleared approval can never be hidden, even if its key is in the store
    const withAp = buildNeedsQueue({
        ...base, approvals: [{ id: 'ap1', title: 't', url: 'u', goal: 'g', createdAt: 1, kind: 'browser' }]
    });
    const apKey = needKey(withAp[0]);
    const forced = filterDismissedNeeds(withAp, { [apKey]: Date.now() });
    ok('a stored key cannot hide a waiting approval', forced.visible.length === 1 && forced.hiddenCount === 0);
}

// ---------- bridge ops (needs.list / needs.clear / needs.restore) ----------
(async () => {
    const reg = new BridgeRegistry();
    let store = {};
    const raw = () => buildNeedsQueue({ ...base, liveSessions: [permSession('s1', 1), permSession('s2', 2)] });
    let hidden = 0;
    const visible = () => {
        const r = filterDismissedNeeds(raw(), store);
        for (const k of r.staleKeys) { delete store[k]; }
        hidden = r.hiddenCount;
        return r.visible;
    };
    reg.register([
        {
            op: 'needs.list', describe: 'the queue. args: none',
            handler: () => {
                const items = visible().map(i => ({ ...i, key: needKey(i), clearable: isClearable(i) }));
                return { items, blocking: blockingCount(items), hidden };
            }
        },
        {
            op: 'needs.clear', describe: 'hide rows. args: keys? | all?',
            handler: (a) => {
                const keys = Array.isArray(a.keys) ? a.keys.map(String).filter(Boolean) : undefined;
                need(keys?.length || a.all === true, 'Pass keys (string[]) or all:true.');
                const targets = a.all === true ? visible().filter(isClearable).map(needKey) : keys;
                let n = 0;
                for (const k of targets) { if (!store[k]) { store[k] = Date.now(); n++; } }
                return { cleared: n };
            }
        },
        {
            op: 'needs.restore', describe: 'unhide all. args: none',
            handler: () => { const n = Object.keys(store).length; store = {}; return { restored: n }; }
        }
    ]);

    const first = await reg.dispatch('needs.list', {});
    ok('needs.list returns rows with keys', first.ok && first.result.items.length === 2
        && first.result.items.every(i => typeof i.key === 'string' && i.clearable === true));

    const one = await reg.dispatch('needs.clear', { keys: [first.result.items[0].key] });
    ok('needs.clear hides one row', one.ok && one.result.cleared === 1);
    const after = await reg.dispatch('needs.list', {});
    ok('the list reflects it', after.result.items.length === 1 && after.result.hidden === 1);

    const all = await reg.dispatch('needs.clear', { all: true });
    ok('needs.clear all takes the rest', all.ok && all.result.cleared === 1);
    ok('page is empty', (await reg.dispatch('needs.list', {})).result.items.length === 0);

    const bad = await reg.dispatch('needs.clear', {});
    ok('needs.clear without args is refused', !bad.ok && /keys/.test(bad.error));

    const back = await reg.dispatch('needs.restore', {});
    ok('needs.restore brings both back', back.ok && back.result.restored === 2
        && (await reg.dispatch('needs.list', {})).result.items.length === 2);

    ok('all three ops are in the catalog', (await reg.dispatch('farm.ops', {}))
        .result.filter(o => o.op.startsWith('needs.')).length === 3);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
