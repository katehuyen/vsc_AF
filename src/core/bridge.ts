/**
 * Farm Bridge — the official gate for AGENTS (or any external process) to use
 * Agent Farm's functions as if they clicked the UI themselves. The user tells
 * an agent "kur şunu / başlat bunu"; the agent drops a request file, the
 * RUNNER window executes it through the same managers the UI uses, and writes
 * a response file back.
 *
 * Protocol (file-based on purpose — no port discovery, works for any process
 * that can write a file):
 *   <globalStorage>/bridge/<name>.request.json   →  { "op": "...", "args": { ... } }
 *   <globalStorage>/bridge/<name>.response.json  ←  { "ok": true, "result": ... }
 *                                                |  { "ok": false, "error": "..." }
 * The request file is deleted after processing; responses are pruned after a
 * day. If no VS Code window is open, requests simply wait — the next runner
 * picks them up (the caller should time out and say so honestly).
 *
 * Future-proofing is the registry: every subsystem registers its ops with a
 * one-line contract, and `farm.ops` returns the whole catalog — so an agent
 * can DISCOVER what today's build offers instead of hardcoding a list, and a
 * new feature ships its bridge access by adding one registration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ENGINES, engineOf, engineTakesEffort } from './consoleEngine';
import { INTERACTIVE_CLOSES, INTERACTIVE_TARGETS, ONE_EXECUTOR, twoExecutors, validateLaunch } from './launch';
import { describeRetry, normalizeRetry, retryRefusal, RetryPolicy } from './retry';

export interface BridgeOpSpec {
    op: string;                       // e.g. "schedules.add"
    /** One-line contract shown in the farm.ops catalog: what it does + args. */
    describe: string;
    handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface BridgeOutcome {
    ok: boolean;
    result?: unknown;
    error?: string;
}

export class BridgeRegistry {
    private ops = new Map<string, BridgeOpSpec>();

    constructor() {
        this.register({
            op: 'farm.ops',
            describe: 'List every available bridge operation with its one-line contract. args: none',
            handler: () => this.catalog()
        });
    }

    /**
     * ‼️ AN OP IS REGISTERED ONCE, AND A SECOND REGISTRATION IS AN ERROR (X-35).
     *
     * This used to be a bare `Map.set`, which meant the LAST registration of a
     * name silently won. It cost exactly what a silent overwrite always costs:
     * `triggers.add` was rewritten to carry the four-engine run dimensions, and
     * a second, older registration further down the same file — flat `model`
     * only — quietly replaced it. The source read correctly, the tests passed
     * on the source, and the running system used the version without engines.
     * `templates.add` and `templates.list` were doubled the same way.
     *
     * So a duplicate now THROWS at startup, where it is one stack trace, rather
     * than at some call site months later, where it is a mystery. Replacing an
     * op on purpose is still possible — it just has to say so, which is the
     * whole difference between an intention and an accident.
     */
    register(spec: BridgeOpSpec | BridgeOpSpec[], opts: { replace?: boolean } = {}): void {
        for (const s of Array.isArray(spec) ? spec : [spec]) {
            if (!opts.replace && this.ops.has(s.op)) {
                throw new Error(
                    `Bridge op "${s.op}" is already registered. Two registrations of one op silently `
                    + 'shadow each other — merge them into one, or pass { replace: true } if the '
                    + 'override is deliberate.'
                );
            }
            this.ops.set(s.op, s);
        }
    }

    catalog(): { op: string; describe: string }[] {
        return [...this.ops.values()]
            .map(s => ({ op: s.op, describe: s.describe }))
            .sort((a, b) => a.op.localeCompare(b.op));
    }

    async dispatch(op: string, args: Record<string, unknown>): Promise<BridgeOutcome> {
        const spec = this.ops.get(op);
        if (!spec) {
            return {
                ok: false,
                error: `Unknown op "${op}" — call { "op": "farm.ops" } for the catalog of ${this.ops.size} operations.`
            };
        }
        try {
            return { ok: true, result: await spec.handler(args) };
        } catch (e) {
            return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) };
        }
    }
}

