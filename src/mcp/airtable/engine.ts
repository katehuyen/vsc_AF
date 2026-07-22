// Airtable Engine access layer — pure node (no vscode imports), shared by the
// MCP server (out/mcp/airtable/index.js, staged standalone) AND the extension
// (Toolbox card, bridge ops import this same module — one source of truth).
//
// The engine is the user's own data motor: an Express server per deploy
// ("instance"), each instance a folder <root>/<name>/ with config.json
// ({ server: { port, host } }) and Admin/server.js. Ports are NOT stable and
// several instances can run at once, so nothing is ever assumed: instances are
// DISCOVERED from the configured roots and health-checked live each time.
//
// API contract (verified against the live server — see the 2026-07-21 handover
// report): records are created with POST /api/file (there is no POST /api/db),
// updated with PUT /api/db/:collection/:id (optimistic via expectedVersion),
// and deleted cleanly with DELETE /api/file (it also clears the search index).

import * as fs from 'fs';
import * as path from 'path';
import { AirtableMcpConfig } from './config';
import {
    buildMediaRecord, dateStrFromDate, deepMerge, extractFileMetadata,
    monthSegmentFromDate
} from './media';
import { buildSentenceRecord, SentenceRecordArgs } from './sentence';

type Dict = Record<string, unknown>;

// ---------------------------------------------------------------- discovery

export interface EngineInstance {
    name: string;          // folder name, e.g. "stem"
    dir: string;           // absolute instance folder
    host: string;
    port: number;
    configPath: string;
}

/** Read one folder as an instance, or undefined when it isn't one. */
function instanceAt(dir: string): EngineInstance | undefined {
    const configPath = path.join(dir, 'config.json');
    try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Dict;
        const server = (cfg.server ?? {}) as Dict;
        const port = Number(server.port);
        if (!Number.isInteger(port) || port <= 0) { return undefined; }
        return {
            name: path.basename(dir), dir, configPath,
            host: typeof server.host === 'string' && server.host ? server.host : 'localhost',
            port
        };
    } catch { return undefined; }
}

/** Scan the configured roots: every direct subfolder with a readable
 *  config.json (server.port) is an instance — and a root that IS an instance
 *  itself (the user picked e.g. …\db\stem instead of …\db) counts too, so
 *  either choice just works. Order: as configured, then a-z; dedup by dir. */
export function discoverInstances(roots: string[]): EngineInstance[] {
    const out: EngineInstance[] = [];
    const seen = new Set<string>();
    const add = (inst: EngineInstance | undefined) => {
        const key = inst && inst.dir.replace(/\\/g, '/').toLowerCase();
        if (inst && key && !seen.has(key)) { seen.add(key); out.push(inst); }
    };
    for (const root of roots) {
        add(instanceAt(root));
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
        for (const e of entries.filter(x => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
            add(instanceAt(path.join(root, e.name)));
        }
    }
    return out;
}

// ---------------------------------------------------------------- HTTP client

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; body: Dict }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: ctl.signal });
        const text = await res.text();
        let body: Dict = {};
        try { body = JSON.parse(text) as Dict; } catch { body = { raw: text.slice(0, 500) }; }
        return { status: res.status, body };
    } finally {
        clearTimeout(timer);
    }
}

export class EngineClient {
    constructor(readonly instance: EngineInstance, private timeoutMs: number) { }

    get base(): string { return `http://${this.instance.host}:${this.instance.port}`; }

