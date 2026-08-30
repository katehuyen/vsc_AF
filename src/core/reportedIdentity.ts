/**
 * X-102 — WHAT THE ENGINE ACTUALLY SAID, READ OUT OF ITS OWN EVENTS.
 *
 * The launch manifest is the DECLARED half of a run: what Agent Farm asked for,
 * written down before the spawn and never rewritten. This file is the other
 * half — what the engine named while it ran. Keeping the two apart is the whole
 * of X-102, and a reader that folded them together would make "did we get what
 * we asked for" stop being a question anybody could answer.
 *
 * ‼️ ONE RULE, AND IT IS THE SAME RULE `providerCatalog.ts` ALREADY MADE
 * EXECUTABLE FOR CATALOGS: **the field, not the printed prefix.** A provider is
 * reported when the engine NAMED it in a field of its own called `providerID` —
 * never when a model happened to be spelled with a slash in it. `opencode.ts`
 * (K-28) carries the scar of the opposite habit: a bare model id sent back as a
 * guessed `provider/model` was refused by the engine by name, on every resume.
 *
 * ‼️ AND THE ONE PLACE A SLASH IS ALLOWED TO MEAN SOMETHING is where the engine
 * publishes a qualified ref as its OWN current value (the ACP `model` config
 * option reports `opencode/big-pickle`). Even there the head only becomes a
 * provider if it is already NAMED in the engine's published list — which is
 * `splitQualifiedRef`'s contract, reused rather than re-implemented, so there is
 * exactly one function in this codebase that is allowed to cut a ref in half.
 *
 * ‼️ WHY THIS IS NOT THREE READERS FOR THREE TRANSPORTS. OpenCode publishes the
 * same fact in three shapes — `export` writes `info.model: {id, providerID}` and
 * flat `providerID`/`modelID` on assistant rows, `run --format json` streams
 * events keyed by `sessionID`, ACP answers `session/new` with config options. A
 * reader per transport is three places to forget when a fourth arrives, and the
 * fourth WILL arrive: this engine has changed its wire shape twice already. A
 * scan that collects NAMED fields wherever they sit reads all three today and
 * the fourth for free, without ever being permitted to guess.
 *
 * Pure — no vscode, no I/O, no clock.
 */

import { splitQualifiedRef } from './providerIdentity';

/**
 * What an engine named about itself, as facts and nothing more.
 *
 * ‼️ NO `proof` AND NO `origin` FIELD HERE, DELIBERATELY. Those are answers about
 * the RELATIONSHIP between what was declared and what was reported, and this
 * side of the pair knows only its own half. Computing a proof here would mean
 * every caller received a verdict formed without the manifest in view — which is
 * precisely the mistake `proofOf` exists to centralise away from.
 *
 * Every list is in FIRST-SEEN order and deduped: a session that ran on one model
 * for nine turns and another for the tenth reads as two, in the order they
 * happened, which is the order somebody debugging it will be thinking in.
 */
export interface ReportedIdentity {
    /** Providers the engine NAMED. Empty is a real and common answer. */
    providerIds: string[];
    /** Models the engine NAMED. */
    models: string[];
    /** The engine's own session ids, where it publishes any. */
    sessionIds: string[];
}

export const NOTHING_REPORTED: ReportedIdentity = { providerIds: [], models: [], sessionIds: [] };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** First-seen order, deduped, empties dropped — the shape every list here has. */
function uniq(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const s = str(v);
        if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
}

/**
 * ‼️ WHATEVER THE CALLER HAPPENED TO HAVE, TURNED INTO DOCUMENTS TO WALK.
 *
 * `identityFromEvents` takes `unknown` because the three transports genuinely
 * hand over three different things: a parsed export object, an array of parsed
 * events, and the raw stdout of `run --format json`. A reader that demanded one
 * of them would push the other two into a `JSON.parse` at every call site, and
 * the call site that got it wrong would report nothing while looking correct.
 *
 * A string is tried as one document first and only then as JSONL, because an
 * export is a single pretty-printed object spanning many lines — read line by
 * line it parses as nothing at all.
 */
