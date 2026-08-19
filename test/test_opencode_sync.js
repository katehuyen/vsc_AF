// OpenCode cross-engine lane (X-39): the worktree boundary that decides whether
// the shared constitution is reachable at all, the non-destructive repair, the
// duty→command files, and the .mcp.json → OpenCode `mcp` shape.
//
// The rules asserted here are the ones READ OUT of opencode.exe 1.18.18
// (Instruction.systemPaths + Filesystem.findUp) and confirmed against the
// running binary — see docs/OPENCODE-ENTEGRASYON.tr.md § "Ajan çalışma alanı".
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const {
    opencodeWorktree, opencodeReachesConstitution, opencodeConfigFragment,
    opencodeSpawnEnv, mcpJsonToOpencode, dutyCommand, isPlainJson,
    opencodeStatus, syncToOpencode, opencodeGlobalInstruction,
    OPENCODE_CONFIG_NAME, OPENCODE_COMMAND_DIR, OPENCODE_MCP_SUGGESTED_REL,
    CONSTITUTION_INSTRUCTION
} = require(path.join(ROOT, 'out/core/opencodesync.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

// A nest: <base>/CLAUDE.md + AGENTS.md (the mirror), agent one level down.
function nest(name, opts) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'af-oc-' + name + '-'));
    const agentDir = path.join(base, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(base, 'CLAUDE.md'), '# constitution\n');
    if (opts.mirror !== false) { fs.writeFileSync(path.join(base, 'AGENTS.md'), '# constitution mirror\n'); }
    fs.writeFileSync(path.join(agentDir, 'CLAUDE.md'), '# agent\n');
    if (opts.agentsMd !== false) { fs.writeFileSync(path.join(agentDir, 'AGENTS.md'), '# agent\n'); }
    if (opts.gitAt === 'base') { fs.mkdirSync(path.join(base, '.git')); }
    if (opts.gitAt === 'agent') { fs.mkdirSync(path.join(agentDir, '.git')); }
    return { base, agentDir, constitutionPath: path.join(base, 'CLAUDE.md') };
}
const cleanup = [];
const make = (n, o) => { const t = nest(n, o); cleanup.push(t.base); return t; };
const oc_global = (home) => opencodeGlobalInstruction(home);

// --- 1) the worktree boundary -------------------------------------------------
{
    const t = make('wt-base', { gitAt: 'base' });
    check('worktree = the git root above the agent', opencodeWorktree(t.agentDir) === fs.realpathSync(t.base) || opencodeWorktree(t.agentDir) === path.resolve(t.base));
    check('constitution reachable when the worktree is above the nest',
        opencodeReachesConstitution(t.agentDir, t.constitutionPath) === true);
}
{
    const t = make('wt-agent', { gitAt: 'agent' });
    check('worktree = the agent folder when it is its own repo',
        path.resolve(opencodeWorktree(t.agentDir)) === path.resolve(t.agentDir));
    check('constitution NOT reachable from its own worktree',
        opencodeReachesConstitution(t.agentDir, t.constitutionPath) === false);
}
{
    // No repository anywhere: OpenCode reports worktree "/" and the walk runs to
    // the drive root, so the constitution is reached.
    const t = make('wt-none', {});
    check('no repo → worktree is the literal "/"', opencodeWorktree(t.agentDir) === '/');
    check('no repo → constitution reachable (walk runs to the drive root)',
        opencodeReachesConstitution(t.agentDir, t.constitutionPath) === true);
}
{
    // A constitution that was never mirrored to AGENTS.md is out of reach
    // however the walk runs — OpenCode reads the mirror, not CLAUDE.md, once an
    // AGENTS.md exists anywhere on the walk.
    const t = make('no-mirror', { gitAt: 'base', mirror: false });
    check('un-mirrored constitution counts as out of reach',
        opencodeReachesConstitution(t.agentDir, t.constitutionPath) === false);
}
check('no constitution at all → nothing to reach',
    opencodeReachesConstitution(os.tmpdir(), undefined) === true);

