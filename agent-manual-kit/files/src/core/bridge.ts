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
import { FINISH_SOUND_SILENT, normalizeFinishSound } from './alertVoices';
import { normalizeLegCeiling } from './baton';
import { EngineId, ENGINES, engineOf, engineTakesEffort } from './consoleEngine';
import { INTERACTIVE_CLOSES, INTERACTIVE_TARGETS, ONE_EXECUTOR, twoExecutors, validateLaunch } from './launch';
import { describeRetry, normalizeRetry, retryRefusal, RetryPolicy } from './retry';
import { normalizeRounds, TaskRound } from './taskRounds';
import { suggestOps } from '../service/manualQuery';

/**
 * ‼️ X-310 — WHO WROTE THE REQUEST, when the writer can say so.
 *
 * A bridge request is a file on disk and says nothing about its author, which
 * was fine while no op needed to tell one caller from another. `farm.restart*`
 * does: the turn that ASKED to be restarted consented to dying and every other
 * turn in flight did not, and without a name for the asker the only choices are
 * to kill everyone or to wait for everyone.
 *
 * It is the engine's own session id, read by `af.js` off the environment the
 * CLI already publishes to its children — nothing new is spawned, injected or
 * remembered to make it true. It is a CLAIM and never a permission: no op may
 * grant anything on the strength of it, and every op must still be correct when
 * it is absent (a panel click, a command, an engine that publishes nothing).
 */
export interface BridgeCaller {
    /** the engine's session id, as the caller's own environment stated it */
    sessionId?: string;
    /** S-68 — the caller's parent pid, so the host can find its CLI by ancestry */
    ppid?: number;
}

export interface BridgeOpSpec {
    op: string;                       // e.g. "schedules.add"
    /** One-line contract shown in the farm.ops catalog: what it does + args. */
    describe: string;
    handler: (args: Record<string, unknown>, from?: BridgeCaller) => Promise<unknown> | unknown;
}

export interface BridgeOutcome {
    ok: boolean;
    result?: unknown;
    error?: string;
    /** Only on a `BridgeRefusal` — the decision that says NO, as data. */
    detail?: unknown;
}

/**
 * ‼️ A REFUSAL IS AN ANSWER, AND AN ANSWER HAS FIELDS (audit A-02.11).
 *
 * An op that decides not to act has computed something: WHY not, what it would
 * have done instead, how long the caller should wait. Thrown as a plain `Error`
 * all of that collapses into one string — and then into 500 characters of one
 * string, because the `catch` below has to assume an arbitrary exception and
 * caps it. Measured on `farm.restartExtensionHost`: the op's own catalogue entry
 * promises the escalation is reported "in `build.escalatedFrom` and `note`", and
 * on the refusal path neither field reached the caller at all, while the
 * sentence that named the way out (`loadBuild:false`) was cut off mid-word at
 * character 500.
 *
 * So a deliberate refusal says so with this, and carries its decision beside the
 * sentence. `ok` stays `false` — nothing happened, and no caller that reads only
 * `ok` changes its mind — and the message is NOT truncated, because we wrote it
 * and it is as long as it needed to be. An arbitrary exception is still capped:
 * that one is not ours and has no bound.
 */
export class BridgeRefusal extends Error {
    constructor(message: string, readonly detail?: unknown) {
        super(message);
        this.name = 'BridgeRefusal';
    }
}

export class BridgeRegistry {
    private ops = new Map<string, BridgeOpSpec>();
    /**
     * X-536 — told about every op a caller asked for that does not exist, so
     * the Agent Manual can record where agents look for something it lacks.
     */
    private unknownListener?: (op: string, near: string[], from?: BridgeCaller) => void;

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

    /** X-536 — who to tell when a caller asks for an op that does not exist. */
    onUnknownOp(listener: (op: string, near: string[], from?: BridgeCaller) => void): void {
        this.unknownListener = listener;
    }

    has(op: string): boolean {
        return this.ops.has(op);
    }

    catalog(): { op: string; describe: string }[] {
        return [...this.ops.values()]
            .map(s => ({ op: s.op, describe: s.describe }))
            .sort((a, b) => a.op.localeCompare(b.op));
    }