/**
 * Undo PowerShell's silent string→object mangling.
 *
 * `Get-Content -Raw` does not hand back a bare String: it decorates the object
 * with note properties (PSPath, PSDrive, ReadCount…). `ConvertTo-Json` then
 * serialises that decorated object as a JSON OBJECT — `{ "value": "...",
 * "Length": 14651, "PSPath": "..." }` — instead of a string. Short literals are
 * unaffected, so this only ever bites the LONG arg (a report body, a document,
 * a prompt read from a file) and it bites it silently: `optStr` sees a non-
 * string, answers '', and the op carries on as if the caller had passed
 * nothing. Measured 2026-08-10: a 14 KB report vanished this way with an
 * `ok: true` response.
 *
 * The signature is unmistakable (a string `value` plus PowerShell's own
 * `Length`/`PSPath`), so the bridge unwraps it for the same reason it strips a
 * BOM — it must accept what the callers actually produce.
 */
function unwrapPsString(v: unknown): unknown {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return v; }
    const o = v as Record<string, unknown>;
    if (typeof o.value !== 'string') { return v; }
    const looksPs = typeof o.Length === 'number' || typeof o.PSPath === 'string';
    return looksPs ? o.value : v;
}

/** Validate a request file's content. Errors are messages for the response. */
export function parseBridgeRequest(text: string): { op: string; args: Record<string, unknown> } | { error: string } {
    // Strip a UTF-8 BOM — PowerShell's `Set-Content -Encoding utf8` (the natural
    // way a Windows agent writes the file) prepends one, and JSON.parse rejects
    // it. The bridge must accept what the callers actually produce.
    const clean = text.replace(/^\uFEFF/, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(clean); } catch (e) {
        return { error: 'Request is not valid JSON: ' + String((e as Error).message).slice(0, 120) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: 'Request must be a JSON object: { "op": "...", "args": { ... } }' };
    }
    const o = parsed as Record<string, unknown>;
    if (typeof o.op !== 'string' || !o.op.trim()) {
        return { error: 'Missing "op" — call { "op": "farm.ops" } to list operations.' };
    }
    const raw = o.args && typeof o.args === 'object' && !Array.isArray(o.args)
        ? o.args as Record<string, unknown>
        : {};
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) { args[k] = unwrapPsString(v); }
    return { op: o.op.trim(), args };
}

/** Throw with a friendly message — handlers use this for arg validation. */
export function need(cond: unknown, message: string): void {
    if (!cond) { throw new Error(message); }
}

export interface BridgePage<T> {
    /** the rows the caller was handed */
    rows: T[];
    /** how many there are IN ALL — the page and the whole, said apart */
    total: number;
    /** id of the first row of this page, or null on an empty page */
    from: string | null;
    /** id of the LAST row — what the caller passes back as `after` */
    last: string | null;
    /** whether another page exists. Never inferred from `rows.length === limit`,
     *  which is wrong exactly when the last page is full. */
    more: boolean;
}

/**
 * ‼️ B-13 — ONE PAGINATION CONTRACT FOR THE WHOLE BRIDGE.
 *
 * Every read op whose answer grows with the farm's history needs one, and the
 * mistake is for each to invent its own: an offset here, a page number there, a
 * timestamp somewhere else, and an agent has to learn three.
 *
 * KEYSET, NOT OFFSET, and that is the whole design. These lists grow at the
 * END while a caller is reading them — a mission appends a message, a run
 * finishes — so an offset silently re-reads or skips a row every time one
 * arrives. `after` is an id the caller already holds, so the page is stable
 * whatever happens to the list meanwhile.
 *
 * AN UNKNOWN CURSOR IS AN ERROR, never "start from the top". A caller paging a
 * history while somebody deletes a run would otherwise read the newest rows a
 * second time and never know it happened — and silently re-serving page one is
 * indistinguishable from an honest answer.
 *
 * `more` is computed, not guessed: `rows.length === limit` is wrong exactly
 * when the last page happens to be full, which is the case a caller hits once
 * and then stops trusting the field.
 */
export function bridgePage<T>(
    all: readonly T[],
    idOf: (row: T) => string,
    opts: { limit?: unknown; after?: unknown; max?: number; fallback?: number; what?: string } = {}
): BridgePage<T> {
    const max = opts.max ?? 500;
    const fallback = opts.fallback ?? 100;
    const limit = Math.max(1, Math.min(max, Number(opts.limit ?? fallback) || fallback));
    const after = String(opts.after ?? '').trim();
    let from = 0;
    if (after) {
        const at = all.findIndex(row => idOf(row) === after);
        need(at >= 0, `No ${opts.what ?? 'row'} "${after}" here — `
            + 'pass the id of the last one you read, or omit it for the first page.');
        from = at + 1;
    }
    const rows = all.slice(from, from + limit);
    return {
        rows,
        total: all.length,
        from: rows.length ? idOf(rows[0]) : null,
        last: rows.length ? idOf(rows[rows.length - 1]) : null,
        more: from + rows.length < all.length
    };
}