function documentsOf(events: unknown): unknown[] {
    if (events === null || events === undefined) { return []; }
    if (typeof events === 'string') {
        const text = events.trim();
        if (!text) { return []; }
        try { return [JSON.parse(text)]; } catch { /* not one document — try the stream */ }
        const out: unknown[] = [];
        for (const line of text.split(/\r?\n/)) {
            const l = line.trim();
            if (!l || (l[0] !== '{' && l[0] !== '[')) { continue; }
            try { out.push(JSON.parse(l)); } catch { /* an unparsed line is not an error here */ }
        }
        return out;
    }
    if (Array.isArray(events)) { return events; }
    return typeof events === 'object' ? [events] : [];
}

/**
 * ‼️ EVERY STRING THE DOCUMENT WROTE UNDER ONE OF THESE NAMES — the executable
 * form of "the field, not the prefix".
 *
 * The walk is by KEY, so what comes back was named by the engine and not
 * inferred from anything. Depth is bounded because these documents arrive from
 * a process and a hand-written or truncated one can be cyclic; a reader that
 * hung would take the surface asking it down with it.
 */
export function namedStrings(doc: unknown, names: readonly string[], depth = 12): string[] {
    const want = new Set(names);
    const out: string[] = [];
    const walk = (node: unknown, left: number): void => {
        if (left < 0 || !node || typeof node !== 'object') { return; }
        if (Array.isArray(node)) {
            for (const item of node) { walk(item, left - 1); }
            return;
        }
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (want.has(k) && typeof v === 'string') { out.push(v); }
            // ‼️ AND `model` AS AN OBJECT IS STILL THE MODEL FIELD. The export
            // writes `info.model = { id, providerID }` where every other shape
            // writes a string; a reader that only accepted the string form would
            // read a whole transcript and report no model at all.
            if (want.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
                const inner = v as Record<string, unknown>;
                if (typeof inner.id === 'string') { out.push(inner.id); }
                if (typeof inner.modelID === 'string') { out.push(inner.modelID); }
            }
            walk(v, left - 1);
        }
    };
    walk(doc, depth);
    return out;
}

/** OpenCode's own session marker — `ses_…`, on every event of every transport,
 *  and nothing else in this codebase writes it (`opencodehistory.ts`). It is
 *  what keeps a scan for ids from collecting message and part ids too. */
const OPENCODE_SESSION_ID = /^ses_[0-9a-zA-Z]+$/;

/**
 * ‼️ THE ONE QUALIFIED REF THIS ENGINE PUBLISHES AS ITS CURRENT VALUE.
 *
 * ACP answers `session/new` and `session/load` with config options, and the
 * `model` one's `currentValue` is `provider/model` — the only place OpenCode
 * states the pair in a single string. It is read by NAVIGATING to that option
 * rather than by scanning for `currentValue` or `value`, and the difference is
 * the whole correctness of it: the option also carries `options[]`, the list of
 * every model ON OFFER. A scan would report all of them as models that ran.
 */
function currentModelRefs(doc: unknown): string[] {
    const out: string[] = [];
    const walk = (node: unknown, left: number): void => {
        if (left < 0 || !node || typeof node !== 'object') { return; }
        if (Array.isArray(node)) {
            for (const item of node) { walk(item, left - 1); }
            return;
        }
        const o = node as Record<string, unknown>;
        if (Array.isArray(o.configOptions)) {
            for (const raw of o.configOptions) {
                const opt = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
                if (str(opt.id) === 'model' && str(opt.currentValue)) { out.push(str(opt.currentValue)); }
            }
        }
        for (const v of Object.values(o)) { walk(v, left - 1); }
    };
    walk(doc, 12);
    return out;
}

/**
 * WHAT OPENCODE REPORTED, across every shape it publishes.
 *
 * `knownProviderIds` is the engine's own published list (the catalog). Without
 * it a qualified ref is read as a model in full and NO provider is claimed —
 * the honest reading of a name nobody has vouched for, and the same refusal
 * `splitQualifiedRef` makes for the same reason.
 */
