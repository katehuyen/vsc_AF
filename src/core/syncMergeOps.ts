import * as fs from 'fs';
import * as path from 'path';
import { withLock } from './a2aStore';
import { BridgeRegistry, need } from './bridge';
import { mergeT2, T2Spec } from './syncMerge';

/**
 * X-342 — THE STORE OWNER TAKES THE MERGE. A keyed store this extension holds in
 * memory (notices, queue, A2A, wiki, session titles/marks) is merged by the
 * extension itself: under the store's lock it reads the file, merges, writes
 * atomically and re-reads — so no later save of a stale copy undoes the sync.
 */
export interface SyncTarget {
    /** The store file's own name — the only thing a caller may point at. */
    file: string;
    path: string;
    spec: T2Spec;
    /** Re-read the file into memory and repaint whoever shows it. */
    reload(): void;
}

export interface SyncItem { file: string; source: string; archive?: string; spec?: T2Spec; replace?: boolean }

export interface SyncItemResult {
    file: string; path: string; changed: boolean; added: number; replaced: number;
    conflicts: number; conflictKeys: string[]; bytes: number; archived: boolean; restored?: boolean;
}

function readJson(f: string): unknown {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; }
}

function atomicWrite(to: string, text: string): void {
    const tmp = to + '.sync-' + process.pid + '.part';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, to);
}

function itemsArg(args: Record<string, unknown>): SyncItem[] {
    const raw = args.items;
    need(Array.isArray(raw) && raw.length > 0, 'items: at least one { file, source } — file is a store name (notices.json …), source the other machine\'s copy.');
    return (raw as Record<string, unknown>[]).map(x => ({
        file: path.basename(String(x?.file ?? '').replace(/\\/g, '/')),
        source: String(x?.source ?? ''),
        archive: typeof x?.archive === 'string' && x.archive ? x.archive : undefined,
        spec: x?.spec && typeof x.spec === 'object' ? x.spec as T2Spec : undefined,
        replace: x?.replace === true
    }));
}

/** One store, under its lock. `replace` takes the source verbatim — the rollback door. */
export function mergeInto(t: SyncTarget, it: SyncItem): SyncItemResult {
    const src = readJson(it.source);
    need(src && typeof src === 'object' && !Array.isArray(src), `source: ${it.source} is not a JSON object.`);
    const spec = it.spec ?? t.spec;
    need(spec.shape === 'map' || spec.shape === 'items', `spec.shape: "map" or "items", not ${JSON.stringify(spec.shape)}.`);
    const res = withLock(t.path, (): SyncItemResult => {
        const live = readJson(t.path);
        const m = it.replace
            ? { merged: src, added: 0, replaced: 0, conflicts: [], changed: JSON.stringify(live) !== JSON.stringify(src) }
            : mergeT2(spec, live, src);
        let archived = false;
        if (it.archive && fs.existsSync(t.path)) {
            fs.mkdirSync(path.dirname(it.archive), { recursive: true });
            fs.copyFileSync(t.path, it.archive);
            archived = true;
        }
        const text = JSON.stringify(m.merged, null, 2);
        if (m.changed) { fs.mkdirSync(path.dirname(t.path), { recursive: true }); atomicWrite(t.path, text); }
        const bytes = fs.existsSync(t.path) ? fs.statSync(t.path).size : 0;
        return {
            file: t.file, path: t.path, changed: m.changed, added: m.added, replaced: m.replaced,
            conflicts: m.conflicts.length, conflictKeys: m.conflicts.slice(0, 20).map(c => c.key),
            bytes, archived, ...(it.replace ? { restored: m.changed } : {})
        };
    });
    need(res, `${t.file}: its lock stayed held — another window is writing it; run the sync again.`);
    if (res!.changed) { t.reload(); }
    return res!;
}

export function registerSyncMergeOps(bridge: BridgeRegistry, targets: SyncTarget[]): void {
    const byFile = new Map(targets.map(t => [t.file, t]));
    bridge.register([{
        op: 'sync.merge',
        describe: 'X-342 — MERGE ANOTHER MACHINE\'S COPY INTO A STORE THIS EXTENSION OWNS, with no reload: under the '
            + 'store\'s lock it reads the file, merges (K2: key union; same key, two values → the newer when the record '
            + 'has its own time, else the live one, listed as a conflict), writes atomically and re-reads it into '
            + 'memory. The body is the same rule as _setup/sync/t2.js. Stores: ' + targets.map(t => t.file).join(', ')
            + '. args: items: [{ file (store name), source (abs path of the other copy), archive? (abs path — the live '
            + 'file is copied there first; must sit under a sync-archive folder), spec? ({shape:"map"|"items", list?, '
            + 'key?, time?} — defaults to the store\'s own), replace? (true = take source verbatim: the rollback door) }]. '
            + 'Answers { results: [{ file, changed, added, replaced, conflicts, conflictKeys, bytes, archived } | { file, error }] } '
            + 'in the order asked. '
            + 'Then call sessions.rescan full=true for transcripts written beside it.',
        handler: (args) => {
            const items = itemsArg(args);
            for (const it of items) {
                need(byFile.has(it.file), `file: ${it.file || '(empty)'} is not a store this extension owns — one of ${[...byFile.keys()].join(', ')}.`);
                need(path.isAbsolute(it.source) && fs.existsSync(it.source), `source: ${it.source || '(empty)'} — an absolute path to an existing file.`);
                need(path.resolve(it.source) !== path.resolve(byFile.get(it.file)!.path), `source: ${it.source} is the store itself.`);
                need(!it.archive || /[\\/]sync-archive[\\/]/.test(it.archive), `archive: ${it.archive} must sit under a sync-archive folder.`);
            }
            // one store's failure is its own line: the ones already merged are reported, not hidden behind a throw
            return {
                results: items.map(it => {
                    try { return mergeInto(byFile.get(it.file)!, it); } catch (e) { return { file: it.file, error: e instanceof Error ? e.message : String(e) }; }
                })
            };
        }
    }]);
}
