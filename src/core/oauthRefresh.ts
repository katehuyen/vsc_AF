import * as fs from 'fs';
import * as https from 'https';
import { writeAtomicSync } from './atomicFile';

/**
 * X-204 — AN EXPIRED ACCESS TOKEN IS NOT A SIGNED-OUT ACCOUNT.
 *
 * `engineAccounts.readClaudeIdentity` has said this since it was written, and
 * the usage reader did not listen: a 401 from the usage endpoint was recorded
 * as `expired`, `slotIsUsable` refuses an expired slot, and a healthy account
 * whose access token had simply aged out of its few hours was dropped out of
 * the fleet and reported to the user as needing a browser. Two modules, one
 * question, two answers — and the wrong one was the one that decided whether a
 * session could start.
 *
 * The grant has two halves and only one of them is short-lived:
 *
 *   - `accessToken` — hours. Its death is routine and costs one HTTP call.
 *   - `refreshToken` — weeks. Its death is the only one a person can fix.
 *
 * So this module does what the CLI does in the same directory: exchange the
 * refresh token for a new access token and write the credentials back. The
 * endpoint, the client id and the body shape are READ OUT OF THE INSTALLED CLI
 * rather than invented — see the constants below.
 *
 * ‼️ AND A REFRESH IS NOT A READ. MEASURED against the live endpoint on
 * 2026-09-05, and it cost an account to learn: Anthropic ROTATES the refresh
 * token on every exchange and REVOKES the access token that was in force.
 * Two consequences run through this whole file and the one that calls it:
 *
 *   1. **The answer must never be lost.** A rotation whose result is not stored
 *      leaves the directory holding a refresh token the server has already
 *      thrown away — `invalid_grant`, and only a person with a browser can undo
 *      it. So the exchange is written to a sidecar BEFORE the real file is
 *      replaced, and a sidecar found on the next read is adopted. A crash, a
 *      locked file or a killed window costs a rename, never the account.
 *   2. **A refresh is felt by whoever is using the slot.** The running CLI's
 *      access token stops working the instant we exchange. So the caller must
 *      not refresh a slot that has a session on it — see `busy` in
 *      `accountUsage`. This module refuses nobody; it is not the one that knows.
 *
 * ‼️ THE FILE IS RE-READ IMMEDIATELY BEFORE THE EXCHANGE, and a token that is
 * already live is used as it stands. The common case — a CLI session in the
 * slot refreshed a second ago — then costs no request and no rotation at all.
 */

/** Claude Code's own token endpoint. */
export const TOKEN_HOST = 'platform.claude.com';
export const TOKEN_PATH = '/v1/oauth/token';
/** Claude Code's public OAuth client id, read from the installed CLI binary. */
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
/** A token with less than this left is treated as already gone: a request that
 *  takes two seconds must not be started with one second of life in hand. */
export const EXPIRY_SKEW_MS = 60_000;

/** The stored grant, as Claude Code writes it under `claudeAiOauth`. */
export interface StoredGrant {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    refreshTokenExpiresAt: number;
    scopes: string[];
}

/** What should be done with a grant, decided before anything is spent. Pure. */
export type RefreshPlan =
    | { kind: 'live'; token: string }
    | { kind: 'exchange'; refreshToken: string; scopes: string[] }
    | { kind: 'no-grant'; reason: string }
    | { kind: 'dead'; reason: string };

/** How the whole operation ended. */
export type RefreshOutcome =
    /** the stored token was (or had become) good; nothing was spent */
    | { kind: 'live'; token: string }
    /** a new access token was minted and written back */
    | { kind: 'refreshed'; token: string }
    /** only a person can fix this — the refresh grant itself is gone */
    | { kind: 'rejected'; reason: string }
    /** this machine's problem, not the account's — the slot is still usable */
    | { kind: 'unavailable'; reason: string };

function num(v: unknown): number {
    return typeof v === 'number' && isFinite(v) ? v : 0;
}

/** Pull the grant out of a parsed credentials file. Pure. */
export function grantOf(parsed: unknown): StoredGrant | undefined {
    const o = (parsed as { claudeAiOauth?: Record<string, unknown> })?.claudeAiOauth;
    if (!o || typeof o.accessToken !== 'string' || !o.accessToken.trim()) { return undefined; }
    return {
        accessToken: o.accessToken.trim(),
        refreshToken: typeof o.refreshToken === 'string' ? o.refreshToken.trim() : '',
        expiresAt: num(o.expiresAt),
        refreshTokenExpiresAt: num(o.refreshTokenExpiresAt),
        scopes: Array.isArray(o.scopes) ? o.scopes.filter(s => typeof s === 'string') as string[] : []
    };
}

