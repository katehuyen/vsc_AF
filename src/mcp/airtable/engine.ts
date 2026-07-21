// EngineRegistry: discovers Airtable engine instances and talks to their HTTP API.
//
// An "instance" is a folder like W:/zome/db/stem that contains a config.json with
// server.port. Multiple instances run at once on different (changeable) ports, so
// we never hard-code a port: we scan the configured roots, read each config.json,
// and health-check the port to see which are actually live.
//
// This module is pure Node (no vscode import) so it runs both inside the spawned
// MCP process AND inside the extension host (bridge ops, ingest linking).

import * as fs from 'fs';
import * as path from 'path';
import {
    extractFileMetadata, buildMediaRecord, monthSegmentFromDate, dateStrFromDate,
    normalizeFileFormat, guessMediaType, FileMeta, deepMerge,
} from './media';
import { buildSentenceRecord, SentenceRecordArgs } from './sentence';

type Dict = Record<string, unknown>;

export interface ExplicitInstance {
    name: string; host?: string; port: number; dbPath?: string; title?: string; root?: string;
}

export interface EngineConfig {
    roots: string[];
    instances: ExplicitInstance[];
    defaultInstance: string;
    defaultLang: string;
    host: string;
    mediaRoots: string[];
    requestTimeoutMs: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
    roots: ['W:/zome/db'],
    instances: [],
    defaultInstance: 'stem',
    defaultLang: 'TR',
    host: 'localhost',
    mediaRoots: ['D:/zome/media'],
    requestTimeoutMs: 8000,
};

/** Load config from an explicit path or the AIRTABLE_MCP_CONFIG env var; gaps
 *  are filled by DEFAULT_CONFIG so the server always starts. */
export function loadEngineConfig(explicitPath?: string): EngineConfig & { __source: string } {
    const candidates = [explicitPath, process.env.AIRTABLE_MCP_CONFIG].filter(Boolean) as string[];
    let fileCfg: Partial<EngineConfig> | null = null;
    let source = '(defaults)';
    for (const c of candidates) {
        try {
            if (fs.existsSync(c)) {
                const raw = JSON.parse(fs.readFileSync(c, 'utf8')) as Dict;
                fileCfg = {};
                for (const [k, v] of Object.entries(raw)) { if (!k.startsWith('__')) { (fileCfg as Dict)[k] = v; } }
                source = c;
                break;
            }
        } catch (e) {
            process.stderr.write(`[airtable-mcp] config parse error in ${c}: ${(e as Error).message}\n`);
        }
    }
    const cfg = { ...DEFAULT_CONFIG, ...(fileCfg || {}) } as EngineConfig;
    cfg.roots = Array.isArray(cfg.roots) ? cfg.roots : [];
    cfg.instances = Array.isArray(cfg.instances) ? cfg.instances : [];
    cfg.mediaRoots = Array.isArray(cfg.mediaRoots) ? cfg.mediaRoots : [];
    cfg.requestTimeoutMs = Number(cfg.requestTimeoutMs) || DEFAULT_CONFIG.requestTimeoutMs;
    return { ...cfg, __source: source };
}

export interface Instance {
    name: string; host: string; port: number; dbPath: string;
    title: string; root: string | null; live?: boolean;
}

interface FetchOpts { method?: string; body?: unknown; timeoutMs?: number; }

export class EngineError extends Error {
    status?: number;
    data?: unknown;
}

export class EngineRegistry {
    private _instances: Instance[] | null = null;

    constructor(public cfg: EngineConfig) { }

    // --- Discovery -----------------------------------------------------------

    private scanRoots(): Instance[] {
        const found = new Map<string, Instance>();
        for (const root of this.cfg.roots) {
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
            for (const ent of entries) {
                if (!ent.isDirectory()) { continue; }
                const instDir = path.join(root, ent.name);
                const cfgPath = path.join(instDir, 'config.json');
                if (!fs.existsSync(cfgPath)) { continue; }
                try {
                    const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Dict;
                    const server = (j.server ?? {}) as Dict;
                    const port = Number(server.port);
                    if (!port) { continue; }
                    found.set(ent.name, {
                        name: ent.name,
                        host: (server.host as string) || this.cfg.host || 'localhost',
                        port,
                        dbPath: ((j.database as Dict)?.path as string) || './db',
                        title: (((j.ui as Dict)?.branding as Dict)?.title as string) || ent.name,
                        root: instDir,
                    });
                } catch { /* unreadable config */ }
            }
        }
        for (const inst of this.cfg.instances) {
            if (!inst?.name || !inst?.port) { continue; }
            found.set(inst.name, {
                name: inst.name, host: inst.host || this.cfg.host || 'localhost', port: inst.port,
                dbPath: inst.dbPath || './db', title: inst.title || inst.name, root: inst.root || null,
            });
        }
        return [...found.values()];
    }

