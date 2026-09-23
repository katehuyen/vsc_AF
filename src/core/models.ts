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

import { agyDefaultEffort } from './agy';
import { EngineId, EngineProbe } from './engines';
import { engineFlagFor, engineOf, engineTakesEffort } from './consoleEngine';
import { EFFORT_CHOICES, LaunchChoice } from './launch';
import { variantEffortRows } from './opencodeVariant';
// ‼️ X-149 — ONE narrowing rule, and it is `media/afLaunch.js`. Loaded, never
// reimplemented: the pages run the same file (see src/core/aflaunch.ts).
import { LaunchCatalog, catalog, effortsForModel, narrow } from './aflaunch';

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

/**
 * ‼️ B-12 — WHICH FLAG THIS ROW WOULD ACTUALLY RIDE ON.
 *
 * The fallback list said `passed as --model` on every engine. That is Claude's
 * flag name, and U-59 measured it wrong on three of the other four: Codex `-m`,
 * Gemini `-m`, OpenCode `-m`, Antigravity `--model`. This list is what a reader
 * sees on exactly the engines whose OWN catalogue has not arrived yet — so the
 * one moment they are told least about the engine was also the moment they were
 * told a flag that fails if they type it. `engineFlagFor` runs the engine's own
 * argument builder and reads the token back, so nothing here knows a flag name.
 */
function modelFlagNote(engine: EngineId): string {
    // ‼️ Claude is asked separately, and not out of special-casing: it is the
    // persistent engine and never goes through `runArgs` (`spawnHeadless` builds
    // its line as a string), so `engineFlagFor` declines to answer for it rather
    // than hand back another engine's vocabulary wearing Claude's name.
    const flag = engine === 'claude' ? '--model' : engineFlagFor(engine, 'model');
    return flag ? `passed as ${flag}` : 'this engine carries the model without a flag of its own';
}

/** The user's own list, the shape every picker takes. */
function fromAliases(aliases: string[], engine: EngineId): LaunchChoice[] {
    const detail = modelFlagNote(engine);
    return aliases.filter(a => typeof a === 'string' && a.trim())
        .map(a => ({ id: a.trim(), label: a.trim(), detail }));
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
 * a description already, so the words are the CLI's; what they are MERGED with
 * is this module's job (see `mergeModelRows`).
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

// ---------------------------------------------------------------------------
// U-32 — ONE MODEL IS ONE ROW, WHATEVER IT IS CALLED WHERE IT CAME FROM
// ---------------------------------------------------------------------------

/**
 * ‼️ THE SAME MODEL ARRIVED TWICE UNDER TWO NAMES, AND THE PICKER BELIEVED BOTH.
 *
 * Measured on this machine: the user's `agentFarm.modelAliases` carries `fable`
 * and the CLI's own cache carries `claude-fable-5[1m]` labelled `Fable`. One
 * model, two rows, and the two labels differ only by a capital letter — the
 * picker read as if the account had two Fables. Deduplication was `id`
 * against `id`, which cannot see that.
 *
 * So identity is the FAMILY, derived by taking off the three things that do not
 * change which model it is: the vendor prefix, the version tail, and the
 * bracketed variant marker. `claude-fable-5[1m]`, `claude-fable-5` and `fable`
 * all reduce to `fable`; `claude-sonnet-4-6` reduces to `sonnet`.
 */
export function modelFamily(id: string): string {
    let s = String(id ?? '').trim().toLowerCase();
    if (!s) { return ''; }
    s = s.replace(/\[[^\]]*\]\s*$/, '');                 // the variant, not the model
    s = s.replace(/^(?:claude|anthropic|models|openai|google)[-/]/, '');
    // version tail: `-5`, `-4-6`, `-20260401`, `-latest`, `-preview`
    s = s.replace(/(?:[-_](?:\d+|latest|preview))+$/, '');
    return s || String(id ?? '').trim().toLowerCase();
}

/**
 * …and what makes a row DIFFERENT from the plain family.
 *
 * `[1m]` is the only marker in the wild today, and it is READ rather than
 * assumed: a bracketed suffix is the CLI's way of saying "same model, other
 * terms", so a row carrying one is a real second choice and must survive the
 * merge — but it may never be drawn as if it were the bare model.
 */
export function modelVariant(id: string): string {
    const m = /\[([^\]]+)\]\s*$/.exec(String(id ?? '').trim());
    return m ? m[1].trim() : '';
}

