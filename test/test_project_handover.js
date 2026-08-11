// Faz 7 — the handover (compiled core/projectHandover.js, pure): the letter to
// whoever picks the project up in three months. Two things are being tested and
// only one of them is prose. First: an absent section says WHY it is absent, so
// "no plan document" never reads as "nothing is open". Second, and the one that
// would cost somebody real work: regenerating the document must not eat the
// human half of it.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    buildHandover, buildHandoverBody, mergeHandoverNotes, handoverNotesBlock,
    HANDOVER_NOTES_ANCHOR
} = require(path.join(__dirname, '..', 'out', 'core', 'projectHandover.js'));

const DAY = 86400000;
const now = new Date('2026-08-11T12:00:00').getTime();

const full = {
    now,
    project: {
        name: 'TalkScribe', status: 'active', kind: 'product',
        summary: 'voice dictation, two live apps',
        folder: 'D:\\vault\\TalkScribe',
        repos: [{ path: 'D:\\code\\zen' }, { path: 'E:\\gone', missing: true }],
        people: [{ name: 'Murat', role: 'owner', contact: 'murat@example.com' }],
        tags: ['voice'], startedAt: now - 200 * DAY, dueAt: now + 30 * DAY,
        budgetUSD: 3, warnings: ['active but quiet for 24 days']
    },
    parent: { name: 'Muvu', status: 'active' },
    children: [{ name: 'ZEN', status: 'active' }],
    docs: [{ role: 'charter', path: 'Charter.md' }, { role: 'plan', path: 'Plan.md' }],
    charter: '## What this is\n\nDictation that does not need a cloud.',
    plan: [{ text: 'Faz 7 — the rest' }],
    backlog: [{ code: 'P-4', text: 'finish the phases' }, { code: 'S-1', text: 'engine models' }],
    blocked: [{ code: 'S-9', text: 'waits for the store', blockedBy: 'S-1' }],
    decisions: [{ ts: now - 40 * DAY, title: 'One session, one project', path: '20_Decisions/one.md' }],
    deliverables: [{ ts: now - 10 * DAY, title: 'ZEN 1.4', detail: 'Chrome Web Store' }],
    unfinished: [{
        code: 'P-4', text: 'PROJE SISTEMI FAZLARI TAMAMLANSIN', sessions: 3,
        lastTs: now - 2 * DAY, note: 'Faz 5 ve 6 kapandi, 7 kaldi'
    }],
    work: { runningTasks: 1, queuedTasks: 2, liveMissions: 0, openQuestions: 1, blockedQueue: 0 },
    sessions: { n: 40, turns: 900, agents: ['developer'], firstTs: now - 200 * DAY, lastTs: now - 2 * DAY },
    cost: { total: 12.5, today: 0.4 },
    analysis: {
        generatedAt: now, weeks: [], files: [{ key: 'D:\\code\\zen\\bg.js', n: 30 }],
        agents: [{ key: 'developer', n: 400 }],
        totals: { sessions: 40, turns: 900, cost: 12.5, commits: 60, items: 20, closedItems: 12, files: 80 },
        cycle: { medianDays: 3, p90Days: 11, n: 12 },
        rhythm: { peak: { dow: 2, hour: 14 }, outOfHours: 0.42, byDow: [], byHour: [] },
        pace: {
            recentPerWeek: 3.2, allPerWeek: 5.1,
            recentCostPerSession: 0.3, allCostPerSession: 0.31, weeksCovered: 28
        }
    },
    worklog: ['- 2026-08-11 — Faz 6 closed']
};

