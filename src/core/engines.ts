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
 *   · Gemini — the `gemini-cli` Google-account login was retired in June 2026,
 *     so that one really is an API key now, which is exactly the kind of fact a
 *     panel has to state instead of leaving the user to discover.
 *   · Antigravity (`agy`) — a THIRD arrangement, and the one that breaks the
 *     pattern: the sign-in belongs to the Antigravity DESKTOP APP and the CLI
 *     borrows it. There is no key, no `agy login`, and no credential file this
 *     extension can read — measured 2026-08-10: no `~/.agy`, no
 *     `~/.antigravity`, nothing under `~/.gemini` that names a token, nothing in
 *     the Windows credential store. What IS on disk is the CLI's record that the
 *     account finished onboarding, and its own log naming the account it
 *     authenticated as. So this row is read from the state the CLI keeps, and
 *     the row says where the grant actually lives rather than inventing a file.
 *
 * Which means an "API keys" screen is the wrong screen. What a person needs to
 * see is, per engine: is the CLI here, HOW is it paid for, is it signed in, and
 * if not, the one command that fixes it. That is what this module computes.
 *
 * It is deliberately pure over injected readers (`EngineProbe`) so the whole
 * matrix can be tested without a keychain, a home directory or a spawn.
 */

import { OPENCODE_AUTH_FILE, OPENCODE_INSTALL_COMMAND } from './opencode';

export type EngineId = 'claude' | 'codex' | 'gemini' | 'agy' | 'opencode';

/** How an engine is being paid for, as far as we can see from disk. */
export type AuthMode =
    /** signed in with a plan — Claude Pro/Max, ChatGPT Plus/Pro/Team */
    | 'subscription'
    /** a key, ours or the CLI's own */
    | 'apikey'
    /**
     * ‼️ U-59 — NOTHING IS SIGNED IN AND NOTHING NEEDS TO BE.
     *
     * `none` used to carry both answers to "is there a credential?": *nobody has
     * signed in yet, so this cannot run* and *this engine's own provider asks
     * for nothing*. They are opposite states and they were the same word, so
     * every reader that had only the mode to go on drew the second as the first
     * — the badge said "not signed in" in the warning colour directly above a
     * sentence saying the engine was ready, and the row offered a sign-in button
     * as the fix for a thing that was not broken.
     *
     * A separate state rather than a flag beside the mode, because the mode is
     * what the exhaustiveness tables switch on: a new reader is now made to
     * answer for this case instead of falling into the failure branch by
     * default.
     */
    | 'builtin'
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
    /**
     * The environment variable the engine reads — EMPTY when the engine has no
     * key route at all.
     *
     * ‼️ Empty is a real answer, not a missing one: Antigravity is paid for by
     * an app sign-in and has no key to store, so a surface that draws an "Add
     * key" box for it is offering a gesture that leads nowhere. Every surface
     * checks this before it draws that box.
     */
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
    /** '' when the engine has no key route — see EngineKey.env. */
    env: string;
    billing: string;
    docs: string;
    loginCommand?: string;
    installCommand?: string;
    /**
     * …or, for an engine that does NOT arrive by a command, the one sentence
     * that says how it does arrive. Antigravity ships with a desktop app; a row
     * offering `npm install -g` for it would send the user to a package that
     * does not exist.
     */
    installHint?: string;
    /** What to do when nothing is signed in and there is no `loginCommand` to
     *  offer — the branch that must never end in "not configured". */
    signInHint?: string;
    /**
     * ‼️ X-38/A-16 — CREDENTIALS ARE NOT THE READINESS TEST ON EVERY ENGINE.
     *
     * Four of the five answer "can it run" with "is there a sign-in on disk".
     * Measured on opencode 1.18.18 that question returns the WRONG answer: with
     * an empty `auth.json` its own connected provider still lists seven models
     * and runs real turns on them. A row that said "not signed in → not ready"
     * would be telling the user to fix something that is not broken, which is
     * the exact dishonesty this module was written to end — so the engine that
     * does not need one says so here rather than being special-cased at each
     * reader. See `OPENCODE_READY_WITHOUT_CREDENTIAL` in `core/opencode.ts`.
     */
    readyWithoutCredential?: boolean;
    /**
     * ‼️ M-14 — HOW MANY CONCURRENCY SLOTS ONE UNATTENDED RUN OF THIS ENGINE
     * TAKES, AND ONLY WHERE IT WAS MEASURED.
     *
     * The governor counts RUNS, which assumes every run costs the same machine.
     * It does not. Absent (the default) means one slot and no claim; a number
     * here is a measurement with a date on it, never a guess, and the comment on
     * it must say what was measured and when. Setting one for an engine nobody
     * has weighed would be the invented figure this repo forbids.
     */
    concurrencyWeight?: number;
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
/** Antigravity's CLI keeps its own state here; the SIGN-IN is not in it. */
const AGY_HOME = '.gemini/antigravity-cli';
/** …but whether the account finished signing in IS, in 150 bytes. Deliberately
 *  this file and not the CLI's log: the log carries the account's email and
 *  grows without limit, and reading a growing file on every panel draw is a
 *  cost that arrives months later. */