/**
 * Merge rows from several sources into one list with no model shown twice.
 *
 * ‼️ THE ALIAS KEEPS THE ID, THE CATALOG LENDS THE WORDS. Where both sources
 * describe the same family+variant, the FIRST row's id survives — the callers
 * pass the aliases first, and an alias is the name that keeps resolving to the
 * latest model after the dated id has been retired. What the CLI's row
 * contributes is its label and its description, which is the half the alias
 * never had.
 *
 * A row that IS a variant is labelled as one, so `Fable` and `fable` can never
 * again sit next to each other looking like the same offer twice.
 */
export function mergeModelRows(rows: LaunchChoice[]): LaunchChoice[] {
    const byKey = new Map<string, LaunchChoice>();
    const order: string[] = [];
    for (const row of rows) {
        const id = String(row?.id ?? '').trim();
        if (!id) { continue; }
        const variant = modelVariant(id);
        const key = JSON.stringify([modelFamily(id), variant]);
        const kept = byKey.get(key);
        if (!kept) {
            byKey.set(key, {
                id,
                // a variant never wears the bare name — that is the duplicate
                label: variant ? `${row.label || id} · ${variant}` : (row.label || id),
                detail: row.detail || ''
            });
            order.push(key);
            continue;
        }
        // The same model, described again. Take whatever the second source
        // knows that the first did not, and say which id is actually sent.
        const bare = kept.label.toLowerCase() === kept.id.toLowerCase();
        if (bare && row.label && row.label.toLowerCase() !== id.toLowerCase()) {
            kept.label = variant ? `${row.label} · ${variant}` : row.label;
        }
        const extra = [row.detail, kept.id === id ? '' : id].filter(Boolean).join(' · ');
        if (extra && !(row.detail && kept.detail.includes(row.detail))) {
            kept.detail = kept.detail ? `${kept.detail} · ${extra}` : extra;
        }
    }
    return order.map(k => byKey.get(k)!);
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
    defaultEffort: Record<string, string>;
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
    /**
     * ‼️ X-145 — AND THE SAME ANSWER AGAIN, IN THE FIELD EVERY *OTHER* READER ASKS.
     *
     * The row below names the effort it will send, which fixed the PICKER. What
     * it did not fix is the question `narrowLaunch` asks — `em.defaultEffort[model]`
     * — because this engine's entry was left `{}` when Codex's was filled. So an
     * effort of `''` (a fresh composer, a launcher row, a resumed session, a
     * bridge call that named only a model) found no default to be completed to,
     * survived narrowing untouched, and `agyModelArgs` then dropped the flag it
     * had no value for:
     *
     *   invalid model selection (--model "gemini-3.7-flash" --effort ""):
     *   --model gemini-3.7-flash requires --effort (available: low, medium, high)
     *
     * and the box on screen still read *Default → medium*, because a `<select>`
     * whose value matches no option shows its first one. The label was right and
     * the value behind it was empty — which is the failure this map closes.
     */
    const defaultEffort: Record<string, string> = {};
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
            // ‼️ THERE IS NO "no --effort flag" HERE, AND SAYING THERE WAS IS THE
            // BUG (X-26). A base this splitter derived is not a selectable id on
            // its own: measured, `--model gemini-3.5-flash` with no effort comes
            // back "requires --effort (available: low, medium, high)" and the
            // turn dies before it starts. So the first row is not "Default" with
            // nothing behind it — it NAMES the effort it will send, which is the
            // repo's own rule for a default-shaped box (docs/CONVENTIONS.md →
            // "Default never stands alone"). `agyDefaultEffort` decides it, so
            // the words here and the command line cannot drift apart.
            const fallback = agyDefaultEffort(row.efforts);
            defaultEffort[base] = fallback;
            efforts[base] = [
                {
                    id: fallback, label: `Default → ${fallback}`,
                    detail: `this model cannot run without an effort — the CLI refuses `
                        + `--model ${base} on its own, so Default sends --effort ${fallback}`
                },
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
    return { models, efforts, defaultEffort };
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
    agyCatalog?: { text?: string; fetchedAt?: number },
    /**
     * ‼️ …AND THE ONE CATALOG WITH TWO SOURCES. OpenCode answers `session/new`
     * with every model this machine can reach, their display names and the one
     * currently selected (measured, A-16), so a card that is open has already
     * been told and nothing is spawned to ask again. But a picker is drawn long
     * before any card exists — X-52 — so the caller ALSO reads `opencode models`
     * in the background and remembers the answer across windows; `via` says
     * which of the two this list came from, because the handshake carries
     * display names and the CLI does not. Absent means neither has answered yet,
     * which the note says rather than pretending the engine has no catalog.
     */
    opencodeCatalog?: {
        models?: { id: string; label: string }[]; fetchedAt?: number;
        via?: 'handshake' | 'cli';
        /** X-330 — model ref → the variants it publishes (`opencode models --verbose`). */
        variants?: Record<string, string[]>;
    }
): Record<EngineId, EngineModels> {
    const safe = <T>(fn: () => T): T | undefined => { try { return fn(); } catch { return undefined; } };
    // ‼️ PER ENGINE, not one array shared by four of them: the rows carry that
    // engine's own flag name (see modelFlagNote), so a single shared list would
    // put Claude's `--model` on the three engines that take `-m`.
    const settingsModelsFor = (engine: EngineId): LaunchChoice[] =>
        [DEFAULT_ROW, ...fromAliases(aliases, engine)];
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
            models: settingsModelsFor('codex'),
            efforts: staticEfforts,
            defaultEffort: {},
            source: 'settings',
            note: 'Codex has not written its model catalog yet (~/' + CODEX_CATALOG + ' is missing), '
                + 'so this is the agentFarm.modelAliases list — run Codex once and these become its own models.'
        };

    const extras = safe(() => readClaudeExtras(probe.readHome(CLAUDE_STATE))) ?? [];
    // ‼️ MERGED BY FAMILY, NOT BY ID (U-32). The aliases go in first so their
    // short, version-free names are the ones that end up on the command line;
    // the CLI's rows lend their label and description, and a row that is only a
    // VARIANT of one already listed is drawn as the variant it is.
    const claudeRows = mergeModelRows([...fromAliases(aliases, 'claude'), ...extras]);
    const claude: EngineModels = {
        models: [DEFAULT_ROW, ...claudeRows],
        efforts: staticEfforts,
        defaultEffort: {},
        source: extras.length ? 'catalog' : 'settings',
        note: extras.length
            ? `Your agentFarm.modelAliases plus ${extras.length} model(s) Claude Code has recorded for this `
            + 'account — a newly granted model shows up here without an edit. '
            + 'A model named twice (an alias and the CLI\'s dated id) is listed once; a 1m-context variant '
            + 'keeps its own row and says so.'
            : 'Claude Code keeps no model catalog on disk, so this is your agentFarm.modelAliases list. '
            + 'Add a new alias there when one ships.'
    };

    const gemini: EngineModels = {
        models: settingsModelsFor('gemini'),
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
            // ‼️ AND THIS ONE IS NOT `{}` (X-145). Every model here states its own
            // vocabulary, and the models that state one CANNOT run without it —
            // so the default a `''` effort completes to is per-model too, and
            // leaving the map empty is what sent `--effort ""` to a CLI that
            // refuses it.
            defaultEffort: agyRows.defaultEffort,
            source: 'catalog',
            fetchedAt: agyCatalog?.fetchedAt,
            note: `${agyRows.models.length - 1} models, read from Antigravity's own \`agy models\` — the same list its picker offers. `
                + 'Each one carries its own effort vocabulary, and a model with none takes no --effort at all.'
                + ageNote(agyCatalog?.fetchedAt)
        }
        : {
            models: settingsModelsFor('agy'),
            efforts: staticEfforts,
            defaultEffort: {},
            source: 'settings',
            note: 'Antigravity keeps no model catalog on disk — its list comes from `agy models`, which has not answered yet. '
                + 'Until it does this is the agentFarm.modelAliases list, which is almost certainly wrong for this engine.'
        };

    const opencodeRows = (opencodeCatalog?.models ?? []).filter(m => m.id);
    const variantsOf = opencodeCatalog?.variants ?? {};
    const variantModels = opencodeRows.filter(m => (variantsOf[m.id] ?? []).length);
    const opencode: EngineModels = opencodeRows.length
        ? {
            models: [DEFAULT_ROW, ...opencodeRows.map(m => ({
                id: m.id, label: m.label || m.id,
                // The catalogue states a provider-qualified id and a display
                // name and nothing else, so the detail is the id — which is what
                // actually goes on the wire and the one thing a reader may need
                // to check against `opencode models`.
                detail: m.id
            }))],
            // ‼️ X-330 — THE VOCABULARY IS PER MODEL: a model's own published
            // variants, and nothing for a model that publishes none (`''` too,
            // so a model the catalog does not name offers nothing). Only a
            // headless run carries one — `engineTakesEffort(…, 'run')` — so a
            // Console card or a terminal still draws no box at all.
            efforts: {
                '': [],
                ...Object.fromEntries(variantModels.map(m => [m.id, variantEffortRows(m.label || m.id, variantsOf[m.id])]))
            },
            defaultEffort: {},
            source: 'catalog',
            fetchedAt: opencodeCatalog?.fetchedAt,
            note: `${opencodeRows.length} models, ` + (opencodeCatalog?.via === 'cli'
                ? 'read from OpenCode\'s own `opencode models` in the background — every model the providers '
                + 'connected here offer, whether or not a session has ever been opened. '
                : 'as OpenCode itself listed them when the session opened — '
                + 'the handshake hands the whole catalog over, so nothing is spawned to ask. ')
                + (variantModels.length
                    ? `${variantModels.length} of them publish reasoning variants, which a headless task sends as `
                    + '--variant; a Console card or a terminal cannot carry one.'
                    : 'None of them publishes a reasoning variant, so there is no level to pick.')
                + ageNote(opencodeCatalog?.fetchedAt)
        }
        : {
            models: settingsModelsFor('opencode'),
            efforts: { '': [] },
            defaultEffort: {},
            source: 'settings',
            note: 'OpenCode publishes its model list on the connection rather than on disk, and neither the '
                + 'background `opencode models` read nor an open session has answered yet. Until one does this '
                + 'is the agentFarm.modelAliases list, which is almost certainly wrong for this engine.'
        };

    return { claude, codex, gemini, agy, opencode };
}

