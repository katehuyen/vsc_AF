import * as path from 'path';

/**
 * X-168 — MORE THAN ONE ACCOUNT ON ONE MACHINE, WITHOUT A BROWSER.
 *
 * The user holds three Claude Pro plans and spends the day being the switch
 * between them: when one five-hour window fills they type `/login`, pick the
 * right Chrome profile, sometimes sign in to Google again, and hand the next
 * agent the previous one's handover note by hand.
 *
 * ‼️ THE MEASUREMENT THIS MODULE RESTS ON, taken on this machine on 2026-09-03:
 * `CLAUDE_CONFIG_DIR` isolates an identity COMPLETELY. Pointed at an empty
 * directory, `claude auth status --json` answered `loggedIn: false`, reported
 * its `projectsDirectory` inside that directory, and wrote a fresh
 * `.claude.json` there. So an account is a DIRECTORY, and switching to it is
 * one environment variable decided before the process starts.
 *
 * That matters more than it sounds, because the obvious alternative — copy the
 * stored `.credentials.json` over `~/.claude/.credentials.json` — is wrong in
 * three ways at once: it overwrites the identity of the session the user is
 * talking to RIGHT NOW, it can never run two accounts at the same time, and a
 * crash halfway through leaves no working account at all.
 *
 * ‼️ AND IT IS NOT A NEW AXIS. X-105 already settled that a Claude ROUTE is
 * base URL, auth and tier injected before the spawn, and that changing it
 * inside a live session is refused because the transcript could not say which
 * route served which turn. An ACCOUNT is the same kind of fact on the same
 * axis: chosen at launch, fixed for the session, changed by starting another
 * one. So this module states the identity and the environment, and the launch
 * machinery that already exists (`providerRuntime.spawnEnvironment` /
 * `terminalEnvOverlay`) carries it.
 *
 * ‼️ THE SHAPE IS PER-ENGINE, NOT PER-CLAUDE — X-167's scope, and the reason
 * this file is an adapter table rather than four Claude constants. Every paid
 * sign-in this extension can drive is browser-authenticated the same way, so
 * "which account starts this session" has to be askable of any engine or it
 * will be asked again, differently, five times. The Claude-specific facts — the
 * variable's NAME, which files are the identity, where the quota is read — live
 * inside the `claude` row below and nowhere else in the codebase; a surface
 * asks the adapter and gets an answer for whatever engine it is holding.
 *
 * ‼️ AND AN UNMEASURED ENGINE SAYS SO RATHER THAN PRETENDING. Each adapter
 * carries the evidence for its own isolation claim, because the failure nobody
 * could debug is a second account that silently shares the first one's tokens:
 * nothing errors, the sessions just quietly burn one plan. So `measured` was
 * proven on a real machine, `declared` is documented by the vendor but unproven
 * here, `unmapped` has no verified way in — and only the first two may be
 * captured. Promoting an engine is measuring one variable and editing one
 * field; no surface, bridge op or runner changes with it.
 *
 * Pure over an injected reader, like `engines.ts`: no home directory, no disk,
 * no vscode — so every rule here is testable and none of it can be reached by
 * accident from a surface that only meant to draw a list.
 */

/** Reading a slot directory is a file or two. Injected so this stays pure. */
export interface AccountFs {
    /** the file's text, or undefined when it is not there / cannot be read */
    read(file: string): string | undefined;
    exists(file: string): boolean;
}

export type SlotHealth = 'ready' | 'needs-signin' | 'unreadable';

/**
 * ‼️ HOW SURE ARE WE THAT THIS ENGINE'S IDENTITY CAN BE ISOLATED AT ALL.
 *
 * - `measured` — done on a real machine, with the probe written down.
 * - `declared` — the vendor documents the variable; nobody has run it here.
 * - `unmapped` — no verified way to keep two identities apart for this engine.
 *
 * The distinction is the honesty of the whole feature: a captured slot that
 * does not actually isolate is worse than no slot, because it looks like it
 * worked.
 */
export type SlotSupport = 'measured' | 'declared' | 'unmapped';

