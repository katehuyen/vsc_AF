/**
 * A-16 — OPENCODE'S ENGINE CONTRACT, FROZEN AGAINST A REAL BINARY.
 *
 * ‼️ EVERY LINE HERE WAS MEASURED, NOT READ ON A DOCUMENTATION PAGE. The SOP
 * (`docs/YENI-MOTOR-EKLEME-SOP.tr.md`) names "we took the field names from the
 * docs" as a proven failure pattern, and this engine has three traps that only a
 * real handshake finds. The raw frames are in `docs/OPENCODE-ENTEGRASYON.tr.md`
 * and re-cuttable with `tools/opencode_acp_probe.js`.
 *
 * Measured 2026-08-15, Windows, opencode 1.18.18, `opencode` on PATH as an npm
 * `.cmd` shim, ZERO credentials in `~/.local/share/opencode/auth.json`:
 *
 *   · `initialize` answers protocolVersion 1 and declares `loadSession`,
 *     `sessionCapabilities: { close, fork, list, resume }`,
 *     `promptCapabilities: { image, embeddedContext }`,
 *     `mcpCapabilities: { http, sse }` and `agentInfo { name, version }`.
 *   · ‼️ `session/set_config_option` takes **`configId`**, not `id`. Sending
 *     `id` is refused with -32602 and a zod error naming `configId`. That is one
 *     word between "the model picker works" and "every model change is silently
 *     an error on stderr", and no page says it.
 *   · ‼️ THE ENGINE IS USABLE WITH NO CREDENTIAL AT ALL. `opencode providers
 *     list` prints "0 credentials" while `opencode models` returns seven — its
 *     own `opencode` provider (`big-pickle` plus six `*-free`). So `auth.mode:
 *     'none'` must NOT become `ready: false` on this engine; see
 *     `OPENCODE_READY_WITHOUT_CREDENTIAL`.
 *   · ‼️ TWO DIFFERENT NUMBERS, TWO DIFFERENT EVENTS. `session/prompt`'s result
 *     carries the TURN's spend; `session/update → usage_update` carries the
 *     window occupancy AND its capacity. Reading spend as context — the mistake
 *     X-43 exists because of — is impossible here only if the two are kept apart
 *     by name, which is what `OpencodeSpend` and `OpencodeContext` do.
 *   · Conversations live in SQLite (`~/.local/share/opencode/opencode.db`), so
 *     there is no transcript file to open; `session list` and `export` are the
 *     readable surface, and `export` prints a human line before its JSON.
 *
 * Pure: vocabularies, one capability gate and fail-soft parsers. No spawning, no
 * vscode, no ACP runtime — that is K-25 (`opencodeacp.ts`).
 */

/** The version every measurement in this file was taken against. */
export const OPENCODE_MEASURED_VERSION = '1.18.18';

/** The ACP revision this contract speaks. `initialize` answered exactly this. */
export const OPENCODE_ACP_PROTOCOL = 1;

/** The npm package, for the "not installed" row's one actionable step. */
export const OPENCODE_INSTALL_COMMAND = 'npm install -g opencode-ai';

/**
 * ‼️ CREDENTIALS ARE NOT THE READINESS TEST ON THIS ENGINE.
 *
 * Every other engine in this codebase answers "can it run" with "is there a
 * sign-in on disk". Measured on opencode 1.18.18 that question returns the wrong
 * answer: with an empty `auth.json` the CLI still lists seven models on its own
 * connected `opencode` provider and runs real turns on them. A row that printed
 * "not signed in → not ready" would be telling the user to fix something that is
 * not broken, which is the exact dishonesty `core/engines.ts` was written to end.
 */
export const OPENCODE_READY_WITHOUT_CREDENTIAL = true;

/** Where the sign-in goes when there IS one — read for existence only. */
export const OPENCODE_AUTH_FILE = '.local/share/opencode/auth.json';

