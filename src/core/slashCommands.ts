/**
 * K-29 — THE SLASH COMMAND CATALOG, AND WHOSE ANSWER IT IS.
 *
 * A composer that offers `/` has to answer one question: **which commands can
 * this session actually run?** The answer has three sources and they do not
 * carry the same authority, which is the whole design:
 *
 * 1. **What the session itself reported.** Claude names its own commands in
 *    `system:init.slash_commands`, and that list is the only one that knows
 *    this install: measured here, it came back with 47 entries mixing the CLI's
 *    own (`/model`, `/compact`, `/context`) with the skills THIS machine has
 *    (`/dataviz`, `/account-signup`) and two internal ones nobody types
 *    (`__remote-workflow`). No shipped table can be right about that.
 * 2. **What is on disk.** `.claude/commands/**\/*.md`, the skills folders and an
 *    engine's workflow folder are files: exact, readable, and namespaced by
 *    their own folders (`commands/git/cleanup.md` → `/git:cleanup`).
 * 3. **What this build knows about the engine.** A conservative set, and it
 *    exists for ONE moment: before a session has started there is nobody to ask,
 *    and a composer offering an empty list is a composer nobody presses twice.
 *
 * ‼️ SO THE PRECEDENCE IS FIXED AND ONE-WAY: a command the session reported
 * replaces the shipped entry of the same name, and a command on disk replaces
 * both — because the disk is where a description was actually written. The
 * shipped table never overwrites anything; it only fills a gap.
 *
 * ‼️ AND WHY THIS FUNCTION DOES NOT READ THE DISK ITSELF. It runs on every
 * keystroke in the composer's `/` box. A pure function over sets that were
 * gathered once is a filter; a function that walks three folders is a stutter.
 * The gathering is the host's job (`toolbox.ts` already does it for the Toolbox
 * page, and this uses the same scanners rather than a second reader).
 */

import { EngineId } from './engines';

/** Where a command came from, which is also how much it can be trusted. */
export type SlashScope =
    | 'engine'    // the CLI's own — shipped table or the session's own report
    | 'local'     // a .md file under a commands/ folder, namespaced by folder
    | 'skill'     // a SKILL.md folder the engine exposes as a command
    | 'workflow'; // an engine workflow file (Antigravity .agents/workflows)

export interface SlashCommand {
    /** As typed, WITH the leading slash: `/cost`, `/git:cleanup`. */
    name: string;
    description: string;
    scope: SlashScope;
    /** '' = any engine can run it (a disk command); otherwise whose it is. */
    engine: EngineId | '';
    /** What follows the name — `<name>`, `[branch]`, '' when it takes none. */
    args: string;
    /** The file behind it, when there is one. */
    source?: string;
    /**
     * ‼️ K-31 will print a warning for these and it is a MEASURED property, not
     * a style: a command whose whole job is to open an interactive menu (`/model`
     * with no argument, `/config`) has nothing to draw in a hosted stream-json
     * session — it can only answer with text. Marking it here rather than in the
     * picker keeps the fact with the command instead of in a list of names the
     * UI has to keep in step.
     */
    tui?: boolean;
    /** True when the running session named it — this install, not this build. */
    reported?: boolean;
}

/**
 * ‼️ THE SHIPPED TABLE IS DELIBERATELY SHORT, and every entry in it is one this
 * build can defend: for Claude, each name below was seen in a real
 * `system:init.slash_commands` on this machine, and the descriptions are ours.
 * Commands that only exist because of an installed skill are NOT here — they
 * arrive with the session's own report, where they belong.
 *
 * The other engines carry what their own documentation states. An engine with
 * no entry is not a bug: it gets whatever is on disk plus whatever it reports,
 * which is the honest answer for a CLI this build has not measured.
 */
