// Insights lifecycle: key stability, dismiss filter, delegation prompt/title,
// mechanical-fix map, opt-in auto-delegation picker (pure core module).
'use strict';
const path = require('path');
const {
    insightKey, filterDismissed, FIX_COMMANDS,
    buildDelegationPrompt, delegationTitle, pickAutoDelegates
} = require(path.join(__dirname, '..', 'out/core/insightops.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const mk = (over) => Object.assign({
    severity: 'warning', agentId: 'a1', agentName: 'psikolog',
    category: 'cost-anomaly', message: 'cost is 4.2x of normal ($3.20 today)',
    guideAnchor: 'maliyet-anomalisi'
}, over);

// ---------- insightKey: identity survives volatile message text ----------
ok('key ignores volatile message numbers',
    insightKey(mk({ message: 'cost is 9.9x of normal ($12 today)' })) === insightKey(mk({})));
ok('key separates categories',
    insightKey(mk({ category: 'trend' })) !== insightKey(mk({})));
ok('key separates agents',
    insightKey(mk({ agentId: 'a2' })) !== insightKey(mk({})));
ok('key separates files within a category',
    insightKey(mk({ category: 'stale-memory', filePath: 'D:/m/a.md' }))
    !== insightKey(mk({ category: 'stale-memory', filePath: 'D:/m/b.md' })));
ok('fleet-level insights key on *',
    insightKey(mk({ agentId: undefined })).startsWith('*|'));

// ---------- filterDismissed ----------
{
    const NOW = 1_800_000_000_000;
    const a = mk({}), b = mk({ category: 'trend' }), c = mk({ category: 'duties' });
    const dismissed = {
        [insightKey(a)]: { until: NOW + 1000, label: 'a' },   // active
        [insightKey(b)]: { until: 0, label: 'b' },            // forever
        [insightKey(c)]: { until: NOW - 1000, label: 'c' }    // expired
    };
    const res = filterDismissed([a, b, c], dismissed, NOW);
    ok('active + forever hidden, expired visible',
        res.visible.length === 1 && res.visible[0].category === 'duties');
    ok('dismissed count honest', res.dismissedCount === 2);
    ok('expired keys reported for pruning',
        res.expiredKeys.length === 1 && res.expiredKeys[0] === insightKey(c));
    const res2 = filterDismissed([a, b, c], {}, NOW);
    ok('empty store hides nothing', res2.visible.length === 3 && res2.dismissedCount === 0);
}

// ---------- FIX_COMMANDS map ----------
ok('memory-index maps to fixMemoryIndex',
    FIX_COMMANDS['memory-index'].command === 'agentfarm.fixMemoryIndex' && FIX_COMMANDS['memory-index'].agentScoped);
ok('duplicate-memory maps to syncMemory (fleet-wide)',
    FIX_COMMANDS['duplicate-memory'].command === 'agentfarm.syncMemory' && !FIX_COMMANDS['duplicate-memory'].agentScoped);
ok('stale/large memory map to distill',
    FIX_COMMANDS['stale-memory'].command === 'agentfarm.distillMemory'
    && FIX_COMMANDS['large-memory'].command === 'agentfarm.distillMemory');
ok('cost-anomaly has NO mechanical fix (delegate/dismiss instead)',
    FIX_COMMANDS['cost-anomaly'] === undefined);

// ---------- delegation prompt / title ----------
{
    const p = buildDelegationPrompt([
        mk({ category: 'stale-memory', filePath: 'D:/ajan/memory/eski.md', message: 'memory file stale for 45 days' }),
        mk({ severity: 'error', category: 'duties', message: 'duty overdue' })
    ]);
    ok('prompt numbers the findings', p.includes('1. [WARNING · stale-memory]') && p.includes('2. [ERROR · duties]'));
    ok('prompt carries the file path', p.includes('D:/ajan/memory/eski.md'));
    ok('prompt demands read-before-change', /OKU/.test(p));
    ok('prompt forbids unsafe changes', /YAPMA/.test(p));
    ok('prompt demands a what-was-done report', /ne düzeltildi/.test(p));
    ok('single title names the category', delegationTitle([mk({})]) === 'Insight: cost-anomaly');
    const multi = delegationTitle([mk({}), mk({ category: 'trend' }), mk({ category: 'duties' }), mk({ category: 'mcp' })]);
    ok('multi title lists categories + count', multi.includes('(4)') && multi.includes('cost-anomaly'));
}

// ---------- pickAutoDelegates ----------
{
    const NOW = 1_800_000_000_000;
    const w1 = mk({ category: 'duties' });
    const w2 = mk({ category: 'guardrail', agentId: 'a2', agentName: 'dev' });
    const info = mk({ severity: 'info', category: 'duties', agentId: 'a3' });
    const offCat = mk({ category: 'trend' });
    ok('empty category list -> nothing', pickAutoDelegates([w1, w2], [], {}, NOW).length === 0);
    const picks = pickAutoDelegates([w1, w2, info, offCat], ['duties', 'guardrail'], {}, NOW);
    ok('enabled warnings picked, info + off-category skipped',
        picks.length === 2 && picks.includes(w1) && picks.includes(w2));
    const cooled = pickAutoDelegates([w1, w2], ['duties', 'guardrail'],
        { [insightKey(w1)]: NOW - 3600 * 1000 }, NOW);
    ok('cooldown suppresses the recently delegated one', cooled.length === 1 && cooled[0] === w2);
    const again = pickAutoDelegates([w1], ['duties'],
        { [insightKey(w1)]: NOW - 25 * 3600 * 1000 }, NOW);
    ok('cooldown expires after 24h', again.length === 1);
    ok('duplicate keys picked once',
        pickAutoDelegates([w1, mk({ category: 'duties', message: 'other text' })], ['duties'], {}, NOW).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
