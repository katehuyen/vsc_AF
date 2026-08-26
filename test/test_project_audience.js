/**
 * ‼️ X-94 — WHAT A MISSION IS TOLD ABOUT A PROJECT, AND WHAT IT IS NOT.
 *
 * The complaint that opened this: a person started an adaptive mission, read
 * the planner's transcript, and found this project's BACKLOG in it — a list of
 * unrelated work, the recent worklog, and an instruction to record what it did
 * in the worklog when it finished. None of that is the mission's subject. The
 * mission arrived with an objective, its constraints and its success criteria;
 * the project's standing queues belong to the session a person sits in.
 *
 * Two halves are measured here and both matter:
 *
 *   1. THE TEXT — a mission's copy of the brief and of the context block. It
 *      keeps the MAP (identity, people, code roots, which document holds which
 *      role) because a mission can be told to record something and then has to
 *      know where. It drops the four standing lists and the write-back
 *      protocol. And it is not merely hidden: the lists are not read off disk,
 *      which is measured here by counting the reads.
 *
 *   2. THE SESSION IS UNTOUCHED — every assertion about the mission shape is
 *      paired with the same question asked of a session, because the session
 *      protocol is a live feature and this must be additive to it. The two are
 *      written to DIFFERENT files for the same reason: a mission's delegations
 *      are spawns, they happen while a person is starting a session, and one
 *      path for both means whichever wrote last decides what the other reads.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const { buildProjectContext, contextFileName } = require(out('core', 'projectContext.js'));
const { buildBrief } = require(out('core', 'projectDocs.js'));

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'af-x94-'));
const write = (name, body) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, body, 'utf8');
    return f;
};
// Each list carries a word that appears nowhere else, so "is it in the text?"
// is a question with one answer rather than a guess about wording.
const roles = {
    plan: write('Plan.md', '## Milestones\n- [ ] PLANWORD ship the thing\n- [x] done already\n'),
    backlog: write('Backlog.md', '- [ ] B-1 BACKLOGWORD do the other thing #feat 🔺 [effort:: M]\n'),
    log: write('Worklog.md', '## Log\n- 2026-08-01 — LOGWORD something happened\n'),
    charter: write('Charter.md', '# what this is\n'),
    people: write('People.md', '- Murat — owner\n')
};
const project = {
    id: 'prj_x94', name: 'Agent Farm', status: 'active', kind: 'product',
    summary: 'SUMMARYWORD the fleet command centre',
    folder: tmp, repos: ['D:\\code\\vsc_AgentFarm'],
    people: [{ name: 'Murat', role: 'owner', kind: 'self' }],
    createdAt: 1, updatedAt: 1
};
const decisions = [{ title: 'DECISIONWORD we chose this', ts: Date.UTC(2026, 6, 1), file: 'd.md' }];
const seed = { project, roles, repos: project.repos, decisions, now: Date.UTC(2026, 7, 25) };

// ============================================ 1. the mission brief's shape
{
    console.log('\n-- a mission is handed the map, not the queues');
    const mission = buildBrief({ ...seed, audience: 'mission' });
    const session = buildBrief(seed);

    ok('the session brief carries the backlog — unchanged', session.includes('BACKLOGWORD'));
    ok('…the open plan items', session.includes('PLANWORD'));
    ok('…the recent worklog', session.includes('LOGWORD'));
    ok('…the recent decisions', session.includes('DECISIONWORD'));
    ok('…and the write-back protocol', /## Writing back/.test(session));

    ok('‼️ the mission brief carries NO backlog', !mission.includes('BACKLOGWORD'));
    ok('‼️ …no open plan items', !mission.includes('PLANWORD'));
    ok('‼️ …no worklog entries', !mission.includes('LOGWORD'));
    ok('‼️ …no decision records', !mission.includes('DECISIONWORD'));
    ok('‼️ …and no section headings for any of them either',
        !/## Next in backlog/.test(mission) && !/## Open plan items/.test(mission)
        && !/## Recently/.test(mission) && !/## Recent decisions/.test(mission));
    ok('‼️ …and not the session\'s write-back protocol', !/## Writing back/.test(mission));

    ok('what it KEEPS is who the project is', mission.includes('SUMMARYWORD')
        && mission.includes('# Agent Farm — brief'));
    ok('…its people', mission.includes('Murat'));
    ok('…its code roots', mission.includes('D:\\code\\vsc_AgentFarm'));
    ok('‼️ …and the role map, because a mission CAN be told to record something',
        /## Where things are/.test(mission) && /log: Worklog\.md/.test(mission));

    ok('‼️ the tail says the objective is the work', /## This project, for a mission/.test(mission)
        && /Your objective is the work/.test(mission));
    ok('‼️ …and names the worklog only as the place IF the objective asks',
        /unless the objective says to; if it does, the worklog is Worklog\.md/.test(mission));
    ok('…and still protects the user\'s documents',
        /Do not reformat the user's documents/.test(mission));
    ok('it is still a generated brief with its banner and role',
        /af-role: brief/.test(mission) && /_generated /.test(mission));
}

// ================================= 2. the lists are NOT READ, not merely hidden
{
    console.log('\n-- a mission spawn does not parse a 500KB backlog to throw it away');
    const real = fs.readFileSync;
    const seen = [];
    fs.readFileSync = function (f, ...rest) {
        if (typeof f === 'string' && f.startsWith(tmp)) { seen.push(path.basename(f)); }
        return real.call(fs, f, ...rest);
    };
    try {
        seen.length = 0;
        buildBrief({ ...seed, audience: 'mission' });
        const missionReads = seen.slice();
        seen.length = 0;
        buildBrief(seed);
        const sessionReads = seen.slice();
        ok('the session brief reads the three list documents',
            sessionReads.includes('Backlog.md') && sessionReads.includes('Plan.md')
            && sessionReads.includes('Worklog.md'));
        ok('‼️ the mission brief reads NONE of them', missionReads.length === 0);
    } finally {
        fs.readFileSync = real;
    }
}

// ================================= 3. the budgeted copy has the same shape
{
    console.log('\n-- the injected copy is budgeted, and the budget cannot put the lists back');
    const injected = buildBrief({ ...seed, audience: 'mission', maxChars: 2500 });
    ok('‼️ still no backlog at any level', !injected.includes('BACKLOGWORD'));
    ok('‼️ still no write-back protocol', !/## Writing back/.test(injected));
    ok('…and the mission tail survived the budget', /## This project, for a mission/.test(injected));
}

// =================================== 4. the context block around it
{
    console.log('\n-- the frame says which kind of reader it is talking to');
    const args = { name: project.name, id: project.id, folder: tmp, repos: project.repos, brief: '- Status: active' };
    const session = buildProjectContext(args);
    const mission = buildProjectContext({ ...args, audience: 'mission' });

    ok('the session frame is unchanged, word for word',
        /Work on this project unless the user says otherwise/.test(session)
        && /record what you did in the project worklog before you finish/.test(session));
    ok('‼️ the mission frame does not say "work on this project"',
        !/Work on this project unless/.test(mission));
    ok('‼️ …nor tell it to record what it did in the worklog',
        !/record what you did in the project worklog/.test(mission));
    ok('‼️ …it says the objective is the work',
        /This is a MISSION run, not a project session/.test(mission)
        && /the objective you were given is/.test(mission));
    ok('‼️ …and it does not open by calling itself a session',
        /^=== AGENT FARM PROJECT CONTEXT ===\nThis MISSION run belongs to the project "Agent Farm"/.test(mission)
        && /^=== AGENT FARM PROJECT CONTEXT ===\nThis session belongs to the project "Agent Farm"/.test(session));
    ok('‼️ …and says out loud that the standing lists are deliberately absent',
        /are NOT your subject and are not reproduced here/.test(mission));
    ok('both are still the same fenced block, findable by the same marker',
        mission.startsWith('=== AGENT FARM PROJECT CONTEXT ===')
        && mission.trimEnd().endsWith('=== END AGENT FARM PROJECT CONTEXT ==='));
    // The frame is hard-coded, so it is English on both audiences — only the
    // brief inside it carries the user's language.
    const frame = mission.replace(/--- PROJECT BRIEF[^]*END PROJECT BRIEF ---/, '');
    ok('the mission frame is English too',
        !/\b(proje|oturum|klasör|kullanıcı|görev)\b/i.test(frame));
}

// ============================== 5. two audiences, two files — never one path
{
    console.log('\n-- a mission spawn and a session spawn cannot overwrite each other');
    ok('the session file name is EXACTLY what it always was',
        contextFileName('prj_abcd1234') === 'prj_abcd1234.txt');
    ok('…and an explicit session audience is the same name',
        contextFileName('prj_abcd1234', 'session') === 'prj_abcd1234.txt');
    ok('‼️ the mission copy is a different file',
        contextFileName('prj_abcd1234', 'mission') === 'prj_abcd1234-mission.txt'
        && contextFileName('prj_abcd1234', 'mission') !== contextFileName('prj_abcd1234'));
    ok('…and the id is still sanitised on both',
        contextFileName('../evil id!', 'mission') === 'evilid-mission.txt');
}

// ================ 6. only a SESSION spawn rewrites the project's own BRIEF.md
{
    console.log('\n-- _AF/BRIEF.md belongs to the session protocol and stays session-shaped');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ writeBrief is gated on the session audience',
        /if \(c && c\.hasFolder && audience === 'session'\) \{ writeBrief\(c\.folder, c\.brief\); \}/.test(ext));
    ok('‼️ …and the file it writes is built WITHOUT the audience — always the full session text',
        /const brief = buildBrief\(seed\);/.test(ext));
    ok('…while the INJECTED copy is the one that takes it',
        /brief: buildBrief\(\{ \.\.\.seed, maxChars: PROJECT_BRIEF_MAX, audience \}\)/.test(ext));
    ok('…and the context file path carries the audience so the two never collide',
        /contextFileName\(c\?\.project\.id \?\? '', audience, !!hook\)/.test(ext));
}

// ========================= 7. the form can say which project, in three ways
{
    console.log('\n-- the project is a choice on the form, not something that happened to you');
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
    ok('there is a project control', /id="f-project"/.test(page));
    ok('…offering this window\'s project as the visible default',
        /this window's project: \$\{winProject\.name\}/.test(page));
    ok('‼️ …and a deliberate "none", which the old implicit behaviour could not say',
        /value="--none--"/.test(page));
    ok('‼️ an untouched box posts NO project key — the message it always posted',
        /if \(form\.projectId === '--none--'\) \{ input\.project = ''; \}/.test(page)
        && /else if \(form\.projectId\) \{ input\.project = form\.projectId; \}/.test(page));
    ok('…the box is read back guarded, like every other control behind the fold',
        /form\.projectId = val\('f-project', form\.projectId\);/.test(page));
    ok('‼️ …and changing it repaints, so the sentence beside it is never a stale answer',
        /projSel\.addEventListener\('change'/.test(page));
    ok('‼️ the page says WHO decided, because an inherited project is the surprise',
        /inherited from this window, not chosen here/.test(page));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the host records which of the two it was',
        /projectOrigin = 'requested';/.test(ext) && /projectOrigin = 'window';/.test(ext));
    ok('…and the preview hands it back with the project',
        /origin: resolved\.projectOrigin \?\? 'requested'/.test(ext));
    ok('…from the ONE resolver both the preview and Start run',
        ext.indexOf('projectOrigin') < ext.indexOf('const previewMission'));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
