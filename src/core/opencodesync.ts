import * as fs from 'fs';
import * as path from 'path';
import { Duty } from './duties';
import { hashString, safeReadFile } from './util';
import { AGENTS_MD_NAME, SyncResult, dutySlug } from './antigravity';
import { gitRootOf, isWithin } from './ruleWalk';

/**
 * OpenCode compatibility layer — the third instruction lane, and the only one
 * whose reach is decided by something outside the agent folder.
 *
 * ‼️ READ THIS BEFORE CHANGING ANYTHING HERE. The rules below are not guessed
 * from documentation; they were read out of the shipped `opencode.exe` 1.18.18
 * (`Instruction.systemPaths` + `Filesystem.findUp`) and then confirmed against
 * the running binary. Details and the measurement transcript live in
 * `docs/OPENCODE-ENTEGRASYON.tr.md` § "Ajan çalışma alanı".
 *
 *   1. GLOBAL — the FIRST of `~/.config/opencode/AGENTS.md`, then
 *      `~/.claude/CLAUDE.md`. One of them, never both. So an OpenCode run can
 *      be carrying the user's personal Claude file without anybody asking for
 *      it; we report that rather than fight it.
 *   2. LOCAL — the names `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` are tried IN
 *      THAT ORDER, and the first name that matches anywhere wins outright:
 *      `AGENTS.md` SHADOWS `CLAUDE.md` completely. Writing the Codex lane's
 *      AGENTS.md therefore CHANGES what OpenCode reads — from CLAUDE.md to
 *      AGENTS.md — which is the intended outcome but must be said out loud.
 *   3. For the winning name, EVERY file from the cwd up to the **worktree** is
 *      merged (nearest first). The worktree is the git root above the cwd, or
 *      `/` when there is no repository at all — measured through OpenCode's own
 *      `/path` endpoint. So the shared constitution at the nest root is picked
 *      up for free in the normal layout, and is INVISIBLE in exactly one case:
 *      when the agent folder is its own git worktree, the walk stops there.
 *   4. `opencode.json` `instructions` entries are added on top, and a relative
 *      entry ESCAPES the worktree (measured: `../AGENTS.md` from an agent
 *      folder that was its own git root reached the nest). That is the repair.
 *
 * The repair is applied in the order X-39 asks for: prefer the user's own
 * `opencode.json` when it can be merged provably safely, and otherwise write
 * nothing and hand the same fragment to our own processes through
 * `OPENCODE_CONFIG_CONTENT` — which OpenCode merges last and which touches no
 * file on disk. A manual TUI run stays outside that, so it is named as a gap
 * instead of being papered over.
 */

/** The agent-scoped config file OpenCode loads by name. */
export const OPENCODE_CONFIG_NAME = 'opencode.json';
/** OpenCode's own customization root, and where its commands live. */
export const OPENCODE_COMMAND_DIR = path.join('.opencode', 'command');
/** Merge-ready MCP snippet. Never applied to the user's config by us. */
export const OPENCODE_MCP_SUGGESTED_REL = path.join('.opencode', 'mcp.suggested.json');
/** Fingerprints for the files THIS lane generates. Separate from the
 *  Antigravity sidecar on purpose: a lane that cannot break another lane's
 *  state machine is a lane you can change without re-reading it. */
const SIDECAR_REL = path.join('.opencode', 'af-opencode-sync.json');
const COMMAND_MARKER = '<!-- agent-farm:duty-command -->';

/** The relative instruction that reaches a constitution one level up. */
export const CONSTITUTION_INSTRUCTION = '../' + AGENTS_MD_NAME;

export interface OpencodeSidecar {
    /** generated command file (relative, forward slashes) → content hash */
    commands: Record<string, number>;
    /** hash of the opencode.json we last wrote (absent: we never wrote it) */
    configHash?: number;
    ts: number;
}

export type OpencodeConfigState =
    | 'not-needed'   // the walk already reaches the constitution
    | 'absent'       // needed, no config file yet
    | 'ours'         // needed, our instruction entry is in place
    | 'incomplete'   // a config we wrote, but the entry is gone
    | 'foreign'      // a config we did not write — merged if provably safe
    | 'unmergeable'; // comments / JSONC / unparseable — never re-serialized