/** The effort rows for one engine+model — the per-model vocabulary when the
 *  catalog states one, the engine's shared list otherwise. */
/**
 * This host's `EngineModels` as the catalogue view `media/afLaunch.js` reads
 * (X-149). `takesEffort` is not asked here: an engine with no effort flag
 * publishes an empty list, and the host only ever narrows against a catalogue it
 * already holds — the two page surfaces need the engine ROW instead, because
 * they narrow before one has landed (X-35), and each says so at its own call.
 */
function catalogOf(em: EngineModels | undefined): LaunchCatalog {
    return catalog({ em: em ?? null, efforts: EFFORT_CHOICES });
}

export function effortsFor(em: EngineModels | undefined, model: string): LaunchChoice[] {
    return effortsForModel(catalogOf(em), model);
}

/**
 * ‼️ X-30 — A MODEL AND AN EFFORT ARE ONE ANSWER, NOT TWO. Every surface that
 * lets one of the pair change asks what the OTHER one becomes rather than
 * re-deriving it, and `em` absent means nothing is known and therefore nothing
 * is narrowed. The measurement behind both, and the rest of the reasoning, is
 * in `media/afLaunch.js` — kept in ONE file so it cannot be half-updated.
 *
 * ‼️ X-149 — THE RULE ITSELF LIVES THERE TOO. This function is the host's door onto it, not a second copy: the
 * Console, the Tasks form and `media/afEngine.js` each used to carry their own,
 * and the same model id was RECOGNISED here and FOREIGN there.
 *
 * `resolveAlias` is the one thing the host asks for that a page does not
 * (S-47/K-28 — `big-pickle` resolving to `opencode/big-pickle`); it is a named
 * option rather than a difference in the rule, so it can be read at a glance
 * and moved when somebody decides the pages should have it too.
 */