/** Where a slot's remaining quota can be read, or why it cannot be. */
export type QuotaSource =
    /** an OAuth credentials file, relative to the slot directory */
    | { kind: 'oauth-credentials'; file: string }
    /**
     * ‼️ X-215 — THE ENGINE'S OWN TRANSCRIPTS, under the slot's directory.
     *
     * Some engines publish no endpoint and are not silent either: they write
     * what the service told them into the rollout they are keeping anyway, and
     * a reader that knows the shape can have the figure for the price of a file
     * read. `dir` is relative to the slot, which is what makes the answer PER
     * ACCOUNT rather than per machine.
     *
     * ‼️ AND THIS BRANCH DOES NOT GO TO THE NETWORK, so nothing that reads it
     * may be metered by the budget that exists to be polite to an endpoint —
     * see `AccountUsageService`. A figure off this machine's own disk waiting
     * in a queue it does not belong in is a cost with no payer.
     */
    | { kind: 'session-tail'; dir: string }
    /** nothing to read — and the reason, because a blank bar explains nothing */
    | { kind: 'none'; reason: string };

/** What is known about the identity in a slot directory. */
export interface AccountIdentity {
    /** the address, when the engine records one — Codex does not, and that is
     *  not a fault; the label carries the name there */
    email: string;
    /** the provider's own stable id for the account (Claude: oauthAccount.accountUuid); '' when the engine records none */
    accountUuid: string;
    subscriptionType: string;
    /** epoch ms; the ACCESS token's expiry — informational, not a verdict */
    expiresAt: number;
    /** epoch ms; the REFRESH token's expiry — this one decides `health` */
    refreshExpiresAt: number;
    health: SlotHealth;
}

/** One account, as it is stored and as every surface above reads it. */
export interface EngineAccountSlot {
    id: string;
    /** which engine this identity belongs to — an account is never engine-free */
    engine: string;
    /** what the user calls it; the email is the fallback, never the id */
    label?: string;
    /** the config directory this slot IS */
    dir: string;
    email?: string;
    /** the key two slots are compared by — a folder name never is (X-282) */
    accountUuid?: string;
    subscriptionType?: string;
    capturedAt?: number;
}

/**
 * ‼️ ONE ENGINE'S ANSWER TO "WHAT IS AN ACCOUNT HERE".
 *
 * Everything engine-specific about accounts is one of these fields. Adding
 * Codex for real is filling one in and measuring it — not a second module, not
 * a branch in a page, and above all not a second `if (engine === 'claude')`
 * somewhere downstream.
 */