/** …and where the conversations are, in a form nothing here can read. */
export const OPENCODE_DB = '.local/share/opencode/opencode.db';

/** `ses_ffae93e06ffe3OOx0X42HLDzT2` — the real conversation id, on every event
 *  of every transport, and NOT derived from a file name (there is no file). */
export const OPENCODE_SESSION_ID = /^ses_[0-9a-zA-Z]+$/;

// ---------------------------------------------------------------------------
// The capability gate — a version check that reads the handshake, not a number
// ---------------------------------------------------------------------------

/**
 * What the agent said it can do, narrowed to the things this integration needs.
 *
 * ‼️ THE GATE IS THE HANDSHAKE, NOT `--version`. A build that answers
 * `protocolVersion: 2` or drops `loadSession` breaks the Console in a way a
 * semver comparison cannot see, and the user's `opencode upgrade` is one command
 * away at all times. So every capability this codebase depends on is asked for
 * BY NAME at connect time and the refusal names the missing one.
 */
export interface OpencodeCapabilities {
    protocolVersion: number;
    /** the version string the agent volunteers — recorded, never gated on */
    agentVersion: string;
    agentName: string;
    /** can an existing conversation be re-opened and replayed */
    loadSession: boolean;
    sessionList: boolean;
    sessionResume: boolean;
    sessionFork: boolean;
    sessionClose: boolean;
    /** can a picture be sent as a content block */
    image: boolean;
    embeddedContext: boolean;
    mcpHttp: boolean;
    mcpSse: boolean;
    /** the sign-in routes it offers, for a surface that has to say how */
    authMethods: { id: string; name: string; description: string }[];
}

function bool(v: unknown): boolean { return v === true; }