/** A required string arg, trimmed. */
export function argStr(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    need(typeof v === 'string' && v.trim(), `Missing required string arg "${key}".`);
    return (v as string).trim();
}

/** An optional string arg ('' when absent). */
export function optStr(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    return typeof v === 'string' ? v.trim() : '';
}

/**
 * The run dimensions an automation can state — read the same way for every op
 * that installs one.
 *
 * ‼️ ONE SPELLING, OR THE TWO SURFACES DRIFT. The page's form offers model ·
 * effort · permission mode · CLI · working folder · priority · project on a
 * schedule and on a trigger; an agent driving the same feature over the bridge
 * has to be able to say the same things with the same names, or "run it on
 * opus at low effort" means one thing on screen and another in a request
 * (`_REF/agentfarm-dev.md`). Absent fields are left out entirely rather than
 * written as empty strings — "not stated" is not the same as "no flag".
 */
/**
 * `opts.mode` — THE EFFECTIVE MODE, when the caller already knows it and these
 * args do not carry it.
 *
 * ‼️ Three doors are in exactly that position and reading `args.mode` at any of
 * them would refuse a run that really is interactive: a TRIGGER may state its
 * mode on the action and its dimensions outside it (or the other way round, and
 * this function is called once per level), while a RERUN and a TEMPLATE RUN
 * inherit the mode from the thing being re-run and never restate it.
 */