export function narrowLaunch(
    em: EngineModels | undefined,
    model: string | undefined,
    effort: string | undefined
): { model: string; effort: string } {
    return narrow(catalogOf(em), { model, effort }, { resolveAlias: true });
}

/**
 * Which catalogue row a written model id IS — by id, or by the same
 * family+variant key the merge dedupes on, so `claude-opus-4-5-20251101` and
 * the alias `opus` are one model rather than one model and one stranger.
 * `undefined` = this catalogue has never heard of it.
 */
function catalogRow(em: EngineModels, model: string): LaunchChoice | undefined {
    const want = String(model ?? '').trim();
    if (!want) { return undefined; }
    const key = (id: string) => `${modelFamily(id)}|${modelVariant(id)}`;
    const wantKey = key(want);
    return em.models.find(m => !!m.id
        && (m.id.toLowerCase() === want.toLowerCase() || key(m.id) === wantKey));
}

/**
 * ‼️ X-120 / X-122 — THE PAIR IS REFUSED WHERE IT IS PROMISED, NOT WHERE IT DIES.
 *
 * `narrowLaunch` is the SILENT half of this same question, and it is right for
 * a picker the user is still moving: what does not fit is dropped as they move.
 * It is wrong for a launch that has already been asked for. A model kept from
 * the engine a row USED to be on, or an effort left behind by the model it was
 * chosen for, is then dropped without a word and the run goes ahead on
 * something nobody typed — or, where nothing narrows it at all, the CLI answers
 * hours later in a file nobody is reading:
 *
 *   invalid model selection (--model "gemini-3.1-pro" --effort "medium"):
 *   gemini-3.1-pro has no "medium" effort (available: low, high)
 *
 * So this is the same catalogue knowledge stated as a refusal, before the run.
 *
 * ‼️ IGNORANCE IS NOT EVIDENCE. Only a REAL catalogue — `source: 'catalog'`,
 * the engine's own answer — may refuse a model. A `settings` list is this
 * extension's alias guess, and refusing from it would refuse models that work.
 * An engine with NO effort setting at all is `headlessEffortRefusal`'s
 * question and is left to it: two refusals for one fault is how two wordings
 * start disagreeing.
 */