export interface OpencodeState {
    /** Where OpenCode's instruction walk stops when launched in this folder. */
    worktree: string;
    /** Is that boundary a git repository, or the `/` fallback? */
    vcs: 'git' | 'none';
    /** Will the walk alone carry the shared constitution into a turn? */
    reachesConstitution: boolean;
    /** The file OpenCode reads for this agent's identity (the Codex lane's). */
    identity: 'AGENTS.md' | 'CLAUDE.md' | 'none';
    configState: OpencodeConfigState;
    /** Generated command files that were edited by hand since we wrote them. */
    commandsDiverged: string[];
    /**
     * The ONE global instruction file this engine will also be carrying, or
     * null. Nobody configures this in Agent Farm and it is easy not to know
     * about: with no `~/.config/opencode/AGENTS.md`, OpenCode falls back to the
     * user's personal `~/.claude/CLAUDE.md` — a file written for a different
     * engine, loaded into every OpenCode turn on this machine.
     */
    globalInstruction: string | null;
}

/** OpenCode's global instruction candidates, in the order it tries them. */
export function opencodeGlobalInstruction(
    home: string = process.env.USERPROFILE || process.env.HOME || '',
    exists: (p: string) => boolean = fs.existsSync
): string | null {
    for (const p of [
        path.join(home, '.config', 'opencode', AGENTS_MD_NAME),
        path.join(home, '.claude', 'CLAUDE.md')
    ]) {
        if (exists(p)) { return p; }
    }
    return null;
}

/**
 * OpenCode's worktree, derived the way OpenCode derives it: the nearest
 * ancestor holding a `.git` (file or directory — a submodule's `.git` is a
 * file), else `/`. `/` is not a typo and not a placeholder: it is the literal
 * value OpenCode reports, and it makes the walk run to the drive root.
 */
export function opencodeWorktree(dir: string, exists: (p: string) => boolean = fs.existsSync): string {
    return gitRootOf(dir, exists) || '/';
}

/**
 * Does the up-walk alone carry the nest's AGENTS.md into an OpenCode turn
 * started in this agent folder? True when the constitution mirror sits inside
 * the same worktree; false when the agent folder is its own worktree.
 *
 * `constitutionPath` is the nest's CLAUDE.md — the SOURCE. What OpenCode reads
 * is its AGENTS.md mirror in the same folder, so that mirror has to exist:
 * a constitution that was never synced is out of reach however the walk runs.
 */
export function opencodeReachesConstitution(
    agentDir: string,
    constitutionPath: string | undefined,
    exists: (p: string) => boolean = fs.existsSync
): boolean {
    if (!constitutionPath) { return true; }
    const mirror = path.join(path.dirname(constitutionPath), AGENTS_MD_NAME);
    if (!exists(mirror)) { return false; }
    const worktree = opencodeWorktree(agentDir, exists);
    if (worktree === '/') { return true; }   // the walk runs to the drive root
    return isWithin(worktree, path.dirname(constitutionPath));
}

/**
 * A standing duty becomes an OpenCode command (`/slug`), the engine's own
 * equivalent of the Antigravity workflow. `template` is the body — OpenCode
 * refuses a `template:` key in the frontmatter, so it is NOT written there.
 */
export function dutyCommand(duty: Duty): { file: string; content: string } {
    const lines = [
        '---',
        `description: ${duty.title} (Agent Farm standing duty, cadence: ${duty.cadence})`,
        '---',
        '',
        COMMAND_MARKER,
        '',
        `# ${duty.title}`,
        ''
    ];
    if (duty.watch) { lines.push(`1. Check the watch target: ${duty.watch}`); }
    lines.push(`${duty.watch ? '2' : '1'}. ${duty.action || 'Do what DUTIES.md describes for this duty.'}`);
    lines.push('');
    lines.push(`Cadence: ${duty.cadence}. The canonical definition lives in DUTIES.md — keep that file the source of truth.`);
    return {
        file: path.join(OPENCODE_COMMAND_DIR, dutySlug(duty.title) + '.md'),
        content: lines.join('\n') + '\n'
    };
}

interface ClaudeMcpServer {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    type?: string;
    url?: string;
    headers?: Record<string, string>;
}

