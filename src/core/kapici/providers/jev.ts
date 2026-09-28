/**
 * X-412 — Jev through the TypeSafe API, or the same request through the Vercel
 * AI Gateway. Built-in fetch, one deadline for the whole call, one backed-off
 * retry on 429/529 while the deadline allows; 401/422 are never retried. The
 * key is read per call and never appears in an error text.
 */
import { KapiciAnswer, KapiciProvider, KapiciQuestion, KapiciState, ProviderErrorKind, ProviderResult } from '../types';

export type JevRoute = 'typesafe' | 'vercel';
export const JEV_ROUTES: Record<JevRoute, { url: string; model: string }> = {
    typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' },
    vercel: { url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', model: 'typesafe-ai/jev' }
};
/** USD per million input tokens; output is free. */
export const JEV_PRICE_PER_MTOK = 0.042;
export const DEFAULT_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 300;
const RETRY_CAP_MS = 1500;

export interface HttpReply { status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } }
export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<HttpReply>;

export interface JevOptions {
    key(): Promise<string | undefined>;
    route?: JevRoute;
    /** Overrides the route's own address / model. */
    url?: string;
    model?: string;
    fetch?: FetchLike;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The wire shape: type, instructions, criteria — a local check never travels. */
export function wireQuestions(questions: Record<string, KapiciQuestion>): Record<string, { type: string; instructions: string; criteria?: unknown }> {
    return Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, { type: q.type, instructions: q.instructions, ...(q.criteria !== undefined ? { criteria: q.criteria } : {}) }]));
}

/** A noul carries no confidence; the documented statistic for n options, (n·max − 1)/(n − 1), is |2p − 1| for two. */
export function parseAnswer(q: KapiciQuestion, raw: unknown): KapiciAnswer | undefined {
    if (!isObj(raw)) { return undefined; }
    const probs = isObj(raw.probabilities) ? Object.fromEntries(Object.entries(raw.probabilities).filter(([, p]) => num(p) !== undefined)) as Record<string, number> : undefined;
    if (q.type === 'noul') {
        const p = num(raw.noul) ?? num(raw.p);
        return p === undefined ? undefined : { type: 'noul', p: clamp01(p), confidence: Math.abs(2 * clamp01(p) - 1) };
    }
    const confidence = num(raw.confidence);
    if (confidence === undefined) { return undefined; }
    if (q.type === 'choice') {
        const options = isObj(q.criteria) ? Object.keys(q.criteria) : [];
        if (typeof raw.choice !== 'string' || (options.length && !options.includes(raw.choice))) { return undefined; }
        return { type: 'choice', choice: raw.choice, confidence: clamp01(confidence), ...(probs ? { probs } : {}) };
    }
    const score = num(raw.score);
    return score === undefined ? undefined : { type: 'score', score, confidence: clamp01(confidence), ...(probs ? { probs } : {}) };
}

function statusKind(status: number): ProviderErrorKind {
    if (status === 401 || status === 403) { return 'auth'; }
    if (status === 422 || status === 400) { return 'invalid'; }
    if (status === 429) { return 'rate'; }
    return 'server';
}

async function errorText(res: HttpReply): Promise<string> {
    try {
        const b = await res.json();
        const m = isObj(b) ? (isObj(b.error) ? b.error.message : b.error ?? b.message) : undefined;
        return typeof m === 'string' ? ` — ${m.slice(0, 160)}` : '';
    } catch { return ''; }
}

export function jevProvider(o: JevOptions): KapiciProvider {
    const route = JEV_ROUTES[o.route ?? 'typesafe'];
    const url = o.url || route.url;
    const model = o.model || route.model;
    const now = o.now ?? Date.now;
    const sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    return {
        name: 'jev',
        async ask(state: KapiciState, questions: Record<string, KapiciQuestion>, a: { timeoutMs: number; signal?: AbortSignal }): Promise<ProviderResult> {
            const f = o.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
            if (!f) { return { error: 'this runtime has no fetch', kind: 'network' }; }
            let key: string | undefined;
            try { key = (await o.key())?.trim(); } catch { key = undefined; }
            if (!key) { return { error: 'no API key in the Secret vault', kind: 'no-key' }; }
            const t0 = now();
            const deadline = t0 + Math.max(1, a.timeoutMs || DEFAULT_TIMEOUT_MS);
            const ctl = new AbortController();
            const onAbort = () => ctl.abort();
            a.signal?.addEventListener('abort', onAbort);
            const timer = setTimeout(() => ctl.abort(), deadline - t0);
            const body = JSON.stringify({ model, state, questions: wireQuestions(questions) });
            try {
                for (let attempt = 0; ; attempt++) {
                    let res: HttpReply;
                    try {
                        res = await f(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: ctl.signal });
                    } catch (e) {
                        if (ctl.signal.aborted) { return a.signal?.aborted ? { error: 'cancelled by the caller', kind: 'network' } : { error: `no answer in ${deadline - t0} ms`, kind: 'timeout' }; }
                        return { error: `request failed — ${String((e as Error)?.message ?? e).split(key).join('***').slice(0, 160)}`, kind: 'network' };
                    }
                    if (res.status >= 200 && res.status < 300) {
                        let reply: unknown;
                        try { reply = await res.json(); } catch { return { error: 'reply is not JSON', kind: 'bad-reply' }; }
                        if (!isObj(reply) || !isObj(reply.answers)) { return { error: 'reply has no answers', kind: 'bad-reply' }; }
                        const answers: Record<string, KapiciAnswer> = {};
                        for (const [id, q] of Object.entries(questions)) {
                            const ans = parseAnswer(q, (reply.answers as Record<string, unknown>)[id]);
                            if (ans) { answers[id] = ans; }
                        }
                        const tokens = isObj(reply.usage) ? num(reply.usage.input_tokens) : undefined;
                        return {
                            answers, model: typeof reply.model === 'string' && reply.model ? reply.model : model, latencyMs: now() - t0,
                            ...(tokens !== undefined ? { costUsd: tokens * JEV_PRICE_PER_MTOK / 1e6 } : {})
                        };
                    }
                    const retryable = res.status === 429 || res.status === 529;
                    const after = Number(res.headers?.get('retry-after'));
                    const wait = Math.min(RETRY_CAP_MS, Number.isFinite(after) && after > 0 ? after * 1000 : RETRY_DELAY_MS);
                    if (!retryable || attempt > 0 || now() + wait >= deadline - 100) {
                        return { error: `HTTP ${res.status}${(await errorText(res)).split(key).join('***')}`, kind: statusKind(res.status) };
                    }
                    await sleep(wait);
                    if (ctl.signal.aborted) { return { error: `no answer in ${deadline - t0} ms`, kind: 'timeout' }; }
                }
            } finally {
                clearTimeout(timer);
                a.signal?.removeEventListener('abort', onAbort);
            }
        }
    };
}