    async dispatch(op: string, args: Record<string, unknown>, from?: BridgeCaller): Promise<BridgeOutcome> {
        const spec = this.ops.get(op);
        if (!spec) {
            // X-536 — an unknown op is the moment an agent is most lost: name the
            // likeliest ops and the search that finds the rest, never the full dump.
            const near = suggestOps([...this.ops.keys()], op);
            try { this.unknownListener?.(op, near, from); } catch { /* recording a gap never fails the call */ }
            return {
                ok: false,
                error: `Unknown op "${op}".` + (near.length ? ` Did you mean ${near.join(', ')}?` : '')
                    + ` Search the manual: farm.find q="${op.replace(/[."]/g, ' ').trim()}" · the map: farm.guide`
                    + ` · ${this.ops.size} ops in all: farm.ops`
            };
        }
        try {
            return { ok: true, result: await spec.handler(args, from) };
        } catch (e) {
            // A refusal we composed ourselves: whole sentence, and its decision.
            if (e instanceof BridgeRefusal) {
                return { ok: false, error: e.message, ...(e.detail !== undefined ? { detail: e.detail } : {}) };
            }
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
export function parseBridgeRequest(text: string):
    { op: string; args: Record<string, unknown>; from?: BridgeCaller } | { error: string } {
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
    // X-310 — the envelope's own field, never one of the op's args: a caller
    // that wrote `sessionId` into `args` is naming something for that op, and
    // the two must not be able to be read as each other.
    const env = o.from && typeof o.from === 'object' && !Array.isArray(o.from)
        ? o.from as Record<string, unknown>
        : null;
    const sessionId = env ? String(unwrapPsString(env.sessionId) ?? '').trim() : '';
    const ppid = env ? Number(env.ppid) : NaN;
    const from: BridgeCaller = {
        ...(sessionId ? { sessionId } : {}),
        ...(Number.isInteger(ppid) && ppid > 0 ? { ppid } : {})
    };
    return { op: o.op.trim(), args, ...(Object.keys(from).length ? { from } : {}) };
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

/**
 * ‼️ B-29 — A NUMBER IN A STRING FIELD IS ITS TEXT, NOT NOTHING. `af.js sessions.find q=12345678`
 * arrives as a number (an id prefix of digits only), and reading it as absent answered with the
 * newest sessions instead of the one asked for. af.js coerces only text that round-trips, so
 * `String(n)` is exactly what was typed.
 */
function strOf(v: unknown): string {
    if (typeof v === 'string') { return v.trim(); }
    return typeof v === 'number' && isFinite(v) ? String(v) : '';
}

/** A required string arg, trimmed. */
export function argStr(args: Record<string, unknown>, key: string): string {
    const v = strOf(args[key]);
    need(v, `Missing required string arg "${key}".`);
    return v;
}

/** A required string arg whose EMPTY value means something ("" = clear): the key must be there, '' is accepted. */
export function argStrOrEmpty(args: Record<string, unknown>, key: string): string {
    need(args[key] !== undefined && args[key] !== null, `Missing required string arg "${key}" ("" is accepted).`);
    return strOf(args[key]);
}

/** An optional string arg ('' when absent). */
export function optStr(args: Record<string, unknown>, key: string): string {
    return strOf(args[key]);
}

/**
 * An optional boolean arg.
 *
 * ‼️ THE STRING FORMS COUNT, because the CLI helper's `key=value` shorthand is
 * how most of these arrive: `af.js accounts.forget id=x deleteFiles=true` hands
 * over the WORD "true" whenever the coercion misses, and an op reading
 * `args.x === true` then silently does the opposite of what was typed. A flag
 * that reads as false when somebody wrote "true" is the worst kind of trap —
 * nothing errors, the destructive half just does not happen (or does).
 */
export function optBool(args: Record<string, unknown>, key: string, fallback = false): boolean {
    const v = args[key];
    if (typeof v === 'boolean') { return v; }
    if (typeof v === 'number') { return v !== 0; }
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['true', 'yes', 'on', '1'].includes(s)) { return true; }
        if (['false', 'no', 'off', '0', ''].includes(s)) { return false; }
    }
    return fallback;
}

/** An optional number arg — the same string tolerance, for the same reason. */
export function optNum(args: Record<string, unknown>, key: string, fallback: number): number {
    const v = args[key];
    if (typeof v === 'number' && isFinite(v)) { return v; }
    if (typeof v === 'string' && v.trim()) {
        const n = Number(v.trim());
        if (isFinite(n)) { return n; }
    }
    return fallback;
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
    /**
     * ‼️ X-106 — `route` IS A QUESTION, NOT A RULE. Whether a route exists and
     * whether this engine can be pointed at it are the adapter's and the user's
     * profiles' answers; this file has neither and must not grow a copy of
     * either. It returns the refusal sentence, or nothing.
     */
    opts: {
        mode?: string;
        route?: (engine: string, providerId: string, tier: string) => string | undefined;
        /**
         * ‼️ X-169 — AND WHETHER THAT SIGN-IN IS ON THIS MACHINE, which is the
         * same kind of question as `route` and arrives the same way: the slot
         * list is a setting and the "belongs to one engine" rule is the account
         * store's, so this file has neither and must not grow a copy of either.
         * It returns the refusal sentence, or nothing.
         */
        account?: (engine: string, account: string) => string | undefined;
        /** U-151 — the retry supervisor this run inherits (Farm Settings, its agent, its project), which an empty engine here takes. */
        supervisor?: (args: Record<string, unknown>) => unknown;
    } = {}
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
            // S-60 — WITH the engine: a mode Antigravity cannot keep is refused
            // where it is written, by the engine's own sentence.
            ...(out.engine ? { engine: String(out.engine) as EngineId } : {}),
            effort: out.effort as string | undefined,
            permissionMode: out.permissionMode as string | undefined
        });
        need(!bad.length, bad.join(' · '));
    }
    // ‼️ AN EFFORT THE ENGINE HAS NO FLAG FOR IS REFUSED, NOT DROPPED. Gemini
    // has no reasoning-effort setting at all (core/gemini.ts) and exits 42 when
    // handed one. Accepting the field and silently ignoring it would let a
    // caller believe a run is throttled when nothing is.
    // X-330 — a task-like run is headless unless it says otherwise, and a
    // headless OpenCode run carries the level as `--variant`; which variants
    // the model publishes is checked at launch, against the catalog.
    const interactive = (opts.mode ?? optStr(args, 'mode')) === 'interactive';
    if (out.effort && !engineTakesEffort(String(out.engine ?? ''), interactive ? 'tui' : 'run')) {
        need(false, String(out.engine) === 'opencode'
            ? 'OpenCode takes a reasoning variant only on a headless run — its TUI has no --variant flag. '
            + 'Leave effort out, or run it headless.'
            : `engine "${out.engine}" has no reasoning-effort setting — leave effort out.`);
    }
    // ‼️ A-24 — AND WHAT IT SOUNDS LIKE WHEN IT IS OVER. An agent that can
    // queue a nightly run has to be able to say "and tell me in that tone", or
    // the field means one thing on the form and nothing in a request
    // (`_REF/agentfarm-dev.md`). The SHAPE is refused here — a value nothing
    // could ever be called never reaches a run — while WHICH tone is checked
    // where the list lives, exactly as `cli` is checked against the user's own
    // profiles rather than against a constant in this file.
    {
        const raw = optStr(args, 'finishSound');
        if (raw) {
            const finish = normalizeFinishSound(raw);
            need(!!finish,
                `unknown finishSound ${JSON.stringify(raw)} — a sound id from alerts.voices, `
                + `or "${FINISH_SOUND_SILENT}" to keep this run quiet`);
            out.finishSound = finish;
        }
    }
    // ‼️ M-30 — AND WHETHER IT WORKS TO THE DISCIPLINE. An agent that can queue
    // a nightly run must be able to say "and this one with the engineering
    // hook", or the field means one thing on the form and nothing in a request
    // (`_REF/agentfarm-dev.md`).
    //
    // ‼️ THREE STATES, SO THE TEST IS AGAINST `undefined`, NOT TRUTHINESS.
    // Omitting it means "the agent's default decides"; `false` is a caller
    // saying "not on this one". Collapsing the two would make it impossible to
    // turn the discipline OFF for a single job over the bridge, which is half
    // of what the switch is for.
    if (args.superpowers !== undefined) {
        need(typeof args.superpowers === 'boolean',
            'superpowers is true or false — omit it entirely to let the agent\'s own '
            + 'default decide, which is a THIRD answer and the one every run made '
            + 'before this gave.');
        out.superpowers = args.superpowers === true;
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
    // ‼️ S-82 — AND WHETHER ITS RUNS OPEN A BATON RELAY, in the words tasks.add
    // uses (`baton`, `maxHops` — the second implies the first): the form can
    // tick it on a schedule and a trigger, so "the nightly batch passes the
    // baton when it hits the wall" must be sayable here with the same word.
    if (args.baton !== undefined) {
        need(typeof args.baton === 'boolean', 'baton is true or false — omit it for an ordinary run.');
    }
    if (args.maxHops !== undefined && args.maxHops !== null && args.maxHops !== '') {
        need(normalizeLegCeiling(args.maxHops) !== undefined,
            `maxHops must be a whole number ≥ 0 (0 = no ceiling), not "${String(args.maxHops)}"`);
    }
    if (args.baton === true || (args.baton !== false && normalizeLegCeiling(args.maxHops) !== undefined)) {
        out.baton = true;
        const cap = normalizeLegCeiling(args.maxHops);
        if (cap !== undefined) { out.batonMaxHops = cap; }
    }
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
    const upSupervisor = opts.supervisor?.(args);
    need(!retryRefusal(args.retry, upSupervisor), retryRefusal(args.retry, upSupervisor));
    const retry = normalizeRetry(args.retry);
    if (retry) { out.retry = retry; }
    // ‼️ M-22 — the pair this call states, checked before it is stored. The
    // ops that lay these dimensions over a run that already exists have to ask
    // again about the MERGED result (`needOneExecutor`); what this catches is
    // the caller who names both in one breath.
    // ‼️ M-27 — AND THE PROMPTS AFTER THE FIRST ONE, for exactly the reason
    // the retry policy is here: the page offers a chain on a task, a schedule,
    // a trigger and a template, so an agent asked to "run the report every
    // morning and then ask it to file the answer" must be able to say it in
    // the same words. Cleaned by the same function the form and the task door
    // use — three doors, one shape.
    {
        const rounds = normalizeRounds(args.rounds);
        if (rounds.length) {
            // ‼️ AND REFUSED ON AN INTERACTIVE RUN RATHER THAN DROPPED, like the
            // surface pair above. A round RESUMES the conversation the round
            // before it was answered in, and resuming is a headless argument;
            // stored on an interactive run the chain would be accepted here,
            // saved, and then quietly never happen.
            const mode = opts.mode !== undefined ? opts.mode : (optStr(args, 'mode') ?? '');
            need(mode !== 'interactive',
                'rounds are sent into the SAME conversation, which means resuming it — a headless '
                + 'argument. This run is interactive: it opens a session in a terminal, where the '
                + 'next thing to say is typed into it.');
            out.rounds = rounds;
        }
    }
    /**
     * ‼️ X-106 — AND WHICH ROUTE IT IS SERVED BY, REFUSED WHERE IT IS WRITTEN
     * DOWN RATHER THAN WHERE IT RUNS.
     *
     * This is the same lesson the engine name and the effort already taught in
     * this function: a schedule, a trigger, a template and a workflow step are
     * runs that have not happened yet, and none of them passes through the
     * task door's own checks. A route stored with a typo is refused at 3 a.m.
     * with nobody watching — the failure furthest in time from the mistake.
     *
     * ‼️ WHETHER THE ROUTE EXISTS IS NOT A QUESTION THIS FILE CAN ANSWER, and
     * pretending otherwise is exactly the defect X-98 measured. It needs the
     * engine's adapter and the user's own profiles, so it arrives as `opts.route`
     * — the same doctrine `cli` follows (checked against the user's profiles,
     * never against a constant here). Absent, the shape is still checked.
     */
    {
        const providerId = optStr(args, 'providerId') ?? '';
        const tier = optStr(args, 'tier') ?? '';
        if (providerId) {
            needRoutableEngine(out.cli, providerId);
            const refused = opts.route?.(String(out.engine ?? 'claude'), providerId, tier);
            need(!refused, refused ?? '');
            out.providerId = providerId;
            if (tier) { out.tier = tier; }
        } else {
            // ‼️ A TIER WITH NO ROUTE IS REFUSED, NOT DROPPED. `opus` is a
            // different model on two routes, so the word answers nothing until
            // one is named — and a caller who set a tier and silently got none
            // cannot tell that from having got it.
            need(!tier, 'a tier belongs to a route: name the providerId it is a tier OF, or leave both out.');
        }
    }
    /**
     * ‼️ X-169 — WHICH SIGN-IN THE RUN IS ON, refused where it is WRITTEN DOWN.
     *
     * The same reason the route above is: a schedule, a trigger, a template and
     * a workflow step are runs that have not happened yet, so an account id with
     * a typo in it is otherwise discovered at 3 a.m. by nobody. And it is a
     * REFUSAL rather than a fallback — dropping it would run the job on whichever
     * identity happens to be signed in, which is the accident this whole family
     * exists to end.
     *
     * Absent is the ordinary answer and means the engine's active account, and
     * failing that the main sign-in: byte for byte what every run written before
     * this item does.
     */
    {
        const account = optStr(args, 'account') ?? '';
        if (account) {
            const refused = opts.account?.(String(out.engine ?? 'claude'), account);
            need(!refused, refused ?? '');
            out.account = account;
        }
    }
    needOneExecutor(out.engine, out.cli);
    return out;
}