/**
 * `.mcp.json` (`mcpServers`) → OpenCode's `mcp` block. Not a copy: the shapes
 * genuinely differ and getting them wrong is silent. Measured from the config
 * reference the binary ships: `command` is an ARRAY (executable first, then the
 * args), `type` is REQUIRED and is `local` or `remote`, and the env map is
 * called `environment`, not `env`.
 */
export function mcpJsonToOpencode(
    mcpServers: Record<string, ClaudeMcpServer>
): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [name, cfg] of Object.entries(mcpServers)) {
        if (cfg.url) {
            out[name] = {
                type: 'remote',
                url: cfg.url,
                enabled: true,
                ...(cfg.headers && Object.keys(cfg.headers).length ? { headers: cfg.headers } : {})
            };
        } else if (cfg.command) {
            out[name] = {
                type: 'local',
                command: [cfg.command, ...(cfg.args ?? []).map(String)],
                enabled: true,
                ...(cfg.env && Object.keys(cfg.env).length ? { environment: cfg.env } : {})
            };
        }
    }
    return out;
}

/**
 * The config fragment for `OPENCODE_CONFIG_CONTENT` — what Agent Farm hands to
 * the OpenCode processes IT starts when the walk cannot reach the constitution.
 * Returns undefined when there is nothing to inject.
 *
 * ‼️ ABSOLUTE here, RELATIVE in the file, and the difference is not cosmetic.
 * The file travels with the repo, so it must not carry this machine's paths;
 * the environment is built at launch and never leaves the process, so it can
 * name the constitution exactly — which matters because a task may run with a
 * `workDir` somewhere else entirely, where `../AGENTS.md` would mean a
 * different file or no file at all.
 */
export function opencodeConfigFragment(
    agentDir: string,
    constitutionPath: string | undefined,
    exists: (p: string) => boolean = fs.existsSync
): string | undefined {
    if (opencodeReachesConstitution(agentDir, constitutionPath, exists)) { return undefined; }
    if (!constitutionPath) { return undefined; }
    const mirror = path.join(path.dirname(constitutionPath), AGENTS_MD_NAME);
    if (!exists(mirror)) { return undefined; }
    return JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        instructions: [mirror.replace(/\\/g, '/')]
    });
}

/**
 * The env additions for one OpenCode process we start. Empty when the walk
 * already reaches the constitution — which is the normal layout, so this adds
 * nothing to nearly every run.
 *
 * ‼️ This covers the processes that get their OWN environment: headless
 * `opencode run` and a terminal launch. It cannot cover the Console, because
 * the ACP runtime is ONE process for every card (X-38's 383 MB decision) and a
 * process-wide variable cannot say something different per agent. The Console
 * is covered by the `instructions` entry in the agent's own opencode.json
 * instead — OpenCode reads that per instance directory — and when that file
 * could not be written, `syncToOpencode` says so rather than implying cover it
 * does not have.
 */
export function opencodeSpawnEnv(
    agentDir: string,
    constitutionPath: string | undefined,
    exists: (p: string) => boolean = fs.existsSync
): Record<string, string> {
    const fragment = opencodeConfigFragment(agentDir, constitutionPath, exists);
    return fragment ? { OPENCODE_CONFIG_CONTENT: fragment } : {};
}

export function readOpencodeSidecar(agentDir: string): OpencodeSidecar | undefined {
    try {
        const json = JSON.parse(fs.readFileSync(path.join(agentDir, SIDECAR_REL), 'utf8')) as OpencodeSidecar;
        return { ...json, commands: json.commands ?? {} };
    } catch { return undefined; }
}

function writeOpencodeSidecar(agentDir: string, sidecar: OpencodeSidecar): void {
    const file = path.join(agentDir, SIDECAR_REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sidecar, null, 2), 'utf8');
}

/**
 * A JSON file we may re-serialize without destroying anything. Comments are the
 * disqualifier: `JSON.parse` drops them and writing back would delete the
 * user's own notes from their own file. Detected outside string literals, so a
 * `"https://…"` value is not mistaken for a comment.
 */
