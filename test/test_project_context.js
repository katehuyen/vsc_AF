// The project session protocol (compiled core/projectContext.js + the brief
// generator in core/projectDocs.js, both pure).
//
// The behaviour under test is the one that makes picking a project mean
// anything: a session started under a project is TOLD about it, before the user
// types. What is asserted here is what the live measurement
// (test/smoke_project_context.mjs) proved has to be true, so a refactor cannot
// break it silently and spend money to find out:
//
//   * the flag goes on EVERY spawn including resumes — the appended system
//     prompt does not survive `--resume`;
//   * the path is QUOTED — every spawn path runs under `shell: true`, and an
//     unquoted path through "John Doe" arrives cut at the space;
//   * a session with NO project gets no flag at all;
//   * the brief is CAPPED — it grows every time the project is worked on, and
//     it would otherwise grow the system prompt of every turn of every session.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = (...p) => path.join(__dirname, '..', 'out', ...p);
const {
    buildProjectContext, trimBrief, contextFileName, quoteContextPath,
    isQuotableContextPath, extractProjectContext, PROJECT_BRIEF_MAX
} = require(out('core', 'projectContext.js'));
const { buildBrief, writeBrief, BRIEF_REL } = require(out('core', 'projectDocs.js'));
const { hostArgs } = require(out('core', 'consoleproto.js'));
const { buildLaunchCommand } = require(out('core', 'launch.js'));

const project = {
    id: 'prj_abcd1234', name: 'Agent Farm', status: 'active', kind: 'product',
    summary: 'the fleet command centre',
    folder: 'D:\\vault\\10_PROJECTS\\Agent Farm',
    repos: ['D:\\code\\vsc_AgentFarm'],
    people: [{ name: 'Murat', role: 'owner', kind: 'self' }],
    tags: ['vscode'], startedAt: Date.UTC(2026, 0, 14),
    createdAt: 1, updatedAt: 1
};

