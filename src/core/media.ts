import * as fs from 'fs';
import * as path from 'path';

/**
 * C1/C3 — Media pipeline helpers for the fal.ai queue API (single-door access
 * to Kling / Seedance / Veo / Flux / Nano Banana class models). Kept pure-ish
 * so TaskManager can drive them and tests can point them at a mock server.
 */

export interface MediaPriceRule {
    /** regex matched against the model id */
    match: string;
    usd: number;
    per: 'request' | 'image' | 'second';
}

/** Placeholder defaults — verify against fal.ai pricing before relying on them. */
export const DEFAULT_MEDIA_PRICING: MediaPriceRule[] = [
    { match: 'flux.*schnell', usd: 0.003, per: 'image' },
    { match: 'flux', usd: 0.025, per: 'image' },
    { match: 'gemini-omni', usd: 0.13, per: 'second' },
    { match: 'nano-banana|gemini.*image', usd: 0.04, per: 'image' },
    { match: 'kling', usd: 0.1, per: 'second' },
    { match: 'seedance', usd: 0.06, per: 'second' },
    { match: 'veo', usd: 0.4, per: 'second' },
    { match: 'whisper|speech-to-text', usd: 0.005, per: 'request' },
    { match: 'tts|text-to-speech|elevenlabs', usd: 0.01, per: 'request' }
];

export interface MediaResult {
    ok: boolean;
    /** raw response JSON (handoff for the next step) */
    response?: unknown;
    error?: string;
    assetUrls: string[];
}

export interface MediaMeta {
    taskId: string;
    title: string;
    model: string;
    input: string;
    assetFiles: string[];
    estCost: number;
    ts: number;
    workflowTitle?: string;
    /** Wave A — production linkage: manifest project id + scene id. */
    projectId?: string;
    sceneId?: string;
    /** 'fal' (generated) or 'external:<label>' (ingested/registered by hand). */
    source?: string;
    /**
     * Wave B — remote asset URLs from the media response, aligned with
     * assetFiles order. Downstream steps (a fal image→video model) need the URL,
     * not the local path, so the selection step hands these off.
     */
    assetUrls?: string[];
    /** Wave B — visual-selection decisions (asset URLs the user kept / dropped). */
    selectedUrls?: string[];
    rejectedUrls?: string[];
    /** M-41 — the local files its input named, and the provider URL each was sent as */
    uploads?: { path: string; url: string; provider: string; cached: boolean }[];
}

/** Extensions the ingest watcher treats as media (mirrors the gallery's kinds). */
export const MEDIA_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'];

export function assetKind(file: string): 'image' | 'video' | 'audio' | 'file' {
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image'
        : ['mp4', 'webm', 'mov'].includes(ext) ? 'video'
        : ['mp3', 'wav', 'ogg'].includes(ext) ? 'audio' : 'file';
}

interface FalQueueSubmit {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
}

/** A request that never answers must still END: an Omni edit step sat "running" for 20+ minutes with no event, the poll loop's own timeout unreachable behind one unbounded fetch. */
export const REQUEST_TIMEOUT_MS = 120_000;
/** Bytes going up or coming down (a video) get longer than a JSON call. */
export const TRANSFER_TIMEOUT_MS = 600_000;

export function bounded(init: RequestInit = {}, ms: number = REQUEST_TIMEOUT_MS): RequestInit {
    return init.signal ? init : { ...init, signal: AbortSignal.timeout(ms) };
}

export async function jsonFetch(url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
    const res = await fetch(url, bounded(init, timeoutMs));
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { ok: res.ok, status: res.status, json, text };
}

/**
 * F3: poll-side fetch with transient-failure tolerance — an hour-long render
 * must survive a network blip. Network errors, 5xx and 429 are retried with
 * growing waits; anything else returns immediately. Never throws. NOT for
 * submit calls: retrying a submit could queue (and charge) the job twice.
 */