    baseUrl(inst: Instance): string { return `http://${inst.host}:${inst.port}`; }

    private async healthCheck(inst: Instance): Promise<{ live: boolean; title?: string }> {
        try {
            const r = await this.rawFetch(this.baseUrl(inst) + '/api/config', { timeoutMs: 2500 });
            if (r.ok) {
                const data = await r.json().catch(() => null) as Dict | null;
                return { live: true, title: (((data?.ui as Dict)?.branding as Dict)?.title as string) || inst.title };
            }
        } catch { /* not running */ }
        return { live: false };
    }

    async instances({ force = false, healthCheck = true } = {}): Promise<Instance[]> {
        if (this._instances && !force) { return this._instances; }
        const scanned = this.scanRoots();
        if (healthCheck) {
            await Promise.all(scanned.map(async (inst) => {
                const hc = await this.healthCheck(inst);
                inst.live = hc.live;
                if (hc.title) { inst.title = hc.title; }
            }));
        }
        this._instances = scanned;
        return scanned;
    }

    async resolveInstance(nameOrNull?: string): Promise<Instance> {
        const list = await this.instances();
        const name = nameOrNull || this.cfg.defaultInstance;
        let inst = list.find((i) => i.name === name);
        if (!inst && !nameOrNull && list.length === 1) { inst = list[0]; }
        if (!inst) {
            const names = list.map((i) => `${i.name}(${i.port}${i.live ? '' : ', offline'})`).join(', ') || '(none found)';
            throw new EngineError(`instance '${name}' not found. Known: ${names}`);
        }
        return inst;
    }

    // --- HTTP core -----------------------------------------------------------

