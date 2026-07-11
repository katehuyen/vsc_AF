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

async function jsonFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { ok: res.ok, status: res.status, json, text };
}

/** Submit to the fal queue and poll until completion. baseUrl override = tests. */
export async function runFalJob(
    model: string,
    inputJson: string,
    auth: string,
    opts: { baseUrl?: string; timeoutMs?: number; pollMs?: number } = {}
): Promise<MediaResult> {
    const base = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
    const pollMs = opts.pollMs ?? 3000;
    const headers = { Authorization: auth, 'Content-Type': 'application/json' };

    let body: string;
    try { body = JSON.stringify(JSON.parse(inputJson)); } catch {
        return { ok: false, error: `input is not valid JSON: ${inputJson.slice(0, 120)}`, assetUrls: [] };
    }

    const submit = await jsonFetch(`${base}/${model}`, { method: 'POST', headers, body });
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
    const t0 = Date.now();
    for (;;) {
        if (Date.now() - t0 > timeoutMs) {
            return { ok: false, error: `timed out after ${Math.round(timeoutMs / 60000)} min`, assetUrls: [] };
        }
        await new Promise(r => setTimeout(r, pollMs));
        const st = await jsonFetch(statusUrl, { headers });
        const status = (st.json as { status?: string })?.status ?? '';
        if (status === 'COMPLETED') { break; }
        if (!st.ok || status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
            return { ok: false, error: `job ${status || 'HTTP ' + st.status}: ${st.text.slice(0, 300)}`, assetUrls: [] };
        }
    }
    const result = await jsonFetch(responseUrl, { headers });
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
        const res = await fetch(url);
        if (!res.ok) { return false; }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(targetFile, buf);
        return true;
    } catch { return false; }
}

/** Estimate cost from pricing rules and the response shape. */
export function estimateMediaCost(model: string, response: unknown, rules: MediaPriceRule[]): number {
    const rule = rules.find(r => {
        try { return new RegExp(r.match, 'i').test(model); } catch { return false; }
    });
    if (!rule) { return 0; }
    if (rule.per === 'request') { return rule.usd; }
    const r = response as { images?: unknown[]; video?: { duration?: number }; duration?: number } | undefined;
    if (rule.per === 'image') {
        const count = Array.isArray(r?.images) ? r!.images!.length : 1;
        return rule.usd * Math.max(1, count);
    }
    const seconds = r?.video?.duration ?? r?.duration ?? 5;
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
    opts: { title?: string; projectId?: string; sceneId?: string; source?: string } = {},
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
        input: '',
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
    patch: Partial<Pick<MediaMeta, 'projectId' | 'sceneId' | 'title'>>
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