/**
 * Decide what a stored grant deserves. Pure, so the rule can be tested without
 * a disk or a network.
 *
 * ‼️ A MISSING `refreshTokenExpiresAt` IS TREATED AS STILL GOOD, matching
 * `readClaudeIdentity`: some grants do not carry one, and refusing an account
 * because a field is absent invents a fault out of silence.
 */
export function planRefresh(
    grant: StoredGrant | undefined, now: number, skewMs = EXPIRY_SKEW_MS
): RefreshPlan {
    if (!grant) { return { kind: 'no-grant', reason: 'no OAuth sign-in is stored in this directory' }; }
    if (grant.expiresAt && grant.expiresAt > now + skewMs) {
        return { kind: 'live', token: grant.accessToken };
    }
    if (!grant.refreshToken) {
        return { kind: 'dead', reason: 'the stored sign-in carries no refresh token' };
    }
    if (grant.refreshTokenExpiresAt && grant.refreshTokenExpiresAt <= now) {
        return { kind: 'dead', reason: 'the refresh token expired on ' + new Date(grant.refreshTokenExpiresAt).toISOString().slice(0, 10) };
    }
    return { kind: 'exchange', refreshToken: grant.refreshToken, scopes: grant.scopes };
}

/** The endpoint's answer, as the CLI reads it. */
export interface TokenPayload {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    refresh_token_expires_in?: unknown;
    scope?: unknown;
}

/**
 * Fold a token response into the stored credentials. Pure.
 *
 * ‼️ EVERY FIELD THIS SIDE DOES NOT UNDERSTAND SURVIVES — `subscriptionType`,
 * `rateLimitTier` and whatever the CLI adds next. The file belongs to Claude
 * Code; we are replacing four values in it, not rewriting it.
 *
 * ‼️ AND AN ABSENT `refresh_token` KEEPS THE OLD ONE, which is what the CLI
 * does: the server rotates it only sometimes, and treating silence as deletion
 * would throw away the only credential a person cannot re-mint.
 */
export function applyRefresh(
    file: Record<string, unknown>, payload: TokenPayload, now: number
): { file: Record<string, unknown>; token: string } | undefined {
    const token = typeof payload.access_token === 'string' ? payload.access_token.trim() : '';
    if (!token) { return undefined; }
    const prev = (file.claudeAiOauth as Record<string, unknown>) ?? {};
    const next: Record<string, unknown> = { ...prev, accessToken: token };
    if (typeof payload.refresh_token === 'string' && payload.refresh_token.trim()) {
        next.refreshToken = payload.refresh_token.trim();
    }
    if (typeof payload.expires_in === 'number' && isFinite(payload.expires_in)) {
        next.expiresAt = now + Math.round(payload.expires_in * 1000);
    }
    if (typeof payload.refresh_token_expires_in === 'number' && isFinite(payload.refresh_token_expires_in)) {
        next.refreshTokenExpiresAt = now + Math.round(payload.refresh_token_expires_in * 1000);
    }
    if (typeof payload.scope === 'string' && payload.scope.trim()) {
        next.scopes = payload.scope.trim().split(/\s+/);
    }
    return { file: { ...file, claudeAiOauth: next }, token };
}

/** The raw POST. Rejects only on transport failure; HTTP status is returned. */
export function postRefresh(
    refreshToken: string, scopes: string[], timeoutMs = 15_000
): Promise<{ status: number; body: string }> {
    const body = JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        scope: scopes.join(' ')
    });
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: TOKEN_HOST,
            path: TOKEN_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', c => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timed out')); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Where a rotated grant is parked between being minted and being stored.
 *
 * ‼️ NOT A BACKUP — A HAND-OFF. The value in it is the ONLY copy of a credential
 * the server has already switched to; the file it is going to still holds the
 * one that no longer works. Anything that finds it is holding the newer truth.
 */
export function sidecarPath(file: string): string { return `${file}.rotated.json`; }

/** The doors this needs on the outside world, so a test can hand it fakes. */
export interface RefreshDeps {
    readFile?(file: string): string;
    writeFile?(file: string, content: string): { ok: boolean; error?: string };
    /** plain write, no rename — the sidecar is a new file nobody else opens */
    writePlain?(file: string, content: string): void;
    exists?(file: string): boolean;
    remove?(file: string): void;
    post?(refreshToken: string, scopes: string[]): Promise<{ status: number; body: string }>;
    now?(): number;
}

