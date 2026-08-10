/**
 * X-3 — WHAT CAN THIS MACHINE ACTUALLY RUN, AND WHY NOT.
 *
 * ‼️ THE WRONG MENTAL MODEL IS THE WHOLE BUG. Everything the extension knew
 * about a non-Claude engine was "is there a key in the vault", and the vault is
 * a flat name→value table with no idea which name belongs to which engine. So
 * the answer to "why can I not run Codex here" was a table of strings, and the
 * user's own summary of it was that the whole thing is managed by
 * Ctrl+Shift+P → Set Secret.
 *
 * The measured truth is different, and it is the reason this file exists: the
 * agent CLIs hold their OWN credentials, and the normal way to pay for them is
 * a SUBSCRIPTION, not an API key.
 *
 *   · Claude Code — `~/.claude/.credentials.json` carries `claudeAiOauth`; the
 *     Pro/Max plan is the billing. `ANTHROPIC_API_KEY` is the alternative, not
 *     the norm. (`claude setup-token` is the headless variant of the same
 *     subscription grant.)
 *   · Codex — `~/.codex/auth.json` carries `auth_mode`, and on this user's
 *     machine it reads `chatgpt` with `OPENAI_API_KEY: null`: a ChatGPT
 *     subscription, no API key anywhere. Measured 2026-08-09.
 *   · Gemini / Antigravity — the Google-account login was retired in June 2026,
 *     so this one really is an API key now, which is exactly the kind of fact a
 *     panel has to state instead of leaving the user to discover.
 *
 * Which means an "API keys" screen is the wrong screen. What a person needs to
 * see is, per engine: is the CLI here, HOW is it paid for, is it signed in, and
 * if not, the one command that fixes it. That is what this module computes.
 *
 * It is deliberately pure over injected readers (`EngineProbe`) so the whole
 * matrix can be tested without a keychain, a home directory or a spawn.
 */

export type EngineId = 'claude' | 'codex' | 'gemini';

/** How an engine is being paid for, as far as we can see from disk. */
export type AuthMode =
    /** signed in with a plan — Claude Pro/Max, ChatGPT Plus/Pro/Team */
    | 'subscription'
    /** a key, ours or the CLI's own */
    | 'apikey'
    /** nothing found: the CLI is here but nobody has signed in */
    | 'none';

export interface EngineCli {
    /** what to type — also what `where`/`which` is asked about */
    command: string;
    found: boolean;
    path?: string;
}

export interface EngineAuth {
    mode: AuthMode;
    /** the file that says so, for a user who wants to look */
    file?: string;
    /** when the CLI last refreshed that grant, if it records one */
    refreshedAt?: number;
    /** one line, plain: what was found */
    detail: string;
}

export interface EngineKey {
    /** the environment variable the engine reads */
    env: string;
    /** …and whether the vault holds a secret under that exact name */
    inVault: boolean;
}

export interface EngineStatus {
    id: EngineId;
    label: string;
    cli: EngineCli;
    auth: EngineAuth;
    key: EngineKey;
    /** can a session be started with it right now */
    ready: boolean;
    /** ‼️ the only line most people will read: what to do next, or why nothing
     *  needs doing. Never "not configured" on its own. */
    next: string;
    /** the command that signs this engine in, when signing in is the answer */
    loginCommand?: string;
    /**
     * ‼️ …and the command that PUTS IT THERE, because "not on PATH" is a state
     * with no gesture attached to it. This machine is the case that proves the
     * gap: `~/.codex/auth.json` holds a live ChatGPT sign-in while `codex` is
     * not installed at all — an account with nothing to run it. A row that says
     * "install it" and stops is the same "not configured" this whole module
     * exists to replace.
     */
    installCommand?: string;
    /** how this engine is normally paid for — the sentence the panel prints
     *  under its name, because "it needs an API key" is false for two of three */
    billing: string;
    docs: string;
}

/** Everything this module needs from the outside world. All optional-safe:
 *  a probe that throws is treated as "not there". */
