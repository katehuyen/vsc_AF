/**
 * X-418 — EVERY FILE A RUN MAKES GETS ITS PLACE AND ITS RECORD.
 *
 * One door for the three things that happen to a produced file:
 *   record  — filed into its library folder (X-417), fingerprinted, probed, and
 *             given a full media record in the user's local Airtable; a file whose
 *             bytes are already recorded gets no second record, only the relation
 *   restage — moved to another stage (FAIL → raw, the run's last output → final,
 *             a promotion → asset): the file moves AND its record's file_path,
 *             workflow.stage, failure and history change in the same call
 *   flush   — the records a closed engine could not take are written when it answers
 * The engine is started first when it is down (X-416: ask · auto · never); a run
 * never stops because it is not there — the record waits in the pending list.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EngineClient, checkInstance, expandRoot, saveMedia } from '../mcp/airtable/engine';
import { AirtableStore, expandedDatabaseRoots, loadStore } from './airtable';
import { findInstance, startNamedInstance } from './airtableStart';
import { LibraryStage, fileInto, libraryType, planLibrary, stageFor } from './mediaLibrary';
import { ProbeInfo, probeFields, probeFile } from './mediaProbe';
import { Produced, addCausal, applyRestage, producedFields } from './mediaRecordFields';
import { PendingCreate, PendingEntry, dropPending, loadPending, notePendingError, queueCreate, queueRestage } from './mediaPending';

type Dict = Record<string, unknown>;
export type AutoStart = 'ask' | 'auto' | 'never';
export const AUTO_STARTS: readonly AutoStart[] = ['ask', 'auto', 'never'];

/** The part of EngineClient the recorder uses — a test hands in a fake. */
export type EngineLike = Pick<EngineClient, 'instance' | 'listItems' | 'getRecord' | 'updateRecord' | 'nextMediaId' | 'mediaTemplate' | 'mediaTemplates' | 'createFile'>;

export interface RecorderDeps {
    storageDir: string;
    store?: () => AirtableStore;
    connect?: (base: string) => Promise<EngineLike | { down: string }>;
    start?: (base: string) => Promise<{ ok: boolean; error?: string }>;
    confirm?: (question: string) => Promise<boolean>;
    probe?: (file: string) => Promise<ProbeInfo | undefined>;
    hash?: (file: string) => Promise<string>;
    now?: () => number;
}

export interface RecordRequest {
    file: string;
    base?: string;
    lang?: string;
    autoStart?: AutoStart;
    template?: string;
    /** an explicit stage; otherwise the role's default */
    stage?: string;
    produced: Omit<Produced, 'stage' | 'fingerprint'>;
    /** leave the file where it is (it is already in the library) */
    inPlace?: boolean;
    /** files it was made from — their records gain it as an effect */
    causeFiles?: string[];
}

export interface RecordOutcome { file: string; stage?: LibraryStage; base: string; id?: string; duplicate?: boolean; pending?: string; template?: string; error?: string; why?: string[] }

export interface RestageRequest { file: string; stage: string; base?: string; lang?: string; id?: string; reason?: string; failure?: Produced['failure']; autoStart?: AutoStart }

const norm = (p: string): string => path.resolve(String(p || '')).replace(/\\/g, '/').toLowerCase();
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export async function sha256File(file: string): Promise<string> {
    const h = crypto.createHash('sha256');
    await new Promise<void>((res, rej) => fs.createReadStream(file).on('data', b => h.update(b)).on('end', () => res()).on('error', rej));
    return 'sha256:' + h.digest('hex');
}

interface Index { byFp: Map<string, string>; byPath: Map<string, string>; at: number }

export class MediaRecorder {
    private down = new Map<string, { until: number; reason: string }>();
    private indexes = new Map<string, Index>();
    private templates = new Map<string, string[]>();
    private readying = new Map<string, Promise<EngineLike | { down: string }>>();
    private flushing = false;

    constructor(private d: RecorderDeps) { }

    private now(): number { return (this.d.now ?? Date.now)(); }
    private store(): AirtableStore { return (this.d.store ?? (() => loadStore(this.d.storageDir)))(); }
    private roots(): string[] { return this.store().mediaRoots.map(expandRoot); }
    baseOf(b?: string): string { return String(b ?? '').trim() || this.store().defaultInstance; }
    langOf(l?: string): string { return String(l ?? '').trim() || this.store().defaultLang || 'TR'; }