export async function resilientFetch(
    url: string, init: RequestInit, pollMs = 3000, retries = 3
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
    for (let attempt = 0; ; attempt++) {
        let res: { ok: boolean; status: number; json: unknown; text: string };
        try { res = await jsonFetch(url, init); }
        catch (e) { res = { ok: false, status: 0, json: undefined, text: String(e) }; }
        const transient = !res.ok && (res.status === 0 || res.status >= 500 || res.status === 429);
        if (!transient || attempt >= retries) { return res; }
        await new Promise(r => setTimeout(r, Math.min(pollMs * 2 ** attempt, 30_000)));
    }
}

/** Submit to the fal queue and poll until completion. baseUrl override = tests. */
export async function runFalJob(
    model: string,
    inputJson: string,
    auth: string,
    opts: {
        baseUrl?: string; timeoutMs?: number; pollMs?: number;
        /** F2: fires once the job is queued — the caller persists the poll URLs for reattach. */
        onQueued?: (job: { statusUrl: string; responseUrl: string }) => void;
    } = {}
): Promise<MediaResult> {
    const base = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    const headers = { Authorization: auth, 'Content-Type': 'application/json' };

    let body: string;
    try { body = JSON.stringify(JSON.parse(inputJson)); } catch {
        return { ok: false, error: `input is not valid JSON: ${inputJson.slice(0, 120)}`, assetUrls: [] };
    }

    // Submit is deliberately NOT retried (a retry could queue the job — and its
    // cost — twice), but a network throw becomes an honest failure, not a crash.
    let submit: { ok: boolean; status: number; json: unknown; text: string };
    try { submit = await jsonFetch(`${base}/${model}`, { method: 'POST', headers, body }); }
    catch (e) { return { ok: false, error: `submit failed: ${String(e).slice(0, 300)}`, assetUrls: [] }; }
    if (!submit.ok) {
        return { ok: false, error: `submit HTTP ${submit.status}: ${submit.text.slice(0, 300)}`, assetUrls: [] };
    }
    const queued = submit.json as FalQueueSubmit;

    // Fast path: some endpoints answer synchronously with the result itself.
    if (!queued?.status_url && !queued?.response_url) {
        return { ok: true, response: submit.json, assetUrls: findAssetUrls(submit.json) };
    }

    const statusUrl = queued.status_url as string;
    const responseUrl = (queued.response_url ?? statusUrl.replace(/\/status$/, '')) as string;
    opts.onQueued?.({ statusUrl, responseUrl });
    return pollFalResult(statusUrl, responseUrl, auth, opts);
}

/**
 * F2: poll an already-submitted fal queue job until completion. Split out of
 * runFalJob so a reload can REATTACH to an in-flight job from its persisted
 * poll URLs instead of losing (and re-paying) the render.
 */
export async function pollFalResult(
    statusUrl: string,
    responseUrl: string,
    auth: string,
    opts: { timeoutMs?: number; pollMs?: number } = {}
): Promise<MediaResult> {
    const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
    const pollMs = opts.pollMs ?? 3000;
    const headers = { Authorization: auth, 'Content-Type': 'application/json' };
    const t0 = Date.now();
    for (;;) {
        if (Date.now() - t0 > timeoutMs) {
            return { ok: false, error: `timed out after ${Math.round(timeoutMs / 60000)} min`, assetUrls: [] };
        }
        await new Promise(r => setTimeout(r, pollMs));
        const st = await resilientFetch(statusUrl, { headers }, pollMs);
        const status = (st.json as { status?: string })?.status ?? '';
        if (status === 'COMPLETED') { break; }
        if (!st.ok || status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
            return { ok: false, error: `job ${status || 'HTTP ' + st.status}: ${st.text.slice(0, 300)}`, assetUrls: [] };
        }
    }
    const result = await resilientFetch(responseUrl, { headers }, pollMs);
    if (!result.ok) {
        return { ok: false, error: `result HTTP ${result.status}: ${result.text.slice(0, 300)}`, assetUrls: [] };
    }
    return { ok: true, response: result.json, assetUrls: findAssetUrls(result.json) };
}

