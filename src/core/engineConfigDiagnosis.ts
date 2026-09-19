/**
 * X-116 — WHAT THE ENGINES' OWN CONFIG FILES SAY ABOUT PROVIDER AND MODEL,
 * READ AND NEVER WRITTEN.
 *
 * A launch records the provider and model Agent Farm ASKED for; the engine then
 * reads its own configuration and can answer the same question again from a
 * file nobody on the page is looking at:
 *
 * - **Claude Code** reads an `env` block out of every settings file it loads.
 *   `ANTHROPIC_BASE_URL` in an agent's own `.claude/settings.json` sends every
 *   run started in that folder somewhere else, AFTER the spawn cleared the
 *   inherited variables — the route recorded is not the route used, and
 *   nothing says so. The fleet-wide file is `providerHealth`'s; the per-folder
 *   ones are here, because a route can be answered for one agent and not the
 *   next.
 * - **OpenCode** takes its default `model` from the global and the project
 *   `opencode.json`, and merges a `provider` block of the user's own into its
 *   catalog. A bare model id there is exactly the ambiguity X-116 forbids
 *   guessing through.
 *
 * ‼️ READ-ONLY BY CONSTRUCTION. This module imports no file system: the caller
 * hands it a READER, and there is nothing here that could be handed a writer.
 * The files are the user's (`providerOwnership` → `config`), and an automated
 * edit to a hand-kept config is a change nobody asked for and nobody can find
 * afterwards. Every finding names the file so the person can edit it.
 *
 * ‼️ NO VALUE LEAVES A SECRET-SHAPED FIELD. An `env` block, `options.apiKey`,
 * `headers` — only their NAMES reach a sentence, never what they hold. What is
 * reported is what the bridge may carry: key names, file paths, provider ids and
 * model refs.
 */
import * as path from 'path';
import { stripJsonc } from './settingsops';
import { isRouteEnvName } from './providerRuntime';

/** Where a file sits in the engine's own precedence. */
export type ConfigScope = 'global' | 'project' | 'local';

/** One file as the caller found it. `text` undefined = not on disk. */
export interface EngineConfigFile {
    engine: string;
    scope: ConfigScope;
    file: string;
    /** The agents whose runs load this file — several share a nest-level one. */
    agents: string[];
    text?: string;
}

/** What was read, for the bridge. Names only. */
export interface EngineConfigRead {
    engine: string;
    scope: ConfigScope;
    file: string;
    agents: string[];
    state: 'read' | 'unreadable';
    keys: string[];
}

