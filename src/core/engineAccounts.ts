import * as path from 'path';
import {
    codexHookCommand, codexHookEntries, codexHookPort, codexHooksCurrent, codexHooksReadable,
    codexTrustLedger, codexTrustProjection, upsertCodexHooks
} from './codexHooks';
import { ALL_HOOK_EVENTS, hooksAreCurrent, syncHooksToAccounts } from './hooksInstaller';

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
    /** X-530 — asleep on purpose: kept, never read for quota, never launched on (accountLife.ts) */
    disabled?: boolean;
    /** when it was put to sleep, epoch ms */
    disabledAt?: number;
}

/**
 * ‼️ ONE ENGINE'S ANSWER TO "WHAT IS AN ACCOUNT HERE".
 *
 * Everything engine-specific about accounts is one of these fields. Adding
 * Codex for real is filling one in and measuring it — not a second module, not
 * a branch in a page, and above all not a second `if (engine === 'claude')`
 * somewhere downstream.
 */
/**
 * ‼️ X-274 — WHO OWNS A KEY inside a file the slot holds, because a whole file
 * has no single owner. `ownFiles` and `carryFiles` are file-sized answers; the
 * identity file `.claude.json` carries the sign-in (the slot's), the folder
 * trusts and MCP servers the user approved (the fleet's) and 21 telemetry
 * fields per project entry (nobody's). Measured 2026-09-13: 74 top-level keys,
 * 29 fields per project entry, every trust key identical across three slots —
 * and nothing keeping it so; the next folder the user trusts would have reached
 * no slot.
 *
 * `fleet` — the fleet's value is projected at every gate, absence included.
 * `slot` — the slot's; the fleet never touches it (the identity).
 * `ignore` — nobody's; never compared, never written. Not decoration: without
 * it every telemetry field would count as drift and the file would be rewritten
 * on every gate for ever (the 3.469.1 fault).
 * `merge` — X-291: BOTH sides', three-way against the base both converged on at
 * the previous gate. Two lists become their union, the fleet's answer wins
 * anything that is not two lists, and what a slot session added travels BACK to
 * the fleet at the next gate so the next account is not asked again. For a
 * permission list only: an approval the user gave once is an answer, not a
 * setting, and `fleet` deleted it at the next gate without telling anyone.
 */
export type KeyPolicy = 'fleet' | 'slot' | 'ignore' | 'merge';
export interface KeyOwnership {
    /** the policy for a key this map does not name */
    default: KeyPolicy;
    keys: Record<string, KeyPolicy>;
    /**
     * A key whose value is a FIXED object with keys of its own (`permissions`).
     * Recursive: the sub-scope has its own default, its own keys and its own
     * nesting, so `permissions.allow` can merge while `permissions.defaultMode`
     * stays the fleet's without either being named twice.
     */
    nested?: Record<string, KeyOwnership>;
    /**
     * A map-shaped key whose ENTRIES carry keys of their own (`projects.<path>`).
     * The policy applies one level down, in every entry the fleet has; an entry
     * only the slot has is the slot's and is left alone.
     */
    entries?: Record<string, KeyOwnership>;
}

/** Only what a projection or a wire needs off a disk, so both are testable without one. */
export interface WireFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
}

export interface ProjectionContext {
    fs: WireFs;
    home: string;
    /** the directory being projected into */
    dir: string;
    /** …as the ENGINE will name it: symlinks and junctions resolved, drive letter as the OS reports it */
    realDir: string;
}

/** the fleet's text → what the directory at `ctx.dir` must hold; `have` is what it holds now */
export type CarryProjection = (source: string, have: string | undefined, ctx: ProjectionContext) => string;

export interface LiveWireContext extends ProjectionContext {
    /** the live-events port the wire must name */
    hooksPort: number;
    /**
     * ‼️ X-298 — is this the FLEET'S own directory (`~/<liveDir>`) rather than a
     * slot projected from it. The wire file itself is written in one place only:
     * a slot receives it by carry, so writing it on both sides would leave the
     * carry clause and the hooks clause each undoing the other's answer.
     */
    fleet?: boolean;
}