export interface EngineAuthAdapter {
    engine: string;
    support: SlotSupport;
    /**
     * The environment variable that relocates this engine's config directory.
     * Empty when `support` is `unmapped` — there is nothing verified to set.
     */
    configEnv: string;
    /** the files that ARE the identity and belong to the slot */
    ownFiles: string[];
    /**
     * ‼️ X-265 — …AND THE FILES THAT ARE NOT THE IDENTITY BUT DECIDE HOW THE
     * SESSION BEHAVES. Copied at capture, never linked, never required.
     *
     * Isolation was designed around the sign-in and quietly took the rest of
     * the directory with it. `~/.claude/settings.json` holds the user's model,
     * their permission mode AND Agent Farm's own live hooks; a slot without it
     * starts a session that obeys none of them and posts no event, so the Live
     * Timeline went deaf the day a second account became possible — measured
     * 2026-09-07: not one Claude hook event since.
     *
     * ‼️ SEPARATE FROM `ownFiles` BECAUSE THE CAPTURE COUNTS THOSE. A capture
     * that copied nothing from `ownFiles` is a FAILED capture — a row that
     * would start sessions as nobody — so folding a settings file into that
     * list would let a slot with no credentials in it pass for a sealed
     * account. Missing here is ordinary: the user may never have had one.
     */
    carryFiles?: string[];
    /**
     * ‼️ X-269 — WHAT THE FLEET GUARANTEES EVERY SESSION ON THIS ENGINE GETS,
     * whichever sign-in it runs under.
     *
     * A `carryFile` travels the USER'S choices; this is the fleet's own, and it
     * wins where the two disagree. It names its own file rather than leaning on
     * the order of `carryFiles`, because an engine may keep its behaviour
     * somewhere else entirely — and an engine with nothing to guarantee simply
     * leaves it out.
     *
     * Applied wherever a slot can lead to a session (`core/slotSettings`), not
     * at capture: a contract enforced once is a photograph, which is the fault
     * this field exists to end.
     */
    requiredEnv?: { file: string; vars: Record<string, string> };
    /**
     * …and what must keep pointing at the main directory, because relocating a
     * config directory moves more than the identity.
     */
    sharedPaths: string[];
    /**
     * Where this engine keeps all of that when NOTHING is relocated, relative
     * to the user's home.
     */
    liveDir: string;
    /**
     * ‼️ …EXCEPT THE ONES THAT ARE NOT UNDER IT, AND THERE IS ALWAYS ONE.
     *
     * Claude is the proof and the trap: the credentials are
     * `~/.claude/.credentials.json`, but the identity — `oauthAccount`, the
     * email, every folder-trust record — is `~/.claude.json`, at the HOME ROOT,
     * one level up from everything else that engine owns. Assuming
     * `<liveDir>/<name>` for all of them makes a capture that copies one file,
     * finds no address, seals a slot anyway and starts a session on an account
     * that is not signed in. Nothing errors; it just does not work.
     *
     * Keyed by the slot-relative name, valued by the home-relative source.
     */
    liveFiles?: Record<string, string>;
    /** one line: what was actually tried, so the claim can be argued with */
    evidence: string;
    /**
     * Read who is signed in, in a directory of this engine's shape.
     *
     * ‼️ Present even on an `unmapped` engine, because reading the identity in
     * the MAIN directory is useful on its own — the Engines page can say whose
     * Gemini sign-in is on this machine without being able to hold a second
     * one. Support governs capture, not reading.
     */
    /**
     * ‼️ X-219 — HOW A DEAD SIGN-IN IS RENEWED, in the engine's own words.
     *
     * A stored credential that no longer refreshes can only be fixed by a
     * person at a browser: an agent may not drive the user's browser and may
     * not open a debug connection to it. What the extension can honestly do is
     * open the engine's OWN command in the slot's OWN directory — and then
     * measure the result instead of assuming it, which is what `statusArgs` is
     * for. Undefined where the engine cannot hold a second sign-in at all: an
     * offer whose only outcome is a refusal is worse than no offer.
     *
     * ‼️ IT NAMES NO VARIABLE. The isolation comes from `accountEnv`, the one
     * seam every launch already goes through (X-168); a command that spelt the
     * variable out here would be the second place it has to change.
     */
    signIn?(): { command: string; args: string[]; statusArgs: string[] } | undefined;
    readIdentity(fsr: AccountFs, dir: string, now?: number): AccountIdentity;
    /** where this slot's remaining quota comes from */
    quotaSource(): QuotaSource;
}

function num(v: unknown): number {
    return typeof v === 'number' && isFinite(v) ? v : 0;
}

function safe<T>(fn: () => T): T | undefined {
    try { return fn(); } catch { return undefined; }
}

function emptyIdentity(): AccountIdentity {
    return { email: '', accountUuid: '', subscriptionType: '', expiresAt: 0, refreshExpiresAt: 0, health: 'needs-signin' };
}

/**
 * Who is in this directory, and can a session be started as them.
 *
 * ‼️ AN EXPIRED ACCESS TOKEN IS NOT A SIGNED-OUT ACCOUNT. Claude Code refreshes
 * it over HTTP without opening anything, which is the entire reason a captured
 * slot keeps working for weeks unattended. Only the REFRESH token's death needs
 * a person, and only that is reported as needing one — a row that said "signed
 * out" for the ordinary hourly case would send the user to fix nothing.
 */