/**
 * Make sure the credentials in `file` carry a usable access token, refreshing
 * them in place when they do not.
 *
 * The four outcomes are deliberately not two: "this machine could not reach the
 * endpoint" and "Anthropic threw the grant away" look the same to a caller that
 * only asks whether it worked, and only one of them is worth telling a user
 * about.
 */
export async function ensureAccessToken(
    file: string, deps: RefreshDeps = {}
): Promise<RefreshOutcome> {
    const readFile = deps.readFile ?? ((f: string) => fs.readFileSync(f, 'utf8'));
    const writeFile = deps.writeFile
        ?? ((f: string, c: string) => writeAtomicSync(f, c));
    const writePlain = deps.writePlain ?? ((f: string, c: string) => { fs.writeFileSync(f, c, 'utf8'); });
    const exists = deps.exists ?? ((f: string) => fs.existsSync(f));
    const remove = deps.remove ?? ((f: string) => { try { fs.unlinkSync(f); } catch { /* best effort */ } });
    const post = deps.post ?? postRefresh;
    const now = (deps.now ?? Date.now)();
    const side = sidecarPath(file);

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(readFile(file).replace(/^﻿/, '')) as Record<string, unknown>;
    } catch (e) {
        return { kind: 'unavailable', reason: `the credentials file could not be read (${String((e as Error)?.message ?? e).slice(0, 80)})` };
    }

    // ‼️ A SIDECAR IS ALWAYS NEWER THAN THE FILE IT SITS NEXT TO. It exists only
    // because a rotation was minted and the replacement did not land, so the
    // credentials on disk are already dead. Adopting it is the recovery, and it
    // happens before anything else is decided.
    if (exists(side)) {
        try {
            const rotated = JSON.parse(readFile(side).replace(/^﻿/, '')) as Record<string, unknown>;
            const g = grantOf(rotated);
            if (g) {
                parsed = rotated;
                if (writeFile(file, JSON.stringify(rotated, null, 2) + '\n').ok) { remove(side); }
            } else {
                remove(side);
            }
        } catch {
            // Unreadable litter, not a credential. Leave it: deleting a file we
            // could not parse is how a recoverable grant gets thrown away.
        }
    }

    const plan = planRefresh(grantOf(parsed), now);
    if (plan.kind === 'live') { return { kind: 'live', token: plan.token }; }
    if (plan.kind === 'no-grant' || plan.kind === 'dead') {
        return { kind: 'rejected', reason: plan.reason };
    }

    let res: { status: number; body: string };
    try {
        res = await post(plan.refreshToken, plan.scopes);
    } catch (e) {
        return { kind: 'unavailable', reason: `the token endpoint could not be reached (${String((e as Error)?.message ?? e).slice(0, 80)})` };
    }
    // ‼️ 400 and 401 are the server saying the GRANT is gone — the one answer
    // that a person has to act on. Everything else is weather.
    if (res.status === 400 || res.status === 401) {
        return { kind: 'rejected', reason: 'Anthropic refused the stored refresh token' };
    }
    if (res.status !== 200) {
        return { kind: 'unavailable', reason: `the token endpoint returned HTTP ${res.status}` };
    }
    let payload: TokenPayload;
    try {
        payload = JSON.parse(res.body) as TokenPayload;
    } catch {
        return { kind: 'unavailable', reason: 'the token endpoint returned something that is not JSON' };
    }
    const merged = applyRefresh(parsed, payload, now);
    if (!merged) {
        return { kind: 'unavailable', reason: 'the token endpoint returned no access token' };
    }
    // ‼️ THE SIDECAR GOES DOWN FIRST, AND THAT ORDER IS THE WHOLE PROTOCOL.
    // The moment the exchange returned, the credentials still on disk became
    // dead — the server rotated them. Between here and a successful rename
    // there is a window in which the only live grant this machine has exists in
    // memory, and a locked file, a crashed window or a closed laptop inside
    // that window costs the account. Writing a brand new file nobody else has
    // open closes the window; the rename can then fail as often as it likes.
    const body = JSON.stringify(merged.file, null, 2) + '\n';
    try { writePlain(side, body); } catch { /* the rename below is still worth trying */ }
    if (writeFile(file, body).ok) { remove(side); }
    return { kind: 'refreshed', token: merged.token };
}
