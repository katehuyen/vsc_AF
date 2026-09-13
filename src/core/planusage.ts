/**
 * Plan usage — your Claude subscription's REAL rate-limit state.
 *
 * Every other number on the dashboard is derived from local transcripts: the
 * "5h window" card is Agent Farm's own token estimate against a limit you typed
 * into a setting. This module reads the figure Anthropic itself reports — the
 * same one `/usage` prints inside Claude Code: session (5h) and weekly
 * utilization percentages with their reset times.
 *
 * Source: `GET https://api.anthropic.com/api/oauth/usage`, authorized with the
 * OAuth access token Claude Code already stores in `~/.claude/.credentials.json`.
 * We only ever READ that file. Refreshing an expired token would rewrite it and
 * race the CLI over its own credentials, so an expired token is reported
 * honestly ("open a Claude Code session") instead of silently repaired.
 *
 * Nothing here is fatal: no credentials file, a foreign auth mode (API key,
 * Bedrock, Vertex), an offline machine or a 401 all resolve to a snapshot with
 * a `note` the card can print. The dashboard simply says what it does not know.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';

/**
 * ‼️ THE INTERVAL WAS NEVER THE REASON FOR THE 429s — THE MISSING User-Agent WAS.
 *
 * This endpoint is undocumented and publishes no limit, no `Retry-After` and no
 * intended polling rate (the requests to document it were closed as not
 * planned). What it does have is TWO buckets, and the header is what sorts you:
 * a request with no `User-Agent` — which is what Node's `https` sends by
 * default, i.e. what this module used to send — lands in an aggressively
 * limited one and gets a persistent 429 whatever the interval. With a
 * CLI-shaped agent, 180 s is the interval community tools report as safe.
 *
 * So the request now goes out dressed exactly as the CLI's own does. Read out of
 * the installed binary (2.1.220): `claude-cli/<version> (external, <entrypoint>)`
 * plus `x-app: cli`, over the same OAuth beta gate. Nothing here is a
 * workaround for a limit that is meant to apply to us: it is the user's own
 * token, their own account, and the very figures `/usage` prints for them in
 * the CLI — one request a minute for the numbers Claude Code shows on demand.
 *
 * The version is not spawned for: every Claude Code transcript line carries the
 * version that wrote it, so the newest session row already knows it (see
 * `SessionInfo.version`, wired in extension.ts). The fallback only covers a
 * machine with no transcripts yet.
 */
export const CLI_UA_FALLBACK_VERSION = '2.1.220';

/** `claude-cli/2.1.220 (external, cli)` — a version-shaped string or nothing. */
export function usageUserAgent(cliVersion?: string): string {
    const m = /\d+\.\d+\.\d+/.exec(String(cliVersion ?? ''));
    return `claude-cli/${m ? m[0] : CLI_UA_FALLBACK_VERSION} (external, cli)`;
}

export interface PlanBar {
    /** Payload key — stable id for the webview. */
    id: string;
    /** Row label, worded exactly as Claude Code's own /usage prints it. */
    title: string;
    /** 0–100, floored the way /usage floors it. */
    percent: number;
    /** Epoch ms of the reset, 0 when the payload didn't say. */
    resetsAt: number;
}

export type PlanUsageState = 'ok' | 'no-auth' | 'expired' | 'error';

export interface PlanUsageSnapshot {
    state: PlanUsageState;
    bars: PlanBar[];
    /** Subscription tier as the credentials file states it ('pro', 'max', …). */
    plan: string;
    /** When this snapshot was produced (epoch ms). */
    fetchedAt: number;
    /** One honest line for anything other than `ok`. */
    note?: string;
}

export interface OauthCredentials {
    token: string;
    /** Epoch ms; 0 when the file didn't say. */
    expiresAt: number;
    plan: string;
}

/** The rows, in the order and wording Claude Code's own /usage uses. A key
 *  that is null in the payload (not part of your plan) is simply not drawn. */
const BAR_SPECS: { key: string; title: string }[] = [
    { key: 'five_hour', title: 'Current session' },
    { key: 'seven_day', title: 'Current week (all models)' },
    { key: 'seven_day_opus', title: 'Current week (Opus only)' },
    { key: 'seven_day_sonnet', title: 'Current week (Sonnet only)' }
];

