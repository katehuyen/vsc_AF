/**
 * SUPERPOWERS — SKILLS THAT SLEEP ON DISK, AND THE ONE PAGE THAT WAKES THEM.
 *
 * ‼️ WHY THIS IS NOT "LOAD THE SKILLS INTO THE PROMPT". The library is fourteen
 * markdown skills — TDD, systematic debugging, planning, brainstorming,
 * verification before completion. Putting them all in front of a model would be
 * a permanent bill on every turn of every session AND would put a procedure in
 * front of work that does not need one. So the files stay where they are at
 * **zero tokens**, and only the library's own root hook is injected when the
 * user asks for it. A model that has read the hook fetches the one skill it
 * needs, at the moment it needs it, with its own file tool.
 *
 * ‼️ AND WHY THE HOOK ALONE IS NOT ENOUGH. The hook says "invoke the relevant
 * skill" because it was written for a harness with a skill REGISTRY behind it.
 * Here they are plain files in a folder: an instruction to invoke something,
 * with no way to find out what exists or where it lives, is an instruction to
 * guess. So the block is the hook PLUS an index — every skill's name, what it
 * is for, and its absolute path. That index is read out of the skills
 * themselves (each one's own frontmatter), so a folder swapped for a newer
 * release describes itself correctly without anybody editing this file.
 *
 * This module is pure: paths and text in, text out. Whether a session gets the
 * block, and how it reaches the CLI, belongs to the caller.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BridgeRegistry } from './bridge';

/** The library's own root hook, relative to the skills folder. */
export const SUPERPOWERS_HOOK_REL = path.join('using-superpowers', 'SKILL.md');

/** Where the library sits inside an agent nest when nobody has said otherwise. */
export const SUPERPOWERS_NEST_REL = path.join('_SKILLS', 'superpowers');

/**
 * ‼️ X-136 — THE EMPTY SETTING RESOLVES AGAINST THE AGENTS, NOT AGAINST THIS
 * MACHINE.
 *
 * The fallback used to be one literal path, which is a folder that exists on
 * exactly one computer: the same portability rule `agentRoots` and the wiki
 * root already obey, broken in the one place nobody would look. The library
 * lives WITH the agents (`<nest>/_SKILLS/superpowers`), so the agent roots
 * already say where it is — and a root that names a single agent rather than a
 * nest has it one level up, which is why the parent is tried too.
 *
 * The first candidate that actually holds the hook wins, because "a folder is
 * there" and "a session can be given something" are different questions and
 * only the second one matters. With nothing found, the FIRST candidate is
 * returned anyway rather than '': the health report has to name a path a person
 * can read, and "the skills folder is not there: …" is an answer, while an
 * empty string is a shrug. No roots at all is the one honest '' — there is
 * nothing to resolve against.
 *
 * Roots arrive already expanded (`%USERPROFILE%`, `~`, `${workspaceRoot}`):
 * expansion is the caller's, so this stays pure.
 */
export function superpowersFallbackRoot(roots: string[]): string {
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const raw of roots) {
        const root = String(raw ?? '').trim();
        if (!root) { continue; }
        // The nest itself, then the folder holding it — a root pointed straight
        // at one agent has the library beside that agent, not under it.
        for (const base of [root, path.dirname(root)]) {
            if (!base || base === path.dirname(base)) { continue; }
            const cand = path.join(base, SUPERPOWERS_NEST_REL);
            const key = cand.replace(/[\\/]+$/, '').toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key);
            candidates.push(cand);
        }
    }
    if (!candidates.length) { return ''; }
    const withHook = candidates.find(c => {
        try { return fs.statSync(path.join(c, SUPERPOWERS_HOOK_REL)).isFile(); } catch { return false; }
    });
    if (withHook) { return withHook; }
    const exists = candidates.find(c => {
        try { return fs.statSync(c).isDirectory(); } catch { return false; }
    });
    return exists ?? candidates[0];
}

/**
 * How much of the hook is allowed into a system prompt.
 *
 * The same reasoning as `PROJECT_BRIEF_MAX`: this text rides on every spawn of
 * every session that has the switch on, so its size is a standing cost rather
 * than a one-off. The library's own hook is about 2.6 KB of body; the cap is
 * there for the folder somebody points at that is not that.
 */
export const SUPERPOWERS_HOOK_MAX = 8000;

export interface SkillInfo {
    /** The folder name — what the skill is called at the path. */
    id: string;
    /** `name:` from its frontmatter, or the folder name when it has none. */
    name: string;
    /** `description:` from its frontmatter — when it applies, in one line. */
    description: string;
    /** The SKILL.md itself, absolute. */
    file: string;
    /** The other markdown in that skill's folder, by file name. A skill points
     *  at these itself; they are listed so a reader can see they exist. */
    extras: string[];
}

/** Frontmatter as a flat map. Values may run onto following indented lines,
 *  which is how a long description is written in this library. */
