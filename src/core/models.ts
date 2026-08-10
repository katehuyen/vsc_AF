/**
 * S-20 — WHAT MODELS DOES THIS ENGINE OFFER *TODAY*?
 *
 * ‼️ A HARDCODED MODEL LIST IS AN EXPIRY DATE. Every picker in this extension
 * was fed one list — `agentFarm.modelAliases`, four Claude aliases typed by
 * hand — no matter which engine was about to run. Two failures came out of the
 * same root:
 *
 *   · Choosing Codex still offered `haiku / sonnet / opus / fable`, while the
 *     CLI's own `/model` was offering `gpt-5.6-sol` and five others. Every one
 *     of those boxes could only produce a `--model` the engine would reject.
 *   · And the Claude half rots on its own schedule: a model released tomorrow
 *     is in the CLI that evening and still missing from this list months later,
 *     because a constant only changes when somebody remembers it exists.
 *
 * So the list is not written here. It is READ from what the engine itself is
 * currently offering, and the hand-typed setting becomes the fallback for the
 * engines that cannot tell us — never the answer for the ones that can.
 *
 * WHERE EACH ENGINE KEEPS ITS ANSWER (measured 2026-08-10):
 *   · Codex — `~/.codex/models_cache.json`, refreshed by the CLI against the
 *     service. It carries the same rows, in the same order, that `/model`
 *     draws: `visibility: "list"` filtered, `priority` ascending. It also
 *     carries each model's OWN reasoning vocabulary, which is why the effort
 *     box is answered from here too (gpt-5.6-luna has five levels, gpt-5.5 has
 *     four — one shared list was wrong for both).
 *   · Claude Code — no full catalog on disk: the aliases are inside the CLI
 *     bundle and `~/.claude/.claude.json` holds only `additionalModelOptionsCache`,
 *     what THIS account additionally gets (measured: the Fable row). So Claude
 *     is the user's alias list PLUS whatever the CLI has recorded for the
 *     account — which is how a newly-granted model appears without an edit.
 *   · Gemini — nothing measured, so nothing claimed: the setting stands, and
 *     the source says so rather than implying a catalog exists.
 *   · Antigravity (S-21, measured 2026-08-10) — NOTHING ON DISK AT ALL, and
 *     that is the interesting case. `agy models` asks the service and prints the
 *     answer; there is no `models_cache.json` anywhere under `~/.gemini`. So its
 *     catalog cannot be read the way the other two are — it has to be RUN. The
 *     parser is here and pure (`readAgyCatalog`); the spawning and the caching
 *     of its output belong to the caller, which passes the text in.
 *
 * Pure over injected readers, exactly like `engines.ts`: the whole matrix is
 * testable without a home directory.
 */

import { EngineId, EngineProbe } from './engines';
import { EFFORT_CHOICES, LaunchChoice } from './launch';

const CODEX_CATALOG = '.codex/models_cache.json';
const CLAUDE_STATE = '.claude/.claude.json';

/** Where a list came from — a picker that cannot say this is asking to be
 *  trusted for no reason. */
export type ModelSource =
    /** the engine's own catalog, as its `/model` reads it */
    | 'catalog'
    /** the user's `agentFarm.modelAliases` — nothing better was on disk */
    | 'settings';

export interface EngineModels {
    /** the rows a model picker draws, "Default" first */
    models: LaunchChoice[];
    /**
     * Effort rows keyed by model id, plus a `''` entry: the list to use for a
     * model the catalog says nothing about (and for every engine that states no
     * per-model vocabulary at all).
     */
    efforts: Record<string, LaunchChoice[]>;
    /** what the engine would pick for a model when the box says Default */
    defaultEffort: Record<string, string>;
    source: ModelSource;
    /** when the CLI last refreshed its catalog, if it records it */
    fetchedAt?: number;
    /** ONE line for the box's tooltip: what this list is and where it came
     *  from. A list nobody can date is a list nobody can distrust. */
    note: string;
}

function json(text: string | undefined): Record<string, unknown> | undefined {
    if (!text) { return undefined; }
    try {
        const v = JSON.parse(text) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    } catch { return undefined; }
}

const DEFAULT_ROW: LaunchChoice = {
    id: '', label: 'Default', detail: "the agent's own model setting / the CLI default"
};