const AGY_ONBOARDING = '.gemini/antigravity-cli/cache/onboarding.json';

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
        // ‼️ CORRECTED IN X-35, AGAINST THE SHIPPED CLI. This row used to state
        // that the "sign in with Google" route "was retired in June 2026, so a
        // plan is no longer a way to pay for it" — a dated, confident claim that
        // the CLI itself contradicts: gemini-cli 0.55.1 still carries
        // `oauth-personal` (Login with Google) as a first-class auth type and
        // takes that path on startup. Saying otherwise sent a user hunting for
        // an API key they may not need, and — worse — it was the same mistake
        // F-14 is about in the other direction: guessing at the billing
        // arrangement instead of reading it. TWO routes, and which one is in use
        // is what `read()` below actually determines.
        billing: 'Either a Google account sign-in (the CLI\'s own `oauth-personal` route, which is what its free/Code-Assist tiers use) or an API key in GEMINI_API_KEY / GOOGLE_API_KEY. The CLI states no per-turn price on either, so a dollar figure beside a Gemini session is derived from your pricing rules, never quoted.',
        docs: 'https://github.com/google-gemini/gemini-cli',
        installCommand: 'npm install -g @google/gemini-cli',
        // ‼️ There is no `gemini login`: the CLI opens a browser on its first run
        // and writes the grant itself. So the step is "run it once", not a
        // command to copy — and NOT "this engine has no plan sign-in", which is
        // what the absence of a login command used to be read as.
        signInHint: 'Run `gemini` once in a terminal and choose "Login with Google" — it opens a browser and stores the grant itself; there is no login subcommand to run.',
        read(probe) {
            if (probe.existsHome(GEMINI_OAUTH)) {
                return {
                    mode: 'subscription', file: GEMINI_OAUTH,
                    detail: 'A Google account sign-in is on disk — the CLI\'s `oauth-personal` route, which it still supports (checked against gemini-cli 0.55.1). What that account is entitled to is between you and Google; this box only knows the credential is there.'
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
    },
    {
        // ‼️ THE ROW ABOVE IS NOT THIS ONE, AND THE CONFUSION IS THE POINT OF
        // SAYING SO. `gemini` is `@google/gemini-cli`, a separate program that
        // is not installed on this machine. Antigravity is Google's agent app,
        // its CLI is `agy`, and the models it offers are Gemini's *and*
        // Claude's *and* an open-weights one — so naming it "Gemini" would be
        // wrong in both directions at once.
        id: 'agy',
        label: 'Antigravity',
        command: 'agy',
        // ‼️ NO KEY EXISTS FOR THIS ENGINE. Not "we have not found one yet" —
        // measured: no `agy login`, no key variable in its help, no credential
        // file. An empty env is the honest answer and the surfaces read it.
        env: '',
        billing: 'A Google account signed into the Antigravity app — the CLI borrows that sign-in. There is no API key for this engine and nothing to keep in the vault.',
        docs: 'https://antigravity.google',
        installHint: 'It arrives with the Antigravity app rather than from a package registry; install that, then run `agy install` once to put the command on PATH.',
        signInHint: 'Open the Antigravity app and sign in with your Google account — the CLI borrows that sign-in. This engine has no key and no sign-in command of its own.',
        read(probe) {
            const onboarding = json(probe.readHome(AGY_ONBOARDING));
            if (onboarding) {
                const consumer = onboarding.consumerOnboardingComplete === true;
                const enterprise = onboarding.enterpriseOnboardingComplete === true;
                if (consumer || enterprise) {
                    return {
                        mode: 'subscription', file: AGY_ONBOARDING,
                        detail: `Signed in through the Antigravity app (${enterprise ? 'enterprise' : 'consumer'} onboarding complete). `
                            + 'The grant itself belongs to the app — there is no credential file here to read, and no key.'
                    };
                }
                return {
                    mode: 'none',
                    file: AGY_ONBOARDING,
                    detail: 'The CLI has run, but no completed sign-in is recorded.'
                };
            }
            if (probe.existsHome(AGY_HOME)) {
                return {
                    mode: 'none',
                    detail: 'The CLI keeps state here but has never recorded a finished sign-in.'
                };
            }
            return { mode: 'none', detail: 'The CLI has never run on this machine.' };
        }
    },
    {
        // ‼️ THE ONE ENGINE THAT IS READY WITH NOTHING SIGNED IN — and it is a
        // measurement, not a courtesy (A-16, opencode 1.18.18): `opencode
        // providers list` printed "0 credentials" while `opencode models`
        // returned seven and every one of them ran a real turn. The row below
        // therefore carries `readyWithoutCredential`, and its `next` line says
        // what a person can do with the free tier instead of sending them off to
        // sign in for nothing.
        id: 'opencode',
        label: 'OpenCode',
        command: 'opencode',
        // It reaches many providers and each has its own variable; there is no
        // single "the OpenCode key". An empty env is the honest answer — the
        // same one Antigravity gives, for a different reason.
        env: '',
        billing: 'Its own connected `opencode` provider needs no sign-in at all — measured: seven models, zero credentials, real turns. '
            + 'Signing in with `opencode auth login`, or adding a provider key, is how you reach the paid models beside them. '
            + 'The engine states the price of a turn itself, so a figure beside an OpenCode session is quoted, not derived.',
        docs: 'https://opencode.ai/docs/cli/',
        loginCommand: 'opencode auth login',
        installCommand: OPENCODE_INSTALL_COMMAND,
        /**
         * ‼️ MEASURED 2026-08-16, TWICE, ON THIS MACHINE: one `opencode run
         * --format json` peaks at **615 MB and 596 MB** working set over its own
         * process tree (`opencode.exe` + the shim's `cmd.exe`/`conhost.exe` +
         * whatever it spawns). `tools/measure_opencode_run.js` walks the tree by
         * ParentProcessId — the first version of that tool summed "every pid
         * that is new", and reported 175 MB of somebody else's Chrome.
         *
         * That is heavier than the shared ACP server (383 MB), which at least
         * serves every hosted card at once; this is one task. Two of them
         * together is 1.2 GB of transient memory on a machine with 8 GB and no
         * room, which is why one run takes the whole default fleet allowance of
         * 2 rather than half of it. The user can still raise
         * `agentFarm.maxConcurrentTasks` — the weight scales with their setting,
         * it does not overrule it.
         */
        concurrencyWeight: 2,
        read(probe) {
            const creds = json(probe.readHome(OPENCODE_AUTH_FILE));
            const names = creds ? Object.keys(creds) : [];
            if (names.length) {
                // ‼️ READ TOLERANTLY, BECAUSE THE FILE WAS MEASURED EMPTY HERE.
                // OpenCode keeps one entry per provider and marks an OAuth grant
                // apart from a stored key; this machine had neither, so the
                // shape is read for what it plainly says and nothing is asserted
                // about what it does not. Getting it wrong changes ONE SENTENCE
                // and never `ready` — which is the whole reason `ready` does not
                // depend on it.
                const oauth = names.some(n => {
                    const entry = creds?.[n];
                    return !!entry && typeof entry === 'object'
                        && String((entry as Record<string, unknown>).type ?? '').toLowerCase() === 'oauth';
                });
                return {
                    mode: oauth ? 'subscription' : 'apikey',
                    file: OPENCODE_AUTH_FILE,
                    detail: `OpenCode is holding credentials for ${names.length} provider${names.length === 1 ? '' : 's'} `
                        + `(${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''})`
                        + `${oauth ? ' — at least one is an account sign-in rather than a key.' : '.'}`
                };
            }
            return {
                // ‼️ `builtin`, NOT `none` (U-59) — the two mean opposite things
                // and used to be the same word. Measured: this engine runs with
                // an empty `auth.json`.
                mode: 'builtin',
                file: OPENCODE_AUTH_FILE,
                detail: 'No provider credential is stored — and on this engine that does NOT mean it cannot run: '
                    + 'its own connected `opencode` provider lists and runs models with an empty `auth.json`.'
            };
        },
        readyWithoutCredential: true
    }
];

/**
 * ‼️ id → what a person calls it, for the surfaces that are NOT webviews (X-35).
 *
 * `media/afEngine.js` is this map's twin and owns every webview: one component,
 * one palette, one spelling. The sidebar trees, notifications, quick picks and
 * report text have no access to it and were printing raw ids — a session row in
 * the tree read `agy`, which is a word nobody outside this codebase knows. Built
 * off `SPECS` rather than typed out again, so the host cannot drift from itself;
 * the empty key is Claude because a Claude transcript states no engine and the
 * answer being an ABSENCE is what made these surfaces silent about it.
 *
 * An id this build has never heard of resolves to nothing here — the callers
 * fall back to the id itself, which is the same rule the badge follows.
 */
export const ENGINE_LABELS: Record<string, string> = {
    '': 'Claude Code',
    ...Object.fromEntries(SPECS.map(s => [s.id, s.label]))
};

/**
 * ‼️ U-59 — EVERY ENGINE THERE IS, DERIVED RATHER THAN TYPED OUT AGAIN.
 *
 * A surface that cannot reach the live matrix still has to name the engines —
 * and the one that did typed `['claude', 'codex', 'gemini', 'agy']` by hand,
 * which was complete on the day it was written and quietly wrong from the day
 * OpenCode arrived. A list written twice is a list that disagrees with itself
 * eventually; this one comes off `SPECS`, so an engine added there cannot be
 * missing here.
 */
export const ENGINE_IDS: EngineId[] = SPECS.map(s => s.id);

/**
 * ‼️ M-14 — WHAT ONE UNATTENDED RUN OF THIS ENGINE WEIGHS, IN CONCURRENCY SLOTS.
 *
 * The governor counts runs, and counting assumes they cost the same machine.
 * Read from `SPECS` so the number lives beside the measurement that justifies
 * it; an engine nobody has weighed is 1 and says nothing. Absent id (a Claude
 * transcript states no engine) is 1 for the same reason.
 */
export function engineConcurrencyWeight(engine: string | undefined): number {
    const id = String(engine ?? '').trim();
    if (!id) { return 1; }
    const spec = SPECS.find(s => s.id === id);
    const w = spec?.concurrencyWeight;
    return typeof w === 'number' && w >= 1 ? w : 1;
}

/** `Codex ×4 · Gemini ×1` — engines counted, busiest first, spelt as people say
 *  them. Empty string when there is nothing to count. */
export function engineSpread(sessions: { source?: string }[]): string {
    const byEngine = new Map<string, number>();
    for (const s of sessions) {
        const key = s.source ?? '';
        byEngine.set(key, (byEngine.get(key) ?? 0) + 1);
    }
    return [...byEngine.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id, n]) => `${ENGINE_LABELS[id] ?? id} ×${n}`)
        .join(' · ');
}