/**
 * ‼️ X-106 — A ROUTE NEEDS AN ENGINE TO POINT, AND A CLI PROFILE IS NOT ONE.
 *
 * A CLI profile is a command TEMPLATE for a binary this extension knows nothing
 * about: it is spawned, its output is archived, and that is the whole
 * relationship — there is no endpoint to inject, no environment this extension
 * owns, and no way to tell afterwards what served it. A route beside one is two
 * statements about a question only one of them can answer, which is the same
 * contradiction `needOneExecutor` refuses between `engine` and `cli` and is
 * refused the same way: named, not silently ranked.
 *
 * Exported for the merge-time callers, exactly as `needOneExecutor` is: half the
 * ops lay an override over a stored run, so the contradiction is usually made by
 * ONE argument ("retry it on the Kimi route" against a task still carrying a CLI
 * profile) and only the merged run mentions both.
 */
export function needRoutableEngine(cli: unknown, providerId: unknown): void {
    const hasCli = typeof cli === 'string' && !!cli.trim();
    const hasRoute = typeof providerId === 'string' && !!providerId.trim();
    need(!(hasCli && hasRoute),
        'a route and a CLI profile are two answers to one question. A CLI profile is a command '
        + 'template for a binary Agent Farm does not know — there is no endpoint to point at it, '
        + 'and nothing afterwards could say what served the run. State one or the other.');
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

/**
 * ‼️ X-106 — WHICH ROUTE THE RUN IS SERVED BY, said once and spliced into every
 * door that can write one down. A note typed out per op is how `console.start`
 * came to describe a route and `schedules.add` came to describe none, while both
 * accepted the argument.
 */
export const ROUTE_NOTE =
    ' ‼️ AND WHICH ROUTE SERVES IT — providerId? (the endpoint the process really '
    + 'talks to, which the engine itself never says. On Claude it is one of the route '
    + 'profiles Agent Farm owns and injects; on OpenCode it is the engine\'s own provider '
    + 'id. engines.providers lists what is set up), tier? (Claude routes only — which model '
    + 'that route serves for this name; "opus" is a different model on two routes, which is '
    + 'why it is not folded into model). ‼️ THIS IS THE DIMENSION AN AUTOMATION MOST NEEDS '
    + 'AND COULD NOT STATE: a run that names none takes whichever standing route the agent '
    + 'happens to have when it fires, at 3 a.m., with nobody there to notice. Omitted, '
    + 'nothing is injected and nothing is cleared — exactly what every run written before '
    + 'this did. A route this engine cannot be pointed at, a tier the route does not map, '
    + 'and a route beside a `cli` profile are all REFUSED HERE rather than dropped: an '
    + 'automation is written once and read months later, so a value silently discarded at '
    + 'write time is a decision that never happens and never says so.';

export const ROUNDS_NOTE =
    ' ‼️ AND HOW MANY TURNS IT GOES — rounds? ([{prompt, delayMin?}, …] or plain '
    + 'strings). A ROUND is one more prompt sent into the SAME conversation, once the round '
    + 'before it has been ANSWERED — so round 2 wakes up knowing everything round 1 did. The '
    + 'prompt above is round 1; these are 2..N, each becoming its own queued row when its turn '
    + 'comes. delayMin waits that many minutes AFTER the previous answer lands (0 = at once, '
    + 'ceiling seven days). ‼️ A RETRY IS NOT A ROUND: a run that fails and is retried '
    + 're-attempts the same round with the same words and consumes none of these. Headless only '
    + '— refused, not ignored, on an interactive run. Stating it on a SCHEDULE or a TRIGGER is '
    + 'the case it exists for: a run that fires with nobody here has no one to type the next '
    + 'thing.';

export const FINISH_SOUND_NOTE =
    ' ‼️ AND WHAT IT SOUNDS LIKE WHEN IT ENDS — finishSound? (a sound id from '
    + 'alerts.voices, the user\'s own ones included, or "' + FINISH_SOUND_SILENT + '"). '
    + 'A tone is written onto the run\'s OWN session the moment that session has an id, so it '
    + 'is the top step of the same chain the ♪ menu writes — this run only, nothing else '
    + 'touched — and picking one also arms that session\'s sound, or the choice would sit '
    + 'there silent whenever the fleet switch is off. "' + FINISH_SOUND_SILENT + '" is not a '
    + 'tone: silence is the session MUTE, so it quiets the whole run rather than only its '
    + 'ending, which is the only way anything can take a sound away (the two authorities over '
    + 'a sound ADD). Omit it and the alert settings decide, exactly as they always have.';

export const SUPERPOWERS_NOTE =
    ' ‼️ AND WHETHER IT WORKS TO THE DISCIPLINE — superpowers? (true|false). The '
    + 'engineering hook X-133 puts in front of a run: brainstorm before building, a plan '
    + 'before code, systematic debugging before a fix. It is normally ONE switch per agent '
    + '(agentFarm.superpowersDefaults), which answers "how does this agent work" and cannot '
    + 'answer "…except for this job" — a nightly lint sweep and a feature build are the same '
    + 'agent and are not the same kind of work. ‼️ OMITTING IT IS A THIRD ANSWER, not false: '
    + 'absent means the agent\'s own default decides, which is what every run made before '
    + 'this did and must keep meaning. Pass false to switch the discipline OFF for this job '
    + 'alone.';

export const BATON_NOTE =
    ' ‼️ S-82 — AND WHETHER EACH RUN OPENS A BATON RELAY — baton? (true), maxHops? (that '
    + 'chain\'s own leg ceiling, the first leg included; 0 = none; implies baton:true; default '
    + 'agentFarm.batonMaxHops). A run that opens a relay is sealed as leg 1 once its session is '
    + 'known: at the quota or context wall its whisper says "pass the baton", and a fresh session '
    + 'on the chain\'s POOL picks the work up. The pool is the `account` when it names a policy '
    + '(@…); a single slot or none means @emptiest. Every firing opens its OWN chain — a chain '
    + 'name (chainId) is a tasks.add argument only.';

export const DIMS_OUT_NOTE =
    ' ‼️ Each row also says what its ENGINE can do (engineLabel, turnShape, '
    + 'reportsCost, costSource, takesEffort) — read those before the figures beside '
    + 'them: a cost from a costSource:"cli" engine is the engine\'s own and may be '
    + 'added to a budget, one from a "tokens" engine is derived from your pricing '
    + 'rules and may not, and an effort is refused outright where takesEffort is false.';

export function bridgeDimsOut(
    o: {
        engine?: string; model?: string; effort?: string; permissionMode?: string;
        providerId?: string; tier?: string; account?: string;
        cli?: string; workDir?: string; priority?: number; projectId?: string;
        interactiveTarget?: string; interactiveClose?: string;
        finishSound?: string;
        superpowers?: boolean;
        ignoreBudget?: boolean; retry?: RetryPolicy; rounds?: TaskRound[];
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
        // X-106 - WHICH ROUTE THE RUN IS SERVED BY, on the way back out too.
        // The panel-bridge equivalence rule this serializer exists for: a route
        // set on a schedule and read back without one, then written away again,
        // is a decision the user made silently erased by a round trip. null is
        // the real answer "no route chosen" - nothing injected, nothing cleared.
        providerId: o.providerId ?? null,
        // Claude routes only; null on every other engine and on every launch
        // that named no route, because a tier has no referent without one.
        tier: o.tier ?? null,
        // ‼️ X-226 — AND WHICH SIGN-IN SERVES IT, which this serializer has never
        // said. `account` travels INTO every door (X-169) and came back out of
        // none, so the reader of a night's work — as often an agent as a person
        // — could learn the route and the tier of a run and not whose plan paid
        // for it. That is the same round-trip erasure the route comment above
        // describes, and it is worse here: an unattended run may now be HANDED
        // OVER to another account at a wall (see `carryOnAccount`), so the
        // answer is not even constant for the life of one piece of work. null is
        // "no account named" — the active sign-in answered, exactly as before.
        account: o.account ?? null,
        cli: o.cli ?? null,
        // ‼️ M-26 — the DEFAULTS are named rather than left null, for the same
        // reason the engine is: "where does this open, and does it stay?" has an
        // answer for every run ever recorded — the integrated terminal, left
        // open, for the ones written before there was anywhere else to put them.
        interactiveTarget: o.interactiveTarget ?? 'vscode',
        interactiveClose: o.interactiveClose ?? 'stay-open',
        // A-24 - what this run sounds like when it ends. null is the real
        // answer "it says nothing about it", which is different from "silent";
        // reading it back as a tone either way would make a round trip invent a
        // decision, exactly as it would for the retry policy below.
        finishSound: o.finishSound ?? null,
        // ‼️ M-30 — null is the real answer "this run says nothing about it, so
        // the agent's default decides", and it is a DIFFERENT answer from
        // `false`. Reading it back as a boolean either way would make a round
        // trip freeze today's default onto a run that never chose one — the
        // same defect the retry policy and the finish sound are guarded against
        // here.
        superpowers: o.superpowers ?? null,
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
            : 'the user\'s default (agentFarm.taskRetry)',
        // ‼️ M-27 — the prompts AFTER the first one, and how many turns that
        // makes in all. Read back so a caller can see a chain it did not set
        // itself: a schedule that goes three rounds deep every morning looks
        // exactly like a one-prompt one until this says otherwise.
        rounds: o.rounds ?? [],
        roundsTotal: 1 + (o.rounds?.length ?? 0)
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
    const srcDir = path.join(extensionPath, 'out', 'service');
    const dstDir = path.join(storageDir, 'bridge');
    const dst = path.join(dstDir, 'af.js');
    const versionFile = path.join(dstDir, '.af_version');
    // X-536 — af.js requires its manual reader from its own folder, so the two
    // travel together; a stage that left one behind is not a stage.
    const files = STAGED_CLI_FILES.filter(f => fs.existsSync(path.join(srcDir, f)));

    if (!files.includes('af.js')) {
        return { staged: false, path: dst };
    }

    let currentVersion: string | undefined;
    try { currentVersion = fs.readFileSync(versionFile, 'utf8').trim(); } catch { /* ignore */ }
    if (currentVersion === version && files.every(f => fs.existsSync(path.join(dstDir, f)))) {
        return { staged: false, path: dst };
    }

    try {
        fs.mkdirSync(dstDir, { recursive: true });
        for (const f of files) { fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f)); }
        fs.writeFileSync(versionFile, version, 'utf8');
        return { staged: true, path: dst };
    } catch {
        return { staged: false, path: dst };
    }
}

/** The standalone files staged into the bridge folder: the CLI and the manual reader it requires. */
export const STAGED_CLI_FILES: readonly string[] = ['af.js', 'manualQuery.js'];

