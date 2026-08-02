// END-TO-END: a real project folder → the real brief → the real context file →
// a real claude session that knows what it is working on.
//
// The other smoke file measures the CHANNEL (does the flag arrive). This one
// measures the PRODUCT: build a project the way Agent Farm builds one, generate
// what it would generate, spawn the way it spawns, and ask the model things
// only the project could tell it.
//
// Run: node test/smoke_project_e2e.mjs   (haiku, lowest effort — costs money)
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = (...p) => path.join(process.cwd(), 'out', ...p);
const { buildBrief, writeBrief, createSkeleton, scanRoles, DEFAULT_SKELETON, BRIEF_REL } =
    require(out('core', 'projectDocs.js'));
const { buildProjectContext, contextFileName } = require(out('core', 'projectContext.js'));
const { hostArgs } = require(out('core', 'consoleproto.js'));

// ---- a project, built the way the extension builds one ----------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-'));
const folder = path.join(root, 'Harbour Rewrite');
fs.mkdirSync(folder, { recursive: true });

const project = {
    id: 'prj_e2e00001', name: 'Harbour Rewrite', status: 'active', kind: 'customer',
    summary: 'porting the berth scheduler off the mainframe',
    folder, repos: [path.join(root, 'code', 'harbour')],
    people: [{ name: 'Ingrid Halvorsen', role: 'client', kind: 'person' }],
    createdAt: Date.now(), updatedAt: Date.now()
};
createSkeleton(folder, project, DEFAULT_SKELETON);

// a worklog with something in it, so the brief has recent history to carry
const roles0 = scanRoles(folder);
if (roles0.log) {
    const t = fs.readFileSync(roles0.log, 'utf8');
    fs.writeFileSync(roles0.log,
        t.replace('<!-- af:log-top -->',
            '<!-- af:log-top -->\n\n- 2026-08-02 the tide-table importer went live\n- 2026-08-01 agreed to keep berth ids as strings'),
        'utf8');
}

const roles = scanRoles(folder);
const brief = buildBrief({ project, roles, repos: project.repos });
writeBrief(folder, brief);
const text = buildProjectContext({
    name: project.name, id: project.id, folder, repos: project.repos,
    brief, briefPath: path.join(folder, BRIEF_REL), generatedAt: Date.now(),
    extra: "Your constitution's _REF/project-session.md applies to this session."
});
const ctxDir = path.join(root, 'ctx');
fs.mkdirSync(ctxDir, { recursive: true });
const ctxFile = path.join(ctxDir, contextFileName(project.id));
fs.writeFileSync(ctxFile, text, 'utf8');

console.log(`project folder: ${folder}`);
console.log(`context file:   ${ctxFile}  (${text.length} chars)`);
console.log(`brief:          ${brief.length} chars\n`);

// ---- spawn exactly the way ConsoleHost does ---------------------------------
const BASE = { model: 'claude-haiku-4-5-20251001', effort: 'low' };
// ‼️ A NEUTRAL working directory. Run from `root`, the model can list the
// folder, see "Harbour Rewrite" sitting in it and answer from the filesystem —
// which looks exactly like the context having worked. The first version of this
// file did that and scored a false pass on the one case that matters.
const neutral = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-cwd-'));
function ask(question, extraArgs = {}) {
    const args = hostArgs({ ...BASE, projectContextFile: ctxFile, ...extraArgs });
    return new Promise(resolve => {
        const child = cp.spawn('claude', args,
            { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: neutral });
        let buf = '', said = '', sid = '';
        child.stdout.on('data', d => {
            buf += d;
            const lines = buf.split('\n'); buf = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) { continue; }
                let o; try { o = JSON.parse(line); } catch { continue; }
                if (typeof o.session_id === 'string' && !sid) { sid = o.session_id; }
                if (o.type === 'assistant') {
                    for (const c of o.message?.content ?? []) { if (c.type === 'text') { said += c.text; } }
                }
                if (o.type === 'result') { child.stdin.end(); }
            }
        });
        child.on('error', e => resolve({ said: 'spawn error: ' + e.message, sid }));
        child.on('close', () => resolve({ said: said.trim(), sid }));
        child.stdin.write(JSON.stringify({
            type: 'user', message: { role: 'user', content: [{ type: 'text', text: question }] }
        }) + '\n');
    });
}

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
    if (cond) { pass++; console.log(`✅ ${label}`); }
    else { fail++; console.log(`❌ ${label}`); }
    if (detail) { console.log(`   ${detail.slice(0, 200).replace(/\s+/g, ' ')}`); }
};

// 1 — does it know the project at all, with the user saying nothing about it?
const a = await ask('In one short line: what project am I working on, and who is the client?');
check('knows the project and its client without being told',
    /harbour/i.test(a.said) && /ingrid|halvorsen/i.test(a.said), a.said);

// 2 — the role map is the brief's real payload: can it say where to write?
const b = await ask('Which FILE should you record what you did in when you finish? Answer with the file name only.');
check('knows which file is the worklog — the map that saves it ten tool calls',
    /worklog/i.test(b.said), b.said);

// 3 — the installation's own line has to reach the agent too
const c = await ask('Does any constitution or house rule apply to this session? Answer yes or no, then name the file if yes.');
check('carries this installation\'s own rule line',
    /project-session\.md/i.test(c.said), c.said);

// 4 — recent history came along
const d = await ask('What was the most recent thing done on this project? One short line.');
check('carries the latest worklog entries',
    /tide|importer/i.test(d.said), d.said);

// 5 — the binding constraint, end to end: resume WITHOUT the flag loses it.
// The seeding turn says nothing about the project (otherwise the answer sits in
// the conversation history), and the question asks for the CLIENT — a name that
// appears nowhere on disk, so the filesystem cannot supply it either.
const seed = await ask('Reply with exactly: ready');
if (seed.sid) {
    const lost = await ask('Who is the client of the project this session belongs to? Name only, or "unknown".',
        { resume: seed.sid, projectContextFile: undefined });
    check('a resume WITHOUT the flag does not know it (why we re-pass it every time)',
        !/ingrid|halvorsen/i.test(lost.said), lost.said);
    const kept = await ask('Who is the client of the project this session belongs to? Name only.',
        { resume: seed.sid });
    check('…and re-passing it restores the project', /ingrid|halvorsen/i.test(kept.said), kept.said);
}

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
try { fs.rmSync(neutral, { recursive: true, force: true }); } catch { /* best effort */ }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