function obj(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/**
 * Read an `initialize` result. FAIL-SOFT BY CONSTRUCTION: a field that is not
 * there reads false, and nothing throws — the refusal below is where a missing
 * capability becomes a sentence, so a malformed handshake cannot take the
 * extension host down with it.
 */
export function opencodeCapabilities(result: unknown): OpencodeCapabilities {
    const r = obj(result);
    const caps = obj(r.agentCapabilities);
    const sess = obj(caps.sessionCapabilities);
    const prompt = obj(caps.promptCapabilities);
    const mcp = obj(caps.mcpCapabilities);
    const info = obj(r.agentInfo);
    const methods = Array.isArray(r.authMethods) ? r.authMethods : [];
    return {
        protocolVersion: typeof r.protocolVersion === 'number' ? r.protocolVersion : 0,
        agentVersion: typeof info.version === 'string' ? info.version : '',
        agentName: typeof info.name === 'string' ? info.name : 'OpenCode',
        loadSession: bool(caps.loadSession),
        // ‼️ THESE ARE OBJECTS, NOT BOOLEANS — measured: `{ "list": {}, "resume":
        // {}, … }`. `bool()` on them would read false and switch off half the
        // integration against a binary that supports all of it.
        sessionList: 'list' in sess,
        sessionResume: 'resume' in sess,
        sessionFork: 'fork' in sess,
        sessionClose: 'close' in sess,
        image: bool(prompt.image),
        embeddedContext: bool(prompt.embeddedContext),
        mcpHttp: bool(mcp.http),
        mcpSse: bool(mcp.sse),
        authMethods: methods.map(m => {
            const a = obj(m);
            return {
                id: typeof a.id === 'string' ? a.id : '',
                name: typeof a.name === 'string' ? a.name : '',
                description: typeof a.description === 'string' ? a.description : ''
            };
        })
    };
}

/**
 * '' when this build can be driven; otherwise the sentence to refuse with.
 *
 * ‼️ IT REFUSES BY NAME. "OpenCode is not compatible" sends a user to an upgrade
 * that may not be the answer; naming the capability that went missing is what
 * lets them — or the next person here — tell an upstream change from a bug.
 */
export function opencodeCapabilityRefusal(c: OpencodeCapabilities): string {
    if (c.protocolVersion !== OPENCODE_ACP_PROTOCOL) {
        return `OpenCode ${c.agentVersion || 'on this machine'} speaks ACP protocol `
            + `${c.protocolVersion || 'nothing recognisable'}; this build of Agent Farm speaks `
            + `${OPENCODE_ACP_PROTOCOL}. The Console cannot drive it until one of the two moves.`;
    }
    const missing: string[] = [];
    if (!c.loadSession) { missing.push('loadSession (re-opening a conversation)'); }
    if (!c.sessionResume) { missing.push('session resume'); }
    if (!missing.length) { return ''; }
    return `OpenCode ${c.agentVersion || OPENCODE_MEASURED_VERSION} no longer offers `
        + `${missing.join(' and ')} — measured against ${OPENCODE_MEASURED_VERSION}, where it did. `
        + 'A conversation started now could not be picked up again, so the Console refuses rather than losing it.';
}

// ---------------------------------------------------------------------------
// Permission — what OpenCode actually has, under its own names
// ---------------------------------------------------------------------------

/**
 * ‼️ TWO KNOBS, AND NEITHER IS A SANDBOX.
 *
 * OpenCode's restraint is a session MODE (`build` executes tools under the
 * configured permissions, `plan` disallows every edit tool) plus one blunt
 * override, `--auto`, whose own help calls it *auto-approve permissions that are
 * not explicitly denied (dangerous!)*. There is no workspace-scoped middle
 * setting, so `acceptEdits` and `bypassPermissions` reach the same two flags —
 * said out loud in `opencodeModeNote` rather than implied by a label that would
 * read as a guarantee.
 *
 * The Console is the exception that makes `default` worth having: over ACP this
 * engine really does stop and ask (`session/request_permission`, with
 * once/always/reject options), so "ask me" is a mode it can keep — unlike Codex.
 */
export const OPENCODE_MODES = ['build', 'plan'] as const;
export type OpencodeMode = typeof OPENCODE_MODES[number];

export interface OpencodePermission {
    mode: OpencodeMode;
    /** the `--auto` flag, on the transports that have nobody to ask */
    auto: boolean;
}

export function opencodePermissionFor(mode: string | undefined): OpencodePermission {
    switch (String(mode ?? '').trim()) {
        case 'plan': return { mode: 'plan', auto: false };
        case 'acceptEdits': return { mode: 'build', auto: true };
        case 'bypassPermissions': return { mode: 'build', auto: true };
        default: return { mode: 'build', auto: false };
    }
}

/** One line beside the picker: what this mode does HERE, on this engine. */
export function opencodeModeNote(mode: string | undefined): string {
    const p = opencodePermissionFor(mode);
    if (p.mode === 'plan') {
        return 'OpenCode runs its own `plan` agent: every edit tool is disallowed, so it can read and reason and not write.';
    }
    if (p.auto) {
        return 'OpenCode runs with `--auto`, which approves everything its config does not explicitly deny — '
            + 'it has no workspace-only middle setting, so this is the same flag "accept edits" and "bypass" both reach. '
            + 'Narrow it in `opencode.json` if that is wider than you meant.';
    }
    return 'OpenCode\'s `build` agent asks before it acts, and in the Console it really can ask — '
        + 'the permission card is the engine\'s own request, with its own once / always / reject options. '
        + 'An unattended run has nobody to answer, so there the same request is refused.';
}

/** What a surface that writes the mode down should CALL it on this engine. */
export function opencodePermissionSetting(mode: string | undefined): { label: string; value: string } {
    const p = opencodePermissionFor(mode);
    return { label: 'Session mode', value: p.auto ? `${p.mode} + --auto` : p.mode };
}

// ---------------------------------------------------------------------------
// Command lines
// ---------------------------------------------------------------------------

/**
 * ‼️ THE COMMAND IS AN npm `.cmd` SHIM ON WINDOWS, SO IT NEEDS A SHELL — and
 * that is safe here for a reason worth stating: on NEITHER transport does
 * user-typed text reach a command line. The hosted turn travels inside a
 * JSON-RPC frame on stdin, and the headless turn is piped to `run`'s stdin. The
 * `message..` positional exists and is deliberately not used.
 */
export const OPENCODE_EXE = 'opencode';
export const OPENCODE_NEEDS_SHELL = true;

/** The shared ACP server — ONE of these serves every hosted card (K-25). */
export function opencodeAcpArgs(): string[] { return ['acp']; }

export interface OpencodeRunInit {
    model?: string;
    /** provider-specific reasoning effort — `--variant`, and OpenCode's own word
     *  for it. ACP 1.18.18 declares only `model` and `mode`, so a variant is a
     *  HEADLESS-only control and no picker offers it on a hosted card. */
    variant?: string;
    /** OpenCode's own agent (`build`, `plan`, or one the user wrote) */
    agent?: string;
    permissionMode?: string;
    cwd?: string;
    /** the conversation to continue — `-s`, MEASURED to carry the context and to
     *  come back with the same `ses_…` id */
    resume?: string;
    /** files to attach — `-f`, the headless image/file channel */
    files?: string[];
}

/**
 * ONE unattended run — a headless task.
 *
 * ‼️ `--format json` OR NOTHING. The default format is a formatted transcript
 * for a person; the JSON form is the only one with `sessionID`, per-step tokens
 * and a cost on the wire, and a task archive that cannot state which
 * conversation it belonged to is a row nothing can resume.
 *
 * The prompt goes on STDIN: `run [message..]` would take it as a positional,
 * which does not survive the shell this shim needs and would put the user's text
 * on a command line for no gain.
 */
export function opencodeRunArgs(o: OpencodeRunInit): string[] {
    const p = opencodePermissionFor(o.permissionMode);
    const resume = String(o.resume ?? '').trim();
    return [
        'run', '--format', 'json',
        ...(resume ? ['-s', resume] : []),
        ...(o.model?.trim() ? ['-m', o.model.trim()] : []),
        ...(o.variant?.trim() ? ['--variant', o.variant.trim()] : []),
        // The agent IS the mode on this engine: `--agent plan` is how a run is
        // held to reading. An explicit agent the user chose wins over the mode.
        ...(o.agent?.trim() ? ['--agent', o.agent.trim()] : p.mode === 'plan' ? ['--agent', 'plan'] : []),
        ...(p.auto ? ['--auto'] : []),
        ...(o.cwd ? ['--dir', `"${o.cwd}"`] : []),
        ...(o.files ?? []).flatMap(f => ['-f', `"${f}"`])
    ];
}

/**
 * The INTERACTIVE engine — OpenCode's own TUI, which is the default subcommand.
 *
 * `--prompt` seeds the first message and STAYS in the conversation; `run` would
 * answer once and exit. `-s <id>` re-opens a conversation and `-c` continues the
 * last one, both ordinary flags on the ordinary command — so unlike Codex, this
 * engine really can be resumed from a terminal.
 */
export function opencodeTuiArgs(
    o: OpencodeRunInit & { continueLast?: boolean }
): string[] {
    const p = opencodePermissionFor(o.permissionMode);
    const resume = String(o.resume ?? '').trim();
    return [
        ...(resume ? ['-s', resume] : o.continueLast ? ['-c'] : []),
        ...(o.model?.trim() ? ['-m', o.model.trim()] : []),
        ...(o.agent?.trim() ? ['--agent', o.agent.trim()] : p.mode === 'plan' ? ['--agent', 'plan'] : []),
        ...(p.auto ? ['--auto'] : []),
        // The TUI takes the folder as a POSITIONAL, not as `--dir` — a different
        // vocabulary on the same binary, which is exactly the kind of thing the
        // SOP wants written down once rather than guessed at each call site.
        ...(o.cwd ? [`"${o.cwd}"`] : [])
    ];
}

/** `opencode session list` and `opencode export <id>` — the readable surface of
 *  a store that is otherwise SQLite. */
export function opencodeSessionListArgs(): string[] { return ['session', 'list']; }
export function opencodeExportArgs(sessionId: string): string[] {
    return ['export', String(sessionId ?? '').trim()];
}

/** ‼️ No `--append-system-prompt` equivalent exists: the inputs are the prompt,
 *  `AGENTS.md` and its own config. A project brief therefore rides INSIDE the
 *  first prompt, exactly as it does on Codex. */
export const OPENCODE_HAS_NO_SYSTEM_PROMPT_FLAG = true;

/** `opencode models` — every model the CONNECTED providers offer, one per line
 *  as `provider/model`. It is a catalogue read, not a turn, so it costs nothing
 *  and needs no credential on the connected `opencode` provider. */
export function opencodeModelsListArgs(): string[] { return ['models']; }

/**
 * ‼️ X-52 — THE SAME CATALOGUE, WITHOUT A SESSION TO GET IT FROM.
 *
 * `session/new` hands the list over with display names and costs no spawn, and
 * that is still the better source when a card is open (`opencodeModelsFrom`).
 * But a model box is drawn long before any card exists — a task written for
 * tomorrow, a preset, the settings page — and "start a session first" is not an
 * answer a picker can give. `opencode models` answers the same question from a
 * cold window: one `provider/model` per line, no display names, so the id is
 * also the label until a handshake supplies a better one.
 *
 * Deduplicated and sorted, because two providers can publish the same id and a
 * picker that lists it twice is a picker nobody trusts.
 */
export function readOpencodeModelList(stdout: string): { id: string; label: string }[] {
    const ids = String(stdout ?? '')
        .split('\n')
        .map(l => l.trim())
        // A model line and nothing else: `provider/model`, no spaces, no prose.
        .filter(l => /^[\w.:-]+\/[\w.:-]+$/.test(l));
    return Array.from(new Set(ids)).sort().map(id => ({ id, label: id }));
}

/**
 * ‼️ U-59 — THE FREE MODEL TO SPEND A HEALTH CHECK ON, PICKED FROM WHAT IS
 * REALLY THERE.
 *
 * A health check is one real turn, so the model it burns is the whole cost of
 * pressing the button — and a hardcoded one is wrong twice over: it is a paid
 * model on an engine whose own provider offers free ones, and it is a name that
 * will be retired while this string stays. So the list is read at press time and
 * a `*-free` model is taken from it.
 *
 * The naming convention IS the signal (`opencode/…-free`), and it is the
 * engine's, not ours: nothing here decides what is free, it only reads what the
 * provider called free. Empty when the catalogue offers none — the caller then
 * has to ask rather than guess, because guessing spends money.
 *
 * Sorted so the choice is deterministic: two runs of the same check on the same
 * catalogue must test the same thing, or a flaky result cannot be told from a
 * flaky model.
 */
export function opencodeFreeModel(stdout: string): string {
    return readOpencodeModelList(stdout).map(m => m.id).filter(id => /-free$/.test(id))[0] ?? '';
}

// ---------------------------------------------------------------------------
// ACP frame shapes — the field names, frozen (K-25 builds the runtime on these)
// ---------------------------------------------------------------------------

/** What the client tells the agent it can do. `fs` matters: without it the
 *  agent reads files itself and the Console never sees the request. */
export function opencodeInitializeParams(): Record<string, unknown> {
    return {
        protocolVersion: OPENCODE_ACP_PROTOCOL,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }
    };
}