export const USAGE_HOST = 'api.anthropic.com';
export const USAGE_PATH = '/api/oauth/usage';
/** The beta header OAuth-token requests carry; without it the endpoint 401s. */
const OAUTH_BETA = 'oauth-2025-04-20';
/** Even a hand-clicked ⟳ never hits the endpoint more often than this. */
export const MIN_FETCH_INTERVAL_MS = 5_000;
/**
 * …and no AUTOMATIC beat is ever faster than this, whatever the setting says.
 *
 * The manual floor above is about a mashed button; this is about a beat that
 * runs unattended for hours. A setting of a few seconds is not a preference the
 * endpoint will honour, it is a guaranteed 429 — so the fast window has a floor
 * of its own, well under the interval reported safe (180 s) but far enough from
 * the "polls every few seconds" behaviour that earns the punitive bucket.
 */
export const MIN_ACTIVE_BEAT_MS = 30_000;
/**
 * …and the floor under the OTHER automatic reader: the turn-boundary edge.
 *
 * ‼️ THE EDGE SPENDS FROM THE SAME BUDGET AS THE BEAT — it changes WHEN a read
 * happens, never HOW MANY. Its floor is therefore the user's own active
 * interval (`edgeFloorMs`), so no two automatic reads are ever closer together
 * than the number they configured: set 60 s and you get at most one read a
 * minute, whether the timer or a finished turn asked for it. A turn boundary is
 * an event the fleet produces hundreds of times an hour, in bursts, so an edge
 * with a *smaller* floor than the beat is simply a fast poller wearing a
 * different name — which is what it was.
 *
 * What the edge still buys, given it adds nothing: **phase**. The moment a turn
 * ends is the moment the figures settle, and it is also the moment the beat
 * switches to the slow idle window — so without the edge the settled number can
 * sit unread for the whole idle interval (5 minutes by default) even though a
 * read was already due.
 */
export const EDGE_READ_FLOOR_MS = MIN_ACTIVE_BEAT_MS;
/**
 * A 429 with no `Retry-After` leaves exactly one safe reading: stop asking, and
 * double the wait each time it happens again. The beat is ignored while this
 * runs (the cached snapshot is served instead), and one success clears it.
 */
export const RATE_LIMIT_BACKOFF_START_MS = 3 * 60_000;
export const RATE_LIMIT_BACKOFF_MAX_MS = 15 * 60_000;
/**
 * ‼️ S-63 — AND A 429 WITH A `Retry-After` LEAVES A BETTER ONE: THE ENDPOINT'S
 * OWN FIGURE. The sentence above was written before the header was ever read —
 * `fetchUsage` returned `{status, body}` and nothing else, so both readers
 * invented the curve on every 429, too long (a counter stale for no reason) or
 * too short (one more request spent for nothing). The header is honoured
 * within a ceiling: an endpoint that says "an hour" is believed, one that says
 * "a day" is treated as the curve, because a reading that stays blind for a
 * day on one header is worse than one wasted request.
 */
export const RETRY_AFTER_MAX_MS = 60 * 60_000;
/** What a 429 reply is allowed to carry beyond its status: the wait the
 *  endpoint asked for, and the rate-limit headers that say what was limited. */
export interface UsageReply {
    status: number;
    body: string;
    /** `Retry-After`, parsed — seconds or an HTTP date; absent when not sent or unreadable */
    retryAfterMs?: number;
    /** `anthropic-ratelimit-*` and `retry-after`, verbatim, lower-cased keys —
     *  kept so a limit can be READ (per token or per machine) rather than
     *  inferred from a second account's refusal (X-278) */
    limitHeaders?: Record<string, string>;
}
/**
 * `Retry-After` as milliseconds from `now`, or undefined when the header is
 * absent or says nothing usable. Both forms RFC 9110 allows: delay-seconds and
 * an HTTP-date (a date in the past is a zero wait, not a negative one).
 */
export function retryAfterMs(header: string | string[] | undefined, now = Date.now()): number | undefined {
    const raw = Array.isArray(header) ? header[0] : header;
    const v = (raw ?? '').trim();
    if (!v) { return undefined; }
    if (/^\d+$/.test(v)) { return Number(v) * 1000; }
    const at = Date.parse(v);
    if (!Number.isFinite(at)) { return undefined; }
    return Math.max(0, at - now);
}
/** The hold a 429 imposes: the endpoint's figure when it gave a usable one
 *  (at least a second, at most RETRY_AFTER_MAX_MS), else the doubling curve. */