    private async connect(base: string): Promise<EngineLike | { down: string }> {
        if (this.d.connect) { return this.d.connect(base); }
        const s = this.store();
        const inst = findInstance(expandedDatabaseRoots(s), base);
        if ('error' in inst) { return { down: inst.error }; }
        const live = await checkInstance(inst);
        return live.alive ? new EngineClient(inst, s.requestTimeoutMs) : { down: `${base} is not running (port ${inst.port})` };
    }

    /** The engine of this base, started first when the policy lets it; flushes what waited for it. One at a time per base. */
    ready(base: string, policy: AutoStart = 'auto'): Promise<EngineLike | { down: string }> {
        const k = base.toLowerCase();
        const inFlight = this.readying.get(k);
        if (inFlight) { return inFlight; }
        const p = this.readyNow(base, policy).finally(() => this.readying.delete(k));
        this.readying.set(k, p);
        return p;
    }

    private async readyNow(base: string, policy: AutoStart): Promise<EngineLike | { down: string }> {
        const cached = this.down.get(base);
        if (cached && cached.until > this.now()) { return { down: cached.reason }; }
        let c = await this.connect(base);
        if ('down' in c && policy !== 'never') {
            const yes = policy === 'auto' || await (this.d.confirm ?? (async () => false))(
                `The local Airtable "${base}" is not running. Start it now? Its records wait in the pending list otherwise.`);
            if (!yes) { this.down.set(base, { until: this.now() + 10 * 60_000, reason: `${base} is not running — not started (the answer was no)` }); return { down: `${base} is not running — not started` }; }
            const s = await (this.d.start ?? (async (b: string) => startNamedInstance(this.d.storageDir, b)))(base);
            c = s.ok ? await this.connect(base) : { down: `${base} could not be started — ${s.error ?? 'unknown'}` };
        }
        if ('down' in c) { this.down.set(base, { until: this.now() + (policy === 'never' ? 60_000 : 5 * 60_000), reason: c.down }); return c; }
        this.down.delete(base);
        if (!this.flushing && loadPending(this.d.storageDir).some(e => e.base.toLowerCase() === base.toLowerCase())) { await this.flushOn(c, base); }
        return c;
    }

    private async index(c: EngineLike, base: string, lang: string): Promise<Index> {
        const k = `${base}|${lang}`.toLowerCase();
        const hit = this.indexes.get(k);
        if (hit && this.now() - hit.at < 120_000) { return hit; }
        const idx: Index = { byFp: new Map(), byPath: new Map(), at: this.now() };
        for (const it of await c.listItems('media', lang)) {
            const id = String(it.id ?? '');
            if (!id) { continue; }
            if (typeof it.fingerprint === 'string' && it.fingerprint) { idx.byFp.set(it.fingerprint, id); }
            const fp = ((it.media ?? {}) as Dict).file_path;
            if (typeof fp === 'string' && fp) { idx.byPath.set(norm(fp), id); }
        }
        this.indexes.set(k, idx);
        return idx;
    }

    private async template(c: EngineLike, lang: string, file: string, stage: string, asked?: string): Promise<string | undefined> {
        if (asked) { return asked; }
        const k = `${c.instance.name}|${lang}`.toLowerCase();
        if (!this.templates.has(k)) {
            let ids: string[] = [];
            try {
                const raw = await c.mediaTemplates(lang) as unknown;
                ids = (Array.isArray(raw) ? raw : []).map(t => String((t as Dict)?.id ?? '')).filter(Boolean);
            } catch { /* no templates — the record is built without one */ }
            this.templates.set(k, ids);
        }
        const want = `${cap(libraryType(file) ?? '')}-${cap(stage)}`.toLowerCase();
        return this.templates.get(k)!.find(t => t.toLowerCase() === want);
    }

    private async patch(c: EngineLike, lang: string, id: string, fn: (item: Dict) => boolean | void): Promise<void> {
        for (let i = 0; ; i++) {
            const cur = await c.getRecord('media', id, lang);
            const item = (cur.item ?? {}) as Dict;
            if (fn(item) === false) { return; }
            try {
                await c.updateRecord('media', id, { item, expectedVersion: typeof cur.version === 'number' ? cur.version : undefined, backup: true }, lang);
                return;
            } catch (e) { if (i > 0 || !/version|409/i.test(String(e))) { throw e; } }
        }
    }