export interface LiveWire {
    /** read-only: is the wire in this directory live — present, trusted where the engine demands it, on the live port */
    read(ctx: LiveWireContext): { ok: boolean; detail: string };
    /** put it right; `dryRun` touches nothing */
    repair(ctx: LiveWireContext, dryRun: boolean): { wrote: boolean; error?: string };
    /**
     * true = the FLEET'S OWN directory (`~/<liveDir>`) is signed by the same
     * read/repair, so the projections have something true to copy. Absent =
     * the fleet's wire is somebody else's job (Claude: the hooks installer).
     */
    fleet?: boolean;
    /**
     * When the wire lives INSIDE a carried JSON file under top-level keys of
     * its own, those keys — so the carry clause renders over them and does not
     * count them (the hooks pass runs after it and re-points them). A wire
     * that is not JSON-keyed (Codex's trust tables) leaves this unset and is
     * carried by projection instead.
     */
    owns?: { file: string; keys: string[] };
    /**
     * ‼️ X-297 — WHICH EVENTS THIS WIRE WILL REPORT BY ITSELF.
     *
     * The Console mirrors a hosted conversation into the live lane for sessions
     * the engine cannot speak for (see `mirrorConsoleToLive`), and the moment a
     * wire works both of them describe the same turn: measured 2026-09-13, one
     * Codex session logged `start` and `prompt` twice, eight seconds apart.
     * The mirror asks this and stays quiet about exactly what the wire already
     * says — so what no wire carries (the agent's own reply, U-78; a lane that
     * ends with no `SessionEnd` hook to end it) is still reported, by the one
     * thing that knows it.
     *
     * Read from the wire that is really there rather than declared: Codex's
     * file is the user's and may name any subset.
     */
    events?(ctx: LiveWireContext): string[];
}

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
    /** X-531 — of those, the ones holding the grant (the tokens): Sign out removes these and nothing else */
    grantFiles?: string[];
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
     * ‼️ X-277 — THE SHARED FILES, which cannot be junctions and are therefore
     * their own field rather than a sixth name in the list above.
     *
     * `sharedPaths` are folders and a folder is reached by a junction. A FILE
     * the engine appends to has to be the SAME FILE under two names — a hard
     * link — or the two copies diverge the moment either is written. Measured
     * on this machine (Claude Code 2.1.269): `history.jsonl` is opened with a
     * locked APPEND, so the inode never changes and a hard link survives
     * ordinary use indefinitely; the one path that would replace the file is
     * the retention prune, which is gated behind an enterprise taint that is
     * off here and refuses a non-regular file anyway.
     *
     * Measured too: not one Claude slot on this machine has a `history.jsonl`
     * at all, so every isolated REPL session has been typing into a history
     * that dies with the account — the X-270 fault by another name.
     *
     * ‼️ AND THE ONE THING THIS BUYS THAT A JUNCTION WOULD NOT HAVE: the engine's
     * write lock is a file beside the NAME (`history.jsonl.lock`), so two REPLs
     * opened on two hard-linked names do not see each other's lock and fall back
     * on the append being atomic. Measured as low risk — an append of one short
     * line under `O_APPEND` — and stated rather than discovered later, because
     * it is the difference between "shared" and "serialised".
     */
    sharedFiles?: string[];
    /**
     * ‼️ X-292 — THE FILE THIS ENGINE STAMPS WHEN ITS OWN HOUSEKEEPING RUNS,
     * relative to the config directory. It is not part of the contract and
     * nothing repairs it: it exists so a repair can say WHY it was needed.
     *
     * The engine prunes its own scratch directories, and on a relocated config
     * directory those are junctions. Node's recursive remove sees a junction as
     * a link and unlinks it rather than walking into it — so the pool survives
     * and the slot loses the path. The contract then puts it back at the next
     * gate, silently, for ever. Reading this stamp beside the repair is what
     * turns "it was broken again" into "the engine's housekeeping broke it".
     */
    housekeeping?: string;
    /**
     * ‼️ X-274 — key-level ownership inside a file the slot holds, keyed by the
     * slot-relative file name. The contract derives a `keys:<file>` clause from
     * every entry: the fleet's keys are compared by value and projected in
     * place, and nothing else in the file is read or written.
     */
    ownership?: Record<string, KeyOwnership>;
    /**
     * ‼️ X-295 — A CARRIED FILE THE DIRECTORY MUST SIGN FOR ITSELF, keyed by
     * the slot-relative name. The fleet's bytes are still the base (X-279:
     * nothing is parsed, nothing re-serialised), and the projection is what
     * those bytes must become in a directory at another PATH — the standing
     * case being Codex's `config.toml`, whose hook-trust records are keyed by
     * the absolute path of the hook file, so the fleet's own records name a
     * file no slot has. `carry:` compares the slot against the projection and
     * reproduction writes it; a file not named here is carried verbatim.
     */
    carryProject?: Record<string, CarryProjection>;
    /**
     * ‼️ X-295 — THE ENGINE'S LIVE WIRE: whether a directory of this shape
     * will send events to Agent Farm, in the engine's own terms. Claude's is a
     * `hooks` block in `settings.json` naming the live port; Codex's is a
     * `hooks.json` beside a `config.toml` that trusts every hook in it. The
     * contract's `hooks` clause is derived from this — an engine without one
     * has no such clause, rather than a clause about a file it never heard of.
     */
    liveWire?: LiveWire;
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
    const expiresAt = num(oauth.expiresAt);
    /**
     * ‼️ X-219 (round 2) — A DATE IS NOT A CREDENTIAL, and this line believed
     * one. `claude-kateanhkim` sat on this machine with `accessToken: ""` and
     * `refreshToken: ""` and a `refreshTokenExpiresAt` a month away, so the only
     * thing that was read said "in date" and the row was stamped `ready`. The
     * card then HID its 🔑 (it is hidden on a healthy row, X-275), which is the
     * expensive half: the account was dead, said it was fine, and offered no way
     * back. Every other reader in this file already asks whether the grant is
     * THERE — Codex checks `access_token`, Gemini checks `refresh_token`; this
     * one asked only when it expires.
     *
     * Two states, and both are "a person is needed":
     *   · nothing to present and nothing to refresh with — the measured case;
     *   · nothing to refresh with and what was presentable has expired, which is
     *     the same fact one hour later. A live access token with no refresh
     *     beside it is still `ready`, because it still works and the countdown
     *     the card already draws is the honest warning for it.
     */
    const tok = (v: unknown): boolean => typeof v === 'string' && !!v.trim();
    const canPresent = tok(oauth.accessToken);
    const canRefresh = tok(oauth.refreshToken);
    const spent = !canPresent && !canRefresh
        ? true
        : !canRefresh && !!expiresAt && expiresAt <= now;
    return {
        email, accountUuid,
        subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : '',
        expiresAt,
        refreshExpiresAt,
        // A missing refresh expiry is treated as "still good": some grants do
        // not carry one, and refusing to use an account because a field is
        // absent would be inventing a fault out of silence.
        health: spent || (refreshExpiresAt && refreshExpiresAt <= now) ? 'needs-signin' : 'ready'
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
        grantFiles: ['.credentials.json'],
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
        // ‼️ X-277 — the terminal's own command history. A folder would be a
        // junction; this is one file the engine appends to, so it is one file
        // under two names (see `sharedFiles`).
        sharedFiles: ['history.jsonl'],
        // ‼️ X-292 — measured on this machine, three separate events: the slot
        // whose `.last-cleanup` is newest is the slot that lost `todos` and
        // `shell-snapshots`, and never `projects`. The pool was untouched each
        // time, which is the signature of an unlink rather than a walk.
        housekeeping: '.last-cleanup',
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
        // ‼️ X-274 — the identity file is three files in one. The sign-in is the
        // slot's; the MCP servers and, per project entry, the folder trust and
        // tool approvals the user gave in the main directory are the fleet's and
        // never reached a slot once it was captured; the rest of a project entry
        // (`last*`, `exampleFiles`…) is telemetry Claude Code rewrites every
        // session and no gate may count. A key not named here is ignored — the
        // eleventh trust key Claude Code adds tomorrow is then a visible gap in
        // this list, not a silent fork.
        // ‼️ X-291 — …AND `allowedTools` IS THE ONE OF THOSE THAT IS AN ANSWER
        // RATHER THAN A SETTING. Under `fleet` a tool the user approved inside a
        // slot session was deleted at the next gate and the fleet never heard of
        // it, so switching account asked the same question again. It merges, and
        // the gate carries the slot's new answers back. `permissions.allow` /
        // `ask` / `deny` in `settings.json` are the same kind of list on the same
        // grounds — `deny` and `ask` were not named by the user and are included
        // BY NAME here because they are answers to the same prompt; everything
        // else under `permissions`, `defaultMode` first among them, stays the
        // fleet's, and MCP server definitions never promote at all.
        ownership: {
            '.claude.json': {
                default: 'ignore',
                keys: { oauthAccount: 'slot', userID: 'slot', mcpServers: 'fleet' },
                entries: {
                    projects: {
                        default: 'ignore',
                        keys: {
                            allowedTools: 'merge', hasTrustDialogAccepted: 'fleet', mcpServers: 'fleet',
                            enabledMcpjsonServers: 'fleet', disabledMcpjsonServers: 'fleet',
                            mcpContextUris: 'fleet', hasClaudeMdExternalIncludesApproved: 'fleet'
                        }
                    }
                }
            },
            // ‼️ THE BEHAVIOUR FILE IS CARRIED WHOLE (`carryFiles`) EXCEPT FOR
            // THIS ONE SUB-OBJECT. `carry` renders the fleet's file over the
            // slot's, which is right for a model or an effort and is exactly
            // what deletes an approval. Naming `permissions` here makes the
            // carry clause leave it alone (`otherClauseOwns`) and hands it to
            // the three-way merge instead — one fact, one clause (ONE SUBJECT).
            'settings.json': {
                default: 'ignore',
                keys: {},
                nested: {
                    permissions: { default: 'fleet', keys: { allow: 'merge', ask: 'merge', deny: 'merge' } }
                }
            }
        },
        /**
         * The live wire is the `hooks` block inside the carried `settings.json`,
         * re-pointed at the live port AFTER the carry has rendered the file
         * (the X-269 order, kept by clause order). The fleet's own file is the
         * hooks installer's, not this — hence no `fleet`.
         */
        liveWire: {
            owns: { file: 'settings.json', keys: ['hooks'] },
            read: ctx => hooksAreCurrent(path.join(ctx.dir, 'settings.json'), ctx.hooksPort)
                ? { ok: true, detail: `hooks current on :${ctx.hooksPort}` }
                : { ok: false, detail: `hooks missing or stale in settings.json (port ${ctx.hooksPort})` },
            repair: (ctx, dryRun) => {
                if (dryRun) { return { wrote: true }; }
                const userFile = path.join(ctx.home, liveSource('claude', 'settings.json'));
                const rows = syncHooksToAccounts(userFile, [path.join(ctx.dir, 'settings.json')], ctx.hooksPort);
                return { wrote: rows.length > 0 };
            },
            // Installed by us, so the set is the installer's own (X-297).
            events: () => ALL_HOOK_EVENTS
        },
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
        support: 'measured',
        configEnv: 'CODEX_HOME',
        ownFiles: ['auth.json'],
        grantFiles: ['auth.json'],
        /**
         * ‼️ X-279 — THE BEHAVIOUR FILES, AND WHY A CODEX SLOT HAD NEITHER.
         *
         * `config.toml` is this engine's `settings.json`: the model, the
         * reasoning effort, every MCP server and every enabled plugin. A slot
         * without it starts a session on the engine's defaults — a different
         * assistant than the one the user configured — and nothing said so.
         *
         * `hooks.json` is the live wire. It posts to Agent Farm's own event
         * port, so a slot without it is the X-265 deafness again on the other
         * engine: measured 2026-09-13, `codex-murposta` held `auth.json` and
         * one junction and the contract called it COMPLETE, because the
         * adapter declared nothing for the contract to ask about.
         *
         * ‼️ X-295 — CARRYING THE WIRE IS NOT ENOUGH; IT MUST BE TRUSTED WHERE
         * IT LANDS. Codex refuses to run a hook without a persisted trust
         * record, and that record lives in `config.toml` keyed by the hook
         * file's path AS CODEX RESOLVES IT (`[hooks.state.'D:\…\hooks.json:stop:0:0']`
         * + `trusted_hash`). The fleet's records name the fleet's file, so a
         * verbatim copy trusts nothing in the slot — and, measured 2026-09-13,
         * the fleet's own records named a path Codex no longer resolved to and
         * a hash an older Codex had computed: not one Codex event had reached
         * the timeline from anywhere. So `config.toml` is PROJECTED: the fleet's
         * bytes, with every hook of the fleet's `hooks.json` trusted under this
         * directory's own path (`core/codexHooks`), and `hooks` reads the wire
         * back the way `codex app-server` → `hooks/list` would. Writing that
         * trust unasked is the user's decision (2026-09-13): the hook file is
         * theirs, carried byte for byte, and a prompt at every slot's first
         * run was the thing they refused.
         *
         * ‼️ NEITHER IS JSON-MERGED. Codex keeps no fleet guarantee and no
         * key-level owner here, so `hooks.json` is carried whole and
         * `config.toml` is the fleet's text plus its own trust — which is also
         * the only way a TOML file survives the trip.
         */
        carryFiles: ['config.toml', 'hooks.json'],
        carryProject: {
            'config.toml': (source, have, ctx) => {
                const src = path.join(ctx.home, liveSource('codex', 'hooks.json'));
                const hooks = ctx.fs.existsSync(src) ? ctx.fs.readFileSync(src, 'utf8') : undefined;
                return codexTrustProjection(source, have, hooks, path.join(ctx.realDir, 'hooks.json'));
            }
        },
        /**
         * The wire in a directory is live when `hooks.json` is there, every
         * command hook in it is trusted under this directory's path in
         * `config.toml`, and the commands post to the live port.
         *
         * ‼️ X-298 — IN THE FLEET'S DIRECTORY THE FILE IS ALSO WRITTEN HERE, event
         * by event and only over hooks carrying our own marker. A slot is not
         * written: it holds the fleet's bytes by carry, and `signFleetWires` runs
         * before the slots are projected, so what a slot copies is already right.
         */
        liveWire: {
            fleet: true,
            read: ctx => {
                const hooksFile = path.join(ctx.dir, 'hooks.json');
                if (ctx.fleet) {
                    const have = ctx.fs.existsSync(hooksFile) ? ctx.fs.readFileSync(hooksFile, 'utf8') : '';
                    if (!codexHooksReadable(have)) {
                        return { ok: false, detail: 'hooks.json is not valid JSON — fix or remove it first' };
                    }
                    if (!codexHooksCurrent(have, codexHookCommand(ctx.hooksPort))) {
                        return {
                            ok: false,
                            detail: have.trim()
                                ? `hooks.json does not post every fleet event to :${ctx.hooksPort}`
                                : 'no hooks.json — the fleet has not written Codex a live wire yet'
                        };
                    }
                }
                if (!ctx.fs.existsSync(hooksFile)) {
                    return ctx.fs.existsSync(path.join(ctx.home, liveSource('codex', 'hooks.json')))
                        ? { ok: false, detail: 'hooks.json missing — no live wire' }
                        : { ok: true, detail: 'no hooks.json on either side — Codex has no live wire on this machine' };
                }
                const entries = codexHookEntries(ctx.fs.readFileSync(hooksFile, 'utf8'), path.join(ctx.realDir, 'hooks.json'));
                if (!entries.length) { return { ok: true, detail: 'hooks.json names no command hooks — nothing to trust' }; }
                const cfg = path.join(ctx.dir, 'config.toml');
                const ledger = codexTrustLedger(ctx.fs.existsSync(cfg) ? ctx.fs.readFileSync(cfg, 'utf8') : '');
                const untrusted = entries.filter(e => ledger.get(e.key) !== e.hash);
                if (untrusted.length) {
                    return { ok: false, detail: `${untrusted.length} of ${entries.length} hooks untrusted in config.toml — ${untrusted.map(e => e.event).join(', ')}` };
                }
                const ports = [...new Set(entries.map(e => codexHookPort(e.command)).filter((p): p is number => p !== undefined))];
                const wrong = ports.filter(p => p !== ctx.hooksPort);
                if (wrong.length) {
                    return { ok: false, detail: `${entries.length} hooks trusted but the wire names :${wrong.join(', :')} — the live port is :${ctx.hooksPort}; this directory carries the fleet's file, and that is where it is repaired` };
                }
                return { ok: true, detail: `${entries.length} hooks trusted for this directory, wire on :${ctx.hooksPort}` };
            },
            repair: (ctx, dryRun) => {
                const cfg = path.join(ctx.dir, 'config.toml');
                const hooksFile = path.join(ctx.dir, 'hooks.json');
                let wroteWire = false;
                if (ctx.fleet) {
                    const had = ctx.fs.existsSync(hooksFile) ? ctx.fs.readFileSync(hooksFile, 'utf8') : '';
                    if (!codexHooksReadable(had)) {
                        return { wrote: false, error: 'hooks.json is not valid JSON — fix or remove it first' };
                    }
                    const wire = upsertCodexHooks(had, codexHookCommand(ctx.hooksPort));
                    if (wire !== had) {
                        if (!dryRun) {
                            try {
                                ctx.fs.mkdirSync(ctx.dir, { recursive: true });
                                // the file was the user's before it was ours: keep the first one they wrote
                                const bak = hooksFile + '.agentfarm-bak';
                                if (had && !ctx.fs.existsSync(bak)) { ctx.fs.writeFileSync(bak, had, 'utf8'); }
                                ctx.fs.writeFileSync(hooksFile, wire, 'utf8');
                            } catch (e) { return { wrote: false, error: String((e as Error)?.message ?? e) }; }
                        }
                        wroteWire = true;
                    }
                }
                const have = ctx.fs.existsSync(cfg) ? ctx.fs.readFileSync(cfg, 'utf8') : '';
                const hooks = ctx.fs.existsSync(hooksFile) ? ctx.fs.readFileSync(hooksFile, 'utf8') : undefined;
                const want = codexTrustProjection(have, have, hooks, path.join(ctx.realDir, 'hooks.json'));
                if (want === have) { return { wrote: wroteWire }; }
                if (!dryRun) {
                    try {
                        ctx.fs.mkdirSync(ctx.dir, { recursive: true });
                        ctx.fs.writeFileSync(cfg, want, 'utf8');
                    } catch (e) { return { wrote: false, error: String((e as Error)?.message ?? e) }; }
                }
                return { wrote: true };
            },
            // The file is the user's, so the set is whatever THEY wired (X-297):
            // measured on this machine, seven events with no `SessionEnd` among
            // them — which is why the mirror is still the thing that ends a
            // Codex lane.
            events: ctx => {
                const f = path.join(ctx.dir, 'hooks.json');
                if (!ctx.fs.existsSync(f)) { return []; }
                try {
                    const j = JSON.parse(ctx.fs.readFileSync(f, 'utf8')) as { hooks?: Record<string, unknown> };
                    return Object.keys(j.hooks ?? {});
                } catch { return []; }
            }
        },
        /**
         * ‼️ `skills` AND `plugins` ARE CONTENT, NOT IDENTITY — X-273 settled
         * that for Claude on the same day and the argument is the engine's, not
         * Claude's: what the user installed once belongs to the fleet, so
         * copying it would fork the library per sign-in and let a slot fall
         * behind an install it never heard about.
         */
        sharedPaths: ['sessions', 'skills', 'plugins'],
        liveDir: '.codex',
        evidence: 'Measured on this machine 2026-09-13 against codex-cli 0.149.0 (which IS installed, '
            + 'contrary to what this line said while it was unproven): pointed at an empty directory, '
            + '`codex login status` answered "Not logged in" with the main ~/.codex signed in, and wrote '
            + 'only its own scratch helpers (tmp/arg0) there.',
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
        grantFiles: ['oauth_creds.json'],
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
        grantFiles: ['opencode/auth.json'],
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

/**
 * ‼️ X-275 — HOW LONG THIS SIGN-IN HAS LEFT, AND WHY SIGNING IN ELSEWHERE DID
 * NOT HELP IT.
 *
 * `health` is a verdict on the present tense and says nothing until the moment
 * it is already too late: a slot reads `ready` right up to the hour its refresh
 * token dies and `needs-signin` the hour after, with no warning in between.
 * MEASURED on this machine 2026-09-14: a Claude refresh token is issued for
 * ~30 days (the four credentials on disk had 18.5 · 20.5 · 21.3 · 27.4 days
 * left), while the access token beside it lasts hours and is renewed over HTTP
 * without anyone noticing. So the only clock that ever needs a person is the
 * slow one, and it is the one nothing was reading.
 *
 * ‼️ AND THE SECOND HALF IS THE ONE THE USER ACTUALLY ASKED: a slot's sign-in
 * is its OWN credential, not a view of the machine's. Signing in through the
 * browser or `/login` writes `~/.claude/.credentials.json` and leaves every
 * slot exactly as dead as it was. That is not a fault to repair — it is what
 * isolation MEANS — but it is invisible, so a person renews the machine's
 * sign-in, sees the slot unchanged, and concludes the fleet is broken.
 * `liveIsSame` is what lets a surface say it out loud.
 *
 * ‼️ AND IT IS NOT AN OFFER TO COPY THE LIVE CREDENTIAL OVER. An OAuth refresh
 * ROTATES the refresh token, so one grant in two directories is two copies
 * racing to invalidate each other — the slot would work until the machine's
 * own install refreshed, then die again with no new information. The cure
 * stays what X-219 built: renew THIS slot, in its own directory.
 */
export type SigninState = 'ready' | 'expiring' | 'needs-signin' | 'unreadable';

export interface SigninOutlook {
    state: SigninState;
    /** epoch ms the refresh token dies; 0 when the grant states no expiry */
    refreshExpiresAt: number;
    /** whole hours left on it; -1 when the grant states no expiry */
    hoursLeft: number;
    /** the engine's sign-in on this machine is THIS SAME account */
    liveIsSame: boolean;
    /** and what that machine-wide sign-in's own health is */
    liveHealth: SlotHealth;
}

/** A quarter of the ~30 days a grant is issued for — long enough to act on. */
export const SIGNIN_WARN_MS = 7 * 24 * 3600e3;

export function signinOutlook(
    id: AccountIdentity,
    live?: AccountIdentity,
    now = Date.now(),
    warnMs = SIGNIN_WARN_MS
): SigninOutlook {
    const at = num(id.refreshExpiresAt);
    const left = at ? at - now : 0;
    const state: SigninState = id.health === 'unreadable' ? 'unreadable'
        : id.health === 'needs-signin' ? 'needs-signin'
            : at && left <= warnMs ? 'expiring'
                : 'ready';
    // Two accounts are the same account when the provider says so; a folder
    // name never is (X-282), and an address can be missing on engines that
    // record none, so an empty uuid matches nothing rather than everything.
    const uuid = (id.accountUuid || '').trim();
    const liveUuid = (live && live.accountUuid || '').trim();
    return {
        state,
        refreshExpiresAt: at,
        hoursLeft: at ? Math.floor(left / 3600e3) : -1,
        liveIsSame: !!uuid && uuid === liveUuid,
        liveHealth: live ? live.health : 'unreadable'
    };
}
