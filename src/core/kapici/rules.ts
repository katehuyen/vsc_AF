/**
 * X-410 — the rule registry. Three layers, later wins on the same id:
 * builtin (shipped in code) → system (agentFarm.kapici.rulesDir, else _KAPICI
 * in every agent root) → project (.kapici/ in the project's repo root).
 * A file is re-read only when its mtime or size changes; a broken file is
 * reported by name and never hides the layer below it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseRule } from './schema';
import { KapiciRule, LoadedRule, RuleLayer } from './types';

export const SYSTEM_DIR_NAME = '_KAPICI';
export const PROJECT_DIR_NAME = '.kapici';

export interface RuleProblem { file: string; layer: RuleLayer; error: string }

/** The system layer's folders: the setting when it is set, else _KAPICI in every agent root. */
export function systemRuleDirs(setting: string | undefined, agentRoots: string[]): string[] {
    const s = (setting ?? '').trim();
    if (s) { return [s]; }
    return [...new Set(agentRoots.map(r => (r ?? '').trim()).filter(Boolean).map(r => path.join(r, SYSTEM_DIR_NAME)))];
}

interface Cached { mtimeMs: number; size: number; res: { rule: KapiciRule } | { error: string } }

export class RuleRegistry {
    private readonly cache = new Map<string, Cached>();

    constructor(private readonly builtin: KapiciRule[], private readonly systemDirs: () => string[]) { }

    /** Every rule visible from a project (or from none), with the layer that won and any file that failed. */
    load(projectRoot?: string): { rules: LoadedRule[]; problems: RuleProblem[] } {
        const problems: RuleProblem[] = [];
        const byId = new Map<string, LoadedRule>();
        const put = (rule: KapiciRule, layer: RuleLayer, file?: string) => {
            const prev = byId.get(rule.id);
            if (prev && prev.layer === layer && file) {
                problems.push({ file, layer, error: `${rule.id} is also defined in ${prev.file ?? 'the code'} — this file wins, keep one` });
            }
            const overrides = prev ? [...(prev.overrides ?? []), prev.layer] : undefined;
            byId.set(rule.id, { rule, layer, ...(file ? { file } : {}), ...(overrides ? { overrides } : {}) });
        };
        for (const r of this.builtin) { put(r, 'builtin'); }
        for (const d of this.systemDirs()) {
            for (const x of this.readDir(d, 'system', problems)) { put(x.rule, 'system', x.file); }
        }
        if (projectRoot && projectRoot.trim()) {
            for (const x of this.readDir(path.join(projectRoot, PROJECT_DIR_NAME), 'project', problems)) { put(x.rule, 'project', x.file); }
        }
        return { rules: [...byId.values()].sort((a, b) => a.rule.id.localeCompare(b.rule.id)), problems };
    }

    get(id: string, projectRoot?: string): LoadedRule | undefined {
        return this.load(projectRoot).rules.find(l => l.rule.id === id);
    }

    /** The rule, or a sentence saying it is missing and what there is instead. */
    find(id: string, projectRoot?: string): LoadedRule | { error: string } {
        const { rules, problems } = this.load(projectRoot);
        const hit = rules.find(l => l.rule.id === id);
        if (hit) { return hit; }
        const broken = problems.find(p => path.basename(p.file, '.json') === id);
        if (broken) { return { error: `the rule "${id}" in ${broken.file} is refused: ${broken.error}` }; }
        return { error: `there is no Kapici rule "${id}" — kapici.rules lists ${rules.length ? rules.map(l => l.rule.id).join(', ') : 'none'}` };
    }

    private readDir(dir: string, layer: RuleLayer, problems: RuleProblem[]): { rule: KapiciRule; file: string }[] {
        let names: string[];
        try { names = fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.json')).sort(); } catch { return []; }
        const out: { rule: KapiciRule; file: string }[] = [];
        for (const n of names) {
            const file = path.join(dir, n);
            let st: fs.Stats;
            try { st = fs.statSync(file); } catch { continue; }
            if (!st.isFile()) { continue; }
            let c = this.cache.get(file);
            if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
                let res: Cached['res'];
                try { res = parseRule(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { res = { error: `unreadable — ${(e as Error).message}` }; }
                c = { mtimeMs: st.mtimeMs, size: st.size, res };
                this.cache.set(file, c);
            }
            if ('error' in c.res) { problems.push({ file, layer, error: c.res.error }); } else { out.push({ rule: c.res.rule, file }); }
        }
        return out;
    }
}