export function bridgeRunDimensions(
    args: Record<string, unknown>,
    opts: { mode?: string } = {}
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // ‼️ THE ENGINE IS CHECKED WHERE IT IS WRITTEN DOWN, NOT WHERE IT RUNS
    // (X-35). A schedule or a trigger is a run that has not happened yet, and a
    // typo'd engine name used to be stored happily and refused hours later, at
    // 3 a.m., with nobody watching — the failure furthest in time from the
    // mistake that caused it. The runtime check still stands; this is the one
    // that lets the caller fix it.
    const engine = optStr(args, 'engine');
    if (engine) {
        need(engine.toLowerCase() in ENGINES,
            `unknown engine "${engine}" — ${Object.keys(ENGINES).join(', ')}`);
        out.engine = engine.toLowerCase();
    }
    // `engine` rides here too (X-18): a schedule and a trigger are tasks that
    // have not happened yet, and every dimension a task has is one they have.
    for (const k of ['model', 'effort', 'permissionMode', 'cli', 'workDir']) {
        const v = optStr(args, k);
        if (v) { out[k] = v; }
    }
    // ‼️ B-12 — AND THE VALUES ARE CHECKED WHERE THEY ARE WRITTEN DOWN TOO.
    // The engine NAME was refused here (above) and the effort and the permission
    // mode were not: `schedules.add { permissionMode: "sudo" }` was stored
    // happily and failed at 3 a.m. in a terminal nobody was watching — the exact
    // failure this function exists to move forward in time, left half-done
    // because `tasks.add` happens to call `validateLaunch` afterwards and a
    // schedule, a trigger, a template and a workflow step do not. It is the SAME
    // list and the same words the launcher refuses with; nothing new is decided
    // here, it is only asked earlier.
    {
        const bad = validateLaunch({
            effort: out.effort as string | undefined,
            permissionMode: out.permissionMode as string | undefined
        });
        need(!bad.length, bad.join(' · '));
    }
    // ‼️ AN EFFORT THE ENGINE HAS NO FLAG FOR IS REFUSED, NOT DROPPED. Gemini
    // has no reasoning-effort setting at all (core/gemini.ts) and exits 42 when
    // handed one. Accepting the field and silently ignoring it would let a
    // caller believe a run is throttled when nothing is.
    if (out.effort && !engineTakesEffort(String(out.engine ?? ''))) {
        need(false, `engine "${out.engine}" has no reasoning-effort setting — leave effort out.`);
    }
    // ‼️ M-26 — WHERE AN INTERACTIVE RUN OPENS AND WHETHER IT STAYS, refused
    // here for the same reason the effort is: a schedule is a run that has not
    // happened yet, and a mistyped surface stored happily tonight is a window
    // that does not appear at 03:00. Both are closed lists; there is no
    // nearest-looking fallback, because "it opened somewhere else" is exactly
    // the outcome the caller would never notice.
    {
        const t = optStr(args, 'interactiveTarget');
        if (t) {
            need((INTERACTIVE_TARGETS as readonly string[]).includes(t),
                `unknown interactiveTarget "${t}" — ${INTERACTIVE_TARGETS.join(', ')}`);
            out.interactiveTarget = t;
        }
        const c = optStr(args, 'interactiveClose');
        if (c) {
            need((INTERACTIVE_CLOSES as readonly string[]).includes(c),
                `unknown interactiveClose "${c}" — ${INTERACTIVE_CLOSES.join(', ')}`);
            out.interactiveClose = c;
        }
        // ‼️ AND THEY ARE REFUSED ON A HEADLESS RUN RATHER THAN IGNORED. A
        // caller that asked for "the Console, and close it when it answers" and
        // got an archived background run would have no way of telling; the mode
        // is right there in the same call, so the contradiction is nameable.
        //
        // ‼️ THE TEST IS `!== 'interactive'`, NOT `=== 'headless'`. Every door
        // that takes a mode resolves it as `mode === 'interactive' ? … : 'headless'`
        // — so an OMITTED mode is headless, and an omitted mode was precisely how
        // the pair used to get through: `tasks.add {interactiveTarget:'external'}`
        // was accepted and then stored on a background run nobody would ever see.
        if (out.interactiveTarget || out.interactiveClose) {
            const mode = opts.mode !== undefined ? opts.mode : (optStr(args, 'mode') ?? '');
            need(mode === 'interactive',
                'interactiveTarget / interactiveClose describe an interactive run — this one is '
                + (mode ? `"${mode}"` : 'headless (no mode was stated, which means headless)')
                + ', which has no surface and nothing to keep open.');
        }
    }
    // `project` on the wire, `projectId` in the model: the caller names the
    // thing, the store holds its id.
    const project = optStr(args, 'project') || optStr(args, 'projectId');
    if (project) { out.projectId = project; }
    const priority = Number(args.priority);
    if (Number.isFinite(priority) && priority) { out.priority = Math.trunc(priority); }
    // ‼️ M-7 — "RUN IT WHATEVER THE BUDGET SAYS" IS A DIMENSION LIKE THE REST.
    // The page offers it on a task, a schedule and a trigger; an agent asked to
    // "set the morning report up so the budget cannot stop it" has to be able
    // to say the same thing with the same word, or the two surfaces disagree
    // about a run that then does not happen at 09:00.
    if (args.ignoreBudget === true) { out.ignoreBudget = true; }
    // ‼️ M-3 — AND WHAT HAPPENS IF IT FAILS, for the same reason: the page can
    // set it on a task, a schedule and a trigger, so an agent asked to "make the
    // nightly batch try three more times half an hour apart" must be able to say
    // it in the same words. Clamped here, once, by the same function the form
    // uses — the alternative is a bridge that can store a policy the UI would
    // have refused.
    // ‼️ M-10 — A RETRY FORMULA IS REFUSED HERE, IN WORDS, RATHER THAN AT 03:00.
    // `normalizeRetry` is deliberately total (it runs on stored policies and on
    // settings files, where a throw would be a run that never happens), so the
    // loud check is the caller's job — and a bridge call IS a caller who typed
    // something. The same validator the form uses, so the two cannot disagree.
    need(!retryRefusal(args.retry), retryRefusal(args.retry));
    const retry = normalizeRetry(args.retry);
    if (retry) { out.retry = retry; }
    // ‼️ M-22 — the pair this call states, checked before it is stored. The
    // ops that lay these dimensions over a run that already exists have to ask
    // again about the MERGED result (`needOneExecutor`); what this catches is
    // the caller who names both in one breath.
    needOneExecutor(out.engine, out.cli);
    return out;
}