    private url(p: string, params: Record<string, string | number | undefined> = {}): string {
        const u = new URL(this.base + p);
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== '') { u.searchParams.set(k, String(v)); }
        }
        return u.toString();
    }

    private async call(method: string, p: string, params: Record<string, string | number | undefined> = {}, body?: unknown): Promise<Dict> {
        const { status, body: json } = await fetchJson(this.url(p, params), {
            method,
            headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined
        }, this.timeoutMs);
        if (status >= 400) {
            const detail = typeof json.error === 'string' ? json.error : JSON.stringify(json).slice(0, 300);
            throw new Error(`${this.instance.name} ${method} ${p} → HTTP ${status}: ${detail}`);
        }
        return json;
    }

    /** GET /api/config — doubles as the health check. */
    config(): Promise<Dict> { return this.call('GET', '/api/config'); }

    stats(lang?: string): Promise<Dict> { return this.call('GET', '/api/stats', { lang }); }

    listCollection(collection: string, lang?: string): Promise<Dict> {
        return this.call('GET', `/api/db/${encodeURIComponent(collection)}`, { lang });
    }

    /** Collection listing normalized to an item array — the live engine answers
     *  a BARE ARRAY here (verified 2026-07-22), older shapes wrap in {items}. */
    async listItems(collection: string, lang?: string): Promise<Dict[]> {
        const listing = await this.listCollection(collection, lang) as unknown;
        if (Array.isArray(listing)) { return listing as Dict[]; }
        const items = (listing as Dict)?.items;
        return Array.isArray(items) ? items as Dict[] : [];
    }

    getRecord(collection: string, id: string, lang?: string): Promise<Dict> {
        return this.call('GET', `/api/db/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { lang });
    }

    /** PUT /api/db — update an EXISTING record (runs the engine's validation). */
    updateRecord(collection: string, id: string, payload: { item: Dict; expectedVersion?: number; backup?: boolean }, lang?: string): Promise<Dict> {
        return this.call('PUT', `/api/db/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { lang }, payload);
    }

    mediaTemplates(lang?: string): Promise<Dict> { return this.call('GET', '/api/media/templates', { lang }); }

    mediaTemplate(id: string, lang?: string): Promise<Dict> {
        return this.call('GET', `/api/media/templates/${encodeURIComponent(id)}`, { lang });
    }

    nextMediaId(mediaType: string, fileFormat: string, date: string, lang?: string): Promise<Dict> {
        return this.call('GET', '/api/media/next-id', { mediaType, fileFormat, date, lang });
    }

    nextCollectionId(collection: string, date: string, lang?: string): Promise<Dict> {
        return this.call('GET', `/api/collections/${encodeURIComponent(collection)}/next-id`, { date, lang });
    }

    /** POST /api/file — the real create path (no validation; index auto-updates). */
    createFile(rel: string, item: Dict, lang?: string): Promise<Dict> {
        return this.call('POST', '/api/file', { lang }, { rel, item });
    }

    /** DELETE /api/file — the clean delete (file AND search index). */
    deleteFile(rel: string, mode: 'trash' | 'hard', lang?: string): Promise<Dict> {
        return this.call('DELETE', '/api/file', { rel, mode, lang });
    }

    saveNote(notePath: string, content: string, lang?: string): Promise<Dict> {
        return this.call('POST', '/api/notes/save', { lang }, { path: notePath, content });
    }
}

export interface LiveInstance extends EngineInstance {
    alive: boolean;
    title?: string;
    error?: string;
}

/** Health-check one instance (short timeout — a dead port must not stall the tool). */
export async function checkInstance(inst: EngineInstance, timeoutMs = 1500): Promise<LiveInstance> {
    try {
        const cfg = await new EngineClient(inst, timeoutMs).config();
        const ui = (cfg.ui ?? {}) as Dict;
        const branding = (ui.branding ?? {}) as Dict;
        return { ...inst, alive: true, title: typeof branding.title === 'string' ? branding.title : undefined };
    } catch (e) {
        return { ...inst, alive: false, error: (e as Error).message.slice(0, 200) };
    }
}

export function checkInstances(list: EngineInstance[], timeoutMs = 1500): Promise<LiveInstance[]> {
    return Promise.all(list.map(i => checkInstance(i, timeoutMs)));
}

/** Pick the instance a tool call should talk to:
 *  explicit name → config default → the single LIVE one. Errors explain what
 *  exists and what is actually running, so the agent can self-correct. */
