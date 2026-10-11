/**
 * X-536 — TEACH SESSIONS AGENT FARM DOES NOT START: an `agent-farm` skill.
 *
 * The start card reaches every session whose engine fires a hook Agent Farm
 * answers, and every run Agent Farm launches. A session the user opens in a
 * terminal on an engine with no such hook knows nothing — and a long session
 * can lose the card to compaction. An Agent Skill closes both gaps: only its
 * name and description sit in context; the body loads when the conversation
 * turns to Agent Farm.
 *
 * ‼️ CONSENT FIRST. The skill folders are the user's engine configuration, so
 * `manual.install` PLANS unless confirm=true, and a file without our marker is
 * never overwritten or removed. Once installed, a skill we wrote is refreshed
 * on activation when the manual changes, so it never describes an old build.
 *
 * ‼️ MEASURED TARGETS ONLY BY DEFAULT. Claude Code (`~/.claude/skills`, which
 * account slots share and OpenCode also reads) and Codex (`$CODEX_HOME/skills`,
 * shared the same way) are known from this codebase. Gemini CLI and
 * Antigravity are listed as unmeasured: they install only when named, and the
 * table must be re-measured per the engine SOP before they become default.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CompiledManual, renderCard } from '../service/manualQuery';

export const SKILL_NAME = 'agent-farm';
const MARKER = '<!-- agent-farm:managed';

export interface SkillTarget {
    engine: string;
    file: string;
    measured: boolean;
    /** another target that already serves this engine */
    via?: string;
    note: string;
}

export function skillTargets(home: string, env: Record<string, string | undefined> = process.env): SkillTarget[] {
    const codexHome = String(env.CODEX_HOME ?? '').trim() || path.join(home, '.codex');
    const at = (dir: string) => path.join(dir, SKILL_NAME, 'SKILL.md');
    return [
        { engine: 'claude', file: at(path.join(home, '.claude', 'skills')), measured: true,
            note: 'Claude Code user skills; every captured account shares this folder.' },
        { engine: 'opencode', file: at(path.join(home, '.claude', 'skills')), measured: true, via: 'claude',
            note: 'OpenCode loads ~/.claude/skills, so the Claude Code copy serves it.' },
        { engine: 'codex', file: at(path.join(codexHome, 'skills')), measured: true,
            note: 'Codex user skills ($CODEX_HOME/skills); every captured account shares this folder.' },
        { engine: 'gemini', file: at(path.join(home, '.gemini', 'skills')), measured: false,
            note: 'Gemini CLI user skills. Not yet measured on a real install: named explicitly only.' },
        { engine: 'agy', file: at(path.join(home, '.gemini', 'antigravity', 'skills')), measured: false,
            note: 'Antigravity global skills. Not yet measured on a real install: named explicitly only.' }
    ];
}

/** The skill as an agent reads it: the card with the portable command, then the map in brief. */
export function skillText(m: CompiledManual): string {
    const af = 'node "$HOME/.agentfarm/af.js"';
    const areas = m.docs.filter(d => d.kind === 'area')
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id))
        .map(a => `- **${a.id}**: ${a.summary}`).join('\n');
    const playbooks = m.docs.filter(d => d.kind === 'playbook')
        .map(p => `- \`${p.id}\`: ${p.title}`).join('\n');
    return [
        '---',
        `name: ${SKILL_NAME}`,
        'description: Drive Agent Farm, the VS Code control room for coding agents on this machine. Use it to '
            + 'start, queue, schedule, trigger, chain, delegate and monitor agent work (tasks, schedules, triggers, '
            + 'workflows, missions with a lead and a team, baton relays, notices to the user, work queue, projects, '
            + 'accounts). Use whenever the user asks for something Agent Farm does or mentions agents, tasks, '
            + 'schedules, missions, relays, notices or the farm.',
        '---',
        `${MARKER} version=${m.version}: written by the Agent Farm extension; edits are overwritten. -->`,
        '',
        '# Agent Farm',
        '',
        renderCard(m.card, { af, version: m.version }),
        '',
        'In PowerShell and bash alike the command is `node "$HOME/.agentfarm/af.js" <op>`.',
        '',
        '## Areas (`farm.guide id=<area>`)',
        areas,
        '',
        '## Playbooks for common requests (`farm.guide id=<playbook>`)',
        playbooks,
        ''
    ].join('\n');
}