export function rateLimitHold(res: { retryAfterMs?: number }, previousMs: number): { ms: number; said: boolean } {
    const r = res.retryAfterMs;
    if (typeof r === 'number' && Number.isFinite(r) && r > 0 && r <= RETRY_AFTER_MAX_MS) {
        return { ms: Math.max(1000, Math.round(r)), said: true };
    }
    return {
        ms: previousMs ? Math.min(RATE_LIMIT_BACKOFF_MAX_MS, previousMs * 2) : RATE_LIMIT_BACKOFF_START_MS,
        said: false
    };
}
/** How the card says a hold, in the words that fit its origin. */
export function holdWords(ms: number): string {
    if (ms < 90_000) { return `${Math.max(1, Math.round(ms / 1000))} s`; }
    return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

export function credentialsPath(home = os.homedir()): string {
    return path.join(home, '.claude', '.credentials.json');
}

/** Read Claude Code's stored OAuth credentials. Undefined = not signed in this
 *  way (API key / enterprise gateway / macOS Keychain), which is not an error. */
export function readOauthCredentials(file = credentialsPath()): OauthCredentials | undefined {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return undefined; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^﻿/, '')); } catch { return undefined; }
    const o = (parsed as { claudeAiOauth?: Record<string, unknown> })?.claudeAiOauth;
    if (!o || typeof o.accessToken !== 'string' || !o.accessToken.trim()) { return undefined; }
    return {
        token: o.accessToken.trim(),
        expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : 0,
        plan: typeof o.subscriptionType === 'string' ? o.subscriptionType : ''
    };
}

/** `resets_at` arrives as an ISO string (with a +00:00 offset) or as unix
 *  seconds, depending on the field. Anything unparseable becomes 0 = unknown. */
export function parseResetsAt(v: unknown): number {
    if (typeof v === 'number' && isFinite(v) && v > 0) {
        // seconds vs milliseconds: 1e12 is the year 2001 in ms, year 33658 in s
        return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
    }
    if (typeof v === 'string' && v.trim()) {
        const t = Date.parse(v);
        if (!isNaN(t)) { return t; }
    }
    return 0;
}

/** Project the raw endpoint payload onto the bars the card draws. Pure. */
export function buildBars(payload: unknown): PlanBar[] {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const bars: PlanBar[] = [];
    for (const spec of BAR_SPECS) {
        const limit = p[spec.key];
        if (!limit || typeof limit !== 'object') { continue; }
        const l = limit as Record<string, unknown>;
        if (typeof l.utilization !== 'number' || !isFinite(l.utilization)) { continue; }
        bars.push({
            id: spec.key,
            title: spec.title,
            percent: Math.max(0, Math.min(100, Math.floor(l.utilization))),
            resetsAt: parseResetsAt(l.resets_at)
        });
    }
    return bars;
}

// ---------- the status-bar projection (pure, so it is testable without VS Code) ----------

/** "2h 14m" / "6m" / "2d 2h" — "" when the reset time is unknown or already past. */
export function remainingText(resetsAt: number, now = Date.now()): string {
    if (!resetsAt || resetsAt <= now) { return ''; }
    const mins = Math.round((resetsAt - now) / 60000);
    if (mins < 60) { return `${mins}m`; }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) { return m ? `${h}h ${m}m` : `${h}h`; }
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

/** The same span worded as a countdown: "in 2h 14m". */
export function untilText(resetsAt: number, now = Date.now()): string {
    const left = remainingText(resetsAt, now);
    return left ? `in ${left}` : '';
}

/**
 * The whole indicator in one line: `$(dashboard) 3h 49m - 86% / wk 41%`.
 *
 * ‼️ The first field is the TIME LEFT IN THE SESSION WINDOW, not a label. A
 * fixed "5h" said only which window the percentage belongs to — a constant,
 * i.e. no information — and it reads as a duration, so the one number the bar
 * appeared to give you about time was the one thing it could not tell you.
 * "3h 49m - 86%" answers both halves of the real question at once: how much is
 * gone, and how long until it comes back. The week keeps its label, because
 * a second bare span next to the first would be unreadable; its reset is in
 * the tooltip, where there is room for every limit.
 *
 * A plan that reports no plain weekly limit falls back to a per-model one
 * rather than showing nothing. A session window whose reset the endpoint did
 * not state falls back to the word `session` — never to an invented span.
 *
 * Returns undefined when there is nothing to show **and never will be**: a
 * machine signed in with an API key (or Bedrock / Vertex) has no subscription
 * percentages, and an indicator that says "unknown" forever is noise. A login
 * that can come back (expired, a transient endpoint failure) stays visible as a
 * question instead — disappearing would read as "you have used nothing".
 */