export async function resolveInstance(config: AirtableMcpConfig, name?: string): Promise<EngineClient> {
    const all = discoverInstances(config.databaseRoots);
    if (!all.length) {
        throw new Error('No engine instances found under: '
            + (config.databaseRoots.join(', ') || '(no database root configured)')
            + '. Each instance is a subfolder with its own config.json.');
    }
    const wanted = (name ?? '').trim() || config.defaultInstance;
    if (wanted) {
        const inst = all.find(i => i.name.toLowerCase() === wanted.toLowerCase());
        if (!inst) {
            throw new Error(`Instance "${wanted}" not found. Known instances: ${all.map(i => i.name).join(', ')}.`);
        }
        const live = await checkInstance(inst);
        if (!live.alive) {
            throw new Error(`Instance "${inst.name}" (port ${inst.port}) is not running — ${live.error}. `
                + `Start it with ${path.join(inst.dir, 'start_admin.bat')} or pick a running one via airtable_instances.`);
        }
        return new EngineClient(inst, config.requestTimeoutMs);
    }
    const live = (await checkInstances(all)).filter(i => i.alive);
    if (live.length === 1) { return new EngineClient(live[0], config.requestTimeoutMs); }
    if (!live.length) {
        throw new Error(`None of the ${all.length} known instance(s) is running (${all.map(i => `${i.name}:${i.port}`).join(', ')}). `
            + 'Start one, or check airtable_instances.');
    }
    throw new Error(`${live.length} instances are running (${live.map(i => i.name).join(', ')}) — `
        + 'say which one with the "instance" argument, or set agentFarm.airtable.defaultInstance.');
}

// ---------------------------------------------------------------- search

export interface SearchHit {
    id: string;
    topic?: string;
    subtopic?: string;
    content?: string;
    status?: string;
    tags?: string[];
    file_path?: string;
    __file_rel?: string;
}

/** Case-insensitive substring search over the fields that identify a record
 *  (id/topic/subtopic/content/description/tags/generation prompt). `tags`
 *  requires EVERY given tag; `query` may match any field. Pure — unit-tested. */
export function searchRecords(items: Dict[], query?: string, tags?: string[]): Dict[] {
    const q = (query ?? '').trim().toLowerCase();
    const wantedTags = (tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean);
    return items.filter(it => {
        if (wantedTags.length) {
            const has = new Set((Array.isArray(it.tags) ? it.tags as unknown[] : [])
                .map(t => String(t).toLowerCase()));
            if (!wantedTags.every(t => has.has(t))) { return false; }
        }
        if (!q) { return true; }
        const prov = (it.provenance ?? {}) as Dict;
        const hay = [
            it.id, it.topic, it.subtopic, it.content, it.description, it.name,
            prov.generation_prompt,
            ...(Array.isArray(it.tags) ? it.tags as unknown[] : [])
        ].filter(v => typeof v === 'string').join('\n').toLowerCase();
        return hay.includes(q);
    });
}

/** Trim a full record down to what a search listing needs. */
export function summarizeRecord(it: Dict): SearchHit {
    const media = (it.media ?? {}) as Dict;
    return {
        id: String(it.id ?? ''),
        topic: typeof it.topic === 'string' && it.topic ? it.topic : undefined,
        subtopic: typeof it.subtopic === 'string' && it.subtopic ? it.subtopic : undefined,
        content: typeof it.content === 'string' && it.content ? String(it.content).slice(0, 200) : undefined,
        status: typeof it.status === 'string' ? it.status : undefined,
        tags: Array.isArray(it.tags) && it.tags.length ? (it.tags as unknown[]).map(String) : undefined,
        file_path: typeof media.file_path === 'string' && media.file_path ? media.file_path : undefined,
        __file_rel: typeof it.__file_rel === 'string' ? it.__file_rel : undefined
    };
}

// ---------------------------------------------------------------- media save / scan

export interface MediaSaveArgs {
    file: string;
    topic?: string; subtopic?: string; content?: string; description?: string; name?: string;
    tags?: string[]; style?: string; content_role?: string; usage_context?: string;
    status?: string;
    template?: string;
    provenance?: Dict; failure?: Dict; extra?: Dict;
    lang?: string;
}

/** The heart: create a media record referencing `file` by absolute path
 *  (the file is NOT moved or copied). Steps per the API contract:
 *  metadata → next-id → skeleton (+ template) → POST /api/file. */
