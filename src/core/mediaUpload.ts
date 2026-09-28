/**
 * M-41 — A FILE ON THIS COMPUTER REACHES A MEDIA PROVIDER.
 *
 * fal and Replicate take an https:// URL, so a media step whose input named
 * `D:\clips\a.mp4` sent them a path they cannot open. The step's input is now
 * read for local files — every JSON string value that IS a local path, and
 * every explicit `{upload:<path>}` — each is uploaded to the provider's own
 * storage and the URL put in its place. A file is uploaded once per content
 * (sha-256) and provider: the cache hands back the same URL until it expires.
 * No vscode; the network and the disk are passed in or local to this file.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { bounded, TRANSFER_TIMEOUT_MS } from './media';

export type UploadProvider = 'fal' | 'replicate';
export const UPLOAD_PROVIDERS: readonly UploadProvider[] = ['fal', 'replicate'];

export interface UploadRecord {
    hash: string; provider: UploadProvider; url: string; name: string; bytes: number; at: number;
    /** when the provider stops serving it (ms) — the cache re-uploads after this */
    expiresAt?: number;
}

export interface UploadDone { path: string; url: string; provider: UploadProvider; cached: boolean; hash: string; expiresAt?: number }

export interface UploadOpts {
    /** the provider's Authorization header value, as the media step sends it */
    auth: string;
    baseUrl?: string;
    /** 0 = the provider's own default */
    retentionDays?: number;
    /** the JSON file holding the content-hash cache */
    cacheFile?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

/** fal takes a single PUT up to this; its multipart protocol is not spoken here. */
export const FAL_SINGLE_MAX = 90 * 1024 * 1024;

const LOCAL = /^(?:[A-Za-z]:[\\/]|\\\\[^\\]|file:\/\/)/;
const MARK = /\{upload:([^}]+)\}/g;

export const isLocalPath = (v: string): boolean => LOCAL.test(v.trim());
const plainPath = (v: string): string => {
    const t = v.trim();
    return t.startsWith('file://') ? decodeURIComponent(t.replace(/^file:\/\/\/?/, '')) : t;
};

const TYPES: Record<string, string> = {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.pdf': 'application/pdf'
};
export const contentType = (p: string): string => TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream';

function walkStrings(v: unknown, f: (s: string) => string): unknown {
    if (typeof v === 'string') { return f(v); }
    if (Array.isArray(v)) { return v.map(x => walkStrings(x, f)); }
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walkStrings(x, f)]));
    }
    return v;
}

/** The local files a media input names: `explicit` ({upload:path}, always uploaded) and `detected` (a value that is a path). */
export function localRefs(input: string): { explicit: string[]; detected: string[] } {
    const explicit = new Set<string>(), detected = new Set<string>();
    const scan = (s: string): string => {
        for (const m of s.matchAll(MARK)) { explicit.add(plainPath(m[1])); }
        if (!/\{upload:[^}]+\}/.test(s) && isLocalPath(s)) { detected.add(plainPath(s)); }
        return s;
    };
    try { walkStrings(JSON.parse(input), scan); } catch { for (const m of input.matchAll(MARK)) { explicit.add(plainPath(m[1])); } }
    return { explicit: [...explicit], detected: [...detected].filter(p => !explicit.has(p)) };
}

/** The input with every uploaded path replaced by its URL; a value not uploaded is left as it was. */
export function replaceRefs(input: string, urls: Record<string, string>): string {
    const swap = (s: string): string => {
        const out = s.replace(MARK, (m, p: string) => urls[plainPath(p)] ?? m);
        return out === s && isLocalPath(s) && urls[plainPath(s)] ? urls[plainPath(s)] : out;
    };
    try { return JSON.stringify(walkStrings(JSON.parse(input), swap)); } catch { return input.replace(MARK, (m, p: string) => urls[plainPath(p)] ?? m); }
}

export async function fileHash(p: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(p).on('data', d => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
    });
}

function readCache(file?: string): Record<string, UploadRecord> {
    if (!file) { return {}; }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, UploadRecord>; } catch { return {}; }
}

function writeCache(file: string | undefined, cache: Record<string, UploadRecord>): void {
    if (!file) { return; }
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(cache, null, 1), 'utf8'); } catch { /* a cache that cannot be written only costs a re-upload */ }
}

async function failText(r: Response): Promise<string> {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch { /* none */ }
    return `HTTP ${r.status}${body ? ` — ${body}` : ''}`;
}

