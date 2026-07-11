import { findAssetUrls, jsonFetch, MediaResult, runFalJob } from './media';

/**
 * Wave C — media provider abstraction. The media step no longer hard-codes
 * fal.ai: it routes the model id to a provider. fal stays the default (any
 * unprefixed model id) so every existing workflow is unchanged; `replicate:`
 * models go to Replicate's prediction API. Auth headers are formatted by the
 * host (per provider) and passed through, so a provider only speaks its API.
 */

export interface MediaRunOpts { baseUrl?: string; timeoutMs?: number; pollMs?: number; }

export interface MediaProvider {
    id: string;
    label: string;
    /** name of the vault secret this provider expects (for setup hints) */
    secretHint: string;
    run(model: string, inputJson: string, authHeader: string, opts?: MediaRunOpts): Promise<MediaResult>;
}

export const REPLICATE_PREFIX = 'replicate:';

const falProvider: MediaProvider = {
    id: 'fal',
    label: 'fal.ai',
    secretHint: 'FAL_KEY',
    run: (model, input, auth, opts) => runFalJob(model, input, auth, opts)
};

const replicateProvider: MediaProvider = {
    id: 'replicate',
    label: 'Replicate',
    secretHint: 'REPLICATE_API_TOKEN',
    run: (model, input, auth, opts) => runReplicateJob(model, input, auth, opts)
};

export const MEDIA_PROVIDERS: MediaProvider[] = [falProvider, replicateProvider];

/** Route a model id to its provider. Unprefixed = fal (backward compatible). */
export function providerFor(model: string): MediaProvider {
    return model.startsWith(REPLICATE_PREFIX) ? replicateProvider : falProvider;
}

// ---------------------------------------------------------------------------
// Wave C — generic webhook poll mode: turn the webhook step into a queue client
// for ANY submit→poll API (Gemini long-running ops, self-hosted queues, …)
// without a bespoke provider. Config-driven; pure json-path is unit-tested and
// the poll loop is exercised against a mock server.
// ---------------------------------------------------------------------------

export interface WebhookPollConfig {
    /** json path in the SUBMIT response to the poll/status URL (e.g. "urls.get", "status_url"). */
    urlField: string;
    /** json path to a status string in each POLL response (e.g. "status"). */
    statusField?: string;
    /** status matches → done. Default: succeeded|completed|complete|done|success. */
    doneRegex?: string;
    /** status matches → failed. Default: failed|error|cancell?ed. */
    failRegex?: string;
    intervalSec?: number;
    timeoutMin?: number;
}

