import * as fs from 'fs';
import * as path from 'path';

/**
 * ‼️ X-44 — A ROLLOUT IN `~/.codex/sessions` IS NOT PROOF THAT CODEX DID THE WORK.
 *
 * Codex Desktop converts other agents' history into its OWN rollout format and
 * files it beside the threads it really ran. The extension read the folder as
 * the engine, so a 13-minute, $12.47 headless Claude mission that Agent Farm
 * itself launched was listed as a 13-millisecond, $0, user-typed Codex session
 * — and counted again beside its own source. Three separate facts were riding
 * on one `engine` field:
 *
 *   producer  — which engine actually did the work        (here: claude)
 *   storage   — which format the file on disk is in       (here: codex)
 *   provenance— native, or a copy of somebody else's run  (here: imported)
 *
 * The manifest Codex writes states the link itself, so nothing here is guessed:
 * `~/.codex/external_agent_session_imports.json` maps each imported thread id
 * to the source transcript's path, its content hash and the import time. When
 * the manifest is missing, unreadable or silent about a thread, the raw
 * `<EXTERNAL SESSION IMPORTED>` / `external-import-turn-*` marks are enough to
 * say "this is a copy of something" and NOT enough to name the producer — which
 * is reported as `imported-unknown-source` rather than filled in with a guess.
 *
 * READ ONLY. Nothing in this module writes to the user's transcripts or to the
 * Codex manifest; canonicalization is a reading of what is already on disk.
 */

/** The raw mark Codex Desktop leaves inside a converted rollout. */
export const EXTERNAL_IMPORT_MARK = '<EXTERNAL SESSION IMPORTED>';
/** `task_started.turn_id` on a converted rollout — `external-import-turn-1`, … */
export const EXTERNAL_IMPORT_TURN = /^external-import-turn-/;

export interface ExternalImportRecord {
    importedThreadId: string;
    /** Source transcript path, with Windows' `\\?\` long-path prefix removed. */
    sourcePath: string;
    /** Claude names a transcript after its session — so the basename IS the id. */
    sourceSessionId: string;
    contentSha256: string;
    /** ms — when the copy was made (NOT when the work ran). */
    importedAt: number;
    /** ms — the source file's mtime as the importer saw it, when stated. */
    sourceModifiedAt?: number;
    /** The engine that produced the source, from the path shape; may be absent. */
    producerEngine?: string;
}

export interface ExternalImportManifest {
    file: string;
    /** How many records were understood (0 with `broken` = the file is unusable). */
    records: number;
    byThread: Map<string, ExternalImportRecord>;
    /** The file exists but could not be read as the expected shape. */
    broken?: boolean;
}

export function emptyImportManifest(file = ''): ExternalImportManifest {
    return { file, records: 0, byThread: new Map() };
}

/** `\\?\D:\x\y.jsonl` → `D:\x\y.jsonl`. Left alone on every other shape. */
export function stripLongPathPrefix(p: string): string {
    const s = String(p ?? '');
    if (s.startsWith('\\\\?\\UNC\\')) { return '\\\\' + s.slice(8); }
    return s.startsWith('\\\\?\\') ? s.slice(4) : s;
}

/**
 * Which engine wrote the source file, from the shape of its path — the one
 * inference here, and a structural one: `…/<something>/projects/<slug>/<uuid>.jsonl`
 * is Claude's own layout and no other CLI in this extension uses it. A path that
 * does not read as any known layout returns undefined, and the caller reports
 * `imported-unknown-source` rather than naming an engine it cannot see.
 */
