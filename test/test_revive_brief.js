// The restart op's answer names the seats a resume takes up again — it does not hand their
// conversations back. `planRevive` spreads each live card into its row, so a row carries the card's
// whole message list; `farm.restartExtensionHost resume=true` answered with all of it (734 KB for one
// seat, measured 2026-10-10) and the agent that asked read it into its context. The answer is now a
// brief of the plan (core/reviveBrief.ts); the plan and the stamp written from it are untouched.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const { planRevive } = require(path.join(ROOT, 'out', 'core', 'consoleRevive.js'));
const { reviveBrief } = require(path.join(ROOT, 'out', 'core', 'reviveBrief.js'));

{
    const messages = Array.from({ length: 2000 }, (_, i) => ({ id: 'm' + i, role: 'user', text: 'x'.repeat(300) }));
    const live = {
        id: 'cs1', agentId: 'd:/a/dev', agentName: 'developer', cwd: 'D:\\a\\dev', status: 'working',
        sessionId: 'f81ee0fc', engine: 'claude', model: 'opus', effort: 'high', account: 'slot-1',
        projectId: 'prj_1', superpowers: true, launchId: 'lch_1', messages, totals: { cost: 1.5, turns: 7 }
    };
    const unnamed = { id: 'cs2', agentId: 'd:/a/mgr', agentName: 'manager', cwd: 'D:\\a\\mgr', status: 'idle', messages: [] };
    const plan = planRevive([live, unnamed]);
    const brief = reviveBrief(plan);
    const row = brief.rows[0];

    ok('the fixture is the leak: the plan row carries the card\'s whole message list', plan.rows[0].messages.length === 2000);
    ok('one brief row per plan row', brief.rows.length === plan.rows.length && brief.rows.length === 1);
    const scalars = Object.keys(plan.rows[0]).filter(k => plan.rows[0][k] === null || typeof plan.rows[0][k] !== 'object');
    ok('‼️ every scalar the plan row carries is in the brief, unchanged — the seat, its session, its dimensions',
        scalars.length >= 10 && scalars.every(k => row[k] === plan.rows[0][k]));
    ok('‼️ a list is answered by its length, never by its contents', row.messages === 2000);
    ok('…and nothing nested travels at all', Object.values(row).every(v => v === null || typeof v !== 'object'));
    ok('a copy, never a trim in place: the plan still holds what the stamp is written from',
        plan.rows[0].messages === messages && plan.rows[0].totals === live.totals);
    ok('a seat that cannot be resumed is still reported, with its reason',
        brief.skipped.length === 1 && brief.skipped[0].id === 'cs2' && /nothing to resume it by/.test(brief.skipped[0].reason));
    ok('an empty plan is an empty brief', JSON.stringify(reviveBrief(planRevive([]))) === '{"rows":[],"skipped":[]}');
}

{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    ok('‼️ the restart answer carries the brief, not the plan', /\n\s*revive: revive && reviveBrief\(revive\),\n/.test(ext));
    ok('…while the caller\'s own seat is still read out of the whole plan', /reviveIntent: reviveIntent\(\{ plan: revive, askedBy, resume \}\)/.test(ext));
    ok('…and the stamp is still written from the plan itself', /revive: plan\?\.rows, skipped: plan\?\.skipped,/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