/** Collect downloadable asset URLs from a media response (images[].url, video.url, audio_url…). */
export function findAssetUrls(json: unknown, depth = 0): string[] {
    if (depth > 6 || !json || typeof json !== 'object') { return []; }
    const urls: string[] = [];
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
        if (typeof value === 'string' && /^https?:\/\//.test(value) &&
            (/(url|uri)$/i.test(key) || /\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|ogg)(\?|$)/i.test(value))) {
            urls.push(value);
        } else if (Array.isArray(value)) {
            for (const item of value) { urls.push(...findAssetUrls(item, depth + 1)); }
        } else if (value && typeof value === 'object') {
            urls.push(...findAssetUrls(value, depth + 1));
        }
    }
    return [...new Set(urls)];
}

export function extFromUrl(url: string): string {
    const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url);
    return m ? m[1].toLowerCase() : 'bin';
}

export async function downloadAsset(url: string, targetFile: string): Promise<boolean> {
    try {
        const res = await fetch(url, bounded({}, TRANSFER_TIMEOUT_MS));
        if (!res.ok) { return false; }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(targetFile, buf);
        return true;
    } catch { return false; }
}

export function priceRuleFor(model: string, rules: MediaPriceRule[]): MediaPriceRule | undefined {
    return rules.find(r => {
        try { return new RegExp(r.match, 'i').test(model); } catch { return false; }
    });
}

/** Estimate cost from pricing rules and the response shape; `measuredSec` stands in when the response names no duration. */
export function estimateMediaCost(model: string, response: unknown, rules: MediaPriceRule[], measuredSec?: number): number {
    const rule = priceRuleFor(model, rules);
    if (!rule) { return 0; }
    if (rule.per === 'request') { return rule.usd; }
    const r = response as { images?: unknown[]; video?: { duration?: number }; duration?: number } | undefined;
    if (rule.per === 'image') {
        const count = Array.isArray(r?.images) ? r!.images!.length : 1;
        return rule.usd * Math.max(1, count);
    }
    const seconds = r?.video?.duration ?? r?.duration ?? measuredSec ?? 5;
    return rule.usd * Math.max(1, Number(seconds) || 5);
}

/** Gallery data: read all media sidecar metas from the outputs dir (newest first). */
export function readMediaMetas(outputsDir: string): MediaMeta[] {
    if (!fs.existsSync(outputsDir)) { return []; }
    const metas: MediaMeta[] = [];
    for (const name of fs.readdirSync(outputsDir)) {
        if (!name.endsWith('.media.json')) { continue; }
        try {
            metas.push(JSON.parse(fs.readFileSync(path.join(outputsDir, name), 'utf8')));
        } catch { /* skip corrupt meta */ }
    }
    return metas.sort((a, b) => b.ts - a.ts);
}

/** Wave B — one selectable asset flattened from a media meta. */
export interface AssetCandidate {
    taskId: string;
    title: string;
    /** remote URL (handed off downstream); falls back to file path if unknown */
    url: string;
    /** local file for preview (may be missing if pruned) */
    file?: string;
    kind: 'image' | 'video' | 'audio' | 'file';
}

/** Flatten metas into per-asset selection candidates (assetUrls aligned to files). */
export function mediaCandidates(metas: MediaMeta[]): AssetCandidate[] {
    const out: AssetCandidate[] = [];
    for (const m of metas) {
        const files = m.assetFiles ?? [];
        const urls = m.assetUrls ?? [];
        const n = Math.max(files.length, urls.length);
        for (let i = 0; i < n; i++) {
            const file = files[i];
            const url = urls[i] ?? file;
            if (!url) { continue; }
            out.push({
                taskId: m.taskId,
                title: m.title + (n > 1 ? ` #${i + 1}` : ''),
                url,
                file,
                kind: assetKind(file ?? url)
            });
        }
    }
    return out;
}

/**
 * Wave B — persist a visual-selection decision across the given metas: each
 * meta records which of ITS asset URLs were kept vs dropped, so the gallery can
 * badge them. `selected` is the full set of chosen URLs across all candidates.
 */
export function recordSelection(outputsDir: string, metas: MediaMeta[], selected: string[]): void {
    const keep = new Set(selected);
    for (const m of metas) {
        const urls = m.assetUrls ?? (m.assetFiles ?? []);
        const sel = urls.filter(u => keep.has(u));
        const rej = urls.filter(u => !keep.has(u));
        updateMediaMeta(outputsDir, m.taskId, { selectedUrls: sel, rejectedUrls: rej });
    }
}