// --- 2) the launch fragment ---------------------------------------------------
{
    const t = make('frag-ok', { gitAt: 'base' });
    check('nothing injected when the walk already reaches it',
        opencodeConfigFragment(t.agentDir, t.constitutionPath) === undefined);
    check('spawn env is empty in the normal layout',
        Object.keys(opencodeSpawnEnv(t.agentDir, t.constitutionPath)).length === 0);
}
{
    const t = make('frag-need', { gitAt: 'agent' });
    const frag = opencodeConfigFragment(t.agentDir, t.constitutionPath);
    check('fragment produced when the walk cannot reach it', typeof frag === 'string');
    const parsed = JSON.parse(frag);
    check('fragment names the constitution ABSOLUTELY (a workDir run must still find it)',
        path.isAbsolute(parsed.instructions[0]));
    check('fragment points at the AGENTS.md mirror, not CLAUDE.md',
        /AGENTS\.md$/.test(parsed.instructions[0]));
    const env = opencodeSpawnEnv(t.agentDir, t.constitutionPath);
    check('env carries OPENCODE_CONFIG_CONTENT', typeof env.OPENCODE_CONFIG_CONTENT === 'string');
    check('env carries nothing else', Object.keys(env).length === 1);
}

// --- 3) the repair, written into the agent's own opencode.json ----------------
{
    const t = make('repair-absent', { gitAt: 'agent' });
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    const cfgPath = path.join(t.agentDir, OPENCODE_CONFIG_NAME);
    check('opencode.json created when there was none', fs.existsSync(cfgPath));
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    check('the instruction is RELATIVE in the file (it travels with the repo)',
        cfg.instructions.includes(CONSTITUTION_INSTRUCTION));
    check('no machine path written into the repo file',
        !JSON.stringify(cfg).includes(t.base.replace(/\\/g, '\\\\')));
    check('$schema written so the file validates', cfg.$schema === 'https://opencode.ai/config.json');
    check('written list reports it', r.written.includes(OPENCODE_CONFIG_NAME));

    // idempotent: a second sync changes nothing and says so
    const before = fs.readFileSync(cfgPath, 'utf8');
    const r2 = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    check('second sync is idempotent', fs.readFileSync(cfgPath, 'utf8') === before);
    check('second sync does not re-report a write', !r2.written.includes(OPENCODE_CONFIG_NAME));
    check('status reads back as ours', opencodeStatus(t.agentDir, t.constitutionPath).configState === 'ours');
}
{
    // A config the user wrote, plain JSON: merged, with a backup, keys preserved.
    const t = make('repair-foreign', { gitAt: 'agent' });
    fs.writeFileSync(path.join(t.agentDir, OPENCODE_CONFIG_NAME),
        JSON.stringify({ model: 'opencode/big-pickle', permission: { edit: 'deny' } }, null, 2));
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    const cfg = JSON.parse(fs.readFileSync(path.join(t.agentDir, OPENCODE_CONFIG_NAME), 'utf8'));
    check('foreign config: the user\'s model survives', cfg.model === 'opencode/big-pickle');
    check('foreign config: the user\'s permission block survives', cfg.permission.edit === 'deny');
    check('foreign config: our entry added', cfg.instructions.includes(CONSTITUTION_INSTRUCTION));
    check('foreign config: a backup was kept', r.backups.length === 1 && /\.afbak$/.test(r.backups[0]));
}
{
    // Comments: JSON.parse would drop them, so the file is NEVER rewritten.
    const t = make('repair-jsonc', { gitAt: 'agent' });
    const raw = '{\n  // my own note\n  "model": "opencode/big-pickle"\n}\n';
    fs.writeFileSync(path.join(t.agentDir, OPENCODE_CONFIG_NAME), raw);
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    check('a commented config is left byte-for-byte alone',
        fs.readFileSync(path.join(t.agentDir, OPENCODE_CONFIG_NAME), 'utf8') === raw);
    check('and it is reported as skipped', r.skipped.includes(OPENCODE_CONFIG_NAME));
    check('status calls it unmergeable', opencodeStatus(t.agentDir, t.constitutionPath).configState === 'unmergeable');
    check('the note names the manual-TUI gap',
        r.notes.some(n => n.includes('manual') && n.includes('instructions')));
    check('the note does NOT claim the Console is covered by the env',
        r.notes.some(n => n.includes('Console cards are NOT covered')));
}
check('isPlainJson: a url value is not a comment', isPlainJson('{"u":"https://x/y"}') === true);
check('isPlainJson: a line comment disqualifies', isPlainJson('{ // x\n"a":1}') === false);
check('isPlainJson: a block comment disqualifies', isPlainJson('{/* x */"a":1}') === false);
check('isPlainJson: unparseable disqualifies', isPlainJson('{a:1}') === false);