/**
 * ‼️ `configId`. NOT `id`.
 *
 * Measured: `{ sessionId, id: 'model', value }` is refused with -32602 and a zod
 * error whose only content is `configId: expected string, received undefined`.
 * The failure is a model picker that appears to work and changes nothing, with
 * the reason on a stderr nobody is reading — so the one call site is this
 * function and the test asserts the key by name.
 */
export function opencodeSetConfigParams(
    sessionId: string, configId: 'model' | 'mode' | string, value: string
): Record<string, unknown> {
    return { sessionId, configId, value };
}

/** The config options a session declares — returned by `session/new`,
 *  `session/load` AND `session/set_config_option`, so one reader serves all. */
export interface OpencodeConfigOption {
    id: string;
    name: string;
    category: string;
    currentValue: string;
    options: { value: string; name: string; description?: string }[];
}

export function opencodeConfigOptions(result: unknown): OpencodeConfigOption[] {
    const list = obj(result).configOptions;
    if (!Array.isArray(list)) { return []; }
    return list.map(raw => {
        const o = obj(raw);
        const opts = Array.isArray(o.options) ? o.options : [];
        return {
            id: typeof o.id === 'string' ? o.id : '',
            name: typeof o.name === 'string' ? o.name : '',
            category: typeof o.category === 'string' ? o.category : '',
            currentValue: typeof o.currentValue === 'string' ? o.currentValue : '',
            options: opts.map(rawOpt => {
                const v = obj(rawOpt);
                return {
                    value: typeof v.value === 'string' ? v.value : '',
                    name: typeof v.name === 'string' ? v.name : '',
                    ...(typeof v.description === 'string' ? { description: v.description } : {})
                };
            }).filter(v => v.value)
        };
    }).filter(o => o.id);
}