export interface EngineProbe {
    /** read a text file under the user's home, or undefined */
    readHome(relPath: string): string | undefined;
    /** does a path under the user's home exist */
    existsHome(relPath: string): boolean;
    /** resolve a command on PATH, or undefined */
    which(command: string): string | undefined;
    /** does the secret vault hold this exact name */
    hasSecret(name: string): boolean;
    /** is this variable set in the extension host's own environment */
    hasEnv(name: string): boolean;
}

interface EngineSpec {
    id: EngineId;
    label: string;
    command: string;
    env: string;
    billing: string;
    docs: string;
    loginCommand?: string;
    installCommand?: string;
    read(probe: EngineProbe): EngineAuth;
}

/** `2026-08-09T10:31:36.731385700Z` — more decimals than Date.parse takes on
 *  every engine, so the fraction is trimmed to milliseconds first. */
export function parseStamp(s: unknown): number | undefined {
    if (typeof s !== 'string' || !s.trim()) { return undefined; }
    const trimmed = s.replace(/(\.\d{3})\d+/, '$1');
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? t : undefined;
}

function json(text: string | undefined): Record<string, unknown> | undefined {
    if (!text) { return undefined; }
    try {
        const v = JSON.parse(text) as unknown;
        return v && typeof v === 'object' && !Array.isArray(v)
            ? v as Record<string, unknown> : undefined;
    } catch { return undefined; }
}

const CLAUDE_CREDS = '.claude/.credentials.json';
const CODEX_AUTH = '.codex/auth.json';
const GEMINI_OAUTH = '.gemini/oauth_creds.json';

const SPECS: EngineSpec[] = [
    {
        id: 'claude',
        label: 'Claude Code',
        command: 'claude',
        env: 'ANTHROPIC_API_KEY',
        billing: 'A Claude Pro or Max plan, signed in once in the browser. An API key is the alternative, not the normal route.',
        docs: 'https://code.claude.com/docs/en/authentication',
        loginCommand: 'claude /login',
        installCommand: 'npm install -g @anthropic-ai/claude-code',
        read(probe) {
            const creds = json(probe.readHome(CLAUDE_CREDS));
            if (creds && creds.claudeAiOauth) {
                const oauth = creds.claudeAiOauth as Record<string, unknown>;
                const expires = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined;
                return {
                    mode: 'subscription', file: CLAUDE_CREDS,
                    refreshedAt: expires,
                    detail: 'Signed in with a Claude plan (claudeAiOauth).'
                };
            }
            if (probe.hasSecret('CLAUDE_CODE_OAUTH_TOKEN') || probe.hasEnv('CLAUDE_CODE_OAUTH_TOKEN')) {
                return {
                    mode: 'subscription',
                    detail: 'A long-lived plan token (CLAUDE_CODE_OAUTH_TOKEN) — the headless form of the same subscription.'
                };
            }
            if (probe.hasSecret('ANTHROPIC_API_KEY') || probe.hasEnv('ANTHROPIC_API_KEY')) {
                return { mode: 'apikey', detail: 'An API key (ANTHROPIC_API_KEY) — billed per token, not against a plan.' };
            }
            return { mode: 'none', detail: 'No plan sign-in and no key.' };
        }
    },
    {
        id: 'codex',
        label: 'Codex',
        command: 'codex',
        env: 'OPENAI_API_KEY',
        billing: 'A ChatGPT Plus, Pro, Team or Business plan, signed in once in the browser — exactly like Claude Code. An API key is the alternative.',
        docs: 'https://developers.openai.com/codex/auth',
        loginCommand: 'codex login',
        installCommand: 'npm install -g @openai/codex',
        read(probe) {
            const auth = json(probe.readHome(CODEX_AUTH));
            if (auth) {
                const mode = typeof auth.auth_mode === 'string' ? auth.auth_mode : '';
                const tokens = auth.tokens as Record<string, unknown> | undefined;
                const signedIn = !!(tokens && typeof tokens.access_token === 'string' && tokens.access_token);
                const refreshedAt = parseStamp(auth.last_refresh);
                if (mode === 'chatgpt' && signedIn) {
                    return {
                        mode: 'subscription', file: CODEX_AUTH, refreshedAt,
                        detail: 'Signed in with a ChatGPT plan (auth_mode: chatgpt). No API key is involved.'
                    };
                }
                if (typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY) {
                    return {
                        mode: 'apikey', file: CODEX_AUTH, refreshedAt,
                        detail: 'Codex is holding its own API key — billed per token, not against a ChatGPT plan.'
                    };
                }
                if (signedIn) {
                    return {
                        mode: 'subscription', file: CODEX_AUTH, refreshedAt,
                        detail: `Signed in (auth_mode: ${mode || 'unstated'}).`
                    };
                }
            }
            if (probe.hasSecret('OPENAI_API_KEY') || probe.hasEnv('OPENAI_API_KEY')) {
                return { mode: 'apikey', detail: 'An API key (OPENAI_API_KEY) from the vault or the environment.' };
            }
            return { mode: 'none', detail: 'No ChatGPT sign-in and no key.' };
        }
    },
    {
        id: 'gemini',
        label: 'Gemini',
        command: 'gemini',
        env: 'GEMINI_API_KEY',
        // ‼️ Not a preference — a fact with a date on it. The panel says it
        // because the alternative is the user hunting for a login that was
        // taken away.
        billing: 'An API key. The "sign in with Google" route this CLI used to have was retired in June 2026, so a plan is no longer a way to pay for it.',
        docs: 'https://github.com/google-gemini/gemini-cli',
        installCommand: 'npm install -g @google/gemini-cli',
        read(probe) {
            if (probe.existsHome(GEMINI_OAUTH)) {
                return {
                    mode: 'subscription', file: GEMINI_OAUTH,
                    detail: 'A Google account sign-in is on disk — that route was retired in June 2026 and may no longer be served.'
                };
            }
            if (probe.hasSecret('GEMINI_API_KEY') || probe.hasEnv('GEMINI_API_KEY')) {
                return { mode: 'apikey', detail: 'An API key (GEMINI_API_KEY) from the vault or the environment.' };
            }
            if (probe.hasSecret('GOOGLE_API_KEY') || probe.hasEnv('GOOGLE_API_KEY')) {
                return { mode: 'apikey', detail: 'An API key (GOOGLE_API_KEY) from the vault or the environment.' };
            }
            return { mode: 'none', detail: 'No key.' };
        }
    }
];