/** Read a dotted path (objects and array indices) out of a parsed JSON value. */
export function jsonPath(obj: unknown, dotted: string): unknown {
    let cur: unknown = obj;
    for (const key of dotted.split('.')) {
        if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return cur;
}

/**
 * After the initial submit, poll `urlField` until the status matches done/fail
 * (or, with no statusField, until a poll returns HTTP-ok). Returns the final
 * response for the handoff. If no poll URL is present, the submit response is
 * treated as already final.
 */
export async function pollWebhookResult(
    submitJson: unknown,
    headers: Record<string, string>,
    cfg: WebhookPollConfig,
    opts: { pollMs?: number } = {}
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
    const pollUrl = jsonPath(submitJson, cfg.urlField);
    if (typeof pollUrl !== 'string' || !/^https?:\/\//.test(pollUrl)) {
        return { ok: true, response: submitJson }; // synchronous API — nothing to poll
    }
    const doneRe = new RegExp(cfg.doneRegex ?? 'succeeded|completed|complete|done|success', 'i');
    const failRe = new RegExp(cfg.failRegex ?? 'failed|error|cancell?ed', 'i');
    const timeoutMs = (cfg.timeoutMin ?? 10) * 60_000;
    const pollMs = opts.pollMs ?? (cfg.intervalSec ?? 3) * 1000;
    const t0 = Date.now();
    for (;;) {
        if (Date.now() - t0 > timeoutMs) {
            return { ok: false, error: `poll timed out after ${Math.round(timeoutMs / 60000)} min` };
        }
        await new Promise(r => setTimeout(r, pollMs));
        const st = await jsonFetch(pollUrl, { headers });
        if (cfg.statusField) {
            const status = String(jsonPath(st.json, cfg.statusField) ?? '');
            if (status && failRe.test(status)) { return { ok: false, error: `job ${status}`, response: st.json }; }
            if (status && doneRe.test(status)) { return { ok: true, response: st.json }; }
            if (!st.ok && !status) { return { ok: false, error: `poll HTTP ${st.status}` }; }
        } else if (st.ok) {
            return { ok: true, response: st.json ?? st.text };
        }
    }
}

interface ReplicatePrediction {
    status?: string;
    output?: unknown;
    error?: unknown;
    urls?: { get?: string };
}

/**
 * Submit to Replicate's prediction API and poll until completion. Model ids are
 * `replicate:owner/name` (latest) or `replicate:owner/name:<version>`. baseUrl
 * override = tests. Mirrors runFalJob's shape so the media step is provider-blind.
 */
export async function runReplicateJob(
    model: string, inputJson: string, authHeader: string, opts: MediaRunOpts = {}
): Promise<MediaResult> {
    const base = (opts.baseUrl ?? 'https://api.replicate.com').replace(/\/$/, '');
    const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
    const pollMs = opts.pollMs ?? 3000;
    const headers = { Authorization: authHeader, 'Content-Type': 'application/json' };

    let input: unknown;
    try { input = JSON.parse(inputJson); } catch {
        return { ok: false, error: `input is not valid JSON: ${inputJson.slice(0, 120)}`, assetUrls: [] };
    }

    const ref = model.slice(REPLICATE_PREFIX.length);
    const colon = ref.indexOf(':');
    const version = colon >= 0 ? ref.slice(colon + 1) : '';
    const modelPath = colon >= 0 ? ref.slice(0, colon) : ref;
    const submitUrl = version ? `${base}/v1/predictions` : `${base}/v1/models/${modelPath}/predictions`;
    const body = JSON.stringify(version ? { version, input } : { input });

    const submit = await jsonFetch(submitUrl, { method: 'POST', headers, body });
    if (!submit.ok) {
        return { ok: false, error: `submit HTTP ${submit.status}: ${submit.text.slice(0, 300)}`, assetUrls: [] };
    }
    let pred = submit.json as ReplicatePrediction;
    const getUrl = pred?.urls?.get;

    // Prefer:wait / sync endpoints may answer already completed.
    if (getUrl && pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
        const t0 = Date.now();
        for (;;) {
            if (Date.now() - t0 > timeoutMs) {
                return { ok: false, error: `timed out after ${Math.round(timeoutMs / 60000)} min`, assetUrls: [] };
            }
            await new Promise(r => setTimeout(r, pollMs));
            const st = await jsonFetch(getUrl, { headers });
            const status = (st.json as ReplicatePrediction)?.status ?? '';
            if (status === 'succeeded') { pred = st.json as ReplicatePrediction; break; }
            if (!st.ok || status === 'failed' || status === 'canceled') {
                const p = st.json as ReplicatePrediction;
                return { ok: false, error: `prediction ${status || 'HTTP ' + st.status}: ${String(p?.error ?? st.text).slice(0, 300)}`, assetUrls: [] };
            }
        }
    } else if (pred.status === 'failed' || pred.status === 'canceled') {
        return { ok: false, error: `prediction ${pred.status}: ${String(pred.error ?? '').slice(0, 300)}`, assetUrls: [] };
    }

    const out = pred.output;
    const assetUrls = typeof out === 'string' && /^https?:\/\//.test(out)
        ? [out]
        : findAssetUrls(out ?? pred);
    return { ok: true, response: pred, assetUrls };
}