// ---------- the whole letter ----------
{
    const md = buildHandover(full);
    ok('it is titled as a handover, not as a report', /^# TalkScribe — handover/.test(md));
    ok('the charter\'s own prose is reproduced verbatim',
        md.includes('Dictation that does not need a cloud.'));
    ok('it says what this project is part of, and what its parts are',
        /Part of: \*\*Muvu\*\*/.test(md) && /Parts: \*\*ZEN\*\*/.test(md));
    ok('every document role is listed with the path you would open',
        /charter: `Charter\.md`/.test(md) && /plan: `Plan\.md`/.test(md));
    ok('‼️ a code root that is not on this machine is called out, not listed as quiet',
        /`E:\\gone` — ‼️ not on this machine/.test(md));
    ok('the people are there with their roles', /\*\*Murat\*\* — owner/.test(md));
    ok('an age is written as an age, not as a timestamp to subtract',
        /Last touched \*\*2 days ago\*\*/.test(md));
    // ‼️ caught the first time this ran against a real folder
    ok('‼️ the age helper carries its own "ago" — no call site can print "today ago"',
        !/today ago|yesterday ago|ago ago/.test(md));
    ok('what is running right now is separated from what waits on a human',
        /In flight right now:/.test(md) && /Waiting on a human:/.test(md));
    ok('what is currently wrong is repeated where a newcomer will see it',
        /active but quiet for 24 days/.test(md));
    ok('blocked items are named as the ones NOT to start with',
        /do not start these first/i.test(md) && /⛔ waits on S-1/.test(md));
    ok('‼️ the item somebody already fought and left open leads with its note',
        /Already fought, still open/.test(md) && /Faz 5 ve 6 kapandi/.test(md));
    ok('the decisions answer "why is it like this"',
        /Why it is like this/.test(md) && /One session, one project/.test(md));
    ok('what shipped is its own section', /ZEN 1\.4/.test(md) && /Chrome Web Store/.test(md));
    ok('the fold says how long an item actually takes',
        /median \*\*3\*\* day\(s\)/.test(md) && /90th percentile 11/.test(md));
    ok('the worklog lines are verbatim', md.includes('- 2026-08-11 — Faz 6 closed'));

    // the first five minutes must be ACTIONS, and must name the real items
    const first = md.slice(md.indexOf('## Your first five minutes'));
    ok('the first five minutes name the abandoned item by its code', /\*\*P-4\*\*/.test(first));
    ok('…and the missing repo', /Clone the code roots marked missing/.test(first));
    ok('…and end by telling the reader to write back into the project',
        /worklog line/.test(first));
    ok('the human block is at the bottom, with its marker',
        md.indexOf(HANDOVER_NOTES_ANCHOR) > md.indexOf('## Your first five minutes'));
}

// ---------- a project with nothing ----------
{
    const bare = buildHandover({
        now,
        project: { name: 'Empty', status: 'planned' },
        gaps: { noFolder: true, noPlan: true, noBacklog: true, noCharter: true }
    });
    ok('‼️ "no charter" is stated as a gap, not left as silence',
        /no charter document/.test(bare));
    ok('‼️ "no folder" explains what that costs, rather than printing empty sections',
        /no folder chosen/.test(bare) && /none of them exist yet/.test(bare));
    ok('no code roots is a statement, not an empty list',
        /no roots declared/.test(bare));
    ok('nobody recorded says who you would have wanted', /Nobody is recorded/.test(bare));
    ok('‼️ "no plan document" and "everything ticked" are different sentences',
        /there is no roadmap to inherit/.test(bare));
    ok('nothing abandoned says so positively',
        /every coded item that was worked on was closed/.test(bare));
    ok('no decisions is called out as the debt it is',
        /is currently answered by nothing at all/.test(bare));
    ok('the first step for a folderless project is to give it one',
        /Give this project a folder/.test(bare));
    ok('a project with no analysis simply has no fold section',
        !/How this project is actually worked/.test(bare));
    // ‼️ the heading exists whatever happens (it is the shape of the letter), so
    // the ONE thing it must never be is a heading with nothing under it
    ok('‼️ "Where it stands" with nothing measured says the caller asked for less, not that it is quiet',
        /That is a gap in whoever asked for this document/.test(bare));
    const stands = bare.slice(bare.indexOf('## Where it stands'), bare.indexOf('## What is open'));
    ok('…and no section of the letter is an empty heading',
        stands.replace('## Where it stands', '').trim().length > 0);
    // an item touched today reads as touched today, in every phrasing
    const fresh = buildHandover({
        ...full,
        unfinished: [{ code: 'P-4', text: 'the phases', sessions: 1, lastTs: now - 3600000 }]
    });
    ok('‼️ an item worked an hour ago reads "today", never "today ago"',
        /\(today\)/.test(fresh) && !/today ago/.test(fresh));
}

// ---------- regeneration: the part that must not be eaten ----------
{
    const first = buildHandover(full);
    const mine = first.replace(
        '- _the trap: what breaks if you do the obvious thing_',
        '- THE BUILD BREAKS UNLESS YOU RUN npm run gen FIRST');

    const again = mergeHandoverNotes(mine, { ...full, project: { ...full.project, status: 'paused' } });
    ok('regeneration succeeds on a document that has the marker', !again.error && !!again.text);
    ok('‼️ THE HUMAN HALF SURVIVES VERBATIM',
        again.text.includes('THE BUILD BREAKS UNLESS YOU RUN npm run gen FIRST'));
    ok('…and the generated half is genuinely rebuilt',
        /Status: \*\*paused\*\*/.test(again.text) && !/Status: \*\*active\*\*/.test(again.text));
    ok('…exactly once — the marker is not duplicated',
        again.text.split(HANDOVER_NOTES_ANCHOR).length === 2);

    const moved = 'my own preface\n\n' + handoverNotesBlock() + '\n- something I wrote\n';
    const merged = mergeHandoverNotes(moved, full);
    ok('‼️ the marker is SEARCHED FOR, so a block the user moved still works',
        merged.text.includes('- something I wrote') && !merged.text.includes('my own preface'));

    const lost = mergeHandoverNotes('# Handover\n\nI deleted the marker and wrote here.\n', full);
    ok('‼️ a document with no marker is NOT overwritten — there is no way to tell which part is mine',
        !!lost.error && !lost.text);
    ok('…and the error says how to get out of it', /Delete the file|put the marker back/.test(lost.error));

    ok('an empty existing file just gets a fresh document',
        (mergeHandoverNotes('', full).text || '').includes(HANDOVER_NOTES_ANCHOR));
    ok('the body alone carries no human block',
        !buildHandoverBody(full).includes(HANDOVER_NOTES_ANCHOR));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