export function producerEngineOfSourcePath(sourcePath: string): string | undefined {
    const p = stripLongPathPrefix(sourcePath).replace(/\\/g, '/').toLowerCase();
    if (/(^|\/)(\.claude|claude)\/projects\/[^/]+\/[^/]+\.jsonl$/.test(p)) { return 'claude'; }
    if (/(^|\/)\.gemini\/tmp\/[^/]+\/chats\//.test(p)) { return 'gemini'; }
    if (/(^|\/)\.codex\/(archived_)?sessions\//.test(p)) { return 'codex'; }
    return undefined;
}

/** Seconds, milliseconds or nanoseconds since the epoch, normalized to ms. */
function toMs(v: unknown): number | undefined {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) { return undefined; }
    if (n > 1e17) { return Math.round(n / 1e6); }  // nanoseconds
    if (n > 1e14) { return Math.round(n / 1e3); }  // microseconds
    if (n > 1e11) { return Math.round(n); }        // milliseconds
    return Math.round(n * 1000);                   // seconds
}

/**
 * One manifest, parsed fail-soft: a malformed record is skipped, a malformed
 * FILE is `broken` with no records. Neither is an error — a source that cannot
 * be read contributes no canonicalization and every session stays visible.
 */
export function parseImportManifest(raw: string, file: string): ExternalImportManifest {
    const out = emptyImportManifest(file);
    let doc: unknown;
    try { doc = JSON.parse(raw); } catch { out.broken = true; return out; }
    const records = Array.isArray(doc) ? doc
        : (doc && typeof doc === 'object' && Array.isArray((doc as { records?: unknown[] }).records)
            ? (doc as { records: unknown[] }).records : undefined);
    if (!records) { out.broken = true; return out; }
    for (const r of records) {
        if (!r || typeof r !== 'object') { continue; }
        const rec = r as Record<string, unknown>;
        const thread = typeof rec.imported_thread_id === 'string' ? rec.imported_thread_id.trim() : '';
        const src = typeof rec.source_path === 'string' ? stripLongPathPrefix(rec.source_path) : '';
        if (!thread || !src) { continue; }
        const base = path.basename(src).replace(/\.jsonl$/i, '');
        out.byThread.set(thread, {
            importedThreadId: thread,
            sourcePath: src,
            sourceSessionId: base,
            contentSha256: typeof rec.content_sha256 === 'string' ? rec.content_sha256 : '',
            importedAt: toMs(rec.imported_at) ?? 0,
            ...(toMs(rec.source_modified_at) ? { sourceModifiedAt: toMs(rec.source_modified_at) } : {}),
            ...(producerEngineOfSourcePath(src) ? { producerEngine: producerEngineOfSourcePath(src) } : {})
        });
    }
    out.records = out.byThread.size;
    return out;
}

/** The manifest's path inside a Codex home. */
export function importManifestPath(codexHome: string): string {
    return path.join(codexHome, 'external_agent_session_imports.json');
}

/**
 * A reader with a size+mtime signature cache. The manifest is read once per
 * change, not once per rollout: fifty imported threads in one scan would
 * otherwise re-read and re-parse the same file fifty times.
 */
export function importManifestReader(
    codexHome: () => string, cacheMs = 60_000
): () => ExternalImportManifest {
    let cache = emptyImportManifest();
    let cachedSig = '';
    let last = 0;
    return () => {
        const home = codexHome();
        if (!home) { return cache = emptyImportManifest(); }
        const file = importManifestPath(home);
        let st: fs.Stats;
        try { st = fs.statSync(file); } catch { cachedSig = ''; return cache = emptyImportManifest(file); }
        const sig = `${st.size}:${st.mtimeMs}`;
        const now = Date.now();
        if (sig === cachedSig && now - last < cacheMs) { return cache; }
        cachedSig = sig;
        last = now;
        try { cache = parseImportManifest(fs.readFileSync(file, 'utf8'), file); }
        catch { cache = { ...emptyImportManifest(file), broken: true }; }
        return cache;
    };
}

/** What a rollout's own text says about being a copy — no manifest involved. */
export interface ImportMarks {
    /** `external-import-turn-*` turn ids, or the literal imported mark. */
    marked: boolean;
    /** `session_meta.originator`, verbatim — evidence, never a verdict: a native
     *  Codex Desktop thread says the same thing. */
    originator?: string;
}

export type SessionProvenance = 'native' | 'imported' | 'imported-unknown-source';

export interface ResolvedProvenance {
    provenance: SessionProvenance;
    /** The engine that did the work — absent when the source cannot be named. */
    producerEngine?: string;
    /** The format the file on disk is in. Always known: it is the file we read. */
    storageEngine: string;
    canonicalSessionId?: string;
    sourceSessionId?: string;
    sourcePath?: string;
    importedThreadId?: string;
    importedAt?: number;
    contentSha256?: string;
}

/**
 * The one resolver every surface goes through, so no page can invent its own
 * repair. Manifest first (a recorded fact), marks second (evidence that this is
 * a copy of SOMETHING), native last.
 */
export function resolveProvenance(
    sessionId: string, storageEngine: string,
    manifest: ExternalImportManifest, marks: ImportMarks
): ResolvedProvenance {
    const rec = manifest.byThread.get(sessionId);
    if (rec) {
        return {
            provenance: 'imported',
            ...(rec.producerEngine ? { producerEngine: rec.producerEngine } : {}),
            storageEngine,
            canonicalSessionId: rec.sourceSessionId,
            sourceSessionId: rec.sourceSessionId,
            sourcePath: rec.sourcePath,
            importedThreadId: sessionId,
            ...(rec.importedAt ? { importedAt: rec.importedAt } : {}),
            ...(rec.contentSha256 ? { contentSha256: rec.contentSha256 } : {})
        };
    }
    if (marks.marked) {
        // The file says it is a copy and nothing says of what. Naming a producer
        // here is exactly the guess this item exists to stop.
        return { provenance: 'imported-unknown-source', storageEngine, importedThreadId: sessionId };
    }
    return { provenance: 'native', producerEngine: storageEngine, storageEngine };
}