export function isPlainJson(raw: string): boolean {
    let inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc) { esc = false; } else if (c === '\\') { esc = true; } else if (c === '"') { inStr = false; }
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '/' && (raw[i + 1] === '/' || raw[i + 1] === '*')) { return false; }
    }
    try { JSON.parse(raw); } catch { return false; }
    return true;
}

function configFiles(agentDir: string): string[] {
    return [
        path.join(agentDir, OPENCODE_CONFIG_NAME),
        path.join(agentDir, 'opencode.jsonc'),
        path.join(agentDir, '.opencode', OPENCODE_CONFIG_NAME)
    ];
}

/** The config OpenCode will actually load for this agent folder, if any. */
function existingConfig(agentDir: string): { file: string; raw: string } | undefined {
    for (const f of configFiles(agentDir)) {
        const raw = safeReadFile(f);
        if (raw !== undefined) { return { file: f, raw }; }
    }
    return undefined;
}

function hasInstruction(parsed: unknown): boolean {
    const instr = (parsed as { instructions?: unknown })?.instructions;
    return Array.isArray(instr) && instr.some(i =>
        typeof i === 'string' && i.replace(/\\/g, '/') === CONSTITUTION_INSTRUCTION);
}

/**
 * What OpenCode currently sees for this agent, and what this lane would have to
 * write. Reads only — safe to call on every panel refresh.
 */
export function opencodeStatus(agentDir: string, constitutionPath?: string): OpencodeState {
    const worktree = opencodeWorktree(agentDir);
    const reaches = opencodeReachesConstitution(agentDir, constitutionPath);
    const identity: OpencodeState['identity'] =
        fs.existsSync(path.join(agentDir, AGENTS_MD_NAME)) ? 'AGENTS.md'
            : fs.existsSync(path.join(agentDir, 'CLAUDE.md')) ? 'CLAUDE.md' : 'none';

    let configState: OpencodeConfigState = 'not-needed';
    if (!reaches) {
        const existing = existingConfig(agentDir);
        const sidecar = readOpencodeSidecar(agentDir);
        if (!existing) {
            configState = 'absent';
        } else if (!isPlainJson(existing.raw)) {
            configState = 'unmergeable';
        } else {
            const ours = sidecar?.configHash !== undefined && sidecar.configHash === hashString(existing.raw);
            const present = hasInstruction(JSON.parse(existing.raw));
            configState = present ? 'ours' : (ours ? 'incomplete' : 'foreign');
        }
    }

    const sidecar = readOpencodeSidecar(agentDir);
    const commandsDiverged: string[] = [];
    for (const [rel, h] of Object.entries(sidecar?.commands ?? {})) {
        const cur = safeReadFile(path.join(agentDir, rel));
        if (cur !== undefined && hashString(cur) !== h) { commandsDiverged.push(rel); }
    }

    return {
        worktree,
        vcs: worktree === '/' ? 'none' : 'git',
        reachesConstitution: reaches,
        identity,
        configState,
        commandsDiverged,
        globalInstruction: opencodeGlobalInstruction()
    };
}

function backupFile(file: string): string | undefined {
    try {
        const backup = `${file}.${Date.now()}.afbak`;
        fs.copyFileSync(file, backup);
        return backup;
    } catch { return undefined; }
}

/**
 * The OpenCode lane, layered on an already-run Antigravity/Codex sync exactly
 * the way `syncCodexExtras` is. It writes NO instruction file of its own: the
 * agent's identity is the AGENTS.md the Codex lane already owns, and a second
 * copy would be a second thing to drift.
 *
 * What it does write: duty commands, an MCP suggestion, and — only when the
 * walk cannot reach the constitution — the one `instructions` entry that
 * repairs it. Idempotent; safe to call on every sync.
 */