export interface EngineConfigDiagnosis {
    files: EngineConfigRead[];
    problems: string[];
    notes: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

function parse(text: string): Record<string, unknown> | undefined {
    try {
        const j = JSON.parse(stripJsonc(text)) as unknown;
        return isObj(j) ? j : undefined;
    } catch { return undefined; }
}

function whose(f: EngineConfigFile): string {
    if (f.scope === 'global') { return 'every run on this machine'; }
    const names = [...new Set(f.agents)].sort();
    if (!names.length) { return 'runs started in that folder'; }
    return names.length === 1 ? `${names[0]}'s runs` : `the runs of ${names.join(', ')}`;
}

function claudeFindings(f: EngineConfigFile, j: Record<string, unknown>, out: EngineConfigDiagnosis): void {
    const env = isObj(j.env) ? Object.keys(j.env).filter(isRouteEnvName).sort() : [];
    if (env.length) {
        out.problems.push(`${env.join(', ')} ${env.length > 1 ? 'are' : 'is'} set in the env block of `
            + `${f.file}, which ${whose(f)} load — a spawn cannot clear it, so the route Agent Farm `
            + 'records is answered a second time from inside the process');
    }
    if (str(j.apiKeyHelper)) {
        out.problems.push(`${f.file} names an apiKeyHelper, so for ${whose(f)} the CLI fetches its own `
            + 'credential — the sign-in a route injects is answered a second time from that script');
    }
}

function opencodeFindings(
    f: EngineConfigFile, j: Record<string, unknown>, out: EngineConfigDiagnosis,
    known: ReadonlySet<string> | undefined
): void {
    for (const key of ['model', 'small_model']) {
        const ref = str(j[key]);
        if (!ref) { continue; }
        const what = key === 'model' ? 'default model' : 'small model';
        const slash = ref.indexOf('/');
        if (slash <= 0) {
            out.problems.push(`${f.file} sets the ${what} to "${ref}", a bare model id — OpenCode names a `
                + 'model as provider/model, and which provider a bare id means cannot be proved here, '
                + 'so it is left unknown rather than guessed');
            continue;
        }
        const provider = ref.slice(0, slash);
        if (known && !known.has(provider)) {
            out.problems.push(`${f.file} sets the ${what} to ${ref}, but "${provider}" is not a provider `
                + `the engine's catalog offers — for ${whose(f)}, a run that names no model of its own `
                + 'would ask for one nothing serves');
            continue;
        }
        out.notes.push(`${f.file} sets the ${what} to ${ref} for ${whose(f)} — a run that names no `
            + 'model of its own runs on it');
    }
    if (isObj(j.provider)) {
        const ids = Object.keys(j.provider).sort();
        if (ids.length) {
            const plain = ids.filter(id => {
                const p = (j.provider as Record<string, unknown>)[id];
                const key = isObj(p) && isObj(p.options) ? str(p.options.apiKey) : '';
                return !!key && !/^\{(env|file):/.test(key);
            });
            out.notes.push(`${f.file} declares ${ids.length === 1 ? 'a provider' : `${ids.length} providers`} `
                + `of its own (${ids.join(', ')}); OpenCode merges ${ids.length === 1 ? 'it' : 'them'} into `
                + 'its catalog, and Agent Farm reads the names and never the options'
                + (plain.length ? `. ${plain.join(', ')} ${plain.length > 1 ? 'hold keys' : 'holds a key'} `
                    + 'written into the file itself rather than {env:…} — not read, copied or shown here' : ''));
        }
    }
    for (const key of ['disabled_providers', 'enabled_providers']) {
        const list = Array.isArray(j[key]) ? (j[key] as unknown[]).map(str).filter(Boolean) : [];
        if (!list.length) { continue; }
        out.notes.push(`${f.file} ${key === 'disabled_providers' ? 'switches off' : 'allows only'} `
            + `${list.join(', ')} for ${whose(f)}`);
    }
}

/**
 * The verdict over every file the caller found. `catalogProviders` is the
 * engine's published provider list, or undefined when nobody has read it — in
 * which case a named provider is neither confirmed nor refused.
 */
export function diagnoseEngineConfig(
    files: readonly EngineConfigFile[], catalogProviders?: readonly string[]
): EngineConfigDiagnosis {
    const out: EngineConfigDiagnosis = { files: [], problems: [], notes: [] };
    const known = catalogProviders ? new Set(catalogProviders) : undefined;
    for (const f of files) {
        if (f.text === undefined) { continue; }
        const j = parse(f.text);
        out.files.push({
            engine: f.engine, scope: f.scope, file: f.file, agents: [...new Set(f.agents)].sort(),
            state: j ? 'read' : 'unreadable', keys: j ? Object.keys(j).sort() : []
        });
        if (!j) {
            out.problems.push(`${f.file} does not parse as JSON or JSONC, so nothing in it could be read — `
                + `the engine loading it for ${whose(f)} may refuse it or skip it`);
            continue;
        }
        if (f.engine === 'claude') { claudeFindings(f, j, out); }
        if (f.engine === 'opencode') { opencodeFindings(f, j, out, known); }
    }
    return out;
}

/** An agent as the collector needs it. */
export interface ConfigAgent { name: string; dir: string; engine?: string }

export interface CollectDeps {
    home: string;
    agents: readonly ConfigAgent[];
    /** Returns the file's text, or undefined when there is none. Never writes. */
    read: (file: string) => string | undefined;
    /** OpenCode's worktree for a folder — the walk for project configs stops there. */
    worktreeOf: (dir: string) => string;
}

const OPENCODE_NAMES = ['opencode.json', 'opencode.jsonc', path.join('.opencode', 'opencode.json')];

/**
 * The files each engine really loads, grouped so a nest-level file shared by
 * five agents is one entry naming five agents rather than five findings.
 */
export function collectEngineConfigFiles(engine: string, deps: CollectDeps): EngineConfigFile[] {
    const byFile = new Map<string, EngineConfigFile>();
    const absent = new Set<string>();
    const add = (scope: ConfigScope, file: string, agent: string | undefined): void => {
        const k = path.resolve(file).toLowerCase();
        if (absent.has(k)) { return; }
        const had = byFile.get(k);
        if (had) { if (agent) { had.agents.push(agent); } return; }
        const text = deps.read(file);
        if (text === undefined) { absent.add(k); return; }
        byFile.set(k, { engine, scope, file, agents: agent ? [agent] : [], text });
    };
    if (engine === 'claude') {
        for (const a of deps.agents) {
            add('project', path.join(a.dir, '.claude', 'settings.json'), a.name);
            add('local', path.join(a.dir, '.claude', 'settings.local.json'), a.name);
        }
    } else if (engine === 'opencode') {
        for (const n of ['opencode.json', 'opencode.jsonc', 'config.json']) {
            add('global', path.join(deps.home, '.config', 'opencode', n), undefined);
        }
        for (const a of deps.agents) {
            const stop = path.resolve(deps.worktreeOf(a.dir)).toLowerCase();
            let cur = path.resolve(a.dir);
            for (; ;) {
                for (const n of OPENCODE_NAMES) { add('project', path.join(cur, n), a.name); }
                const parent = path.dirname(cur);
                if (cur.toLowerCase() === stop || parent === cur) { break; }
                cur = parent;
            }
        }
    }
    return [...byFile.values()];
}