// --- 4) nothing written when the walk already works --------------------------
{
    const t = make('quiet', { gitAt: 'base' });
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    check('no config file created in the normal layout',
        !fs.existsSync(path.join(t.agentDir, OPENCODE_CONFIG_NAME)));
    check('and the note says the walk covers it',
        r.notes.some(n => n.includes('reached by the instruction walk')));
    check('status: not-needed', opencodeStatus(t.agentDir, t.constitutionPath).configState === 'not-needed');
    check('status: identity is AGENTS.md', opencodeStatus(t.agentDir, t.constitutionPath).identity === 'AGENTS.md');
}
{
    const t = make('identity-claude', { gitAt: 'base', agentsMd: false });
    check('status: falls back to CLAUDE.md when no AGENTS.md exists yet',
        opencodeStatus(t.agentDir, t.constitutionPath).identity === 'CLAUDE.md');
}

// --- 5) duties → OpenCode commands -------------------------------------------
{
    const duty = { title: 'Günlük Yedek Kontrolü', cadence: 'daily', watch: 'repo dirty', action: 'commit it' };
    const cmd = dutyCommand(duty);
    check('command lands in .opencode/command/', cmd.file.startsWith(OPENCODE_COMMAND_DIR));
    check('command file name is an ascii slug', /^[a-z0-9-]+\.md$/.test(path.basename(cmd.file)));
    check('command has a description frontmatter', /^---\ndescription: /.test(cmd.content));
    check('command does NOT put template in the frontmatter (OpenCode refuses it)',
        !/^template:/m.test(cmd.content.split('---')[1] || ''));
    check('command body carries the watch target', cmd.content.includes('repo dirty'));

    const t = make('duties', { gitAt: 'base' });
    const r = syncToOpencode(t.agentDir, [duty], { constitutionPath: t.constitutionPath });
    const full = path.join(t.agentDir, cmd.file);
    check('duty command written', fs.existsSync(full));
    check('written list reports it', r.written.includes(cmd.file));

    // hand-edited → left alone
    fs.writeFileSync(full, fs.readFileSync(full, 'utf8') + '\nmine\n');
    const r2 = syncToOpencode(t.agentDir, [duty], { constitutionPath: t.constitutionPath });
    check('a hand-edited command is left untouched', fs.readFileSync(full, 'utf8').includes('mine'));
    check('and reported as skipped', r2.skipped.includes(cmd.file));
    check('status lists it as diverged',
        opencodeStatus(t.agentDir, t.constitutionPath).commandsDiverged.length === 1);

    // a paused duty produces nothing
    const t2 = make('duties-paused', { gitAt: 'base' });
    syncToOpencode(t2.agentDir, [{ ...duty, paused: true }], { constitutionPath: t2.constitutionPath });
    check('a paused duty writes no command', !fs.existsSync(path.join(t2.agentDir, cmd.file)));
}

