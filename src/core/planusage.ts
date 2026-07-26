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

/** A snapshot for "we could not ask" — the card prints `note` verbatim. */
export function unavailable(state: PlanUsageState, note: string, plan = '', now = Date.now()): PlanUsageSnapshot {
    return { state, bars: [], plan, fetchedAt: now, note };
}

/** The raw GET. Rejects only on transport failure; HTTP status is returned. */
export function fetchUsage(token: string, timeoutMs = 8000): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: USAGE_HOST,
            path: USAGE_PATH,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'anthropic-beta': OAUTH_BETA,
                'anthropic-version': '2023-06-01'
            }
        }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timed out')); });
        req.on('error', reject);
        req.end();
    });
}

export interface PlanUsageOptions {
    /** How long a snapshot stays fresh; 0 = always refetch on request. */
    ttlMs(): number;
    /** Overridable for tests. */
    credentialsFile?: () => string;
    fetchImpl?: (token: string) => Promise<{ status: number; body: string }>;
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

    constructor(private opts: PlanUsageOptions) { }

    /** The cached snapshot — never touches the network. */
    current(): PlanUsageSnapshot | undefined { return this.snap; }

    /** Fresh-enough snapshot; `force` bypasses the TTL but not the hard floor. */
    async get(force = false): Promise<PlanUsageSnapshot> {
        const now = (this.opts.now ?? Date.now)();
        const age = now - this.lastFetchAt;
        if (this.snap && !force && age < Math.max(0, this.opts.ttlMs())) { return this.snap; }
        if (this.snap && age < MIN_FETCH_INTERVAL_MS) { return this.snap; }
        if (this.inflight) { return this.inflight; }
        this.inflight = this.load(now).finally(() => { this.inflight = undefined; });
        return this.inflight;
    }

    private async load(now: number): Promise<PlanUsageSnapshot> {
        this.lastFetchAt = now;
        const cred = (this.opts.credentialsFile
            ? readOauthCredentials(this.opts.credentialsFile())
            : readOauthCredentials());
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
            const res = await (this.opts.fetchImpl ?? fetchUsage)(cred.token);
            if (res.status === 401 || res.status === 403) {
                return (this.snap = unavailable('expired',
                    'Anthropic rejected the stored login — start a Claude Code session to refresh it.',
                    cred.plan, now));
            }
            if (res.status === 429) {
                return (this.snap = unavailable('error',
                    'The usage endpoint is rate limited right now — try again in a moment.',
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
            return (this.snap = { state: 'ok', bars, plan: cred.plan, fetchedAt: now });
        } catch (e) {
            return (this.snap = unavailable('error',
                `Could not reach the usage endpoint: ${String((e as Error)?.message ?? e).slice(0, 120)}`,
                cred.plan, now));
        }
    }
}