/** The user's own list, the shape every picker takes. */
function fromAliases(aliases: string[]): LaunchChoice[] {
    return aliases.filter(a => typeof a === 'string' && a.trim())
        .map(a => ({ id: a.trim(), label: a.trim(), detail: 'passed as --model' }));
}

/**
 * Codex's catalog, read the way the CLI reads it.
 *
 * `visibility` is the field that keeps routing aliases and internal review
 * models out of a human's picker (`gpt-5.6-sol-wm`, `codex-auto-review`), and
 * `priority` is the order the CLI shows — reproducing both is what makes this
 * box agree with the terminal instead of merely being non-empty.
 */
export function readCodexCatalog(text: string | undefined): {
    models: LaunchChoice[];
    efforts: Record<string, LaunchChoice[]>;
    defaultEffort: Record<string, string>;
    fetchedAt?: number;
} | undefined {
    const root = json(text);
    const list = root?.models;
    if (!Array.isArray(list)) { return undefined; }
    const rows = list
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .filter(m => typeof m.slug === 'string' && m.slug.trim())
        .filter(m => m.visibility !== 'hide')
        .sort((a, b) => (typeof a.priority === 'number' ? a.priority : 1e9)
            - (typeof b.priority === 'number' ? b.priority : 1e9));
    if (!rows.length) { return undefined; }

    const models: LaunchChoice[] = [];
    const efforts: Record<string, LaunchChoice[]> = {};
    const defaultEffort: Record<string, string> = {};
    for (const m of rows) {
        const id = String(m.slug).trim();
        models.push({
            id,
            label: typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name.trim() : id,
            // the slug is what actually goes on the command line, so a picker
            // that shows a pretty name has to keep it readable somewhere
            detail: [String(m.description ?? '').trim(), id].filter(Boolean).join(' · ')
        });
        const levels = m.supported_reasoning_levels;
        if (Array.isArray(levels) && levels.length) {
            efforts[id] = [
                { id: '', label: 'Default', detail: 'no --effort flag — the model\'s own default' },
                ...levels
                    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
                    .filter(l => typeof l.effort === 'string' && l.effort.trim())
                    .map(l => ({
                        id: String(l.effort).trim(),
                        label: String(l.effort).trim(),
                        detail: String(l.description ?? '').trim() || 'passed as --effort'
                    }))
            ];
        }
        if (typeof m.default_reasoning_level === 'string' && m.default_reasoning_level.trim()) {
            defaultEffort[id] = m.default_reasoning_level.trim();
        }
    }
    const fetchedAt = Date.parse(String(root?.fetched_at ?? '').replace(/(\.\d{3})\d+/, '$1'));
    return {
        models: [DEFAULT_ROW, ...models],
        efforts,
        defaultEffort,
        fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : undefined
    };
}

/**
 * What Claude Code has recorded for THIS account, on top of the aliases.
 *
 * `additionalModelOptionsCache` is the CLI's own note of the models the account
 * was granted beyond the built-in names — the one place on disk that knows
 * about a model this extension has never heard of. Its rows carry a label and
 * a description already, so they are shown as the CLI words them.
 */
export function readClaudeExtras(text: string | undefined): LaunchChoice[] {
    const root = json(text);
    const list = root?.additionalModelOptionsCache;
    if (!Array.isArray(list)) { return []; }
    return list
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .filter(m => typeof m.value === 'string' && m.value.trim())
        .map(m => ({
            id: String(m.value).trim(),
            label: String(m.label ?? '').trim() || String(m.value).trim(),
            detail: String(m.description ?? '').trim() || 'offered to this account by the CLI'
        }));
}

/**
 * ‼️ ANTIGRAVITY'S CATALOG IS A LIST OF COMBINATIONS, AND THE PICKER NEEDS THE
 * AXES BACK.
 *
 * `agy models` prints one tab-separated row per SELECTABLE model, and eight of
 * the eleven rows on this machine are the same three models at three efforts:
 *
 *   gemini-3.6-flash-high      Gemini 3.6 Flash (High)
 *   gemini-3.6-flash-medium    Gemini 3.6 Flash (Medium)
 *   gemini-3.6-flash-low       Gemini 3.6 Flash (Low)
 *   …
 *   claude-sonnet-4-6          Claude Sonnet 4.6 (Thinking)
 *   gpt-oss-120b-medium        GPT-OSS 120B (Medium)
 *
 * Offering all eleven as models would be the literal answer and the wrong one:
 * the effort box beside it would then be dead, and the CLI REFUSES the pair
 * anyway — *invalid model selection (--model "gemini-3.6-flash-low" --effort
 * "medium")*. Its own error message is what says the axes are real: *gemini-3.1-pro
 * has no "medium" effort (available: low, high)*. So the rows are split back
 * into base × effort, which is exactly the shape S-20 already built for Codex,
 * and the split is confirmed by that message — this parser derives `low, high`
 * for `gemini-3.1-pro` from the list alone.
 *
 * ‼️ THE SPLIT NEEDS BOTH HALVES TO AGREE. The id must end in `-low|-medium|-high`
 * AND the label in `(Low)|(Medium)|(High)`. `claude-opus-4-6-thinking` ends in a
 * suffix that is not an effort, and `claude-sonnet-4-6` carries `(Thinking)` in
 * its label without one in its id; requiring both keeps either from being
 * mistaken for an effort and silently losing a model.
 */