export function readClaudeIdentity(fsr: AccountFs, dir: string, now = Date.now()): AccountIdentity {
    const rawCreds = safe(() => fsr.read(path.join(dir, '.credentials.json')));
    if (!rawCreds) { return emptyIdentity(); }
    let oauth: Record<string, unknown> | undefined;
    try {
        const parsed = JSON.parse(rawCreds) as { claudeAiOauth?: Record<string, unknown> };
        oauth = parsed?.claudeAiOauth;
    } catch {
        // ‼️ Unreadable is its own answer. Calling a locked or half-written file
        // "signed out" would send somebody to a browser to fix a parse error.
        return { ...emptyIdentity(), health: 'unreadable' };
    }
    if (!oauth) { return emptyIdentity(); }

    let email = '';
    let accountUuid = '';
    const rawCfg = safe(() => fsr.read(path.join(dir, '.claude.json')));
    if (rawCfg) {
        try {
            const cfg = JSON.parse(rawCfg) as { oauthAccount?: { emailAddress?: unknown; accountUuid?: unknown } };
            const e = cfg?.oauthAccount?.emailAddress;
            if (typeof e === 'string') { email = e; }
            // ‼️ X-282 — THE UUID IS THE KEY, THE ADDRESS IS THE LABEL. Two
            // folders carrying one uuid are one account filed twice, whatever
            // their names say; measured on this machine, twice.
            const u = cfg?.oauthAccount?.accountUuid;
            if (typeof u === 'string') { accountUuid = u.trim(); }
        } catch { /* the identity file is optional; the credentials decide health */ }
    }

    const refreshExpiresAt = num(oauth.refreshTokenExpiresAt);
    return {
        email, accountUuid,
        subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : '',
        expiresAt: num(oauth.expiresAt),
        refreshExpiresAt,
        // A missing refresh expiry is treated as "still good": some grants do
        // not carry one, and refusing to use an account because a field is
        // absent would be inventing a fault out of silence.
        health: refreshExpiresAt && refreshExpiresAt <= now ? 'needs-signin' : 'ready'
    };
}

/**
 * ‼️ THE CODEX IDENTITY IS THE SAME QUESTION IN DIFFERENT WORDS, and it is read
 * here rather than left blank so that the day `CODEX_HOME` is measured, the
 * only thing that changes is one field. `auth.json` on this machine holds a
 * live ChatGPT sign-in (`auth_mode: chatgpt`) and no address — OpenAI keeps
 * that inside the id_token — so an empty email is the normal case here, not a
 * fault, and the slot is named after its label instead.
 */
export function readCodexIdentity(fsr: AccountFs, dir: string): AccountIdentity {
    const raw = safe(() => fsr.read(path.join(dir, 'auth.json')));
    if (!raw) { return emptyIdentity(); }
    let auth: Record<string, unknown>;
    try {
        auth = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return { ...emptyIdentity(), health: 'unreadable' };
    }
    const tokens = auth.tokens as Record<string, unknown> | undefined;
    const signedIn = !!(tokens && typeof tokens.access_token === 'string' && tokens.access_token);
    const key = typeof auth.OPENAI_API_KEY === 'string' && !!auth.OPENAI_API_KEY;
    if (!signedIn && !key) { return emptyIdentity(); }
    return {
        email: '', accountUuid: '',
        subscriptionType: typeof auth.auth_mode === 'string' && auth.auth_mode
            ? auth.auth_mode
            : (key ? 'apikey' : ''),
        // Codex records no expiry this side can read, so the presence of the
        // grant is the whole verdict — and saying zero is honest about that
        // rather than inventing a countdown nobody measured.
        expiresAt: 0,
        refreshExpiresAt: 0,
        health: 'ready'
    };
}

/** The Google grant the Gemini CLI writes for itself. */
export function readGeminiIdentity(fsr: AccountFs, dir: string): AccountIdentity {
    const raw = safe(() => fsr.read(path.join(dir, 'oauth_creds.json')));
    if (!raw) { return emptyIdentity(); }
    let creds: Record<string, unknown>;
    try {
        creds = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return { ...emptyIdentity(), health: 'unreadable' };
    }
    const hasRefresh = typeof creds.refresh_token === 'string' && !!creds.refresh_token;
    return {
        email: '', accountUuid: '',
        subscriptionType: 'oauth-personal',
        expiresAt: num(creds.expiry_date),
        refreshExpiresAt: 0,
        health: hasRefresh ? 'ready' : 'needs-signin'
    };
}

