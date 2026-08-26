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

export interface SuperpowersDeps {
    /** The skills folder — the setting, resolved. */
    root(): string;
    /** …and as the user typed it, for the report. */
    rootSetting?(): string;
}

export function registerSuperpowersOps(bridge: BridgeRegistry, deps: SuperpowersDeps): void {
    bridge.register([
        {
            op: 'superpowers.status',
            describe: 'X-55 — the engineering-discipline skills that sleep on disk: where the folder is, whether the root hook (using-superpowers/SKILL.md) is in it, and every skill it holds with the one line saying when it applies. No arguments. ‼️ Nothing here is loaded into a session by reading this — the skills cost nothing until a session is given the hook, which is what makes keeping fourteen of them affordable.',
            handler: () => superpowersHealth(deps.root(), deps.rootSetting ? deps.rootSetting() : '')
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