    /** Create (or find) the record of one file on a live engine and link it to what it was made from. */
    private async createOn(c: EngineLike, base: string, lang: string, file: string, p: PendingCreate): Promise<{ id: string; duplicate?: boolean; template?: string }> {
        const idx = await this.index(c, base, lang);
        const fp = typeof p.fields.extra.fingerprint === 'string' ? p.fields.extra.fingerprint : '';
        const causes: string[] = [];
        for (const cf of p.causeFiles ?? []) {
            let id = idx.byPath.get(norm(cf));
            if (!id && fs.existsSync(cf)) { id = idx.byFp.get(await this.hash(cf)); }
            if (id) { causes.push(id); }
        }
        const dup = (fp && idx.byFp.get(fp)) || idx.byPath.get(norm(file));
        let id: string;
        let template: string | undefined;
        if (dup) {
            id = dup;
            if (causes.length) { await this.patch(c, lang, id, item => addCausal(item, 'causes', causes)); }
        } else {
            const stage = String(((p.fields.extra.workflow ?? {}) as Dict).stage ?? '');
            template = await this.template(c, lang, file, stage, p.template);
            const extra = causes.length ? { ...p.fields.extra, relations: { causal: { causes } } } : p.fields.extra;
            const res = await saveMedia(c as unknown as EngineClient, {
                file, lang, template, status: p.fields.status, provenance: p.fields.provenance, failure: p.fields.failure, extra
            });
            id = res.id;
            if (fp) { idx.byFp.set(fp, id); }
            idx.byPath.set(norm(file), id);
        }
        for (const cause of causes) { await this.patch(c, lang, cause, item => addCausal(item, 'effects', [id])); }
        return { id, ...(dup ? { duplicate: true } : {}), ...(template ? { template } : {}) };
    }

    private hash(file: string): Promise<string> { return (this.d.hash ?? sha256File)(file); }

    /** File one produced file into the library and give it its record (or a place in the pending list). */
    async record(r: RecordRequest): Promise<RecordOutcome> {
        const base = this.baseOf(r.base);
        const lang = this.langOf(r.lang);
        let file = r.file;
        let stage: LibraryStage;
        let why: string[] | undefined;
        if (r.inPlace) {
            const st = stageFor(r.produced.role, r.stage);
            if ('error' in st) { return { file, base, error: st.error }; }
            stage = st.stage;
        } else {
            const plan = planLibrary({ roots: this.roots(), base, file, stage: r.stage, role: r.produced.role, exists: p => fs.existsSync(p) });
            if ('error' in plan) { return { file, base, error: plan.error }; }
            file = fileInto(file, plan);
            stage = plan.stage;
            why = plan.why;
        }
        const probed = probeFields(await (this.d.probe ?? probeFile)(file).catch(() => undefined), libraryType(file) ?? '');
        const fields = producedFields({ ...r.produced, stage, fingerprint: await this.hash(file) }, probed, this.now());
        const create: PendingCreate = { ...(r.template ? { template: r.template } : {}), fields, ...(r.causeFiles?.length ? { causeFiles: r.causeFiles } : {}) };
        const c = await this.ready(base, r.autoStart);
        if ('down' in c) {
            const e = queueCreate(this.d.storageDir, { base, lang, file, create, error: c.down }, this.now());
            return { file, stage, base, pending: e.key, why: [...(why ?? []), `the record waits in the pending list — ${c.down}`] };
        }
        try {
            const res = await this.createOn(c, base, lang, file, create);
            return { file, stage, base, ...res, ...(why ? { why } : {}) };
        } catch (e) {
            const msg = (e as Error).message;
            const q = queueCreate(this.d.storageDir, { base, lang, file, create, error: msg }, this.now());
            return { file, stage, base, pending: q.key, error: msg, ...(why ? { why } : {}) };
        }
    }