    private async rawFetch(url: string, { method = 'GET', body, timeoutMs }: FetchOpts = {}): Promise<Response> {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs || this.cfg.requestTimeoutMs);
        try {
            const headers: Record<string, string> = {};
            let payload: string | undefined;
            if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
            return await fetch(url, { method, signal: ctrl.signal, headers, body: payload });
        } finally { clearTimeout(t); }
    }

    private async json<T = unknown>(
        inst: Instance, apiPath: string,
        { method = 'GET', body, query }: { method?: string; body?: unknown; query?: Record<string, string> } = {}
    ): Promise<T> {
        const q = query ? '?' + new URLSearchParams(query).toString() : '';
        const url = this.baseUrl(inst) + apiPath + q;
        const res = await this.rawFetch(url, { method, body });
        const text = await res.text();
        let data: unknown = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        if (!res.ok) {
            const d = data as Dict | null;
            const detail = (d?.error as string) || (d?.detail as string) || res.statusText;
            const err = new EngineError(`${method} ${apiPath} -> ${res.status} ${detail}`);
            err.status = res.status; err.data = data;
            throw err;
        }
        return data as T;
    }

    // --- API wrappers --------------------------------------------------------

    private lang(l?: string): string { return l || this.cfg.defaultLang; }

    stats(inst: Instance): Promise<Dict> { return this.json(inst, '/api/stats'); }
    schemas(inst: Instance): Promise<Dict> { return this.json(inst, '/api/schemas'); }

    listCollection(inst: Instance, collection: string, lang?: string): Promise<unknown> {
        return this.json(inst, `/api/db/${encodeURIComponent(collection)}`, { query: { lang: this.lang(lang) } });
    }

    async getItem(inst: Instance, collection: string, id: string, lang?: string): Promise<Dict> {
        const data = await this.json<Dict>(inst, `/api/db/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
            { query: { lang: this.lang(lang) } });
        return (data?.item as Dict) || data;
    }

    mediaTemplates(inst: Instance, lang?: string): Promise<unknown> {
        return this.json(inst, '/api/media/templates', { query: { lang: this.lang(lang) } });
    }

    async mediaTemplate(inst: Instance, id: string, lang?: string): Promise<Dict> {
        const data = await this.json<Dict>(inst, `/api/media/templates/${encodeURIComponent(id)}`,
            { query: { lang: this.lang(lang) } });
        return (data?.item as Dict) || data;
    }

    mediaNextId(inst: Instance, a: { mediaType?: string; fileFormat?: string; dateStr?: string; lang?: string }): Promise<Dict> {
        return this.json(inst, '/api/media/next-id', {
            query: {
                lang: this.lang(a.lang), mediaType: a.mediaType || '',
                fileFormat: a.fileFormat || '', date: a.dateStr || dateStrFromDate(),
            },
        });
    }

    collectionNextId(inst: Instance, collection: string, a: { dateStr?: string; prefix?: string; lang?: string } = {}): Promise<Dict> {
        return this.json(inst, `/api/collections/${encodeURIComponent(collection)}/next-id`, {
            query: { lang: this.lang(a.lang), date: a.dateStr || dateStrFromDate(), prefix: a.prefix || '' },
        });
    }

    createFile(inst: Instance, a: { rel: string; item: Dict; lang?: string }): Promise<Dict> {
        return this.json(inst, '/api/file', { method: 'POST', query: { lang: this.lang(a.lang) }, body: { rel: a.rel, item: a.item } });
    }

    updateFile(inst: Instance, a: { rel: string; item: Dict; expectedVersion?: number; lang?: string }): Promise<Dict> {
        const body: Dict = { rel: a.rel, item: a.item, backup: true };
        if (a.expectedVersion !== undefined) { body.expectedVersion = a.expectedVersion; }
        return this.json(inst, '/api/file', { method: 'PUT', query: { lang: this.lang(a.lang) }, body });
    }

    deleteFile(inst: Instance, a: { rel: string; mode?: 'trash' | 'hard'; lang?: string }): Promise<Dict> {
        return this.json(inst, '/api/file', { method: 'DELETE', query: { lang: this.lang(a.lang), rel: a.rel, mode: a.mode || 'hard' } });
    }

    saveNote(inst: Instance, a: { path: string; content: string }): Promise<Dict> {
        return this.json(inst, '/api/notes/save', { method: 'POST', body: { path: a.path, content: a.content } });
    }

    // --- File-path resolution ------------------------------------------------

    resolveMediaFile(filePath: string): string {
        const raw = String(filePath || '').trim();
        if (!raw) { throw new EngineError('file_path is required'); }
        const norm = raw.replace(/\//g, path.sep).replace(/\\/g, path.sep);
        const candidates: string[] = [];
        if (path.isAbsolute(norm)) { candidates.push(norm); }
        else {
            for (const mr of this.cfg.mediaRoots) { candidates.push(path.resolve(mr, norm)); }
            candidates.push(path.resolve(norm));
        }
        for (const c of candidates) { if (fs.existsSync(c)) { return c; } }
        throw new EngineError(`file not found: ${raw} (looked in: ${candidates.join(' | ')})`);
    }

    // Collapse backslashes AND the stray double-slash the panel sometimes writes
    // (e.g. ".../raw//file.png") so dedup matches panel-made records too.
    private static normPath(p: string): string {
        return String(p || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
    }

    /** Find an existing media record that references this file (idempotency). */
    async findMediaByFilePath(inst: Instance, absPath: string, lang?: string): Promise<string | null> {
        const target = EngineRegistry.normPath(absPath);
        try {
            const raw = await this.listCollection(inst, 'media', lang);
            const arr = (Array.isArray(raw) ? raw : ((raw as Dict)?.items as unknown[])) || [];
            for (const it of arr as Dict[]) {
                const fp = (it?.media as Dict)?.file_path as string;
                if (fp && EngineRegistry.normPath(fp) === target) { return it.id as string; }
            }
        } catch { /* offline or empty */ }
        return null;
    }

    // --- High-level: save one media record -----------------------------------

    async mediaSave(instName: string | undefined, args: Dict): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        if (inst.live === false) {
            throw new EngineError(`instance '${inst.name}' is not running (port ${inst.port}). Start it, then retry.`);
        }
        const lang = (args.lang as string) || this.cfg.defaultLang;
        const absPath = this.resolveMediaFile(args.file_path as string);

        if (args.skip_if_exists === true) {
            const existing = await this.findMediaByFilePath(inst, absPath, lang);
            if (existing) { return { ok: true, id: existing, instance: inst.name, skipped: 'already_in_db', file_path: absPath.replace(/\\/g, '/') }; }
        }

        const fileMeta: FileMeta = await extractFileMetadata(absPath);
        const now = new Date();
        const idInfo = await this.mediaNextId(inst, { mediaType: fileMeta.mediaType, fileFormat: fileMeta.fileFormat, dateStr: dateStrFromDate(now), lang });
        const id = (idInfo?.nextId as string) || `media_${Date.now()}`;

        let templateItem: Dict | null = null;
        if (args.template) {
            try { templateItem = await this.mediaTemplate(inst, args.template as string, lang); }
            catch (e) { throw new EngineError(`template '${args.template}' could not be loaded: ${(e as Error).message}`); }
        }

        const record = buildMediaRecord({
            id, lang, status: (args.status as string) || 'draft', absPath, fileMeta,
            topic: args.topic as string, subtopic: args.subtopic as string, content: args.content as string,
            description: args.description as string, name: args.name as string,
            tags: args.tags as string[], style: args.style as string, content_role: args.content_role as string,
            usage_context: args.usage_context as string,
            provenance: args.provenance as Dict, failure: args.failure as Dict, extra: args.extra as Dict,
            templateItem,
        });

        const rel = `db/media/${monthSegmentFromDate(now)}/${id}.json`;
        const result = await this.createFile(inst, { rel, item: record, lang });
        return {
            ok: true, id, rel, instance: inst.name, lang,
            file_path: (record.media as Dict).file_path,
            media_type: fileMeta.mediaType, width: fileMeta.width, height: fileMeta.height,
            version: (result?.version as number) ?? 1,
            panel: `${this.baseUrl(inst)}/  (collection: media, id: ${id})`,
        };
    }

    // --- High-level: update an existing media record -------------------------
    // Uses PUT /api/db/:collection/:id — the engine resolves the file, checks the
    // version, writes a .bak, bumps version, re-orders keys, updates the index and
    // audit log. We never compute the file path ourselves.

    async mediaUpdate(instName: string | undefined, args: Dict): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        const id = String(args.id || '');
        if (!id) { throw new EngineError('id is required'); }
        const lang = (args.lang as string) || this.cfg.defaultLang;
        const got = await this.json<{ item: Dict; version?: number }>(inst, `/api/db/media/${encodeURIComponent(id)}`, { query: { lang } });
        const merged: Dict = { ...(got.item || {}) };
        for (const k of ['__file_rel', '__file_name', '__file_abs', '__file_is_bak']) { delete merged[k]; }
        if (args.patch && typeof args.patch === 'object') { deepMerge(merged, args.patch as Dict); }
        const result = await this.json<Dict>(inst, `/api/db/media/${encodeURIComponent(id)}`, {
            method: 'PUT', query: { lang }, body: { item: merged, expectedVersion: got.version, backup: true },
        });
        return { ok: true, id, instance: inst.name, version: (result?.version as number) ?? got.version };
    }

    // --- High-level: save a knowledge atom (sentence) ------------------------

    async knowledgeSave(instName: string | undefined, args: Dict): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        if (inst.live === false) { throw new EngineError(`instance '${inst.name}' is not running (port ${inst.port}).`); }
        const lang = (args.lang as string) || this.cfg.defaultLang;
        const content = String(args.content || '').trim();
        if (!content) { throw new EngineError('content is required for a knowledge atom'); }
        const now = new Date();
        const idInfo = await this.collectionNextId(inst, 'sentences', { dateStr: dateStrFromDate(now), lang });
        const id = (idInfo?.nextId as string) || `sent_${dateStrFromDate(now)}_${Date.now()}`;
        // args first, then id/lang so the computed identity always wins.
        const record = buildSentenceRecord({ ...(args as object), id, lang } as SentenceRecordArgs);
        const rel = `db/sentences/${monthSegmentFromDate(now)}/${id}.json`;
        const result = await this.createFile(inst, { rel, item: record, lang });
        return { ok: true, id, rel, instance: inst.name, lang, word_count: record.word_count, version: (result?.version as number) ?? 1 };
    }

    // --- High-level: save a free-form note -----------------------------------

    async noteSave(instName: string | undefined, args: Dict): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        const notePath = String(args.path || '').trim();
        const content = String(args.content || '');
        if (!notePath) { throw new EngineError('path is required (e.g. "ideas/2026-07/topic.md")'); }
        const result = await this.saveNote(inst, { path: notePath, content });
        return { ok: true, instance: inst.name, path: notePath, result };
    }

    // --- High-level: scan a folder for media, mark which are already in the DB -

    async mediaScanFolder(instName: string | undefined, a: { folder: string; recursive?: boolean; lang?: string }): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        const abs = this.resolveMediaFile(a.folder);
        const st = await fs.promises.stat(abs);
        if (!st.isDirectory()) { throw new EngineError(`not a folder: ${a.folder}`); }

        const known = new Map<string, string>();
        if (inst.live !== false) {
            try {
                const raw = await this.listCollection(inst, 'media', a.lang);
                const arr = (Array.isArray(raw) ? raw : ((raw as Dict)?.items as unknown[])) || [];
                for (const it of arr as Dict[]) {
                    const fp = (it?.media as Dict)?.file_path as string;
                    if (fp) { known.set(EngineRegistry.normPath(fp), it.id as string); }
                }
            } catch { /* mark all as unknown */ }
        }

        const results: Dict[] = [];
        const walk = (dir: string): void => {
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const e of entries) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) { if (a.recursive) { walk(p); } continue; }
                const fmt = normalizeFileFormat(e.name);
                const type = guessMediaType(fmt);
                if (type === 'unknown') { continue; }
                const norm = p.replace(/\\/g, '/');
                const existingId = known.get(EngineRegistry.normPath(p)) || null;
                let size = 0;
                try { size = fs.statSync(p).size; } catch { /* vanished */ }
                results.push({
                    file_path: norm, file_name: e.name, media_type: type, file_format: fmt,
                    file_size_bytes: size, in_db: !!existingId, existing_id: existingId,
                });
            }
        };
        walk(abs);
        return {
            instance: inst.name, folder: abs.replace(/\\/g, '/'),
            total: results.length, new_count: results.filter((r) => !r.in_db).length, items: results,
        };
    }

    // --- High-level: search a collection -------------------------------------

    async search(instName: string | undefined, a: { collection?: string; query?: string; tags?: string[]; status?: string; limit?: number; lang?: string }): Promise<Dict> {
        const inst = await this.resolveInstance(instName);
        const collection = a.collection || 'media';
        const raw = await this.listCollection(inst, collection, a.lang);
        const arr = ((Array.isArray(raw) ? raw : ((raw as Dict)?.items as unknown[])) || []) as Dict[];
        const q = String(a.query || '').toLowerCase().trim();
        const wantTags = (a.tags || []).map((t) => String(t).toLowerCase());

        const matches = arr.filter((it) => {
            if (a.status && String(it.status || '') !== a.status) { return false; }
            if (wantTags.length) {
                const itemTags = ((it.tags as string[]) || []).map((t) => String(t).toLowerCase());
                if (!wantTags.every((wt) => itemTags.some((t) => t.includes(wt)))) { return false; }
            }
            if (q) {
                const hay = [
                    it.id, it.topic, it.subtopic, it.point, it.content, it.description, it.name,
                    ((it.tags as string[]) || []).join(' '),
                    (it.provenance as Dict)?.generation_prompt,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) { return false; }
            }
            return true;
        });

        const limit = a.limit || 25;
        const slim = matches.slice(0, limit).map((it) => ({
            id: it.id, status: it.status, topic: it.topic,
            tags: it.tags, media_type: (it.media as Dict)?.type, file_path: (it.media as Dict)?.file_path,
            description: it.description || it.content,
        }));
        return { instance: inst.name, collection, total_matched: matches.length, returned: slim.length, items: slim };
    }
}