/** OpenCode holds provider credentials rather than a plan of its own. */
export function readOpencodeIdentity(fsr: AccountFs, dir: string): AccountIdentity {
    const raw = safe(() => fsr.read(path.join(dir, 'opencode', 'auth.json')));
    if (!raw) { return emptyIdentity(); }
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const providers = Object.keys(parsed || {});
        if (!providers.length) { return emptyIdentity(); }
        return {
            email: '', accountUuid: '', subscriptionType: providers.join(', '),
            expiresAt: 0, refreshExpiresAt: 0, health: 'ready'
        };
    } catch {
        return { ...emptyIdentity(), health: 'unreadable' };
    }
}

/** An engine whose identity this side cannot read: nothing is claimed. */
function noIdentity(): AccountIdentity {
    return emptyIdentity();
}

/**
 * ‼️ THE TABLE. Five engines, three levels of certainty, and the certainty is
 * written down beside the claim rather than assumed by whoever reads it next.
 */
export const ENGINE_AUTH_ADAPTERS: EngineAuthAdapter[] = [
    {
        engine: 'claude',
        support: 'measured',
        configEnv: 'CLAUDE_CONFIG_DIR',
        ownFiles: ['.credentials.json', '.claude.json'],
        // ‼️ DIRECTORIES ONLY, and `history.jsonl` is left out on purpose. A
        // directory is shared with a junction, which needs no administrator on
        // Windows; a FILE would need a real symlink, which does — so a capture
        // that tried to share it would fail on the machine this was built for.
        // Prompt history diverging per account costs nothing. Transcripts
        // diverging costs the panel every session it starts, which is why those
        // are here.
        // ‼️ X-273 — AND WHAT THE USER INSTALLED IS THE FLEET'S, NOT AN
        // ACCOUNT'S. `plugins` and `skills` live under this directory too, so a
        // session started on a slot could reach neither: measured 2026-09-13,
        // the fleet holds a plugin marketplace (447 files) and two global
        // skills, and every isolated session had been running without any of
        // them. Nothing there is an identity — installing a skill once and
        // losing it on the next sign-in is the X-270 fault by another name.
        sharedPaths: ['projects', 'todos', 'shell-snapshots', 'plugins', 'skills'],
        // ‼️ X-265 — the settings file travels with the slot. CLAUDE_CONFIG_DIR
        // moves where `settings.json` is READ FROM, so an isolated session
        // inherits the user's model, permission mode and live hooks only if a
        // copy is put there. Measured on this machine: it was not, and every
        // Claude session started under an account has been invisible since.
        carryFiles: ['settings.json'],
        // ‼️ X-269 — MEASURED 2026-09-12: not one of the five slots on this
        // machine carried this key, so every Claude session Agent Farm had ever
        // started under an account ran on Anthropic's SIMPLIFIED system prompt.
        // The user's standing decision is the full one. The variable is read
        // when the process STARTS, so this can only ever fix the next session —
        // which is exactly why it is applied before the spawn rather than
        // repaired after somebody notices.
        requiredEnv: { file: 'settings.json', vars: { CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' } },
        liveDir: '.claude',
        // ‼️ the identity is at the HOME ROOT, not under .claude — see liveFiles
        liveFiles: { '.claude.json': '.claude.json' },
        evidence: 'Measured on this machine 2026-09-03: pointed at an empty directory, '
            + '`claude auth status --json` answered loggedIn:false, reported its projectsDirectory '
            + 'inside that directory, and wrote a fresh .claude.json there.',
        // ‼️ MEASURED 2026-09-06 from `claude --help` / `claude auth --help`:
        // the subcommand is `auth login`. There is no bare `claude login`, and a
        // button wired to one would have failed on the first press.
        signIn: () => ({ command: 'claude', args: ['auth', 'login'], statusArgs: ['auth', 'status'] }),
        readIdentity: readClaudeIdentity,
        quotaSource: () => ({ kind: 'oauth-credentials', file: '.credentials.json' })
    },
    {
        engine: 'codex',
        support: 'declared',
        configEnv: 'CODEX_HOME',
        ownFiles: ['auth.json'],
        sharedPaths: ['sessions'],
        liveDir: '.codex',
        evidence: 'CODEX_HOME is Codex\'s own documented override for ~/.codex, but it has NOT been run '
            + 'here — the codex CLI is not installed on this machine, only its auth.json is. Capturing a '
            + 'second Codex account is allowed and stays marked "declared" until somebody proves it.',
        // Measured the same day from `codex --help` / `codex login --help`:
        // `codex login`, with `codex login status` to read the result back.
        signIn: () => ({ command: 'codex', args: ['login'], statusArgs: ['login', 'status'] }),
        readIdentity: readCodexIdentity,
        /**
         * ‼️ X-215 — CODEX'S QUOTA IS ITS OWN TRANSCRIPT, and this said the
         * opposite for as long as the cards were blank.
         *
         * It read "Codex keeps no readable quota figure on disk — its plan
         * limits are only visible inside the CLI itself". `core/engineUsage.ts`
         * has been reading exactly that figure since U-27: the tail of the
         * newest rollout under `sessions/` carries `rate_limits.primary`
         * (`used_percent`, `window_minutes`), and the status bar and the
         * Dashboard have been drawing it — "week 72%" — the whole time. The
         * user found it by comparing two surfaces of the same product.
         *
         * A stated reason is a claim about the world, and a wrong one is worse
         * than a blank bar: it CLOSES THE QUESTION. `sessions` is a shared path
         * (see `sharedPaths` above), so a captured slot has the real folder
         * under its own directory and the figure is that account's, not the
         * machine's.
         */
        quotaSource: () => ({ kind: 'session-tail', dir: 'sessions' })
    },
    {
        engine: 'gemini',
        support: 'unmapped',
        configEnv: '',
        ownFiles: ['oauth_creds.json', 'google_accounts.json'],
        sharedPaths: [],
        liveDir: '.gemini',
        evidence: 'The Gemini CLI writes its Google sign-in into ~/.gemini and this side has not verified any '
            + 'variable that relocates it, so a second Gemini identity cannot be kept apart yet. Reading the one '
            + 'that is there works; capture waits on that one measurement.',
        readIdentity: readGeminiIdentity,
        quotaSource: () => ({
            kind: 'none',
            reason: 'Gemini publishes no local quota figure; what the account is entitled to is between the user and Google.'
        })
    },
    {
        engine: 'opencode',
        support: 'unmapped',
        configEnv: '',
        ownFiles: ['opencode/auth.json'],
        sharedPaths: [],
        liveDir: '.local/share',
        evidence: 'OpenCode stores credentials under the shared XDG data root (~/.local/share/opencode/auth.json), '
            + 'so moving that root would move every other XDG application with it — not an isolation, a side effect. '
            + 'It also runs with no credential at all (X-38), so a second slot is rarely the point here.',
        readIdentity: readOpencodeIdentity,
        quotaSource: () => ({
            kind: 'none',
            reason: 'OpenCode holds provider credentials, not a plan of its own, so there is no per-account allowance to read.'
        })
    },
    {
        engine: 'agy',
        support: 'unmapped',
        configEnv: '',
        ownFiles: [],
        sharedPaths: [],
        liveDir: '.gemini/antigravity-cli',
        evidence: 'Antigravity is paid for by an app sign-in and keeps no credential file this side can seal into a '
            + 'directory, so two identities cannot be kept apart for it. Nothing here pretends otherwise.',
        readIdentity: noIdentity,
        quotaSource: () => ({ kind: 'none', reason: 'Antigravity exposes no local credential or quota file.' })
    }
];

/**
 * ‼️ AN ENGINE NOBODY WROTE AN ADAPTER FOR IS `unmapped`, NOT A CRASH. New
 * engines land in this codebase regularly, and a page that throws because it
 * met one is a worse failure than a row saying "not mapped yet".
 */
export function adapterFor(engine: string | undefined): EngineAuthAdapter {
    const id = String(engine || '').trim();
    const found = ENGINE_AUTH_ADAPTERS.find(a => a.engine === id);
    if (found) { return found; }
    return {
        engine: id || 'unknown',
        support: 'unmapped',
        configEnv: '',
        ownFiles: [],
        sharedPaths: [],
        liveDir: '',
        evidence: `No account adapter is written for "${id || 'this engine'}" yet, so it cannot hold a second identity.`,
        readIdentity: noIdentity,
        quotaSource: () => ({ kind: 'none', reason: 'No account adapter for this engine.' })
    };
}

/**
 * Where one of a slot's files lives BEFORE anything is relocated, relative to
 * the user's home — the source a capture copies from.
 *
 * ‼️ The one-line override table is the whole point of this function: read it
 * off `liveDir` alone and Claude's identity file is looked for in the wrong
 * place, so the capture seals a slot with no address and no sign-in in it.
 */
export function liveSource(engine: string | undefined, name: string): string {
    const a = adapterFor(engine);
    const override = a.liveFiles?.[name];
    if (override) { return override; }
    return a.liveDir ? path.posix.join(a.liveDir.replace(/\\/g, '/'), name) : name;
}

/**
 * ‼️ X-211 — CAN THIS ENGINE HOLD MORE THAN ONE SIGN-IN AT A TIME?
 *
 * The answer is a variable: an account is a config directory chosen before the
 * process starts, so an engine with no `configEnv` cannot be pointed at one
 * however many slots are stored. Every surface that draws the account axis —
 * the composer's box, the status bar's heading, the terminal's resume picker —
 * asks this rather than testing `slots.length`, because "no accounts captured"
 * and "no such thing as an account here" are different answers and only the
 * first one deserves a picker offering Machine Global.
 */
export function canIsolateAccounts(engine: string | undefined): boolean {
    return !!adapterFor(engine).configEnv;
}

/** The engines a second account can actually be captured for, right now. */
export function accountCapableEngines(): string[] {
    return ENGINE_AUTH_ADAPTERS.filter(a => a.support !== 'unmapped').map(a => a.engine);
}

/**
 * Why this engine cannot hold a second account — empty string when it can.
 * One sentence, so every surface refuses in the same words (the `engineRefusal`
 * precedent in engines.ts).
 */
export function captureRefusal(engine: string | undefined): string {
    const a = adapterFor(engine);
    return a.support === 'unmapped' ? a.evidence : '';
}

/**
 * The layout in one paragraph, kept beside the table rather than in a document
 * that can drift away from it. A surface explaining the arrangement to the user
 * asks for this rather than writing its own words.
 *
 * ‼️ AND THE SHARED PART IS THE POINT, not a footnote: relocating the config
 * directory moves the TRANSCRIPTS too — measured, `projectsDirectory` pointed
 * inside the probe directory. Agent Farm indexes a single root (`claudeDir()`
 * in extension.ts), so a session started under an isolated slot would be
 * invisible in the panel: no history, no resume, no cost, no colour.
 */
export function describeSlotLayout(engine: string): string {
    const a = adapterFor(engine);
    if (a.support === 'unmapped') { return a.evidence; }
    return `An account is a config directory, chosen with ${a.configEnv} before the process starts. `
        + `Only the identity is its own — ${a.ownFiles.join(' and ')} — because that variable moves the `
        + 'session records too, and a session whose transcript lands inside a slot is invisible to the panel: '
        + `no history, no resume, no cost. So ${a.sharedPaths.join(', ')} are shared with the main directory `
        + 'through a link (a junction on Windows, which needs no administrator), and every session ever '
        + 'started is still read from one root.';
}

/** Where a slot's directory sits under whatever root the host gives it. */
export function slotDir(root: string, id: string): string {
    return path.join(root, id);
}

/**
 * A filename-safe, human-readable id minted from the address, deduplicated
 * against what is already there.
 *
 * ‼️ `toLowerCase()` IS WRONG HERE and this machine is why: under a Turkish
 * locale it maps `I` to a dotless form and `i` to `İ`, so two accounts could
 * mint the same folder name on one machine and different ones on another. The
 * invariant form is the only one that is a stable key.
 *
 * ‼️ AND THE ENGINE IS PART OF THE ID, so one address signed in to two engines
 * is two slots rather than a collision.
 */
export function mintSlotId(engine: string, email: string, taken: string[]): string {
    const local = String(email || '').split('@')[0];
    const safeLocal = local
        .replace(/[A-Z]/g, c => c.toLowerCase())   // invariant: ASCII only, by construction
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const base = `${engine}-${safeLocal || 'account'}`;
    if (!taken.includes(base)) { return base; }
    // Counting up rather than overwriting: two plans really can share an
    // address, and the failure worth avoiding is the silent one.
    for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!taken.includes(candidate)) { return candidate; }
    }
}

