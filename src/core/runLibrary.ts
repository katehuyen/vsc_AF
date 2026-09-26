/**
 * X-418 — A RUN'S FILES, FROM THE MOMENT THEY EXIST TO THE MOMENT THE RUN ENDS.
 *
 *   produced — a media or tool step made files: each is filed into its stage
 *              folder at once (candidate/intermediate → semi, a failed step's → raw)
 *              and recorded, linked to the local files it was made from
 *   consumed — a local file a step read that the run did not make is a run INPUT:
 *              recorded where it is; one already in a stage folder keeps its stage
 *   failed / rejected — a judge FAIL or a selection that left it out: → raw,
 *              its Başarı Statüsü filled, nothing thrown away
 *   ended    — a run that reached its end: the files of its last producing step
 *              → final, its inputs from outside the library → source
 * Every file is written down in the run's ledger (persisted on its record), so a
 * later event finds it by path, and a window reload loses nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { expandRoot } from '../mcp/airtable/engine';
import { LIBRARY_STAGES, LibraryStage, MediaRole, fileInto, libraryDir, libraryType, planLibrary } from './mediaLibrary';
import { MediaRecorder } from './mediaRecorder';
import { MediaOrigin, Produced } from './mediaRecordFields';
import { LibrarySpec, ResolvedLibrary, StepLibrarySpec, resolveLibrary } from './runLibrarySpec';

export interface LedgerEntry {
    file: string;
    stepIndex: number;
    taskId: string;
    kind: 'produced' | 'input';
    stage: LibraryStage;
    base: string;
    lang: string;
    id?: string;
    pending?: string;
    /** the step named its stage — the run's end does not promote it */
    pinned?: boolean;
    /** an input already in a stage folder: recorded, never moved */
    kept?: boolean;
    unrecorded?: boolean;
    error?: string;
}

export interface RunCtx {
    w: { title: string; library?: LibrarySpec; steps: { title: string; library?: StepLibrarySpec }[] };
    runId: string;
    runStartedAt?: number;
    stepIndex: number;
    taskId: string;
    attempt?: number;
    ledger: LedgerEntry[];
}

export interface Made { role: MediaRole; origin: MediaOrigin; productionType: string; model?: string; prompt?: string; costUsd?: number; sources?: string[]; failure?: Produced['failure'] }

export interface ModuleView { defaultInstance: string; defaultLang: string; mediaRoots: string[] }

const norm = (p: string): string => path.resolve(String(p || '')).toLowerCase();
const isLocalMedia = (f: string): boolean => !!f && path.isAbsolute(f) && !!libraryType(f) && fs.existsSync(f);

/** A file moved: every gallery sidecar (`<taskId>.media.json`) that names it follows it. */
export function retargetSidecars(outputsDir: string, from: string, to: string): void {
    let names: string[] = [];
    try { names = fs.readdirSync(outputsDir).filter(n => n.endsWith('.media.json')); } catch { return; }
    for (const n of names) {
        const f = path.join(outputsDir, n);
        try {
            const meta = JSON.parse(fs.readFileSync(f, 'utf8')) as { assetFiles?: string[] };
            const i = Array.isArray(meta.assetFiles) ? meta.assetFiles.findIndex(a => norm(a) === norm(from)) : -1;
            if (i < 0) { continue; }
            meta.assetFiles![i] = to;
            fs.writeFileSync(f, JSON.stringify(meta, null, 2), 'utf8');
        } catch { /* an unreadable sidecar keeps its old path */ }
    }
}

export class RunLibrary {
    constructor(
        private rec: MediaRecorder,
        private module: () => ModuleView,
        private save: () => void,
        /** a file moved: whoever holds its path (a gallery sidecar) follows it */
        private moved: (from: string, to: string) => void = () => undefined
    ) { }

    resolve(ctx: Pick<RunCtx, 'w' | 'stepIndex'>): ResolvedLibrary {
        return resolveLibrary(ctx.w.library, ctx.w.steps[ctx.stepIndex]?.library, this.module());
    }

    private roots(): string[] { return this.module().mediaRoots.map(expandRoot); }