export type InstallAction = 'create' | 'update' | 'same' | 'via' | 'foreign' | 'unmeasured';

export interface InstallRow { engine: string; file: string; action: InstallAction; note: string }

function readText(file: string): string | undefined {
    try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; }
}

export function isManaged(text: string | undefined): boolean {
    return !!text && text.includes(MARKER);
}

/** What install would do per target. `engines` names targets; omitted = every measured one. */
export function planInstall(targets: readonly SkillTarget[], text: string, engines?: readonly string[]): InstallRow[] {
    const wanted = engines?.length ? new Set(engines.map(e => e.toLowerCase())) : undefined;
    return targets.filter(t => !wanted || wanted.has(t.engine)).map(t => {
        if (t.via) { return { engine: t.engine, file: t.file, action: 'via' as const, note: t.note }; }
        if (!t.measured && !wanted) { return { engine: t.engine, file: t.file, action: 'unmeasured' as const, note: t.note }; }
        const now = readText(t.file);
        if (now === undefined) { return { engine: t.engine, file: t.file, action: 'create' as const, note: t.note }; }
        if (!isManaged(now)) {
            return { engine: t.engine, file: t.file, action: 'foreign' as const,
                note: 'A skill of the same name that Agent Farm did not write is there; it is left alone.' };
        }
        return { engine: t.engine, file: t.file, action: now === text ? 'same' as const : 'update' as const, note: t.note };
    });
}

export function applyInstall(rows: readonly InstallRow[], text: string): string[] {
    const written: string[] = [];
    for (const r of rows) {
        if (r.action !== 'create' && r.action !== 'update') { continue; }
        fs.mkdirSync(path.dirname(r.file), { recursive: true });
        fs.writeFileSync(r.file, text, 'utf8');
        written.push(r.file);
    }
    return written;
}

/** Remove only what we wrote; a foreign skill of the same name is reported and kept. */
export function removeSkills(targets: readonly SkillTarget[], engines?: readonly string[]): { removed: string[]; kept: string[] } {
    const wanted = engines?.length ? new Set(engines.map(e => e.toLowerCase())) : undefined;
    const removed: string[] = [];
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const t of targets) {
        if ((wanted && !wanted.has(t.engine)) || seen.has(t.file)) { continue; }
        seen.add(t.file);
        const now = readText(t.file);
        if (now === undefined) { continue; }
        if (!isManaged(now)) { kept.push(t.file); continue; }
        try {
            fs.unlinkSync(t.file);
            try { fs.rmdirSync(path.dirname(t.file)); } catch { /* not empty: the user put something there */ }
            removed.push(t.file);
        } catch { kept.push(t.file); }
    }
    return { removed, kept };
}

/** On activation: bring every skill WE installed up to this build. Never installs a new one. */
export function refreshInstalled(targets: readonly SkillTarget[], text: string): string[] {
    const rows = targets.filter(t => !t.via && isManaged(readText(t.file)))
        .map(t => ({ engine: t.engine, file: t.file, action: (readText(t.file) === text ? 'same' : 'update') as InstallAction, note: t.note }));
    return applyInstall(rows, text);
}

export function skillStatus(targets: readonly SkillTarget[], text: string): { engine: string; file: string; measured: boolean; installed: boolean; managed: boolean; current: boolean; via?: string }[] {
    return targets.map(t => {
        const now = readText(t.file);
        return {
            engine: t.engine, file: t.file, measured: t.measured,
            installed: now !== undefined, managed: isManaged(now), current: now === text,
            ...(t.via ? { via: t.via } : {})
        };
    });
}