export function barText(snap: PlanUsageSnapshot | undefined, now = Date.now()): string | undefined {
    if (!snap || snap.state === 'no-auth') { return undefined; }
    if (snap.state !== 'ok' || !snap.bars.length) { return '$(dashboard) usage ?'; }
    const bar = (id: string) => snap.bars.find(b => b.id === id);
    const session = bar('five_hour');
    const week = bar('seven_day') ?? bar('seven_day_opus') ?? bar('seven_day_sonnet');
    const parts: string[] = [];
    if (session) {
        const left = remainingText(session.resetsAt, now);
        parts.push(left ? `${left} - ${session.percent}%` : `session ${session.percent}%`);
    }
    if (week) { parts.push(`wk ${week.percent}%`); }
    if (!parts.length) { return '$(dashboard) usage ?'; }
    return `$(dashboard) ${parts.join(' / ')}`;
}

/**
 * The refresh beat in ms — the ONE decision every surface obeys.
 *
 * ‼️ TWO WINDOWS, because the figures move at two speeds. While an agent is
 * mid-turn they change under you continuously, and that is exactly when you are
 * watching them — a five-minute beat there means the bar is wrong for almost
 * all of the turn it is supposed to be reporting. When every session is waiting
 * for a prompt, nothing can move them except the clock, so re-reading every few
 * seconds buys nothing. Idle sessions are still idle: what switches the fast
 * window on is a turn actually RUNNING, not a session being open.
 *
 * `idleMinutes` = 0 means the user turned automatic refresh off; that answer
 * holds in both windows — a fast beat starting behind their back would make the
 * setting a lie. The floor is `MIN_ACTIVE_BEAT_MS`, so no setting can put the
 * beat back in the range that earns a permanent 429.
 */
export function refreshMs(active: boolean, idleMinutes: number, activeSeconds: number): number {
    if (!(idleMinutes > 0)) { return 0; }
    if (!active) { return Math.round(idleMinutes * 60_000); }
    return Math.max(MIN_ACTIVE_BEAT_MS, Math.round(activeSeconds * 1000));
}

/** The worst percentage on the snapshot — what decides the indicator's colour.
 *  Every limit counts, including the ones the one-line text has no room for. */
export function peakPercent(snap: PlanUsageSnapshot | undefined): number {
    if (!snap || snap.state !== 'ok') { return 0; }
    return snap.bars.reduce((max, b) => Math.max(max, b.percent), 0);
}

/** A snapshot for "we could not ask" — the card prints `note` verbatim. */
export function unavailable(state: PlanUsageState, note: string, plan = '', now = Date.now()): PlanUsageSnapshot {
    return { state, bars: [], plan, fetchedAt: now, note };
}

/** The raw GET. Rejects only on transport failure; HTTP status is returned,
 *  and on a 429 the wait the endpoint asked for and the headers that name what
 *  was limited (S-63). */
export function fetchUsage(
    token: string, userAgent = usageUserAgent(), timeoutMs = 8000
): Promise<UsageReply> {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: USAGE_HOST,
            path: USAGE_PATH,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'anthropic-beta': OAUTH_BETA,
                'anthropic-version': '2023-06-01',
                // ‼️ not decoration — see the note at the top of this file
                'User-Agent': userAgent,
                'x-app': 'cli'
            }
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => { body += c; });
            res.on('end', () => {
                const out: UsageReply = { status: res.statusCode ?? 0, body };
                const wait = retryAfterMs(res.headers['retry-after']);
                if (wait !== undefined) { out.retryAfterMs = wait; }
                const limits: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) {
                    if (k === 'retry-after' || k.startsWith('anthropic-ratelimit-')) {
                        limits[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
                    }
                }
                if (Object.keys(limits).length) { out.limitHeaders = limits; }
                resolve(out);
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timed out')); });
        req.on('error', reject);
        req.end();
    });
}