/**
 * ‼️ THE MODEL CATALOGUE COSTS NOTHING AND ARRIVES UNASKED.
 *
 * `session/new` already answers with every model this machine can reach, their
 * display names and the one currently selected. Shelling out to `opencode
 * models` for a list the handshake just handed over is a spawn per panel draw
 * for no new fact.
 */
export function opencodeModelsFrom(options: OpencodeConfigOption[]): { id: string; label: string }[] {
    const model = options.find(o => o.id === 'model');
    return (model?.options ?? []).map(o => ({ id: o.value, label: o.name || o.value }));
}

/**
 * ‼️ K-28 — A VALUE THE ENGINE WILL RECOGNISE, OR NOTHING.
 *
 * OpenCode names a model `provider/model` — `opencode/big-pickle` — and that is
 * what `session/new` and `session/load` report as the current value. Its own
 * EXPORT does not: `info.model` is `{ id: "big-pickle", providerID: "opencode" }`
 * and the id alone is what an indexed transcript carries. So a RESUMED session
 * arrived at the Console asking for `big-pickle`, the connection said
 * `opencode/big-pickle`, and the two not matching read as "the user changed the
 * model" — `session/set_config_option` went out with the bare id and the engine
 * refused a name it had never published: *Invalid params: model not found:
 * big-pickle — {"providerId":"big-pickle","modelId":"big-pickle"}*. A red row on
 * every resume, for a change nobody asked for.
 *
 * The engine's own option list is the only authority on the spelling, so the
 * wanted value is resolved against it rather than patched with a guessed prefix:
 *
 * - already one of the published values → itself;
 * - the tail of exactly one of them (`big-pickle` → `opencode/big-pickle`) →
 *   that one, which is the completion the export made necessary;
 * - the tail of several → **undefined**. Two providers offering the same model
 *   is a real shape, and picking one of them by luck would silently answer with
 *   a different engine's model;
 * - not offered at all → undefined, because sending it is a refusal with extra
 *   steps.
 *
 * An option this session never declared is left alone (returned as asked), so a
 * config key nobody has modelled here is not swallowed by this rule.
 */