/**
 * The one sentence a row is worth reading for.
 *
 * ‼️ IT NEVER SAYS ONLY WHAT IS WRONG. "Not configured" is the message this
 * whole item exists because of: it names a state and leaves the user to find
 * the fix. Every branch here ends in something to DO, or in the reason nothing
 * needs doing.
 */
function nextStep(spec: EngineSpec, cli: EngineCli, auth: EngineAuth): string {
    if (!cli.found) {
        // ‼️ A SIGNED-IN ACCOUNT WITH NO CLI IS ITS OWN STATE, and the one this
        // machine is actually in: `~/.codex/auth.json` says the ChatGPT plan is
        // live while `codex` is nowhere on PATH. Reporting only "not on PATH"
        // there reads as "start over", when in fact the sign-in is done and the
        // install is the only thing missing — so the row says so.
        const grant = auth.mode === 'subscription' ? ' The sign-in is already on disk, so this is the only step left.'
            : auth.mode === 'apikey' ? ' The key is already there, so this is the only step left.' : '';
        return `${spec.label} is not installed on this machine — nothing can start until the ${spec.command} command exists.`
            + (spec.installCommand ? ` Install it with: ${spec.installCommand}.` : '')
            + grant;
    }
    if (auth.mode === 'subscription') {
        return `Ready, on a plan. Nothing to pay per token and no key to keep.`;
    }
    if (auth.mode === 'apikey') {
        return `Ready, on a key (${spec.env}) — this one is billed per token.`
            + (spec.loginCommand ? ` A plan is the cheaper route for daily work: ${spec.loginCommand}.` : '');
    }
    return spec.loginCommand
        ? `Sign in once with your plan — run ${spec.loginCommand} in a terminal — or put ${spec.env} in the vault to pay per token.`
        : `Put ${spec.env} in the vault. This engine has no plan sign-in.`;
}