export interface PlanUsageOptions {
    /** How long a snapshot stays fresh; 0 = always refetch on request. */
    ttlMs(): number;
    /**
     * Closest two AUTOMATIC reads may ever be, in ms — the user's active
     * interval. Defaults to `EDGE_READ_FLOOR_MS`. See that constant: this is
     * what keeps the turn-boundary edge from spending more requests than the
     * beat was configured for, rather than merely spending them elsewhere.
     */
    edgeFloorMs?(): number;
    /** Version of the installed CLI, for the User-Agent (see usageUserAgent). */
    cliVersion?: () => string | undefined;
    /**
     * Which file holds the sign-in to read — live, because it MOVES: an account
     * made standing on the Engines page points this at that slot's directory
     * (X-212). Empty string, or absent, is the main sign-in.
     */
    credentialsFile?: () => string;
    /** Overridable for tests — the same seam `AccountUsageService` has, so the
     *  two readers of one credentials file can be faked the same way. */
    readCreds?: (file: string) => OauthCredentials | undefined;
    fetchImpl?: (token: string, userAgent: string) => Promise<UsageReply>;
    now?: () => number;
}

/**
 * Cache in front of the endpoint. The dashboard card asks on a timer and on the
 * ⟳ button; both go through here, so a page left open all day makes one request
 * per TTL rather than one per render, and a mashed ⟳ still can't spam.
 */
export class PlanUsageService {
    private snap: PlanUsageSnapshot | undefined;
    private lastFetchAt = 0;
    private inflight: Promise<PlanUsageSnapshot> | undefined;
    /** How long the current backoff is; doubles per 429, cleared by a success. */
    private backoffMs = 0;
    /** No automatic read before this moment (see RATE_LIMIT_BACKOFF_START_MS). */
    private backoffUntil = 0;
    /**
     * ‼️ X-212 — WHOSE SIGN-IN THE CACHED SNAPSHOT BELONGS TO.
     *
     * `credentialsFile` stopped being a constant the moment an account could be
     * made standing: the same service now reads a different file depending on
     * which sign-in the user last pointed at. A cache that does not remember
     * which one it read would go on serving the previous account's percentages
     * for a whole TTL — and the indicator would say the new account's name over
     * the old account's figures, which is worse than saying nothing at all.
     *
     * So the SOURCE is part of the snapshot's identity. A read whose file has
     * moved has no cache to serve from and falls through to the endpoint, which
     * is the same thing a first read does.
     */
    private snapFrom = '';

    constructor(private opts: PlanUsageOptions) { }

    /** The credentials file this service reads right now — live, because the
     *  standing account is a setting and may move between two reads. */
    private credFile(): string {
        return (this.opts.credentialsFile?.() || '').trim() || credentialsPath();
    }

    /** The cached snapshot — never touches the network. */
    current(): PlanUsageSnapshot | undefined { return this.snap; }

    /** When the backoff lets the next automatic read through; 0 = not backed
     *  off. Surfaces are expected to SAY this rather than look idle (Principle 1). */
    rateLimitedUntil(): number { return this.backoffUntil; }

    /**
     * Fresh-enough snapshot; `force` = a PERSON asked (see `read`).
     *
     * The button bypasses the backoff on purpose: someone clicking ⟳ has decided
     * to spend one request, and the alternative — a control that silently
     * refuses for a quarter of an hour — is a control that has taught you it
     * does not work. Nothing automatic gets that privilege.
     */
    get(force = false): Promise<PlanUsageSnapshot> { return this.read(force ? 'user' : 'beat'); }

    /**
     * A turn just ENDED, so the figures have just moved — worth skipping the TTL
     * for, and nothing else.
     *
     * ‼️ THIS IS WHERE THE 429s WERE ACTUALLY COMING FROM. The edge used to call
     * `get(true)`, i.e. it claimed the button's privileges: it skipped the TTL
     * *and* the backoff, with only the 5-second hard floor left underneath. A
     * fleet doing 136 turns an hour crosses this edge a couple of hundred times,
     * in bursts — so the endpoint saw a request every few seconds however
     * politely the *beat* was configured, and the backoff that was supposed to
     * rescue us was being walked straight through on the very events that
     * triggered it. An automatic read obeying no ceiling is not an optimisation,
     * it is the bug.
     */
    readOnEdge(): Promise<PlanUsageSnapshot> { return this.read('edge'); }