export function opencodeResolveOption(
    options: OpencodeConfigOption[], configId: string, want: string
): string | undefined {
    const v = String(want ?? '').trim();
    if (!v) { return undefined; }
    const group = options.find(o => o.id === configId);
    if (!group) { return v; }
    const values = group.options.map(o => o.value);
    if (values.includes(v)) { return v; }
    const tails = values.filter(x => x.slice(x.lastIndexOf('/') + 1) === v);
    return tails.length === 1 ? tails[0] : undefined;
}

// ---------------------------------------------------------------------------
// Usage — SPEND and CONTEXT, and they are not the same event
// ---------------------------------------------------------------------------

/**
 * What one TURN cost. `turnAggregate` in the words of `consoleproto.ts` →
 * `UsageScope`: every internal model call of one user turn, summed.
 *
 * ‼️ IT IS NOT CUMULATIVE, and that was measured rather than assumed. Turn 2 of
 * a conversation came back with `inputTokens: 36` and `cachedReadTokens: 8192`
 * where turn 1 had 6196 / 1920 — a running total cannot go down. So NO delta is
 * subtracted here; doing what the Codex adaptor correctly does would report a
 * turn as costing nothing.
 */
export interface OpencodeSpend {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    /** the engine's own total — `input + output + reasoning + cacheRead +
     *  cacheWrite`, verified against three real turns */
    total: number;
    /** dollars the engine itself states. ‼️ 0 on a free model is a REAL zero,
     *  not "unknown" — this engine publishes the figure. */
    cost?: number;
}