export function openCodeReported(
    events: unknown, knownProviderIds?: readonly string[]
): ReportedIdentity {
    const docs = documentsOf(events);
    if (!docs.length) { return { ...NOTHING_REPORTED }; }
    const providerIds: string[] = [];
    const models: string[] = [];
    const sessionIds: string[] = [];
    for (const doc of docs) {
        // 1 — THE FIELDS, TAKEN LITERALLY. Both spellings: the engine writes
        // `providerID`/`modelID`, and a JS-side record built from one writes the
        // lowercase-d form. Accepting both costs nothing and missing one reports
        // an empty answer that looks exactly like a session nobody ran.
        providerIds.push(...namedStrings(doc, ['providerID', 'providerId']));
        models.push(...namedStrings(doc, ['modelID', 'modelId', 'model']));
        sessionIds.push(...namedStrings(doc, ['sessionID', 'sessionId', 'id'])
            .filter(v => OPENCODE_SESSION_ID.test(v)));
        // 2 — THE PUBLISHED CURRENT VALUE, cut only where the head is a name the
        // engine itself published.
        for (const ref of currentModelRefs(doc)) {
            const split = splitQualifiedRef(ref, knownProviderIds);
            if (split.providerId) { providerIds.push(split.providerId); }
            models.push(split.modelId);
        }
    }
    // ‼️ A MODEL COLLECTED AS A BARE `model` STRING IS NEVER CUT. It reaches here
    // spelled however the engine spelled it — `big-pickle` from an export,
    // `opencode/big-pickle` from a connection — and both are true statements of
    // what the engine said. Normalising them into one would invent a wire name
    // this codebase has already been refused for inventing once.
    return { providerIds: uniq(providerIds), models: uniq(models), sessionIds: uniq(sessionIds) };
}

/**
 * WHAT CLAUDE REPORTED — and the asymmetry is the measured fact, not an omission.
 *
 * ‼️ `providerIds` IS EMPTY HERE AND ALWAYS WILL BE. Measured on 23 Aug 2026
 * against a local fake Anthropic endpoint: two Claude processes ran concurrently
 * on separate routes under the same model name and the transcript did not
 * preserve which route served either. There is no field to read, so the answer
 * is nothing — and reading `claude-opus-5` as "Anthropic" is the exact defect
 * `providerIdentity.ts` exists to make impossible.
 *
 * ‼️ `models` IS A DIFFERENT FIELD AND THE TRANSCRIPT DOES NAME IT. This is not
 * a softening of the rule above: the rule forbids deriving a PROVIDER from a
 * model name, and it says nothing against reading the model the engine wrote
 * down. Without this, X-102's "what came back" half would be permanently empty
 * on the engine that runs almost everything here, and the manifest would be
 * comparing itself to nothing.
 */
export function claudeReported(events: unknown): ReportedIdentity {
    const docs = documentsOf(events);
    if (!docs.length) { return { ...NOTHING_REPORTED }; }
    const models: string[] = [];
    const sessionIds: string[] = [];
    for (const doc of docs) {
        models.push(...namedStrings(doc, ['model']));
        sessionIds.push(...namedStrings(doc, ['sessionId', 'session_id']));
    }
    return { providerIds: [], models: uniq(models), sessionIds: uniq(sessionIds) };
}

/**
 * The reported half as the shared shape wants it — the adapters' return value.
 *
 * ‼️ IT OMITS AN EMPTY LIST RATHER THAN WRITING ONE. `Partial<ProviderIdentity>`
 * is merged over a declared identity, and `reportedProviderIds: []` spread over
 * a record that already had one would erase it. An absent key merges as "I have
 * nothing to say about this", which is what an engine with no provider axis
 * actually means.
 */
export function reportedPartial(
    engine: string, reported: ReportedIdentity
): { engine: string; reportedProviderIds?: string[]; reportedModels?: string[] } {
    return {
        engine,
        ...(reported.providerIds.length ? { reportedProviderIds: [...reported.providerIds] } : {}),
        ...(reported.models.length ? { reportedModels: [...reported.models] } : {})
    };
}
