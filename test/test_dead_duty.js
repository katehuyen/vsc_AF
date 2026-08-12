// Dead-duty detection (compiled core/health.js): a standing duty that is
// written down, timed, and driven by NOTHING. An [every-turn] duty is passive
// by design — it is only checked while the agent already happens to be running —
// so a [daily]/[weekly] duty with no schedule or trigger behind it never
// actually happens. The duties reference warns about exactly this; nothing
// checked for it until now.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { dutyIsWired, buildInsights } = require(path.join(__dirname, '..', 'out', 'core', 'health.js'));

// ---------- dutyIsWired ----------
{
    const autos = [
        'AGENT_AREA filing — daily batch  apply the filing procedure',
        'nightly sweep  DUTIES.md: apply the TODO cycle health check duty'
    ];
    ok('a duty named in an automation title is wired', dutyIsWired('AGENT_AREA filing', autos));
    ok('a duty named only in the PROMPT is wired', dutyIsWired('TODO cycle health check', autos));
    ok('an unmentioned duty is NOT wired', dutyIsWired('AI landscape — weekly deep dive', autos) === false);
    ok('matching ignores case', dutyIsWired('agent_area FILING', autos));
    ok('surrounding whitespace is tolerated', dutyIsWired('  AGENT_AREA filing  ', autos));
    ok('an empty duty title never reports dead', dutyIsWired('', autos));
    ok('no automations at all means nothing is wired', dutyIsWired('anything', []) === false);
}

// ---------- the insight ----------
const agent = (duties) => ({
    id: 'a1', name: 'manager', dir: 'D:/x', duties,
    dutiesPath: 'D:/x/DUTIES.md', claudeMdPath: undefined,
    contextLoad: { total: 0 }, memoryFiles: [], skills: [], mcpServers: [],
    sessions: []
});
// `external` is what the cost insights ask for when they state their scope
// (X-35): a "fleet" money figure now says how many sessions on other engines it
// leaves out. Nothing here has any, so the note is empty and nothing changes.
const index = {
    all: () => [], forAgent: () => [], external: () => [], externalForAgent: () => [],
    windowUsage: () => ({ tokens: 0 })
};
const base = { staleMemoryDays: 45, contextBudgetTokens: 999999, permissionLint: false };
const dutyInsights = (duties, automationTitles) =>
    buildInsights([agent(duties)], index, { ...base, automationTitles })
        .filter(i => i.category === 'duties' && /nothing drives it/.test(i.message));

{
    const daily = [{ title: 'AGENT_AREA filing', cadence: 'daily', watch: '', action: 'do it' }];
    ok('an unwired daily duty raises the insight', dutyInsights(daily, ['unrelated schedule']).length === 1);
    ok('the insight names the cadence', /\[daily\]/.test(dutyInsights(daily, ['x'])[0].message));
    ok('it is a warning, not info', dutyInsights(daily, ['x'])[0].severity === 'warning');
    ok('it points at DUTIES.md', dutyInsights(daily, ['x'])[0].filePath === 'D:/x/DUTIES.md');
    ok('a wired daily duty raises nothing',
        dutyInsights(daily, ['AGENT_AREA filing — daily batch']).length === 0);

    ok('a weekly duty is checked too',
        dutyInsights([{ title: 'AI weekly', cadence: 'weekly', watch: '', action: 'do' }], ['x']).length === 1);
    ok('an every-turn duty is exempt (passive by design)',
        dutyInsights([{ title: 'Answered questions', cadence: 'every-turn', watch: '', action: 'do' }], ['x']).length === 0);
    ok('a session-start duty is exempt',
        dutyInsights([{ title: 'Filing inbox', cadence: 'session-start', watch: '', action: 'do' }], ['x']).length === 0);
    ok('a paused duty is exempt',
        dutyInsights([{ title: 'x', cadence: 'daily', paused: true, watch: '', action: 'do' }], ['y']).length === 0);

    // the safety valve: a caller with no view of automations must not conclude
    // that every duty in the farm is dead
    ok('undefined automationTitles skips the check entirely',
        dutyInsights(daily, undefined).length === 0);
}

console.log(`test_dead_duty: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