function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

/**
 * The ACP shape: `session/prompt`'s result `usage`.
 * `{ inputTokens, outputTokens, totalTokens, thoughtTokens?, cachedReadTokens?, cachedWriteTokens? }`
 */
export function opencodeSpendFromAcp(usage: unknown): OpencodeSpend {
    const u = obj(usage);
    const spend: OpencodeSpend = {
        input: num(u.inputTokens),
        output: num(u.outputTokens),
        reasoning: num(u.thoughtTokens),
        cacheRead: num(u.cachedReadTokens),
        cacheWrite: num(u.cachedWriteTokens),
        total: num(u.totalTokens)
    };
    if (!spend.total) { spend.total = opencodeTotal(spend); }
    return spend;
}

/**
 * The JSONL shape: `step_finish`'s `part.tokens`.
 * `{ total, input, output, reasoning, cache: { read, write } }` — the same five
 * numbers under five other names, which is why both readers land here.
 */
export function opencodeSpendFromJsonl(tokens: unknown, cost?: unknown): OpencodeSpend {
    const t = obj(tokens);
    const cache = obj(t.cache);
    const spend: OpencodeSpend = {
        input: num(t.input),
        output: num(t.output),
        reasoning: num(t.reasoning),
        cacheRead: num(cache.read),
        cacheWrite: num(cache.write),
        total: num(t.total)
    };
    if (!spend.total) { spend.total = opencodeTotal(spend); }
    if (typeof cost === 'number' && Number.isFinite(cost)) { spend.cost = cost; }
    return spend;
}

export function opencodeTotal(s: OpencodeSpend): number {
    return s.input + s.output + s.reasoning + s.cacheRead + s.cacheWrite;
}

/**
 * ‼️ CONTEXT, FROM ITS OWN EVENT — and OpenCode is the first engine here that
 * states BOTH numbers.
 *
 * `session/update → { sessionUpdate: 'usage_update', used, size, cost }`. `used`
 * is what the window is holding after the last call and `size` is that window's
 * real capacity — measured as 200000 on `big-pickle` and 262144 on
 * `nemotron-3.5-lightning-free`, i.e. per MODEL and reported by the runtime, so
 * it is never overwritten by a published catalogue figure (SOP: the operational
 * window wins).
 *
 * The spend total is deliberately not accepted here. `used: 29341` arrived on
 * the same turn whose spend total was 29381 — close enough to look
 * interchangeable and wrong for the reason X-43 documents.
 */