export function readAgyCatalog(text: string | undefined): {
    models: LaunchChoice[];
    efforts: Record<string, LaunchChoice[]>;
} | undefined {
    const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) { return undefined; }

    const order: string[] = [];
    const bases = new Map<string, { label: string; efforts: string[] }>();
    for (const line of lines) {
        // The CLI prints `id<TAB>label`; a row with no tab is not a model row
        // (it is a banner, or a version of this command nobody has measured) and
        // is skipped rather than guessed at.
        const tab = line.indexOf('\t');
        if (tab <= 0) { continue; }
        const id = line.slice(0, tab).trim();
        const label = line.slice(tab + 1).trim();
        if (!id || /\s/.test(id)) { continue; }

        const m = /^(.*)-(low|medium|high)$/i.exec(id);
        const suffix = m ? m[2].toLowerCase() : '';
        const labelled = suffix && new RegExp(`\\(\\s*${suffix}\\s*\\)\\s*$`, 'i').test(label);
        const base = labelled ? m![1] : id;
        const baseLabel = labelled ? label.replace(/\s*\([^()]*\)\s*$/, '').trim() || base : label || id;

        if (!bases.has(base)) { bases.set(base, { label: baseLabel, efforts: [] }); order.push(base); }
        if (labelled) { bases.get(base)!.efforts.push(suffix); }
    }
    if (!order.length) { return undefined; }

    const models: LaunchChoice[] = [DEFAULT_ROW];
    const efforts: Record<string, LaunchChoice[]> = {};
    for (const base of order) {
        const row = bases.get(base)!;
        models.push({
            id: base,
            label: row.label,
            // the base id is what goes on the command line, so a picker showing a
            // pretty name has to keep it readable somewhere
            detail: row.efforts.length
                ? `${base} · ${row.efforts.join(', ')}`
                : `${base} · one setting, no effort to choose`
        });
        if (row.efforts.length) {
            efforts[base] = [
                { id: '', label: 'Default', detail: 'no --effort flag — the engine\'s own choice for this model' },
                ...row.efforts.map(e => ({
                    id: e, label: e,
                    detail: `passed as --effort — this model offers ${row.efforts.join(', ')}`
                }))
            ];
        } else {
            // ‼️ AN EMPTY LIST, NOT THE SHARED ONE. A model the catalog gives no
            // efforts for takes no `--effort` at all, and offering the generic
            // low/medium/high there would build a command line the CLI refuses.
            efforts[base] = [
                { id: '', label: 'Default', detail: 'this model has no effort setting — the box is not used' }
            ];
        }
    }
    return { models, efforts };
}

/** `2026-08-10T06:57:08Z` → `10.08.2026` in the user's locale, or ''. */
function ageNote(fetchedAt: number | undefined): string {
    if (!fetchedAt) { return ''; }
    const days = Math.floor((Date.now() - fetchedAt) / 86400e3);
    return days <= 0 ? ' Refreshed today.'
        : days === 1 ? ' Refreshed yesterday.'
            : ` Refreshed ${days} days ago.`;
}

/**
 * The model/effort answer for every engine, in one read.
 *
 * ‼️ A CATALOG THAT CANNOT BE READ FALLS BACK — LOUDLY. If `models_cache.json`
 * is missing (Codex installed but never run) the picker still has to offer
 * something, so the user's aliases stand; but `source` says `settings` and the
 * note says the catalog was not found, because a Claude alias silently offered
 * for Codex is exactly the bug this module exists to end.
 */
