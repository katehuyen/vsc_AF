/**
 * X-416 / X-418 — THE PENDING LIST: records a closed engine could not take yet.
 *
 * A run never stops because the user's Airtable is down: the file is already
 * in its library folder, and what its record would have said waits here —
 * one JSON file in the extension's storage — until the engine answers and the
 * list is flushed. A create waits with its full fields; a stage change of a
 * record that exists waits as an update; a stage change of a record that is
 * itself still waiting is folded into that create, so the flush writes it once.
 */
import * as fs from 'fs';
import * as path from 'path';
import { RecordFields } from './mediaRecordFields';

type Dict = Record<string, unknown>;

export interface PendingCreate { template?: string; fields: RecordFields; causeFiles?: string[] }
export interface PendingUpdate { id?: string; fromFile?: string; stage: string; from?: string; reason?: string; failure?: { reason: string; salvageable?: boolean; notes?: string } }

export interface PendingEntry {
    key: string;
    base: string;
    lang: string;
    kind: 'create' | 'update';
    /** the file's path NOW — a move while waiting rewrites it */
    file: string;
    since: number;
    tries: number;
    lastError?: string;
    create?: PendingCreate;
    update?: PendingUpdate;
}

export const PENDING_FILE = 'airtable-pending.json';
const fileOf = (dir: string): string => path.join(dir, PENDING_FILE);
const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export function loadPending(dir: string): PendingEntry[] {
    try {
        const raw = JSON.parse(fs.readFileSync(fileOf(dir), 'utf8')) as unknown;
        return Array.isArray(raw) ? raw.filter((e): e is PendingEntry => !!e && typeof e === 'object' && typeof (e as Dict).key === 'string') : [];
    } catch { return []; }
}

export function savePending(dir: string, list: PendingEntry[]): void {
    fs.mkdirSync(dir, { recursive: true });
    const f = fileOf(dir);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, f);
}

let seq = 0;
const newKey = (now: number): string => `pnd-${now.toString(36)}-${(seq++).toString(36)}`;

/** Queue a create; a file already waiting to be created is not queued twice. */
export function queueCreate(dir: string, e: { base: string; lang: string; file: string; create: PendingCreate; error?: string }, now = Date.now()): PendingEntry {
    const list = loadPending(dir);
    const hit = list.find(x => x.kind === 'create' && same(x.file, e.file));
    if (hit) { return hit; }
    const entry: PendingEntry = { key: newKey(now), base: e.base, lang: e.lang, kind: 'create', file: e.file, since: now, tries: 0, create: e.create, ...(e.error ? { lastError: e.error } : {}) };
    savePending(dir, [...list, entry]);
    return entry;
}

/**
 * A file moved to another stage while the engine was down. Its waiting create
 * takes the new path and stage (one write at the flush); a recorded file queues
 * an update by record id. Returns the entry that now carries the change.
 */
export function queueRestage(dir: string, e: { base: string; lang: string; fromFile: string; file: string; id?: string; update: Omit<PendingUpdate, 'id'>; error?: string }, now = Date.now()): PendingEntry {
    const list = loadPending(dir);
    const create = list.find(x => x.kind === 'create' && same(x.file, e.fromFile));
    if (create?.create) {
        create.file = e.file;
        const extra = create.create.fields.extra as Dict;
        const wf = (extra.workflow ?? (extra.workflow = {})) as Dict;
        wf.stage = e.update.stage;
        wf.last_action = `moved to ${e.update.stage}${e.update.reason ? ' — ' + e.update.reason : ''}`;
        const hist = Array.isArray(extra.pipeline_history) ? extra.pipeline_history as unknown[] : [];
        hist.push({ at: new Date(now).toISOString(), by: 'agent-farm', action: 'moved', from: e.update.from ?? '', to: e.update.stage, ...(e.update.reason ? { note: e.update.reason } : {}) });
        extra.pipeline_history = hist;
        if (e.update.failure) {
            create.create.fields.failure = { is_failed: true, reason: e.update.failure.reason, salvageable: e.update.failure.salvageable !== false, salvage_notes: e.update.failure.notes ?? '' };
            ((extra.completed_sections ?? (extra.completed_sections = {})) as Dict).failure = true;
        }
        savePending(dir, list);
        return create;
    }
    const entry: PendingEntry = { key: newKey(now), base: e.base, lang: e.lang, kind: 'update', file: e.file, since: now, tries: 0, update: { ...(e.id ? { id: e.id } : {}), fromFile: e.fromFile, ...e.update }, ...(e.error ? { lastError: e.error } : {}) };
    savePending(dir, [...list, entry]);
    return entry;
}

export function dropPending(dir: string, keys: string[]): void {
    if (!keys.length) { return; }
    savePending(dir, loadPending(dir).filter(x => !keys.includes(x.key)));
}

export function notePendingError(dir: string, key: string, error: string): void {
    const list = loadPending(dir);
    const e = list.find(x => x.key === key);
    if (!e) { return; }
    e.tries += 1;
    e.lastError = error.slice(0, 400);
    savePending(dir, list);
}