export function syncToOpencode(
    agentDir: string,
    duties: Duty[],
    opts: { force?: boolean; constitutionPath?: string } = {}
): SyncResult {
    const result: SyncResult = { written: [], skipped: [], backups: [], notes: [] };
    const previous = readOpencodeSidecar(agentDir);
    const sidecar: OpencodeSidecar = { commands: {}, configHash: previous?.configHash, ts: Date.now() };

    // ── Identity ────────────────────────────────────────────────────────────
    const identity = opencodeStatus(agentDir, opts.constitutionPath).identity;
    if (identity === 'AGENTS.md') {
        result.notes.push('OpenCode: reads the same AGENTS.md this folder already has — one identity file, not a second copy. It SHADOWS CLAUDE.md for this engine (first matching name wins).');
    } else if (identity === 'CLAUDE.md') {
        result.notes.push('OpenCode: no AGENTS.md yet, so it is reading CLAUDE.md — run the Antigravity/Codex sync first and AGENTS.md takes over.');
    } else {
        result.notes.push('OpenCode: this folder has no instruction file at all.');
    }

    // ── The constitution's reach ────────────────────────────────────────────
    const reaches = opencodeReachesConstitution(agentDir, opts.constitutionPath);
    if (!opts.constitutionPath) {
        // nothing to reach
    } else if (reaches) {
        result.notes.push(`OpenCode: the shared constitution is reached by the instruction walk (worktree ${opencodeWorktree(agentDir)}) — nothing to configure.`);
    } else {
        writeInstructionEntry(agentDir, previous, sidecar, result, opts.force === true);
    }

    // ── Duties → OpenCode commands ──────────────────────────────────────────
    for (const duty of duties.filter(d => !d.paused)) {
        const cmd = dutyCommand(duty);
        const full = path.join(agentDir, cmd.file);
        const key = cmd.file.replace(/\\/g, '/');
        const current = safeReadFile(full);
        const prevHash = previous?.commands[key];
        if (current !== undefined && !current.includes(COMMAND_MARKER)) {
            result.skipped.push(cmd.file);
            result.notes.push(`${cmd.file}: an OpenCode command with this name already exists (not ours) — left untouched.`);
            continue;
        }
        if (current !== undefined && prevHash !== undefined && hashString(current) !== prevHash && !opts.force) {
            result.skipped.push(cmd.file);
            result.notes.push(`${cmd.file}: edited by hand since the last sync — left untouched.`);
            // ‼️ The OLD fingerprint is kept, not the edited one. Recording the
            // hand edit would make the next status read call this file in sync
            // and the divergence would be reported exactly once, to whoever
            // happened to be looking — which is the same as not reporting it.
            sidecar.commands[key] = prevHash;
            continue;
        }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, cmd.content, 'utf8');
        result.written.push(cmd.file);
        sidecar.commands[key] = hashString(cmd.content);
    }

    // ── MCP ─────────────────────────────────────────────────────────────────
    const mcpRaw = safeReadFile(path.join(agentDir, '.mcp.json'));
    if (mcpRaw) {
        try {
            const parsed = JSON.parse(mcpRaw) as { mcpServers?: Record<string, ClaudeMcpServer> };
            const servers = parsed.mcpServers ?? {};
            if (Object.keys(servers).length) {
                const translated = mcpJsonToOpencode(servers);
                const out = path.join(agentDir, OPENCODE_MCP_SUGGESTED_REL);
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, JSON.stringify({
                    $schema: 'https://opencode.ai/config.json',
                    mcp: translated
                }, null, 2) + '\n', 'utf8');
                result.written.push(OPENCODE_MCP_SUGGESTED_REL);
                // ‼️ Names and counts only. The values in `environment`/`headers`
                // are credentials; they belong in the file next to the .mcp.json
                // they came from and NOWHERE a log, a toast or a bridge reply
                // can carry them.
                const withSecrets = Object.values(translated)
                    .filter(s => s.environment || s.headers).length;
                result.notes.push(
                    `OpenCode MCP: ${Object.keys(translated).length} server(s) translated into ${OPENCODE_MCP_SUGGESTED_REL} ` +
                    `(shape differs from .mcp.json: command is an array, type is required, env is "environment")` +
                    (withSecrets ? `; ${withSecrets} carry values that are not printed anywhere` : '') +
                    '. Merge it yourself — Agent Farm never edits your live OpenCode config.');
            }
        } catch { result.notes.push('OpenCode MCP: .mcp.json is not valid JSON — snippet skipped.'); }
    }

    // ── Skills ──────────────────────────────────────────────────────────────
    // Nothing to do, and saying so is the point: OpenCode auto-loads
    // `~/.claude/skills/<name>/SKILL.md`, so the skills this farm already
    // generates are found without being copied. Copying them would create a
    // second set to keep in step for no gain.
    result.notes.push('OpenCode skills: none copied — it auto-loads ~/.claude/skills/<name>/SKILL.md, which is where these already live.');

    // ── The global file nobody configured ───────────────────────────────────
    const global = opencodeGlobalInstruction();
    if (global && /[\\/]\.claude[\\/]CLAUDE\.md$/.test(global)) {
        result.notes.push(
            `OpenCode also loads ${global} into every turn on this machine — it falls back to your personal Claude file when ~/.config/opencode/AGENTS.md does not exist. ` +
            'Agent Farm does not write there; put an AGENTS.md in the OpenCode config folder if you want that slot to say something else.');
    }

    writeOpencodeSidecar(agentDir, sidecar);
    return result;
}