/** The first eight characters — enough to tell two accounts apart on a card. */
export function shortUuid(uuid: string | undefined): string {
    return String(uuid || '').trim().slice(0, 8);
}

/**
 * ‼️ X-282 — WHICH SLOTS ARE ONE ACCOUNT FILED TWICE. Keyed by engine + uuid,
 * never by folder name: measured on this machine, `claude-aicozums` and
 * `claude-aicozums-2` carried one uuid, and so did the murvietnam pair — five
 * slots, three accounts, and every picker offering five "independent" quotas.
 * A slot whose uuid could not be read is nobody's duplicate: that is "the
 * engine did not say who this is", not "this is somebody new".
 */
export function duplicateSlots(
    list: ReadonlyArray<{ id: string; engine: string; accountUuid?: string }>
): Map<string, string[]> {
    const byKey = new Map<string, string[]>();
    for (const s of list) {
        const u = String(s.accountUuid || '').trim();
        if (!u) { continue; }
        const key = `${s.engine}\u0001${u}`;
        byKey.set(key, [...(byKey.get(key) || []), s.id]);
    }
    const out = new Map<string, string[]>();
    for (const ids of byKey.values()) {
        if (ids.length < 2) { continue; }
        for (const id of ids) { out.set(id, ids.filter(o => o !== id)); }
    }
    return out;
}