function frontMatter(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) { return out; }
    let key = '';
    for (const raw of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(raw);
        if (kv) { key = kv[1].toLowerCase(); out[key] = kv[2].trim(); continue; }
        if (key && /^\s+\S/.test(raw)) { out[key] = (out[key] + ' ' + raw.trim()).trim(); }
    }
    return out;
}

/** The body — everything after the frontmatter, which is registry metadata and
 *  means nothing to a model reading the text as instructions. */
function body(text: string): string {
    const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
    return (m ? text.slice(m[0].length) : text).trim();
}

/**
 * Every skill in the folder, in the order a person would read them (by name).
 * A folder with no `SKILL.md` is not a skill and is skipped in silence — the
 * library ships `assets/` and `docs/` beside the skills.
 */
export function readSkills(root: string): SkillInfo[] {
    let dirs: string[] = [];
    try {
        dirs = fs.readdirSync(root, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name);
    } catch { return []; }
    const out: SkillInfo[] = [];
    for (const id of dirs) {
        const file = path.join(root, id, 'SKILL.md');
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const fm = frontMatter(text);
        let extras: string[] = [];
        try {
            extras = fs.readdirSync(path.join(root, id))
                .filter(f => /\.md$/i.test(f) && f !== 'SKILL.md').sort();
        } catch { /* the folder is readable enough */ }
        out.push({
            id,
            name: fm.name || id,
            description: fm.description || '',
            file,
            extras
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export interface SuperpowersHealth {
    /** The folder, resolved. */
    root: string;
    /** …and as the setting spells it, when the two differ (X-57's rule). */
    setting: string;
    exists: boolean;
    /** The root hook — the one file whose absence means there is nothing to
     *  inject, whatever else the folder holds. */
    hook: string;
    hookFound: boolean;
    skills: { id: string; name: string; description: string; extras: number }[];
    /** Can a session be given anything at all from here? */
    usable: boolean;
    why: string;
}

export function superpowersHealth(root: string, setting = ''): SuperpowersHealth {
    const hook = path.join(root, SUPERPOWERS_HOOK_REL);
    const exists = (() => { try { return fs.statSync(root).isDirectory(); } catch { return false; } })();
    const hookFound = (() => { try { return fs.statSync(hook).isFile(); } catch { return false; } })();
    const skills = readSkills(root);
    // ‼️ The hook is the whole mechanism, so its absence is the one refusal that
    // matters and it is named rather than reported as "0 skills".
    const why = !exists
        ? `The skills folder is not there: ${root}`
        : !hookFound
            ? `${SUPERPOWERS_HOOK_REL} is missing — that file IS the hook; without it there is nothing to put in front of a model.`
            : !skills.length ? 'The folder holds no skill (no <name>/SKILL.md in it).' : '';
    return {
        root, setting: setting.trim(),
        exists, hook, hookFound,
        skills: skills.map(s => ({ id: s.id, name: s.name, description: s.description, extras: s.extras.length })),
        usable: exists && hookFound && skills.length > 0,
        why
    };
}

/**
 * THE TEXT A SESSION IS GIVEN — the hook, then where the skills actually are.
 *
 * Returns '' when the folder cannot supply one, which is the caller's cue to
 * add nothing at all: half a hook ("use the relevant skill" with no skills
 * behind it) is worse than silence, because the model would go looking.
 */
export function superpowersBlock(root: string): string {
    const health = superpowersHealth(root);
    if (!health.usable) { return ''; }
    let hook = '';
    try { hook = body(fs.readFileSync(health.hook, 'utf8')); } catch { return ''; }
    if (hook.length > SUPERPOWERS_HOOK_MAX) {
        hook = hook.slice(0, SUPERPOWERS_HOOK_MAX).trimEnd()
            + `\n\n…(cut at ${SUPERPOWERS_HOOK_MAX} characters — the whole file is ${health.hook})`;
    }
    const skills = readSkills(root);
    const lines = skills.map(s => `- **${s.name}** — ${s.description || 'no description in its frontmatter'}\n  \`${s.file}\``);
    return [
        '# Superpowers — engineering discipline',
        '',
        hook,
        '',
        '## The skills, and where they are',
        '',
        'They are plain markdown files on this machine, not a registered skill',
        'system: there is nothing to "invoke". When one applies, READ IT with your',
        'file tool, at the path given here, and then follow it. A path written',
        'inside a skill is relative to that skill\'s own folder.',
        '',
        ...lines,
        '',
        `Root: \`${root}\``
    ].join('\n');
}

/**
 * ‼️ WHO GETS THE DISCIPLINE WITHOUT BEING ASKED.
 *
 * The switch is per session, but a switch that starts off every single time is
 * a switch nobody remembers to flip: the agent whose whole job is building
 * software wants TDD and root-cause debugging on its first turn, and the agent
 * that files notes into a vault does not. So the default is per AGENT — and it
 * is a SETTING with this only as its fallback, because a constant is a default
 * the user cannot disagree with.
 */
export const SUPERPOWERS_DEFAULT_AGENTS = ['developer'];

/**
 * Is the switch on for this agent when nobody has touched it?
 *
 * Matched on the agent's NAME, case- and space-insensitively, because a name is
 * what a person types into a settings box. An explicit `false` in the store
 * beats the built-in list: turning the default OFF for `developer` has to be
 * possible, and an entry that could only ever mean "on" would make it not.
 */
export function superpowersDefaultFor(
    agentName: string, store?: Record<string, boolean>
): boolean {
    const key = String(agentName ?? '').trim().toLowerCase();
    if (!key) { return false; }
    const hit = store && Object.keys(store).find(k => k.trim().toLowerCase() === key);
    if (hit !== undefined) { return !!(store as Record<string, boolean>)[hit]; }
    return SUPERPOWERS_DEFAULT_AGENTS.includes(key);
}

/**
 * ‼️ ONTO THE ROW THAT IS ALREADY THERE — the one rule every writer of this
 * setting has to obey, so it is written once.
 *
 * The map is keyed by a name a person typed and `superpowersDefaultFor` reads
 * it case-insensitively, so writing `DEVELOPER` beside an existing `developer`
 * would leave two rows for one agent and whichever `Object.keys` reached first
 * would decide. Shared by the bridge op and the settings page rather than
 * copied into each: two writers of one setting is exactly how the second row
 * appears.
 */
export function superpowersDefaultsKey(
    agent: string, store?: Record<string, boolean>
): string {
    const name = String(agent ?? '').trim();
    return Object.keys(store ?? {})
        .find(k => k.trim().toLowerCase() === name.toLowerCase()) ?? name;
}

export interface SuperpowersDeps {
    /** The skills folder — the setting, resolved. */
    root(): string;
    /** …and as the user typed it, for the report. */
    rootSetting?(): string;
    /** Per-agent defaults, as the setting holds them. */
    defaults?(): Record<string, boolean>;
    /** Write one agent's answer back into that setting. Absent = the store is
     *  read-only here, which is what a test wants. */
    setDefault?(agent: string, on: boolean): Promise<void> | void;
}

export function registerSuperpowersOps(bridge: BridgeRegistry, deps: SuperpowersDeps): void {
    bridge.register([
        {
            op: 'superpowers.status',
            describe: 'X-55 — the engineering-discipline skills that sleep on disk: where the folder is, whether the root hook (using-superpowers/SKILL.md) is in it, every skill it holds with the one line saying when it applies, and WHICH AGENTS start a session with the switch already on (`defaults`, from agentFarm.superpowersDefaults; an agent not named there falls back to the built-in list). No arguments. ‼️ Nothing here is loaded into a session by reading this — the skills cost nothing until a session is given the hook, which is what makes keeping fourteen of them affordable.',
            handler: () => ({
                ...superpowersHealth(deps.root(), deps.rootSetting ? deps.rootSetting() : ''),
                defaults: deps.defaults ? deps.defaults() : {},
                defaultAgents: SUPERPOWERS_DEFAULT_AGENTS
            })
        },
        {
            op: 'superpowers.set',
            describe: 'X-55 — turn the engineering discipline on or off BY DEFAULT for one agent: every session that agent starts from then on is given the hook (or is not) without anybody touching the switch in the composer. args: agent (its name), on (true|false). This is the DEFAULT, not a running session — a session already open keeps whatever it was started with, because its system prompt was written at spawn and cannot be rewritten under it. Ask superpowers.status for the current map.',
            handler: async (args) => {
                const agent = String((args as Record<string, unknown>).agent ?? '').trim();
                if (!agent) { throw new Error('which agent? — pass agent:"<name>"'); }
                if (!deps.setDefault) { throw new Error('the defaults are read-only here'); }
                const on = (args as Record<string, unknown>).on !== false;
                // Onto the row that is already there — the shared rule, so the
                // settings page and this op cannot disagree about the key.
                const key = superpowersDefaultsKey(agent, deps.defaults ? deps.defaults() : {});
                await deps.setDefault(key, on);
                return {
                    agent: key, on,
                    defaults: deps.defaults ? deps.defaults() : {},
                    note: on
                        ? 'New sessions for this agent start with the Superpowers hook in their system prompt.'
                        : 'New sessions for this agent start plain — nothing is added.'
                };
            }
        },
        {
            op: 'superpowers.hook',
            describe: 'X-55 — the exact text a session is given when the switch is on: the library\'s own root hook, plus an index of every skill with its absolute path (the hook was written for a harness with a skill registry; here they are plain files, so "invoke the relevant skill" needs the list to be worth anything). No arguments. Answers `{ text, chars, skills }`, and an empty text when the folder cannot supply one — half a hook is worse than none, because the model goes looking for skills that are not there.',
            handler: () => {
                const text = superpowersBlock(deps.root());
                return {
                    text, chars: text.length,
                    skills: readSkills(deps.root()).map(s => s.id),
                    ...(text ? {} : { why: superpowersHealth(deps.root()).why })
                };
            }
        }
    ]);
}