export async function saveMedia(client: EngineClient, args: MediaSaveArgs): Promise<{ id: string; rel: string; record: Dict }> {
    const absPath = path.resolve(args.file);
    if (!fs.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath} — the record must reference a real file.`);
    }
    const fileMeta = await extractFileMetadata(absPath);
    const date = dateStrFromDate();
    const idRes = await client.nextMediaId(fileMeta.mediaType, fileMeta.fileFormat, date, args.lang);
    const id = String(idRes.nextId ?? '');
    if (!id) { throw new Error('Engine returned no nextId for the media record.'); }

    let templateItem: Dict | null = null;
    if (args.template) {
        const t = await client.mediaTemplate(args.template, args.lang);
        templateItem = (t.item ?? null) as Dict | null;
        if (!templateItem) { throw new Error(`Template "${args.template}" has no item body.`); }
    }

    const record = buildMediaRecord({
        id, absPath, fileMeta, templateItem,
        lang: args.lang, status: args.status,
        topic: args.topic, subtopic: args.subtopic, content: args.content,
        description: args.description, name: args.name,
        tags: args.tags, style: args.style, content_role: args.content_role,
        usage_context: args.usage_context,
        provenance: args.provenance, failure: args.failure, extra: args.extra
    });
    const rel = `db/media/${monthSegmentFromDate()}/${id}.json`;
    await client.createFile(rel, record, args.lang);
    return { id, rel, record };
}

const norm = (p: string): string => String(p || '').replace(/\\/g, '/').toLowerCase();

export interface FolderScan {
    folder: string;
    total: number;
    newFiles: string[];
    known: { file: string; id: string }[];
    skipped: string[];
}

/** Which files in `folder` already have a media record (matched on
 *  media.file_path) and which are new — feeds the ingest loop. */
export async function scanFolder(client: EngineClient, folder: string, lang?: string, recursive = true): Promise<FolderScan> {
    const absFolder = path.resolve(folder);
    if (!fs.existsSync(absFolder)) { throw new Error(`Folder not found: ${absFolder}`); }
    const files: string[] = [];
    const skipped: string[] = [];
    const walk = (dir: string, depth: number) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { skipped.push(dir); return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (recursive && depth < 6) { walk(p, depth + 1); }
                continue;
            }
            if (e.isFile()) { files.push(p); }
        }
    };
    walk(absFolder, 0);

    const items = await client.listItems('media', lang);
    const byPath = new Map<string, string>();
    for (const it of items) {
        const media = (it.media ?? {}) as Dict;
        if (typeof media.file_path === 'string' && media.file_path) {
            byPath.set(norm(media.file_path), String(it.id ?? ''));
        }
    }

    const newFiles: string[] = [];
    const known: { file: string; id: string }[] = [];
    for (const f of files.sort()) {
        const id = byPath.get(norm(f));
        if (id) { known.push({ file: f, id }); } else { newFiles.push(f); }
    }
    return { folder: absFolder, total: files.length, newFiles, known, skipped };
}

// ---------------------------------------------------------------- knowledge save

export async function saveSentence(client: EngineClient, args: Omit<SentenceRecordArgs, 'id'>): Promise<{ id: string; rel: string; record: Dict }> {
    const date = dateStrFromDate();
    const idRes = await client.nextCollectionId('sentences', date, args.lang);
    const id = String(idRes.nextId ?? '');
    if (!id) { throw new Error('Engine returned no nextId for the sentence record.'); }
    const record = buildSentenceRecord({ ...args, id });
    const rel = `db/sentences/${monthSegmentFromDate()}/${id}.json`;
    await client.createFile(rel, record, args.lang);
    return { id, rel, record };
}

// ---------------------------------------------------------------- record update

/** Merge `patch` into the CURRENT record and PUT it back with optimistic
 *  concurrency (expectedVersion from the read) — a lost-update here would
 *  silently overwrite panel edits. */
export async function updateRecord(client: EngineClient, collection: string, id: string, patch: Dict, lang?: string): Promise<Dict> {
    const current = await client.getRecord(collection, id, lang);
    const item = (current.item ?? {}) as Dict;
    const version = typeof current.version === 'number' ? current.version : undefined;
    deepMerge(item, patch);
    return client.updateRecord(collection, id, { item, expectedVersion: version, backup: true }, lang);
}