export const BUILTIN_SLASH: Record<string, SlashCommand[]> = {
    claude: [
        b('/clear', 'Start a fresh conversation — the transcript is kept, the context is not.'),
        b('/compact', 'Summarise the conversation so far and carry on with the summary.', '[instructions]'),
        b('/context', 'What is in the context window right now, by category.'),
        b('/cost', 'What this session has spent.'),
        b('/model', 'Which model answers the next turn.', '[name]', true),
        b('/effort', 'How hard the model thinks before answering.', '[level]', true),
        b('/config', 'Open the settings.', '', true),
        b('/agents', 'The subagents available here.', '', true),
        b('/mcp', 'The MCP servers, their status and their tools.', '', true),
        b('/usage', 'Where the rolling limits stand.'),
        b('/init', 'Write a CLAUDE.md for this repository.'),
        b('/import', 'Bring another conversation into this one.', '<session>'),
        b('/rename', 'Give this session your own name.', '<name>'),
        b('/recap', 'What has happened in this session so far.'),
        b('/insights', 'What this session has learned worth keeping.'),
        b('/doctor', 'Check the installation and say what is wrong with it.'),
        b('/reload-skills', 'Re-read the skills folders without restarting.'),
        b('/color', 'Change the theme.', '', true)
    ],
    agy: [
        b('/goal', 'State what this run is FOR — the workflow reads it.', '<goal>', false, 'agy'),
        b('/plan', 'Ask for a plan before anything is changed.', '[scope]', false, 'agy'),
        b('/browser', 'Drive a browser for this step.', '[url]', false, 'agy')
    ],
    codex: [
        b('/model', 'Which model answers the next turn.', '[name]', true, 'codex'),
        b('/approvals', 'How much Codex may do without asking.', '', true, 'codex'),
        b('/new', 'Start a fresh thread.', '', false, 'codex')
    ],
    opencode: [
        b('/models', 'Switch provider or model.', '', true, 'opencode'),
        b('/sessions', 'The conversations OpenCode is holding.', '', true, 'opencode'),
        b('/share', 'Publish this conversation as a link.', '', false, 'opencode')
    ],
    gemini: [
        b('/chat', 'Save, resume or list conversations.', '<save|resume|list>', true, 'gemini'),
        b('/compress', 'Replace the conversation with a summary of it.', '', false, 'gemini'),
        b('/tools', 'Which tools this session can call.', '', true, 'gemini')
    ]
};

function b(
    name: string, description: string, args = '', tui = false, engine: EngineId = 'claude'
): SlashCommand {
    return { name, description, scope: 'engine', engine, args, ...(tui ? { tui: true } : {}) };
}

/** What the host gathered, so the filter below never touches a disk. */
export interface SlashSources {
    /** `.claude/commands/**` — already namespaced by folder (`/git:cleanup`). */
    commands?: { name: string; description: string; source: string; argumentHint?: string }[];
    /** Skill folders the engine exposes as commands. */
    skills?: { name: string; description: string; source: string }[];
    /** Engine workflow files (Antigravity `.agents/workflows`). */
    workflows?: { name: string; description: string; source: string }[];
    /** ‼️ The names the RUNNING session reported — this install, not this build. */
    reported?: string[];
}

export interface SlashQuery {
    engine?: string;
    /**
     * X-97 — which provider is behind the engine. Kept as a plain id and passed
     * through rather than switched on: a provider narrows the MODEL list, not
     * the command list, and inventing a per-provider command table here would be
     * a rule nobody measured. It reaches the entries so an adapter can filter
     * with knowledge this module does not have.
     */
    provider?: string;
    sources?: SlashSources;
    /** Free text to narrow by, with or without the leading slash. */
    q?: string;
}

const withSlash = (n: string): string => (n.startsWith('/') ? n : '/' + n);

/**
 * ‼️ AN INTERNAL NAME IS NOT A COMMAND. A reported list carries entries no
 * person types — measured here: `__remote-workflow`, `workflow-launch-exec`.
 * Offering them in a picker is offering a way to break the session.
 */