/** The whole matrix, in the order the panel draws it. */
export function readEngines(probe: EngineProbe): EngineStatus[] {
    return SPECS.map(spec => {
        const path = safe(() => probe.which(spec.command));
        const cli: EngineCli = { command: spec.command, found: !!path, path: path || undefined };
        const auth = safe(() => spec.read(probe)) ?? { mode: 'none' as AuthMode, detail: 'Could not be read.' };
        return {
            id: spec.id,
            label: spec.label,
            cli,
            auth,
            key: { env: spec.env, inVault: !!safe(() => probe.hasSecret(spec.env)) },
            ready: cli.found && auth.mode !== 'none',
            next: nextStep(spec, cli, auth),
            loginCommand: spec.loginCommand,
            installCommand: spec.installCommand,
            billing: spec.billing,
            docs: spec.docs
        };
    });
}

/** A probe that throws — a locked file, a home directory that moved — must not
 *  take the whole page down with it; that row simply says less. */
function safe<T>(fn: () => T): T | undefined {
    try { return fn(); } catch { return undefined; }
}

/** The headline the Settings section carries: how many can run right now. */
export function enginesSummary(list: EngineStatus[]): { ready: number; total: number; onPlan: number } {
    return {
        ready: list.filter(e => e.ready).length,
        total: list.length,
        onPlan: list.filter(e => e.ready && e.auth.mode === 'subscription').length
    };
}

// ---------------------------------------------------------------------------
// X-18 — the engine axis, as every surface that STARTS something sees it
// ---------------------------------------------------------------------------

/**
 * One engine as a PICKER draws it.
 *
 * ‼️ ONE LIST, EVERY SURFACE. The Console composer, the ▶ on a sidebar row, the
 * task form, a mission's team and the bridge all offer the same rows in the
 * same order with the same refusal sentence — because the alternative is five
 * places deciding independently what "not ready" means, and four of them
 * getting it wrong the first time an engine is half-installed. The heavy answer
 * (`EngineStatus`) is computed once and narrowed here; nothing re-derives it.
 */
export interface EngineOption {
    id: EngineId;
    label: string;
    /** can a session be started on it RIGHT NOW */
    ready: boolean;
    /** what to do about it — `EngineStatus.next`, never "not configured" */
    next: string;
    /** how it is paid for: a plan, a key, or nothing yet */
    auth: AuthMode;
    /** the sentence under its name in a picker */
    billing: string;
}

export function engineOptions(list: EngineStatus[]): EngineOption[] {
    return list.map(e => ({
        id: e.id, label: e.label, ready: e.ready, next: e.next,
        auth: e.auth.mode, billing: e.billing
    }));
}

/**
 * ‼️ THE REFUSAL, WORDED ONCE.
 *
 * Returns the sentence to refuse with, or `undefined` when the engine can run.
 * An engine that is not installed produces a session that dies on its first
 * turn with a shell error — an answer strictly worse than "it is not installed,
 * here is the command", which `EngineStatus.next` already knows. Every entry
 * point calls this before it spawns anything, so the same wrong choice is
 * refused the same way whether it came from a panel, a quick pick or the bridge.
 *
 * An empty id means `claude` — what every caller written before engines existed
 * means, and what nothing may start refusing.
 */
export function engineRefusal(
    list: { id: EngineId; label: string; ready: boolean; next: string }[],
    id: string | undefined
): string | undefined {
    const want = String(id ?? '').trim().toLowerCase() || 'claude';
    const row = list.find(e => e.id === want);
    if (!row) {
        return `"${want}" is not an engine this build knows — ${list.map(e => e.id).join(', ')}.`;
    }
    if (row.ready) { return undefined; }
    return `${row.label} cannot run on this machine — ${row.next}`;
}