/**
 * Put `instructions: ["../AGENTS.md"]` into the agent's own opencode.json —
 * but only when that can be done without destroying anything the user wrote.
 * A JSONC file, a file with comments, or one that will not parse is NEVER
 * re-serialized: the fragment goes to our processes through the environment
 * instead, and the manual-TUI gap is named rather than hidden.
 */
function writeInstructionEntry(
    agentDir: string,
    previous: OpencodeSidecar | undefined,
    sidecar: OpencodeSidecar,
    result: SyncResult,
    force: boolean
): void {
    const gap =
        'A manual `opencode` run started outside Agent Farm will still be blind to the constitution — ' +
        `add \`"instructions": ["${CONSTITUTION_INSTRUCTION}"]\` to this folder's ${OPENCODE_CONFIG_NAME} yourself.`;
    const injected =
        'Agent Farm passes it to the OpenCode processes that get their own environment — headless task and schedule runs — through OPENCODE_CONFIG_CONTENT. ' +
        'Console cards are NOT covered that way: the ACP runtime is one process for every card, so a process-wide variable cannot say something different per agent. ';

    const existing = existingConfig(agentDir);
    const rel = existing ? path.relative(agentDir, existing.file) : OPENCODE_CONFIG_NAME;

    if (existing && !isPlainJson(existing.raw)) {
        result.skipped.push(rel);
        result.notes.push(
            `OpenCode: the constitution is OUTSIDE this folder's worktree (${opencodeWorktree(agentDir)}), so the instruction walk cannot see it. ` +
            `${rel} carries comments or will not parse, and re-serializing it would delete them — left untouched. ${injected}${gap}`);
        return;
    }

    let obj: Record<string, unknown> = { $schema: 'https://opencode.ai/config.json' };
    if (existing) {
        obj = JSON.parse(existing.raw) as Record<string, unknown>;
        const ours = previous?.configHash !== undefined && previous.configHash === hashString(existing.raw);
        if (!ours && !force && !hasInstruction(obj)) {
            // A config the user wrote. Adding one array entry to a file that
            // parses cleanly is the merge X-39 asks for — but it is still their
            // file, so it gets a backup and is named in the result.
            const b = backupFile(existing.file);
            if (b) { result.backups.push(b); }
        }
    }
    if (hasInstruction(obj)) {
        result.notes.push(`OpenCode: ${rel} already carries the constitution instruction — nothing to change.`);
        sidecar.configHash = existing ? hashString(existing.raw) : sidecar.configHash;
        return;
    }
    const instructions = Array.isArray(obj.instructions) ? (obj.instructions as unknown[]).slice() : [];
    instructions.push(CONSTITUTION_INSTRUCTION);
    obj.instructions = instructions;
    if (!obj.$schema) { obj.$schema = 'https://opencode.ai/config.json'; }

    const target = existing ? existing.file : path.join(agentDir, OPENCODE_CONFIG_NAME);
    const content = JSON.stringify(obj, null, 2) + '\n';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    sidecar.configHash = hashString(content);
    result.written.push(path.relative(agentDir, target));
    result.notes.push(
        `OpenCode: the constitution is OUTSIDE this folder's worktree (${opencodeWorktree(agentDir)}), so the instruction walk cannot see it — ` +
        `\`instructions: ["${CONSTITUTION_INSTRUCTION}"]\` added to ${path.relative(agentDir, target)}, which reaches above the worktree (measured).`);
}
