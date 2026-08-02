// What the project context actually COSTS, measured.
//
// The design says this figure gets measured and written down rather than
// estimated — chars÷4 is the English ratio and is wrong by a factor of two on
// anything else, and a project brief carries the user's own language.
//
// Method: the same turn twice, once with the flag and once without, comparing
// every input bucket the CLI reports. The difference is the context.
//
// Run: node test/smoke_project_cost.mjs   (two real haiku calls)
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = (...p) => path.join(process.cwd(), 'out', ...p);
const { buildBrief, createSkeleton, scanRoles, DEFAULT_SKELETON, BRIEF_REL } =
    require(out('core', 'projectDocs.js'));
const { buildProjectContext } = require(out('core', 'projectContext.js'));

// a realistic project, not a stub: skeleton, a worklog with entries, a client
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cost-'));
const folder = path.join(root, 'Harbour Rewrite');
fs.mkdirSync(folder, { recursive: true });
const project = {
    id: 'prj_cost0001', name: 'Harbour Rewrite', status: 'active', kind: 'customer',
    summary: 'porting the berth scheduler off the mainframe',
    folder, repos: [path.join(root, 'code', 'harbour')],
    people: [{ name: 'Ingrid Halvorsen', role: 'client', kind: 'person' }],
    createdAt: 1, updatedAt: 1
};
createSkeleton(folder, project, DEFAULT_SKELETON);
const roles0 = scanRoles(folder);
if (roles0.log) {
    const t = fs.readFileSync(roles0.log, 'utf8');
    fs.writeFileSync(roles0.log, t.replace('<!-- af:log-top -->',
        '<!-- af:log-top -->\n\n- 2026-08-02 the tide-table importer went live\n'
        + '- 2026-08-01 agreed to keep berth ids as strings\n'
        + '- 2026-07-30 first end-to-end run against the staging mainframe'), 'utf8');
}
const brief = buildBrief({ project, roles: scanRoles(folder), repos: project.repos });
const text = buildProjectContext({
    name: project.name, id: project.id, folder, repos: project.repos, brief,
    briefPath: path.join(folder, BRIEF_REL),
    extra: "Your constitution's _REF/project-session.md applies to this session."
});
const file = path.join(root, 'context.txt');
fs.writeFileSync(file, text, 'utf8');

const HOST = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--permission-prompt-tool', 'stdio', '--model', 'claude-haiku-4-5-20251001', '--effort', 'low'];

function run(args) {
    return new Promise(resolve => {
        const c = cp.spawn('claude', args,
            { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: root });
        let buf = '', usage = null;
        c.stdout.on('data', d => {
            buf += d;
            const lines = buf.split('\n'); buf = lines.pop() ?? '';
            for (const l of lines) {
                if (!l.trim()) { continue; }
                let o; try { o = JSON.parse(l); } catch { continue; }
                if (o.type === 'assistant' && o.message?.usage) { usage = o.message.usage; }
                if (o.type === 'result') { c.stdin.end(); }
            }
        });
        c.on('close', () => resolve(usage));
        c.stdin.write(JSON.stringify({
            type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Reply with exactly: ok' }] }
        }) + '\n');
    });
}

const total = u => (u?.input_tokens ?? 0)
    + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0);

const without = await run(HOST);
const withCtx = await run([...HOST, '--append-system-prompt-file', `"${file}"`]);

console.log(`brief:        ${brief.length} chars`);
console.log(`context file: ${text.length} chars\n`);
console.log('without the flag:', JSON.stringify(without));
console.log('with the flag:   ', JSON.stringify(withCtx));
console.log(`\nDELTA input tokens: ${total(withCtx) - total(without)}`);
console.log(`chars per token:    ${((text.length) / Math.max(1, total(withCtx) - total(without))).toFixed(2)}`);

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