/**
 * ‼️ M-22 — THE EXECUTOR PAIR OF THE RUN THAT WILL ACTUALLY HAPPEN.
 *
 * `bridgeRunDimensions` only sees what this call typed, and half these ops do
 * not build a run from scratch — they lay an override over a stored task,
 * template, schedule or trigger. So the contradiction is usually made by ONE
 * argument: "retry it on OpenCode" against a task still carrying a CLI
 * profile, or a `cli` set on a schedule that was moved to another engine last
 * week. Neither side is wrong on its own and neither call mentions both
 * fields; only the merged run does. Every surface that resolves one calls this
 * with the values it resolved, which is why the check is here and not inside
 * the reader.
 */
export function needOneExecutor(engine: unknown, cli: unknown): void {
    need(!twoExecutors(cli, engine), ONE_EXECUTOR);
}

/**
 * …and the same dimensions on the way BACK OUT — one serializer for
 * `list` / `get` / `add` / `edit` / `rerun` (X-35).
 *
 * ‼️ THE RULE THIS ENFORCES IS THE PANEL–BRIDGE EQUIVALENCE ONE
 * (`_REF/agentfarm-dev.md`): work set up on a page has to be readable and
 * editable from the bridge WITHOUT LOSS. It was not — `schedules.list` returned
 * a schedule with no engine, `tasks.get` called itself "one task in detail" and
 * omitted every launch dimension, and a caller round-tripping either of them
 * silently reset a Codex job to Claude. Every reply is built here so a field
 * added to a run is added to all five at once.
 *
 * `null` rather than absent for a field that is genuinely unset: a reader
 * distinguishing "not stated" from "the key does not exist in this build" is
 * the difference between a default and a missing feature.
 */
/**
 * ‼️ B-12 — WHAT EVERY READ-BACK CARRIES, in the words the contracts print.
 * It lives beside the serializer rather than in each `describe`, because a
 * sentence typed into five contracts is a sentence four of them stop matching.
 */
/**
 * ‼️ M-26 — the two INTERACTIVE axes, in one sentence, for every op that can
 * install an interactive run. Shared rather than retyped: four describes saying
 * the same thing in four wordings is four contracts.
 */
export const INTERACTIVE_NOTE =
    ' ‼️ AND IF mode IS interactive, WHERE IT OPENS AND WHETHER IT STAYS — '
    + 'interactiveTarget? (vscode = the integrated terminal, the default | external = its '
    + 'own OS terminal window, Windows Terminal where there is one; the CLI\'s exit code '
    + 'comes back through a file so the run still finishes on its own | console = Agent '
    + 'Farm hosts the conversation in its Console panel, the only surface that follows '
    + 'what the run is DOING rather than only when it stopped), '
    + 'interactiveClose? (stay-open = the default, the conversational CLI, and it finishes '
    + 'when the surface is closed | auto-close = one turn — the engine is asked in its '
    + 'print-and-exit form and the run has an end). '
    + 'Both are refused, not ignored, on a headless run — including one that is headless '
    + 'because no mode was stated at all.';

export const DIMS_OUT_NOTE =
    ' ‼️ Each row also says what its ENGINE can do (engineLabel, turnShape, '
    + 'reportsCost, costSource, takesEffort) — read those before the figures beside '
    + 'them: a cost from a costSource:"cli" engine is the engine\'s own and may be '
    + 'added to a budget, one from a "tokens" engine is derived from your pricing '
    + 'rules and may not, and an effort is refused outright where takesEffort is false.';