    /** A run starts: the engine of every database its media and tool steps file into is checked — and started — now, not at its first file. */
    prepare(w: { title: string; library?: LibrarySpec; steps: { title: string; library?: StepLibrarySpec; media?: unknown; tool?: unknown }[] }): void {
        const bases = new Map<string, ResolvedLibrary['autoStart']>();
        w.steps.forEach((s, i) => {
            if (!s.media && !s.tool) { return; }
            const lib = this.resolve({ w, stepIndex: i });
            if (lib.on) { bases.set(lib.base, lib.autoStart); }
        });
        for (const [b, a] of bases) { void this.rec.ready(b, a).catch(() => undefined); }
    }

    /** The stage folder a file already sits in under this base, if any. */
    stageOfPath(base: string, file: string): LibraryStage | undefined {
        const type = libraryType(file);
        if (!type) { return undefined; }
        const f = norm(file);
        for (const root of this.roots()) {
            for (const st of LIBRARY_STAGES) {
                const dir = norm(libraryDir(root, base, type, st)) + path.sep;
                if (f.startsWith(dir)) { return st; }
            }
        }
        return undefined;
    }

    private known(ledger: LedgerEntry[], file: string): LedgerEntry | undefined {
        return ledger.find(e => norm(e.file) === norm(file));
    }

    /** Files a step made, filed and recorded; returns their paths now, in the same order, and one line per file. */
    async produced(ctx: RunCtx, files: string[], m: Made): Promise<{ files: string[]; lines: string[] }> {
        const lib = this.resolve(ctx);
        if (!lib.on || !files.length) { return { files, lines: lib.on ? [] : [`Library: ${lib.why[0]}`] }; }
        const causes = (m.sources ?? []).filter(isLocalMedia);
        if (causes.length) { await this.consumed(ctx, causes); }
        const failed = m.role === 'failed' || m.role === 'rejected';
        const out: string[] = [];
        const lines: string[] = [];
        for (const [i, file] of files.entries()) {
            if (!isLocalMedia(file)) { out.push(file); continue; }
            const entry: LedgerEntry = { file, stepIndex: ctx.stepIndex, taskId: ctx.taskId, kind: 'produced', stage: 'raw', base: lib.base, lang: lib.lang, ...(lib.stage ? { pinned: true } : {}) };
            try {
                if (failed && lib.record === 'passed') {
                    const plan = planLibrary({ roots: this.roots(), base: lib.base, file, stage: lib.stage, role: m.role, exists: p => fs.existsSync(p) });
                    if ('error' in plan) { throw new Error(plan.error); }
                    entry.file = fileInto(file, plan);
                    entry.stage = plan.stage;
                    entry.unrecorded = true;
                    lines.push(`Library: ${path.basename(entry.file)} → ${lib.base}/${plan.type}/${plan.stage} (not recorded — record: passed)`);
                } else {
                    const r = await this.rec.record({
                        file, base: lib.base, lang: lib.lang, autoStart: lib.autoStart, template: lib.template, stage: lib.stage, causeFiles: causes,
                        produced: {
                            role: m.role, origin: m.origin, productionType: m.productionType, model: m.model, prompt: m.prompt,
                            costUsd: files.length > 1 && m.costUsd ? m.costUsd / files.length : m.costUsd, sourceMaterial: m.sources, failure: m.failure, sequence: i + 1,
                            run: { id: ctx.runId, name: ctx.w.title, startedAt: ctx.runStartedAt, stepIndex: ctx.stepIndex, steps: ctx.w.steps.length, stepTitle: ctx.w.steps[ctx.stepIndex]?.title, taskId: ctx.taskId, attempt: ctx.attempt }
                        }
                    });
                    if (r.error && !r.pending) { throw new Error(r.error); }
                    Object.assign(entry, { file: r.file, stage: r.stage ?? entry.stage, ...(r.id ? { id: r.id } : {}), ...(r.pending ? { pending: r.pending } : {}) });
                    lines.push(`Library: ${path.basename(r.file)} → ${lib.base}/${libraryType(r.file)}/${r.stage}${r.id ? ` · record ${r.id}${r.duplicate ? ' (already recorded)' : ''}` : ''}${r.pending ? ` · record pending (${r.pending})` : ''}`);
                }
            } catch (e) {
                entry.error = (e as Error).message.slice(0, 300);
                lines.push(`Library: ${path.basename(file)} stayed where it is — ${entry.error}`);
            }
            if (norm(entry.file) !== norm(file)) { this.moved(file, entry.file); }
            ctx.ledger.push(entry);
            out.push(entry.file);
        }
        this.save();
        return { files: out, lines };
    }