export interface OpencodeContext {
    tokens: number;
    window?: number;
    /** the engine states its own dollars alongside; free models say 0 */
    cost?: number;
}

export function opencodeContextFrom(update: unknown): OpencodeContext | undefined {
    const u = obj(update);
    if (u.sessionUpdate !== 'usage_update') { return undefined; }
    if (typeof u.used !== 'number') { return undefined; }
    const cost = obj(u.cost);
    const ctx: OpencodeContext = { tokens: num(u.used) };
    if (typeof u.size === 'number' && u.size > 0) { ctx.window = u.size; }
    if (typeof cost.amount === 'number') { ctx.cost = cost.amount; }
    return ctx;
}

// ---------------------------------------------------------------------------
// Fail-soft readers for the two CLI surfaces
// ---------------------------------------------------------------------------

/** One line of `opencode run --format json`. `undefined` for anything that is
 *  not a JSON object with a `type` — a log line, a banner, a half-written line
 *  at the end of a killed process. */
export function opencodeRunEvent(line: string): { type: string; sessionID: string; part: Record<string, unknown> } | undefined {
    const text = String(line ?? '').trim();
    if (!text || text[0] !== '{') { return undefined; }
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return undefined; }
    const o = obj(raw);
    if (typeof o.type !== 'string' || !o.type) { return undefined; }
    return {
        type: o.type,
        sessionID: typeof o.sessionID === 'string' ? o.sessionID : '',
        part: obj(o.part)
    };
}

/**
 * ‼️ `opencode export` PRINTS A SENTENCE BEFORE ITS JSON — `Exporting session:
 * ses_…` on stdout, above the document. `JSON.parse(stdout)` therefore throws on
 * a perfectly good export, which is a fail-soft branch that would have been
 * discovered as "history is empty" months later.
 */
export function opencodeExportJson(stdout: string): Record<string, unknown> | undefined {
    const text = String(stdout ?? '');
    const start = text.indexOf('{');
    if (start < 0) { return undefined; }
    try {
        const v = JSON.parse(text.slice(start)) as unknown;
        const o = obj(v);
        return o.info || o.messages ? o : undefined;
    } catch { return undefined; }
}

export interface OpencodeSessionRow {
    id: string;
    title: string;
    /** ‼️ only what the table gives: a LOCAL clock time with no date. The real
     *  timestamps are in the export (`info.time`) and over ACP
     *  (`session/list → updatedAt`), so nothing derives a date from this. */
    updated: string;
}

/**
 * `opencode session list` — a drawn table with a rule under its header. Parsed
 * off the COLUMN the id occupies rather than by splitting on whitespace: a title
 * has spaces in it, and the first session whose title was a sentence would have
 * shifted every field.
 */
export function opencodeSessionList(stdout: string): OpencodeSessionRow[] {
    const rows: OpencodeSessionRow[] = [];
    for (const line of String(stdout ?? '').split(/\r?\n/)) {
        const m = /^(ses_[0-9a-zA-Z]+)\s\s+(.*?)\s\s+(\S.*)$/.exec(line.trim());
        if (!m) { continue; }
        rows.push({ id: m[1], title: m[2].trim(), updated: m[3].trim() });
    }
    return rows;
}

/**
 * ‼️ AND WHY THERE IS NOTHING TO OPEN, in this engine's own words.
 *
 * Antigravity's conversations are protobuf in SQLite and unreachable. OpenCode's
 * are SQLite too — but it publishes `session list` and `export`, so the honest
 * sentence is different: the history IS readable, through the CLI, and the row
 * is built from that rather than from a file that will never appear.
 */
export const OPENCODE_NO_TRANSCRIPT_NOTE =
    'OpenCode keeps its conversations in a SQLite database rather than a transcript file, '
    + 'so there is nothing to open on disk — the history here is read through the CLI\'s own '
    + '`session list` and `export`, which is why the row exists at all.';