async function uploadFal(p: string, bytes: Buffer, o: UploadOpts, f: typeof fetch): Promise<{ url: string; expiresAt?: number }> {
    if (bytes.length > FAL_SINGLE_MAX) {
        throw new Error(`${path.basename(p)} is ${(bytes.length / 1048576).toFixed(0)} MB; fal takes one upload up to 90 MB here (its multipart upload is not supported yet)`);
    }
    const base = (o.baseUrl ?? 'https://rest.fal.ai').replace(/\/$/, '');
    const days = o.retentionDays ?? 0;
    const init = await f(`${base}/storage/upload/initiate?storage_type=fal-cdn-v3`, bounded({
        method: 'POST',
        headers: {
            Authorization: o.auth, 'Content-Type': 'application/json',
            ...(days > 0 ? { 'x-fal-object-lifecycle-preference': JSON.stringify({ expiration_duration_seconds: Math.round(days * 86400) }) } : {})
        },
        body: JSON.stringify({ content_type: contentType(p), file_name: path.basename(p) })
    }));
    if (!init.ok) { throw new Error(`fal refused the upload: ${await failText(init)}`); }
    const j = await init.json() as { upload_url?: string; file_url?: string };
    if (!j.upload_url || !j.file_url) { throw new Error('fal answered without upload_url / file_url'); }
    const put = await f(j.upload_url, bounded({ method: 'PUT', headers: { 'Content-Type': contentType(p) }, body: bytes }, TRANSFER_TIMEOUT_MS));
    if (!put.ok) { throw new Error(`fal did not take the bytes: ${await failText(put)}`); }
    return { url: j.file_url, ...(days > 0 ? { expiresAt: (o.now ?? Date.now)() + days * 86400_000 } : {}) };
}

async function uploadReplicate(p: string, bytes: Buffer, o: UploadOpts, f: typeof fetch): Promise<{ url: string; expiresAt?: number }> {
    const base = (o.baseUrl ?? 'https://api.replicate.com').replace(/\/$/, '');
    const form = new FormData();
    form.append('content', new Blob([bytes], { type: contentType(p) }), path.basename(p));
    const r = await f(`${base}/v1/files`, bounded({ method: 'POST', headers: { Authorization: o.auth }, body: form }, TRANSFER_TIMEOUT_MS));
    if (!r.ok) { throw new Error(`Replicate refused the upload: ${await failText(r)}`); }
    const j = await r.json() as { urls?: { get?: string }; expires_at?: string };
    if (!j.urls?.get) { throw new Error('Replicate answered without urls.get'); }
    const exp = j.expires_at ? Date.parse(j.expires_at) : NaN;
    return { url: j.urls.get, ...(Number.isFinite(exp) ? { expiresAt: exp } : {}) };
}

/** One file to one provider — or the URL it already has there for the same content. */
export async function uploadFile(file: string, provider: UploadProvider, o: UploadOpts): Promise<UploadDone> {
    const p = plainPath(file);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { throw new Error(`${p} is not a file on this computer`); }
    const now = (o.now ?? Date.now)();
    const hash = await fileHash(p);
    const cache = readCache(o.cacheFile);
    const key = `${provider}:${hash}`;
    const hit = cache[key];
    if (hit && (!hit.expiresAt || hit.expiresAt > now + 3600_000)) {
        return { path: p, url: hit.url, provider, cached: true, hash, ...(hit.expiresAt ? { expiresAt: hit.expiresAt } : {}) };
    }
    if (!o.auth) { throw new Error(`no ${provider} key is stored — the upload needs the same key the media step uses`); }
    const bytes = fs.readFileSync(p);
    const f = o.fetchImpl ?? fetch;
    const up = provider === 'replicate' ? await uploadReplicate(p, bytes, o, f) : await uploadFal(p, bytes, o, f);
    cache[key] = { hash, provider, url: up.url, name: path.basename(p), bytes: bytes.length, at: now, ...(up.expiresAt ? { expiresAt: up.expiresAt } : {}) };
    writeCache(o.cacheFile, cache);
    return { path: p, url: up.url, provider, cached: false, hash, ...(up.expiresAt ? { expiresAt: up.expiresAt } : {}) };
}

export type AutoUpload = 'ask' | 'auto' | 'never';

/**
 * A media step's input made sendable: explicit marks always uploaded, detected
 * paths as `mode` says (ask → `confirm`, which a person answers). Returns the
 * new input and what was uploaded, or the one sentence that stops the step.
 */
export async function prepareMediaInput(
    input: string, provider: UploadProvider, mode: AutoUpload, o: UploadOpts,
    confirm: (paths: string[]) => Promise<boolean>
): Promise<{ input: string; uploads: UploadDone[] } | { error: string }> {
    const refs = localRefs(input);
    if (!refs.explicit.length && !refs.detected.length) { return { input, uploads: [] }; }
    let want = [...refs.explicit];
    if (refs.detected.length) {
        const names = refs.detected.join(', ');
        if (mode === 'never') {
            return { error: `the input names a file on this computer (${names}); automatic upload is off — write it as {upload:<path>} or turn "Upload local files" on in Farm Settings` };
        }
        if (mode === 'ask' && !(await confirm(refs.detected))) { return { error: `the upload of ${names} to ${provider} was declined` }; }
        want = want.concat(refs.detected);
    }
    const uploads: UploadDone[] = [];
    try {
        for (const p of want) { uploads.push(await uploadFile(p, provider, o)); }
    } catch (e) {
        return { error: `upload failed — ${e instanceof Error ? e.message : String(e)}` };
    }
    return { input: replaceRefs(input, Object.fromEntries(uploads.map(u => [u.path, u.url]))), uploads };
}
