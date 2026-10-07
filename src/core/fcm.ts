/**
 * X-451 — Firebase Cloud Messaging (HTTP v1) from a service account key, with
 * node's own crypto: a JWT signed RS256 is traded at the key's token_uri for an
 * access token, and that sends one data message per phone. The key lives in
 * Secrets under FCM_SECRET and only Agent Farm reads it (secrets.ts adopts the
 * name as farm-only).
 */
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';

export const FCM_SECRET = 'FCM_SERVICE_ACCOUNT_JSON';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_BASE = 'https://fcm.googleapis.com';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
/** A late wake still makes the phone catch up, but not hours later; the collapse key keeps one queued. */
const WAKE_TTL = '600s';
const COLLAPSE_KEY = 'agentfarm-wake';

export interface ServiceAccount { projectId: string; clientEmail: string; privateKey: string; tokenUri: string }
export interface HttpAnswer { status: number; body: string }
export type Post = (url: string, headers: Record<string, string>, body: string) => Promise<HttpAnswer>;
export type SendResult = { ok: true } | { ok: false; error: string; gone?: boolean };
export type WakeSend = (token: string, data: Record<string, string>) => Promise<SendResult>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const parseJson = (s: string): any => { try { return JSON.parse(s); } catch { return undefined; } };
const msg = (e: unknown) => String((e as Error)?.message ?? e);

/** The key the user pasted into Secrets, or a sentence saying what is wrong with it. */
export function parseServiceAccount(text: string | undefined): ServiceAccount | { error: string } {
    if (!text || !text.trim()) { return { error: `the phone wake needs a Firebase service account key: add ${FCM_SECRET} in Secrets` }; }
    const j = parseJson(text);
    if (!j || typeof j !== 'object') { return { error: `${FCM_SECRET} is not JSON - paste the whole key file Firebase gave` }; }
    if (j.type !== undefined && j.type !== 'service_account') { return { error: `${FCM_SECRET} is a ${String(j.type)} key, not a service account key` }; }
    const sa = { projectId: str(j.project_id), clientEmail: str(j.client_email), privateKey: typeof j.private_key === 'string' ? j.private_key : '' };
    const missing = [['project_id', sa.projectId], ['client_email', sa.clientEmail], ['private_key', sa.privateKey]].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) { return { error: `${FCM_SECRET} has no ${missing.join(', ')}` }; }
    try { crypto.createPrivateKey(sa.privateKey); } catch { return { error: `${FCM_SECRET}'s private_key is not a PEM private key` }; }
    return { ...sa, tokenUri: str(j.token_uri) || DEFAULT_TOKEN_URI };
}

/** The signed JWT the token endpoint trades for an access token (an hour, the most Google grants). */
export function signedAssertion(sa: ServiceAccount, nowSec: number): string {
    const b64u = (s: string) => Buffer.from(s).toString('base64url');
    const body = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({
        iss: sa.clientEmail, scope: FCM_SCOPE, aud: sa.tokenUri, iat: nowSec, exp: nowSec + 3600 }))}`;
    return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), sa.privateKey).toString('base64url')}`;
}

/** HTTPS only — plain http just to this machine, where a test's fake Google listens. */
export const httpPost: Post = (url, headers, body) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) { reject(new Error(`refusing ${u.protocol}//${u.host}: only https`)); return; }
    const req = (u.protocol === 'http:' ? http : https).request(u, {
        method: 'POST', headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) }, timeout: 15_000,
    }, res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end(body);
});

/** FCM's own error code (UNREGISTERED, SENDER_ID_MISMATCH, …), else the API status. */
function fcmCode(j: any): string {
    const d = Array.isArray(j?.error?.details) ? j.error.details.find((x: any) => typeof x?.errorCode === 'string') : undefined;
    return d?.errorCode ?? str(j?.error?.status);
}

export class FcmClient {
    private access?: { token: string; until: number };
    private readonly post: Post;
    private readonly now: () => number;
    private readonly base: string;

    constructor(private readonly sa: ServiceAccount, o: { post?: Post; now?: () => number; base?: string } = {}) {
        this.post = o.post ?? httpPost;
        this.now = o.now ?? Date.now;
        this.base = o.base ?? FCM_BASE;
    }

    private async accessToken(): Promise<string> {
        const now = this.now();
        if (this.access && now < this.access.until) { return this.access.token; }
        const form = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(this.sa, Math.floor(now / 1000)) });
        const r = await this.post(this.sa.tokenUri, { 'Content-Type': 'application/x-www-form-urlencoded' }, form.toString());
        const j = parseJson(r.body);
        if (r.status !== 200 || typeof j?.access_token !== 'string') {
            const why = str(j?.error_description) || str(j?.error);
            throw new Error(`Google did not accept the service account key (${r.status}${why ? ': ' + why : ''})`);
        }
        const life = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600;
        this.access = { token: j.access_token, until: now + Math.max(60, life - 300) * 1000 };
        return j.access_token;
    }

    /** One data message; `gone` = FCM says the token is dead, so the phone must register again. */
    async send(token: string, data: Record<string, string>): Promise<SendResult> {
        const url = `${this.base}/v1/projects/${encodeURIComponent(this.sa.projectId)}/messages:send`;
        const body = JSON.stringify({ message: { token, data, android: { priority: 'HIGH', ttl: WAKE_TTL, collapse_key: COLLAPSE_KEY } } });
        for (let attempt = 0; ; attempt++) {
            let r: HttpAnswer;
            try {
                const bearer = await this.accessToken();
                r = await this.post(url, { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body);
            } catch (e) { return { ok: false, error: msg(e) }; }
            if (r.status === 200) { return { ok: true }; }
            if (r.status === 401 && attempt === 0) { this.access = undefined; continue; }
            const j = parseJson(r.body);
            const code = fcmCode(j);
            const gone = r.status === 404 || code === 'UNREGISTERED';
            const why = str(j?.error?.message);
            return { ok: false, error: `FCM refused the wake (${r.status}${code ? ' ' + code : ''}${why ? ': ' + why : ''})`, ...(gone ? { gone: true } : {}) };
        }
    }
}

/** The sender for whatever key Secrets holds now; a client is kept while the key is the same, so its access token is reused. */
export function fcmSenderFrom(read: () => string | undefined, o?: { post?: Post; now?: () => number; base?: string }): () => WakeSend | { error: string } {
    let seen = '';
    let made: WakeSend | { error: string } | undefined;
    return () => {
        const text = read() ?? '';
        if (made === undefined || text !== seen) {
            seen = text;
            const sa = parseServiceAccount(text);
            if ('error' in sa) { made = sa; } else { const c = new FcmClient(sa, o); made = (t, d) => c.send(t, d); }
        }
        return made;
    };
}