/**
 * ‼️ ACTIVATING A SLOT IS THIS FUNCTION AND NOTHING ELSE. One variable, named
 * by the engine's own adapter, handed to the launch machinery that already
 * exists. No file is written, nothing the user is currently talking to is
 * touched, and two slots can run at once.
 *
 * ‼️ AND THE MAIN ACCOUNT IS THE ABSENCE OF THE VARIABLE, deliberately — not a
 * slot whose directory happens to be `~/.claude`. Naming the default explicitly
 * would put a variable into every session Agent Farm starts that no session
 * carried before, which is a behaviour change wearing a default's clothes.
 *
 * ‼️ An `unmapped` engine returns nothing rather than inventing a variable
 * name: a slot that does not isolate must never look like one that does.
 */
export function accountEnv(slot: { engine?: string; dir?: string } | undefined): Record<string, string> {
    if (!slot || !slot.dir) { return {}; }
    const a = adapterFor(slot.engine);
    return a.configEnv ? { [a.configEnv]: slot.dir } : {};
}

/** Who is in this slot, read through its own engine's adapter. */
export function readSlotIdentity(
    slot: { engine?: string; dir: string },
    fsr: AccountFs,
    now = Date.now()
): AccountIdentity {
    return adapterFor(slot.engine).readIdentity(fsr, slot.dir, now);
}

/** Where this slot's quota is read from, or why there is none. */
export function slotQuotaSource(slot: { engine?: string } | undefined): QuotaSource {
    return adapterFor(slot && slot.engine).quotaSource();
}

/** The verdict on its own, for a caller that already has the identity. */
export function slotHealth(id: AccountIdentity): SlotHealth {
    return id.health;
}