const typeable = (name: string): boolean => !/^\/?_/.test(name);

/**
 * The catalog for one place, in precedence order: disk beats the session's
 * report beats the shipped table. Sorted by name, so the picker's order is a
 * property of the answer rather than of the order three scanners happened to
 * finish in.
 */
export function getSlashCommands(query: SlashQuery = {}): SlashCommand[] {
    const engine = (query.engine ?? 'claude').trim().toLowerCase() || 'claude';
    const byName = new Map<string, SlashCommand>();
    // 3 — the shipped table, first in so anything real can replace it
    for (const c of BUILTIN_SLASH[engine] ?? []) { byName.set(c.name, { ...c }); }
    // 2 — what the session said it has. A name already in the table keeps its
    // description (ours is the only one there is) and is marked as CONFIRMED by
    // the running process; a name we had never heard of is added plainly.
    for (const raw of query.sources?.reported ?? []) {
        const name = withSlash(String(raw).trim());
        if (!typeable(name)) { continue; }
        const had = byName.get(name);
        byName.set(name, had
            ? { ...had, reported: true }
            : {
                name, description: '', scope: 'engine',
                engine: engine as EngineId, args: '', reported: true
            });
    }
    // 1 — the disk. A file is the only source with a description somebody wrote
    // on purpose, so it wins outright.
    for (const c of query.sources?.commands ?? []) {
        const name = withSlash(c.name);
        byName.set(name, {
            name, description: c.description || '', scope: 'local',
            engine: '', args: c.argumentHint ?? '', source: c.source,
            ...(byName.get(name)?.reported ? { reported: true } : {})
        });
    }
    for (const s of query.sources?.skills ?? []) {
        const name = withSlash(s.name);
        byName.set(name, {
            name, description: s.description || '', scope: 'skill',
            engine: '', args: '', source: s.source,
            ...(byName.get(name)?.reported ? { reported: true } : {})
        });
    }
    for (const w of query.sources?.workflows ?? []) {
        const name = withSlash(w.name);
        byName.set(name, {
            name, description: w.description || '', scope: 'workflow',
            engine: '', args: '', source: w.source,
            ...(byName.get(name)?.reported ? { reported: true } : {})
        });
    }
    const all = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return narrowSlash(all, query.q);
}

/**
 * ‼️ THE FILTER IS A SEPARATE FUNCTION BECAUSE THE PICKER TYPES INTO IT. The
 * catalog is gathered once per session; this runs per keystroke, and a filter
 * that re-ran the merge would make a `/` box feel like a network call.
 *
 * A leading slash is optional and a `:` is not special: typing `git` finds
 * `/git:cleanup`, which is the whole reason folder namespacing was worth having.
 */
export function narrowSlash(list: SlashCommand[], q?: string): SlashCommand[] {
    const needle = (q ?? '').trim().replace(/^\//, '').toLowerCase();
    if (!needle) { return list; }
    const hit = (c: SlashCommand): boolean =>
        c.name.slice(1).toLowerCase().includes(needle)
        || c.description.toLowerCase().includes(needle);
    return list.filter(hit);
}

/**
 * ‼️ K-29 — MERGING WHAT A SESSION REPORTS INTO WHAT IT ALREADY REPORTED.
 *
 * `system:init` arrives once per process, but a session can be resumed and a
 * skill can be added while it runs (`/reload-skills`), so a second init on the
 * same state must ADD rather than replace: a list that shrank because the
 * second report was partial would take commands away from a picker that had
 * them a moment ago. Order is preserved — the engine's own is the order the
 * engine gave.
 */
export function mergeReported(had: string[] | undefined, next: unknown): string[] {
    const incoming = Array.isArray(next)
        ? next.map(x => String(x)).filter(x => x.trim())
        : [];
    if (!incoming.length) { return had ?? []; }
    const out = [...(had ?? [])];
    for (const name of incoming) { if (!out.includes(name)) { out.push(name); } }
    return out;
}