    /** Local files a step read that this run did not make: its inputs, recorded where they are. */
    async consumed(ctx: RunCtx, files: string[]): Promise<void> {
        const lib = this.resolve(ctx);
        if (!lib.on) { return; }
        for (const file of files.filter(isLocalMedia)) {
            if (this.known(ctx.ledger, file)) { continue; }
            const at = this.stageOfPath(lib.base, file);
            const r = await this.rec.record({
                file, base: lib.base, lang: lib.lang, autoStart: lib.autoStart, inPlace: true, stage: at ?? 'source',
                produced: { role: 'input', origin: 'user_submission', productionType: 'input', run: { id: ctx.runId, name: ctx.w.title, startedAt: ctx.runStartedAt, stepIndex: ctx.stepIndex, steps: ctx.w.steps.length } }
            }).catch(e => ({ file, error: (e as Error).message, base: lib.base } as { file: string; error: string; base: string; id?: string; pending?: string }));
            ctx.ledger.push({
                file, stepIndex: ctx.stepIndex, taskId: ctx.taskId, kind: 'input', stage: at ?? 'source', base: lib.base, lang: lib.lang,
                ...(at ? { kept: true } : {}), ...(r.id ? { id: r.id } : {}), ...(r.pending ? { pending: r.pending } : {}), ...('error' in r && r.error ? { error: r.error } : {})
            });
        }
        this.save();
    }

    private async restage(ledger: LedgerEntry[], file: string, stage: LibraryStage, reason: string, failure?: Produced['failure'], force = false): Promise<string> {
        const e = this.known(ledger, file);
        if (!e || (e.stage === stage && !force) || !fs.existsSync(e.file)) { return file; }
        let to: string;
        if (e.unrecorded) {
            const plan = planLibrary({ roots: this.roots(), base: e.base, file: e.file, stage, exists: p => fs.existsSync(p) });
            if ('error' in plan) { return file; }
            to = fileInto(e.file, plan);
        } else {
            const r = await this.rec.restage({ file: e.file, stage, base: e.base, lang: e.lang, id: e.id, reason, failure });
            if (r.error && !r.pending) { e.error = r.error.slice(0, 300); this.save(); return e.file; }
            to = r.file;
            if (r.pending) { e.pending = r.pending; }
        }
        const from = e.file;
        e.file = to;
        e.stage = stage;
        this.save();
        if (norm(from) !== norm(to)) { this.moved(from, to); }
        return to;
    }

    /** A judge said FAIL: the file goes to raw with its reason — kept, salvageable. */
    failed(ledger: LedgerEntry[], file: string, reason: string): Promise<string> {
        return this.restage(ledger, file, 'raw', 'judge FAIL', { reason: reason.slice(0, 1000), salvageable: true });
    }

    /** A selection left these out: raw, said so. */
    async rejected(ledger: LedgerEntry[], files: string[]): Promise<void> {
        for (const f of files) { await this.restage(ledger, f, 'raw', 'not selected', { reason: 'not selected at the selection step', salvageable: true }); }
    }

    /** The run ended: when it reached its end, its last producing step's files are final and its outside inputs go to source. */
    async ended(ledger: LedgerEntry[], status: string): Promise<string[]> {
        if (status !== 'done' || !ledger.length) { return []; }
        const lines: string[] = [];
        const made = ledger.filter(e => e.kind === 'produced' && !e.pinned && e.stage === 'semi' && !e.error);
        const last = Math.max(-1, ...made.map(e => e.stepIndex));
        for (const e of made.filter(x => x.stepIndex === last)) {
            const to = await this.restage(ledger, e.file, 'final', 'the run\'s last output');
            lines.push(`Library: ${path.basename(to)} → final`);
        }
        for (const e of ledger.filter(x => x.kind === 'input' && !x.kept && x.stage === 'source' && !x.error)) {
            if (this.stageOfPath(e.base, e.file)) { continue; }
            const to = await this.restage(ledger, e.file, 'source', 'filed as a run input', undefined, true);
            lines.push(`Library: ${path.basename(to)} → source (run input)`);
        }
        return lines;
    }
}