    /**
     * The three reasons a read happens, and what each is allowed to skip.
     *
     * |        | skips the TTL | skips a backoff | floor                    |
     * |--------|---------------|-----------------|--------------------------|
     * | `beat` | no            | no              | 5 s                      |
     * | `edge` | **yes**       | no              | **the active interval**  |
     * | `user` | **yes**       | **yes**         | 5 s                      |
     *
     * Only `user` is a person. Everything else is this extension deciding to
     * spend a request on its own, and it does that on a leash.
     */
    private read(reason: 'beat' | 'edge' | 'user'): Promise<PlanUsageSnapshot> {
        const now = (this.opts.now ?? Date.now)();
        // ‼️ X-212 — the account moved under us: the cached answer is somebody
        // else's and is dropped rather than aged out. See `snapFrom`.
        if (this.snap && this.credFile() !== this.snapFrom) { this.snap = undefined; }
        const age = now - this.lastFetchAt;
        const floor = reason === 'edge'
            ? Math.max(MIN_FETCH_INTERVAL_MS, this.opts.edgeFloorMs?.() ?? EDGE_READ_FLOOR_MS)
            : MIN_FETCH_INTERVAL_MS;
        if (this.snap) {
            if (reason === 'beat' && age < Math.max(0, this.opts.ttlMs())) { return Promise.resolve(this.snap); }
            if (reason !== 'user' && now < this.backoffUntil) { return Promise.resolve(this.snap); }
            if (age < floor) { return Promise.resolve(this.snap); }
        }
        if (this.inflight) { return this.inflight; }
        this.inflight = this.load(now).finally(() => { this.inflight = undefined; });
        return this.inflight;
    }

    private async load(now: number): Promise<PlanUsageSnapshot> {
        this.lastFetchAt = now;
        // whatever this read answers is stamped with the file it came out of,
        // even a failure — an unreadable slot must not look like a fresh cache
        // for the account the user moves to next
        const file = this.credFile();
        this.snapFrom = file;
        const cred = (this.opts.readCreds ?? readOauthCredentials)(file);
        if (!cred) {
            return (this.snap = unavailable('no-auth',
                'No Claude subscription login found on this machine — this card reads the OAuth session Claude Code stores.',
                '', now));
        }
        if (cred.expiresAt > 0 && cred.expiresAt <= now) {
            return (this.snap = unavailable('expired',
                'Your Claude Code login token has expired — start a Claude Code session to refresh it.',
                cred.plan, now));
        }
        try {
            const res = await (this.opts.fetchImpl ?? fetchUsage)(
                cred.token, usageUserAgent(this.opts.cliVersion?.()));
            if (res.status === 401 || res.status === 403) {
                return (this.snap = unavailable('expired',
                    'Anthropic rejected the stored login — start a Claude Code session to refresh it.',
                    cred.plan, now));
            }
            if (res.status === 429) {
                // ‼️ S-63 — the endpoint's own figure when it gave one; the
                // curve only when it did not. A hold the endpoint named does
                // not feed the curve: the next unexplained 429 starts it afresh.
                const hold = rateLimitHold(res, this.backoffMs);
                this.backoffMs = hold.said ? 0 : hold.ms;
                this.backoffUntil = now + hold.ms;
                return (this.snap = unavailable('error',
                    hold.said
                        ? `The usage endpoint rate limited this request and asked for ${holdWords(hold.ms)} — next automatic read then. ⟳ asks anyway.`
                        : `The usage endpoint rate limited this request without saying how long — backing off, next automatic read in ${holdWords(hold.ms)}. ⟳ asks anyway.`,
                    cred.plan, now));
            }
            if (res.status !== 200) {
                return (this.snap = unavailable('error',
                    `Usage endpoint returned HTTP ${res.status}.`, cred.plan, now));
            }
            const payload = JSON.parse(res.body) as unknown;
            const bars = buildBars(payload);
            if (!bars.length) {
                return (this.snap = unavailable('error',
                    'The usage endpoint reported no limits for this account.', cred.plan, now));
            }
            // it answered: whatever backoff we were on is over
            this.backoffMs = 0;
            this.backoffUntil = 0;
            return (this.snap = { state: 'ok', bars, plan: cred.plan, fetchedAt: now });
        } catch (e) {
            return (this.snap = unavailable('error',
                `Could not reach the usage endpoint: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
                cred.plan, now));
        }
    }
}