/**
 * Wave B2 — fold vision-QA feedback into a media input's "prompt" field so the
 * regeneration addresses what failed. Strips the judge's PASS/FAIL prefix.
 * Inputs without a string "prompt" (or non-JSON) pass through unchanged.
 */
export function injectMediaFeedback(inputJson: string, feedback: string): string {
    const clean = feedback.replace(/^\s*(PASS|FAIL)\b[:\-\s]*/i, '').trim();
    if (!clean) { return inputJson; }
    try {
        const obj = JSON.parse(inputJson) as Record<string, unknown>;
        if (obj && typeof obj.prompt === 'string') {
            obj.prompt = `${obj.prompt} (Önceki denemede şu sorun vardı: ${clean}. Bunu düzelt.)`;
            return JSON.stringify(obj);
        }
    } catch { /* not JSON or no prompt — pass through */ }
    return inputJson;
}

export function mediaCostSince(outputsDir: string, sinceMs: number): number {
    const cutoff = Date.now() - sinceMs;
    return readMediaMetas(outputsDir)
        .filter(m => m.ts >= cutoff)
        .reduce((a, m) => a + (m.estCost || 0), 0);
}

/** All asset paths already known to the gallery (dedup base for ingest). */
export function registeredAssetPaths(outputsDir: string): Set<string> {
    const set = new Set<string>();
    for (const m of readMediaMetas(outputsDir)) {
        for (const f of m.assetFiles) { set.add(path.resolve(f).toLowerCase()); }
    }
    return set;
}

/**
 * Wave A — register a file that was NOT produced by a media step (downloaded
 * from a web platform, exported from an editor…) as a gallery asset. The file
 * is referenced in place (no copy — videos are big); only a sidecar meta is
 * written into the outputs dir. Returns undefined if already registered.
 */
export function registerExternalAsset(
    outputsDir: string,
    filePath: string,
    opts: { title?: string; projectId?: string; sceneId?: string; source?: string; input?: string } = {},
    known?: Set<string>
): MediaMeta | undefined {
    const abs = path.resolve(filePath);
    const key = abs.toLowerCase();
    const registry = known ?? registeredAssetPaths(outputsDir);
    if (registry.has(key)) { return undefined; }
    let ts = Date.now();
    try { ts = fs.statSync(abs).mtimeMs; } catch { /* keep now */ }
    const meta: MediaMeta = {
        taskId: 'ext-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title: opts.title ?? path.basename(abs),
        model: 'external',
        // Nothing generated it, so there is no payload — but a caller who KNOWS
        // what it was made from (the prompt it was produced with elsewhere) can
        // say so, and the gallery then reads it exactly like a generated one.
        input: opts.input ?? '',
        assetFiles: [abs],
        estCost: 0,
        ts,
        projectId: opts.projectId,
        sceneId: opts.sceneId,
        source: opts.source ?? 'external'
    };
    fs.mkdirSync(outputsDir, { recursive: true });
    fs.writeFileSync(path.join(outputsDir, `${meta.taskId}.media.json`),
        JSON.stringify(meta, null, 2), 'utf8');
    registry.add(key);
    return meta;
}

/** Patch one sidecar meta (gallery "Assign to scene…"). Returns the updated meta. */
export function updateMediaMeta(
    outputsDir: string,
    taskId: string,
    patch: Partial<Pick<MediaMeta, 'projectId' | 'sceneId' | 'title' | 'selectedUrls' | 'rejectedUrls'>>
): MediaMeta | undefined {
    const file = path.join(outputsDir, `${taskId}.media.json`);
    if (!fs.existsSync(file)) { return undefined; }
    try {
        const meta = JSON.parse(fs.readFileSync(file, 'utf8')) as MediaMeta;
        Object.assign(meta, patch);
        // An explicit undefined clears the assignment (JSON.stringify drops it).
        fs.writeFileSync(file, JSON.stringify(meta, null, 2), 'utf8');
        return meta;
    } catch { return undefined; }
}