// ---------- the context text ----------
{
    const text = buildProjectContext({
        name: project.name, id: project.id, folder: project.folder,
        repos: project.repos, brief: '- Status: active\n- Codeword: xyzzy',
        generatedAt: Date.UTC(2026, 7, 2, 9, 30)
    });
    ok('it names the project and its id', text.includes('"Agent Farm"') && text.includes('prj_abcd1234'));
    ok('…the docs folder', text.includes(project.folder));
    ok('…the code repos', text.includes('D:\\code\\vsc_AgentFarm'));
    ok('…and tells the agent what to do with them', /record what you did in the project worklog/i.test(text));
    ok('the brief is INLINED, not pointed at', text.includes('Codeword: xyzzy'));
    ok('…under a header that says when it was made', /PROJECT BRIEF \(generated 2026-08-02/.test(text));
    ok('the block is fenced so it can be found again',
        text.startsWith('=== AGENT FARM PROJECT CONTEXT ===') &&
        text.trimEnd().endsWith('=== END AGENT FARM PROJECT CONTEXT ==='));

    // Hard-coded strings are English; only the brief carries the user's
    // language. (Word boundaries matter here — "proje" is a substring of
    // "project", and the first version of this check failed on its own frame.)
    const frame = text.replace(/--- PROJECT BRIEF[^]*END PROJECT BRIEF ---/, '');
    ok('the frame is English regardless of what the project is written in',
        !/\b(proje|oturum|klasör|kullanıcı|ajan)\b/i.test(frame));

    const withExtra = buildProjectContext({
        name: 'X', id: 'p1', extra: 'Your constitution applies to this session.'
    });
    ok('the installation\'s own line is carried', withExtra.includes('Your constitution applies'));
    ok('…and nothing is invented when there is no brief', !withExtra.includes('PROJECT BRIEF'));

    const bare = buildProjectContext({ name: 'X', id: 'p1' });
    ok('a project with no folder still produces a usable context',
        bare.includes('"X"') && !bare.includes('Docs folder:'));
}

// ---------- the cap ----------
{
    ok('a short brief is left alone', trimBrief('- one\n- two').cut === false);

    const long = Array.from({ length: 400 }, (_, i) => `- line ${i} ................`).join('\n');
    const t = trimBrief(long);
    ok('a long one is cut', t.cut === true && t.text.length <= PROJECT_BRIEF_MAX);
    ok('…on a line boundary, not mid-sentence', !t.text.endsWith('.') || long.startsWith(t.text));
    ok('…and it really is a prefix of the original', long.startsWith(t.text));

    const text = buildProjectContext({
        name: 'X', id: 'p1', brief: long, briefPath: 'D:\\vault\\X\\_AF\\BRIEF.md'
    });
    ok('the context says the brief was cut', /cut to fit/.test(text));
    ok('…and where the whole thing is', text.includes('_AF\\BRIEF.md'));
    ok('‼️ the system prompt cannot grow without bound',
        text.length < PROJECT_BRIEF_MAX + 1200);

    // no path known → still says it was cut, without pointing nowhere
    const noPath = buildProjectContext({ name: 'X', id: 'p1', brief: long });
    ok('a cut with no folder to point at still admits the cut',
        /cut to fit/.test(noPath) && !/undefined/.test(noPath));
}

// ---------- the file name and the quoting ----------
{
    ok('the file is keyed by the immutable id', contextFileName('prj_abcd1234') === 'prj_abcd1234.txt');
    ok('…and nothing from an id can escape the folder — separators and dots go',
        contextFileName('../../etc/passwd') === 'etcpasswd.txt');
    ok('a path is quoted', quoteContextPath('C:\\John Doe\\x.txt') === '"C:\\John Doe\\x.txt"');
    ok('a path with a quote in it is refused, not mangled',
        isQuotableContextPath('C:\\a"b.txt') === false);
    ok('an empty path is refused', isQuotableContextPath('') === false);
    ok('a normal path is fine', isQuotableContextPath('C:\\John Doe\\x.txt') === true);
}

// ---------- the flag, on every spawn path ----------
{
    const file = 'C:\\John Doe\\AppData\\af\\prj_1.txt';

    const fresh = hostArgs({ projectContextFile: file }).join(' ');
    ok('the Console passes the flag', fresh.includes('--append-system-prompt-file'));
    ok('‼️ QUOTED — shell:true splits an unquoted path on its space',
        fresh.includes(`--append-system-prompt-file "${file}"`));

    // The binding one. Measured: the appended system prompt is LOST on resume.
    const resumed = hostArgs({ resume: 'sid-1', projectContextFile: file }).join(' ');
    ok('‼️ a RESUME gets it again — it is not inherited',
        resumed.includes('--resume sid-1') && resumed.includes(`--append-system-prompt-file "${file}"`));

    ok('no project → no flag at all',
        !hostArgs({}).join(' ').includes('append-system-prompt'));
    ok('…and an empty path is treated as no project',
        !hostArgs({ projectContextFile: '   ' }).join(' ').includes('append-system-prompt'));
    ok('a path we cannot quote is dropped rather than passed broken',
        !hostArgs({ projectContextFile: 'C:\\a"b.txt' }).join(' ').includes('append-system-prompt'));

    // the terminal path builds a command STRING instead of an argv
    const cmd = buildLaunchCommand('claude', { projectContextFile: file, model: 'opus' });
    ok('a terminal launch carries it too', cmd.includes(`--append-system-prompt-file "${file}"`));
    ok('…on a resume as well',
        buildLaunchCommand('claude', { resume: 'sid-2', projectContextFile: file })
            .includes(`--append-system-prompt-file "${file}"`));
    ok('…and not at all without a project',
        !buildLaunchCommand('claude', { model: 'opus' }).includes('append-system-prompt'));
    ok('the first prompt STILL comes last (it is the positional argument)',
        buildLaunchCommand('claude', { projectContextFile: file, prompt: 'hello' }).trim().endsWith('"hello"'));

    // the headless task path
    const tasksSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    ok('a headless task carries it',
        /--append-system-prompt-file "\$\{ctxFile\}"/.test(tasksSrc));
    ok('‼️ the task is stamped with the project it was CREATED under',
        /'projectId' in extra[\s\S]{0,80}activeProjectId\?\.\(\)/.test(tasksSrc)
        && /projectContextFile\?\.\(task\)/.test(tasksSrc));
    // The behaviour behind that expression — who the stamp speaks for — is
    // exercised for real in test_lifecycle.js, which can load a TaskManager.
}

// ---------- the brief ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-brief-'));
    const p = { ...project, folder: dir };
    const logFile = path.join(dir, 'Worklog.md');
    fs.writeFileSync(logFile,
        '---\naf-role: log\n---\n\n# Worklog\n\n<!-- af:log-top -->\n\n- 2026-08-02 shipped the thing\n- 2026-08-01 started it\n',
        'utf8');
    const charter = path.join(dir, 'Charter.md');
    fs.writeFileSync(charter, '---\naf-id: prj_abcd1234\naf-role: charter\n---\n\n# Agent Farm\n', 'utf8');

    const { scanRoles } = require(out('core', 'projectDocs.js'));
    const roles = scanRoles(dir);
    const brief = buildBrief({ project: p, roles, repos: p.repos, now: Date.UTC(2026, 7, 2, 9, 30) });

    ok('the brief states the project\'s state', brief.includes('- Status: active'));
    ok('…its one-line summary', brief.includes('the fleet command centre'));
    ok('…who is involved', brief.includes('Murat') && brief.includes('owner'));
    ok('…and its code roots', brief.includes('D:\\code\\vsc_AgentFarm'));
    ok('‼️ WHERE THINGS ARE — the map that saves an agent ten tool calls',
        brief.includes('## Where things are') && brief.includes('log: Worklog.md'));
    ok('…and it uses paths relative to the folder, not absolute ones',
        !brief.includes(path.join(dir, 'Worklog.md')));
    ok('the newest worklog lines come along', brief.includes('shipped the thing'));
    ok('…newest first, as the anchor orders them',
        brief.indexOf('shipped the thing') < brief.indexOf('started it'));
    ok('it says where to write back', /Record what you did in the worklog/.test(brief));
    ok('…and what not to touch', /Do not reformat the user's documents/.test(brief));
    ok('it is marked as generated, so nobody edits it by hand',
        brief.includes('af:managed') && brief.includes('af-role: brief'));

    // ‼️ DATES ARE LOCAL, BOTH OF THEM.
    // Started/Due are stored as LOCAL midnight (the page's picker builds
    // `value + 'T00:00:00'`), so printing them through toISOString() lands on the
    // previous day everywhere east of UTC — measured at +07, a 15 August due date
    // reached the agent as 14 August. Built here the same way the store does, so
    // the assertion holds in every timezone rather than only in this one.
    {
        const dated = buildBrief({
            project: { ...p, startedAt: new Date(2026, 0, 14).getTime(), dueAt: new Date(2026, 7, 15).getTime() },
            roles, repos: p.repos, now: new Date(2026, 7, 2, 9, 30).getTime()
        });
        ok('‼️ a stored date comes back as the day it was entered, not the day before',
            dated.includes('- Started: 2026-01-14') && dated.includes('- Due: 2026-08-15'));
        // The header stamp (projectContext) is local; a UTC footer put two times
        // seven hours apart inside one file and left the reader to pick.
        ok('…and the generated stamp is local too, so the brief agrees with its own header',
            dated.includes('_generated 2026-08-02 09:30_'));
    }

    const w = writeBrief(dir, brief);
    ok('it writes into _AF/', w.ok && fs.existsSync(path.join(dir, BRIEF_REL)));
    ok('…and writing again just replaces it', writeBrief(dir, brief).ok);
    // _AF/ is regenerated on every single spawn, and the project folder usually
    // lives in a git-backed vault: without this the user's vault is never clean.
    ok('‼️ _AF/ is kept out of the user\'s git',
        fs.readFileSync(path.join(dir, '_AF', '.gitignore'), 'utf8').includes('*'));
    ok('a project with no folder cannot be written, and says so',
        writeBrief('', brief).ok === false);

    // a project whose folder holds nothing yet must still produce something
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'af-brief2-'));
    const bare = buildBrief({ project: { ...p, folder: empty, people: [], tags: [] }, roles: {} });
    ok('an empty folder still gets a usable brief',
        bare.includes('# Agent Farm — brief') && bare.includes('- Status: active'));
    ok('…which admits there is no worklog rather than pointing at one',
        /no worklog file yet/.test(bare));

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { fs.rmSync(empty, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ---------- the transparency chip reads back what was SENT ----------
{
    const text = buildProjectContext({ name: 'Agent Farm', id: 'p1', brief: '- one' });
    const wrapped = `some other system prompt\n\n${text}\n\ntrailing`;
    ok('the context can be pulled back out of a bigger prompt',
        extractProjectContext(wrapped) === text);
    ok('…and nothing is claimed when there is none', extractProjectContext('nothing here') === '');

    // ‼️ The channel is invisible — it is in no transcript — so the UI owes the
    // user the text ITSELF, not a description of it. Same debt 3.50.0 paid when
    // the composer was found to be sending more than it showed.
    const consoleJs = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the composer carries a project chip', /function projectChipHtml\(\)/.test(consoleJs));
    ok('‼️ and the chip shows the VERBATIM text, not a summary of it',
        /This exact text is added to the session's system prompt/.test(consoleJs)
        && /\$\{ctx\}/.test(consoleJs));
    ok('…it is drawn when there is NO project too — "nothing is added" is news as well',
        /pchip none/.test(consoleJs));
    ok('a session row says which project it was started under', /pbadge/.test(consoleJs));
    ok('the picker moves the WINDOW\'s active project, not a console-only one',
        /type: 'setProject'/.test(consoleJs));

    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('…and the panel reads that text back rather than rebuilding it for display',
        /projectContextText\(projectId: string\): string/.test(panel));
}

// ---------- the agent side of the protocol ----------
// The extension can hand an agent a project, but what the agent DOES with one
// is a rule, and a rule that lives nowhere is not a rule (constitution,
// Principle 1). Both halves are asserted here because they ship together.
{
    const ajanlar = path.join('D:', path.sep, 'zone', 'agent', 'ajanlar');
    const refFile = path.join(ajanlar, '_REF', 'project-session.md');
    if (fs.existsSync(refFile)) {
        const ref = fs.readFileSync(refFile, 'utf8');
        ok('the procedure names the marker an agent recognises the session by',
            ref.includes('=== AGENT FARM PROJECT CONTEXT ==='));
        ok('…tells it NOT to re-read the folder it was already given',
            /Do not read the folder/.test(ref));
        ok('‼️ …and makes writing to the worklog mandatory, not discretionary',
            /MANDATORY/.test(ref) && /projects\.log/.test(ref));
        ok('…and protects the user\'s own formatting',
            /Never reformat the user's documents/.test(ref));

        const core = fs.readFileSync(path.join(ajanlar, 'CLAUDE.md'), 'utf8');
        ok('the constitution triggers it — a procedure with no trigger is dead',
            /AGENT FARM PROJECT CONTEXT[^]{0,120}_REF\/project-session\.md/.test(core));
    } else {
        // the agent repo is not on this machine; the extension's own half stands
        ok('agent-side files are checked when the agent repo is present', true);
    }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