/**
 * ‼️ THE ONE SENTENCE A CLAUDE-ONLY ANALYTIC OWES ITS READER (X-35).
 *
 * Cost, cache efficiency, context load, quality, recall, duty compliance — all
 * of it is defined against Claude Code's transcript format and genuinely cannot
 * be computed from a Codex rollout or an Antigravity metadata row. Keeping
 * those analytics Claude-only is the RIGHT call; what was never right is a
 * surface headed "fleet" that quietly dropped three engines, because a reader
 * comparing it against the Sessions page finds a different number and has
 * nothing to explain the gap.
 *
 * So every such surface says the same thing in the same words, from here — a
 * sentence invented per page is a sentence that disagrees per page. `what` names
 * the measurement in the reader's terms ("these cost figures", "this search").
 * No sessions to exclude → empty string, and the caller prints nothing.
 */
export function claudeOnlyScopeNote(
    external: { source?: string }[],
    what: string
): string {
    if (!external.length) { return ''; }
    return `${what} covers Claude Code only — ${external.length} `
        + `session${external.length === 1 ? '' : 's'} on other engines `
        + `(${engineSpread(external)}) ${external.length === 1 ? 'is' : 'are'} not in it, `
        + 'because the measurement is defined against Claude\'s transcript format and '
        + 'would read zero or read wrong on a foreign one. They are listed on the Sessions page.';
}

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
            + (spec.installCommand ? ` Install it with: ${spec.installCommand}.`
                : spec.installHint ? ` ${spec.installHint}` : '')
            + grant;
    }
    if (auth.mode === 'subscription') {
        return `Ready, on a plan. Nothing to pay per token and no key to keep.`;
    }
    if (auth.mode === 'apikey') {
        return `Ready, on a key (${spec.env}) — this one is billed per token.`
            + (spec.loginCommand ? ` A plan is the cheaper route for daily work: ${spec.loginCommand}.` : '');
    }
    // ‼️ X-38 — "NOTHING SIGNED IN" IS NOT "NOTHING WORKS" ON THIS ONE. Without
    // this branch OpenCode's row would tell a user to run a login command to fix
    // an engine that is running perfectly well, which is the same false report
    // this module exists to remove — only in the opposite direction.
    if (spec.readyWithoutCredential) {
        return 'Ready, with nothing signed in — its own connected provider runs on the free tier. '
            + (spec.loginCommand
                ? `Run ${spec.loginCommand} only when you want the paid models beside them.`
                : 'Add a provider credential only when you want the paid models beside them.');
    }
    if (spec.loginCommand) {
        return `Sign in once with your plan — run ${spec.loginCommand} in a terminal — or put ${spec.env} in the vault to pay per token.`;
    }
    // ‼️ AN ENGINE WITH NO KEY AND NO LOGIN COMMAND STILL GETS A STEP. Without
    // this branch Antigravity's row would read "Put  in the vault", which is
    // both nonsense and the "not configured" dead end this module replaces.
    if (!spec.env) { return spec.signInHint ?? `${spec.label} is not signed in.`; }
    // ‼️ "NO PLAN SIGN-IN" IS A CLAIM, AND IT WAS WRONG FOR GEMINI (X-35). Not
    // every engine's sign-in is a `login` SUBCOMMAND — gemini-cli's is a browser
    // flow it starts by itself on first run — so "no loginCommand" does not mean
    // "key only". An engine that has another route says so in its own words.
    if (spec.signInHint) { return `${spec.signInHint} Or put ${spec.env} in the vault to pay per token.`; }
    return `Put ${spec.env} in the vault. This engine has no plan sign-in.`;
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
            // An engine with no key route is never asked about one: `hasSecret('')`
            // is a question with no meaning, and an answer to it would put a
            // nameless entry in the vault's own hover.
            key: { env: spec.env, inVault: !!spec.env && !!safe(() => probe.hasSecret(spec.env)) },
            // The CLI still has to be here. `builtin` is a READY mode (U-59) —
            // it says a credential is not wanted, not that one is missing — so
            // the mode alone now answers this for OpenCode; the flag stays as
            // the belt to that braces, for a spec that declares readiness
            // without its reader having been taught the new mode.
            ready: cli.found && (auth.mode !== 'none' || !!spec.readyWithoutCredential),
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