export function readEngineModels(
    probe: EngineProbe, aliases: string[],
    /**
     * ‼️ THE ONE CATALOG THAT IS NOT ON DISK. `agy models` has to be RUN, and
     * running a command on every picker draw is not something this module gets
     * to decide — so the caller spawns it, caches the output with its age, and
     * hands the text in. Absent means "not fetched yet", which is a different
     * thing from "the engine has none" and the note says which.
     */
    agyCatalog?: { text?: string; fetchedAt?: number }
): Record<EngineId, EngineModels> {
    const safe = <T>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };
    const settingsModels = [DEFAULT_ROW, ...fromAliases(aliases)];
    const staticEfforts = { '': EFFORT_CHOICES };

    const codexCatalog = safe(() => readCodexCatalog(probe.readHome(CODEX_CATALOG)));
    const codex: EngineModels = codexCatalog
        ? {
            models: codexCatalog.models,
            efforts: { '': EFFORT_CHOICES, ...codexCatalog.efforts },
            defaultEffort: codexCatalog.defaultEffort,
            source: 'catalog',
            fetchedAt: codexCatalog.fetchedAt,
            note: `${codexCatalog.models.length - 1} models, read from Codex's own catalog `
                + `(~/${CODEX_CATALOG}) — the same rows its /model offers.${ageNote(codexCatalog.fetchedAt)}`
        }
        : {
            models: settingsModels,
            efforts: staticEfforts,
            defaultEffort: {},
            source: 'settings',
            note: 'Codex has not written its model catalog yet (~/' + CODEX_CATALOG + ' is missing), '
                + 'so this is the agentFarm.modelAliases list — run Codex once and these become its own models.'
        };

    const extras = safe(() => readClaudeExtras(probe.readHome(CLAUDE_STATE))) ?? [];
    const seen = new Set<string>();
    const claudeModels = [DEFAULT_ROW, ...fromAliases(aliases), ...extras]
        .filter(m => { const k = m.id.toLowerCase(); if (seen.has(k)) { return false; } seen.add(k); return true; });
    const claude: EngineModels = {
        models: claudeModels,
        efforts: staticEfforts,
        defaultEffort: {},
        source: extras.length ? 'catalog' : 'settings',
        note: extras.length
            ? `Your agentFarm.modelAliases plus ${extras.length} model(s) Claude Code has recorded for this `
            + 'account — a newly granted model shows up here without an edit.'
            : 'Claude Code keeps no model catalog on disk, so this is your agentFarm.modelAliases list. '
            + 'Add a new alias there when one ships.'
    };

    const gemini: EngineModels = {
        models: settingsModels,
        efforts: staticEfforts,
        defaultEffort: {},
        source: 'settings',
        note: 'This engine states no model catalog, so this is the agentFarm.modelAliases list.'
    };

    const agyRows = safe(() => readAgyCatalog(agyCatalog?.text));
    const agy: EngineModels = agyRows
        ? {
            models: agyRows.models,
            // ‼️ NO `''` FALLBACK ENTRY. On this engine every model states its own
            // effort vocabulary — including "none" — so a shared list would only
            // ever be the wrong one; a model the catalog has never heard of gets
            // EFFORT_CHOICES through `effortsFor`, which is the honest guess.
            efforts: agyRows.efforts,
            defaultEffort: {},
            source: 'catalog',
            fetchedAt: agyCatalog?.fetchedAt,
            note: `${agyRows.models.length - 1} models, read from Antigravity's own \`agy models\` — the same list its picker offers. `
                + 'Each one carries its own effort vocabulary, and a model with none takes no --effort at all.'
                + ageNote(agyCatalog?.fetchedAt)
        }
        : {
            models: settingsModels,
            efforts: staticEfforts,
            defaultEffort: {},
            source: 'settings',
            note: 'Antigravity keeps no model catalog on disk — its list comes from `agy models`, which has not answered yet. '
                + 'Until it does this is the agentFarm.modelAliases list, which is almost certainly wrong for this engine.'
        };

    return { claude, codex, gemini, agy };
}

/** The effort rows for one engine+model — the per-model vocabulary when the
 *  catalog states one, the engine's shared list otherwise. */
export function effortsFor(em: EngineModels | undefined, model: string): LaunchChoice[] {
    if (!em) { return EFFORT_CHOICES; }
    return em.efforts[String(model ?? '').trim()] ?? em.efforts[''] ?? EFFORT_CHOICES;
}