export function capabilityRefusal(
    em: EngineModels | undefined,
    engine: string | undefined,
    model: string | undefined,
    effort: string | undefined
): string {
    const wantModel = String(model ?? '').trim();
    const wantEffort = String(effort ?? '').trim();
    if (!wantModel && !wantEffort) { return ''; }
    if (!em || em.source !== 'catalog') { return ''; }
    const label = engineOf(engine).label;
    const known = em.models.filter(m => !!m.id);
    if (!known.length) { return ''; }
    const row = catalogRow(em, wantModel);
    if (wantModel && !row) {
        const few = known.slice(0, 4).map(m => m.id);
        return `model "${wantModel}" is not one ${label} offers here — it lists `
            + few.join(', ') + (known.length > few.length ? ', …' : '')
            + ' (engines.models has the full list) — pick one of those, or change the engine this runs on';
    }
    if (!engineTakesEffort(engine)) { return ''; }
    const rows = effortsFor(em, row?.id ?? '');
    // ‼️ DEDUPED, because a vocabulary row and the default row that RESOLVES to
    // it are the same word twice: Antigravity's `medium, high, medium, low` is
    // this list read literally, and a refusal that cannot list three settings
    // without repeating one reads as a bug in the message rather than a fault
    // in the row.
    const words = [...new Set(rows.filter(e => !!e.id).map(e => e.id))];
    /**
     * ‼️ X-145 — A MISSING EFFORT IS ALSO A REFUSAL, ON AN ENGINE THAT SAYS SO.
     *
     * "No effort" reads as "let the CLI decide" on every other engine, and on
     * Antigravity it is a fourth wrong answer: a model whose rows contain no
     * empty one CANNOT be sent bare, and the CLI says exactly that —
     * *--model gemini-3.7-flash requires --effort (available: low, medium,
     * high)*. The pickers complete it themselves now (`defaultEffort` above),
     * but a mission member, a task row or a bridge call states its dimensions
     * WITHOUT narrowing, so this is the only place that can say so before the
     * run. The catalogue's own shape is the test — no engine is named here.
     *
     * ‼️ AND IT IS THE MODEL'S OWN VOCABULARY THAT SAYS SO, NOT THE SHARED ONE.
     * `effortsFor` falls back to the engine-wide list for a model the catalogue
     * states nothing about, and that list carries no empty row on some engines —
     * so reading it here would refuse a model whose requirements are simply
     * unknown. Ignorance is not evidence; only an entry written for THIS model
     * may refuse it.
     */
    const own = wantModel ? em.efforts[row?.id ?? ''] : undefined;
    if (!wantEffort) {
        if (!own || !own.length || own.some(e => e.id === '')) { return ''; }
        return `model "${row?.id || wantModel}" cannot run without an effort — `
            + `${label} refuses it bare, so name one of: ${words.join(', ')}`;
    }
    // A model that states an EMPTY vocabulary takes no --effort at all; one that
    // states none is unknown, and unknown refuses nothing.
    if (!rows.length) {
        return `effort "${wantEffort}" is not something ${row?.id || label} takes at all — clear the effort`;
    }
    if (!words.length || rows.some(e => e.id === wantEffort)) { return ''; }
    return `effort "${wantEffort}" is not one ${row?.id || label} takes — ${words.join(', ')}`;
}