    /** Move a file to another stage and change its record with it. */
    async restage(r: RestageRequest): Promise<RecordOutcome> {
        const base = this.baseOf(r.base);
        const lang = this.langOf(r.lang);
        const plan = planLibrary({ roots: this.roots(), base, file: r.file, stage: r.stage, exists: p => fs.existsSync(p) });
        if ('error' in plan) { return { file: r.file, base, error: plan.error }; }
        const from = r.file;
        const file = fileInto(from, plan);
        const update = { stage: plan.stage, reason: r.reason, failure: r.failure };
        // a create still waiting for this file takes the new path and stage — one write at the flush
        const waiting = loadPending(this.d.storageDir).some(e => e.kind === 'create' && norm(e.file) === norm(from));
        const folded = waiting ? queueRestage(this.d.storageDir, { base, lang, fromFile: from, file, update }, this.now()) : undefined;
        const c = await this.ready(base, r.autoStart);
        if (folded) {
            const still = loadPending(this.d.storageDir).some(e => e.key === folded.key);
            return { file, stage: plan.stage, base, ...(still ? { pending: folded.key } : {}), why: plan.why };
        }
        if ('down' in c) {
            const q = queueRestage(this.d.storageDir, { base, lang, fromFile: from, file, id: r.id, update, error: c.down }, this.now());
            return { file, stage: plan.stage, base, pending: q.key, why: plan.why };
        }
        const idx = await this.index(c, base, lang);
        const id = r.id || idx.byPath.get(norm(from)) || idx.byPath.get(norm(file)) || idx.byFp.get(await this.hash(file));
        if (!id) { return { file, stage: plan.stage, base, error: 'moved, but no record names this file — record it with media.record', why: plan.why }; }
        await this.patch(c, lang, id, item => { applyRestage(item, { file, stage: plan.stage, reason: r.reason, failure: r.failure, at: this.now() }); });
        idx.byPath.delete(norm(from));
        idx.byPath.set(norm(file), id);
        return { file, stage: plan.stage, base, id, why: plan.why };
    }

    pending(base?: string): PendingEntry[] {
        const all = loadPending(this.d.storageDir);
        return base ? all.filter(e => e.base.toLowerCase() === base.toLowerCase()) : all;
    }

    /** Write what waited for this engine; each entry that lands leaves the list, one that fails says why. */
    private async flushOn(c: EngineLike, base: string): Promise<{ done: number; failed: number }> {
        this.flushing = true;
        let done = 0, failed = 0;
        try {
            for (const e of this.pending(base)) {
                try {
                    if (e.kind === 'create' && e.create) {
                        if (!fs.existsSync(e.file)) { throw new Error(`no file at ${e.file}`); }
                        await this.createOn(c, base, e.lang, e.file, e.create);
                    } else if (e.update) {
                        const u = e.update;
                        const idx = await this.index(c, base, e.lang);
                        const id = u.id || (u.fromFile && idx.byPath.get(norm(u.fromFile))) || idx.byPath.get(norm(e.file)) || (fs.existsSync(e.file) ? idx.byFp.get(await this.hash(e.file)) : undefined);
                        if (!id) { throw new Error(`no record names ${u.fromFile ?? e.file} — record it with media.record`); }
                        await this.patch(c, e.lang, id, item => { applyRestage(item, { file: e.file, stage: u.stage as LibraryStage, from: u.from, reason: u.reason, failure: u.failure, at: this.now() }); });
                    }
                    dropPending(this.d.storageDir, [e.key]);
                    done++;
                } catch (err) {
                    notePendingError(this.d.storageDir, e.key, (err as Error).message);
                    failed++;
                }
            }
        } finally { this.flushing = false; }
        return { done, failed };
    }

    /** Flush the pending list of one base or of every base that has one. */
    async flush(base?: string, policy: AutoStart = 'never'): Promise<{ base: string; done: number; failed: number; down?: string }[]> {
        const bases = base ? [this.baseOf(base)] : [...new Set(this.pending().map(e => e.base))];
        const out: { base: string; done: number; failed: number; down?: string }[] = [];
        for (const b of bases) {
            this.down.delete(b);
            const c = await this.connect(b);
            if ('down' in c && policy === 'never') { out.push({ base: b, done: 0, failed: 0, down: c.down }); continue; }
            const live = 'down' in c ? await this.ready(b, policy) : c;
            if ('down' in live) { out.push({ base: b, done: 0, failed: 0, down: live.down }); continue; }
            out.push({ base: b, ...(await this.flushOn(live, b)) });
        }
        return out;
    }
}