export function bridgeDimsOut(
    o: {
        engine?: string; model?: string; effort?: string; permissionMode?: string;
        cli?: string; workDir?: string; priority?: number; projectId?: string;
        interactiveTarget?: string; interactiveClose?: string;
        ignoreBudget?: boolean; retry?: RetryPolicy;
    },
    projectName?: (id: string) => string | undefined
): Record<string, unknown> {
    return {
        // The default is named rather than left null: "which engine did this
        // run on" has an answer for every run ever recorded, and it is `claude`
        // for the ones made before there was a second one.
        engine: o.engine ?? 'claude',
        // ‼️ B-12 — AND WHAT THAT ENGINE CAN DO, beside the dimensions it was
        // set with. Every field below means something different per engine —
        // `effort` is refused outright where `takesEffort` is false, and
        // `costUSD` on the reply beside this one is the engine's own figure on
        // a `costSource:"cli"` row and derived from the user's pricing rules on
        // a `"tokens"` one — so a caller could read the whole reply and not
        // know which set of rules it was reading under. It is answered HERE
        // rather than op by op for the same reason the dimensions are: one
        // serializer means a sixth engine is described everywhere at once.
        engineLabel: engineOf(o.engine).label,
        // one long-lived process | one process per turn | one shared for every
        // card on this engine (see EngineShape)
        turnShape: engineOf(o.engine).shape,
        reportsCost: engineOf(o.engine).reportsCost,
        costSource: engineOf(o.engine).costSource,
        takesEffort: engineTakesEffort(o.engine),
        // ‼️ THE WHOLE STRING OR NOTHING. OpenCode names models
        // `provider/model` (`opencode/big-pickle`) and that is what goes on the
        // wire — a reader that splits it or strips the provider has invented a
        // model id no engine has.
        model: o.model ?? null,
        effort: o.effort ?? null,
        permissionMode: o.permissionMode ?? null,
        cli: o.cli ?? null,
        // ‼️ M-26 — the DEFAULTS are named rather than left null, for the same
        // reason the engine is: "where does this open, and does it stay?" has an
        // answer for every run ever recorded — the integrated terminal, left
        // open, for the ones written before there was anywhere else to put them.
        interactiveTarget: o.interactiveTarget ?? 'vscode',
        interactiveClose: o.interactiveClose ?? 'stay-open',
        workDir: o.workDir ?? null,
        priority: o.priority ?? 0,
        project: o.projectId ? (projectName?.(o.projectId) ?? o.projectId) : null,
        // ‼️ M-7 — a run that walks past the daily budget must SAY that it does.
        // Reading a schedule back without it and writing it away again is how a
        // waiver the user set on purpose disappears in a round trip.
        ignoreBudget: !!o.ignoreBudget,
        // ‼️ M-3 — null means "the user's default", which is a DIFFERENT answer
        // from `{max: 0}` ("never retry this one"). Reading it back as an object
        // either way would make a round trip freeze the default in place — and
        // the words say WHICH of the two it is rather than resolving a setting
        // this function has no business reading.
        retry: o.retry ?? null,
        retryPolicy: o.retry
            ? describeRetry(o.retry)
            : 'the user\'s default (agentFarm.taskRetry)'
    };
}

/**
 * The session (or sessions) an op was called about — `sessionId`, `sessionIds`,
 * or both.
 *
 * ‼️ ONE spelling of "which sessions", shared by every op that can act on more
 * than one. The alternative is each op inventing its own plural key and an
 * agent having to remember which is which; and once the panels can do a thing
 * to a selection, the bridge has to be able to do it to a set or the two
 * surfaces have drifted (`_REF/agentfarm-dev.md`). Duplicates are collapsed —
 * an op told the same session twice must not do the work twice.
 */
export function argSessionIds(args: Record<string, unknown>): string[] {
    const out: string[] = [];
    const push = (v: unknown): void => {
        const s = String(v ?? '').trim();
        if (s && !out.includes(s)) { out.push(s); }
    };
    push(args.sessionId);
    if (Array.isArray(args.sessionIds)) { for (const v of args.sessionIds) { push(v); } }
    return out;
}

/** The path to the staged af.js inside the bridge directory. */
export function stagedBridgeCliPath(storageDir: string): string {
    return path.join(storageDir, 'bridge', 'af.js');
}

/**
 * Copy the compiled bridge CLI helper (out/service/af.js) into <globalStorage>/bridge/af.js
 * so agents have a reliable, version-independent, escape-free CLI to execute bridge operations.
 */
export function stageBridgeCli(extensionPath: string, storageDir: string, version: string): { staged: boolean; path: string } {
    const src = path.join(extensionPath, 'out', 'service', 'af.js');
    const dstDir = path.join(storageDir, 'bridge');
    const dst = path.join(dstDir, 'af.js');
    const versionFile = path.join(dstDir, '.af_version');

    if (!fs.existsSync(src)) {
        return { staged: false, path: dst };
    }

    let currentVersion: string | undefined;
    try { currentVersion = fs.readFileSync(versionFile, 'utf8').trim(); } catch { /* ignore */ }
    if (currentVersion === version && fs.existsSync(dst)) {
        return { staged: false, path: dst };
    }

    try {
        fs.mkdirSync(dstDir, { recursive: true });
        fs.copyFileSync(src, dst);
        fs.writeFileSync(versionFile, version, 'utf8');
        return { staged: true, path: dst };
    } catch {
        return { staged: false, path: dst };
    }
}