// --- 6) MCP: a different shape, not a copy -----------------------------------
{
    const out = mcpJsonToOpencode({
        node_repl: { command: 'node', args: ['x.js', '--flag'], env: { TOKEN: 'sekret' } },
        obsidian: { type: 'http', url: 'http://127.0.0.1:27123/mcp', headers: { Authorization: 'Bearer abc' } }
    });
    check('local: type is required and set', out.node_repl.type === 'local');
    check('local: command is an ARRAY, executable first',
        Array.isArray(out.node_repl.command) && out.node_repl.command[0] === 'node' &&
        out.node_repl.command[2] === '--flag');
    check('local: env is renamed to environment', out.node_repl.environment.TOKEN === 'sekret' &&
        out.node_repl.env === undefined);
    check('remote: type/url/headers', out.obsidian.type === 'remote' &&
        out.obsidian.url === 'http://127.0.0.1:27123/mcp' &&
        out.obsidian.headers.Authorization === 'Bearer abc');
    check('remote: no command key', out.obsidian.command === undefined);

    const t = make('mcp', { gitAt: 'base' });
    fs.writeFileSync(path.join(t.agentDir, '.mcp.json'), JSON.stringify({
        mcpServers: {
            node_repl: { command: 'node', args: ['x.js'], env: { TOKEN: 'sekret' } },
            obsidian: { type: 'http', url: 'http://x/mcp', headers: { Authorization: 'Bearer abc' } }
        }
    }));
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    const snippet = path.join(t.agentDir, OPENCODE_MCP_SUGGESTED_REL);
    check('snippet written under .opencode/', fs.existsSync(snippet));
    check('written list reports the snippet', r.written.includes(OPENCODE_MCP_SUGGESTED_REL));
    check('snippet is a mergeable opencode config (mcp key + $schema)', (() => {
        const j = JSON.parse(fs.readFileSync(snippet, 'utf8'));
        return !!j.mcp && j.$schema === 'https://opencode.ai/config.json';
    })());
    // ‼️ The one rule X-39 states by name: a credential never leaves through a
    // note, a toast or a bridge reply.
    const notes = r.notes.join(' | ');
    check('NO credential value in any note', !notes.includes('sekret') && !notes.includes('Bearer abc'));
    check('the note counts them instead', /2 server\(s\) translated/.test(notes));
    check('the note says how many carry values', /2 carry values that are not printed/.test(notes));
    check('the note does not claim we merged it', notes.includes('never edits your live OpenCode config'));
}

// --- 7) skills: nothing is copied, and that is said -------------------------
{
    const t = make('skills', { gitAt: 'base' });
    const r = syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    check('no skills folder is created', !fs.existsSync(path.join(t.agentDir, '.opencode', 'skill')) &&
        !fs.existsSync(path.join(t.agentDir, '.opencode', 'skills')));
    check('the note names the auto-loaded path instead',
        r.notes.some(n => n.includes('~/.claude/skills/<name>/SKILL.md')));
}

// --- 8) the global instruction slot nobody configured ------------------------
{
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'af-oc-home-'));
    cleanup.push(home);
    check('no global instruction when neither file exists',
        oc_global(home) === null);
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# personal\n');
    check('falls back to the personal ~/.claude/CLAUDE.md',
        oc_global(home) === path.join(home, '.claude', 'CLAUDE.md'));
    fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'opencode', 'AGENTS.md'), '# opencode\n');
    check('OpenCode\'s own global file wins, and only ONE is loaded',
        oc_global(home) === path.join(home, '.config', 'opencode', 'AGENTS.md'));
}

// --- 9) the identity file is never written by this lane ----------------------
{
    const t = make('identity', { gitAt: 'base' });
    const before = fs.readFileSync(path.join(t.agentDir, 'AGENTS.md'), 'utf8');
    const claudeBefore = fs.readFileSync(path.join(t.agentDir, 'CLAUDE.md'), 'utf8');
    syncToOpencode(t.agentDir, [], { constitutionPath: t.constitutionPath });
    check('AGENTS.md untouched (the Codex lane owns it)',
        fs.readFileSync(path.join(t.agentDir, 'AGENTS.md'), 'utf8') === before);
    check('CLAUDE.md untouched',
        fs.readFileSync(path.join(t.agentDir, 'CLAUDE.md'), 'utf8') === claudeBefore);
}

for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
