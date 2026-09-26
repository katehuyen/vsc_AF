import * as path from 'path';
import { EnrichPlan } from './enrichSpec';
import { enrichModality } from './mediaEnrich';
import { turnFailure } from './mediaEnricher';
import { LIBRARY_INBOX, LibraryStage, libraryType, MediaRole } from './mediaLibrary';
import { RecordOutcome, RecordRequest } from './mediaRecorder';
import { OneShotResult, OneShotWant, oneShotEnvelope } from './oneShot';
import { sanitizePrompt } from './util';

/**
 * X-422 — THE WAITING AREA PROCESSED. `media_<base>\all_in\` holds files the
 * user dropped that nobody has processed. Each one a model can open is looked
 * at and given a stage; a file it is sure of is filed and recorded
 * (media.record) and its form filled (media.enrich). One it is not sure of, one
 * no model here can open, and one the library does not hold stays where it is —
 * asked on Notices, or left waiting (flex point library.allin.unsure).
 */

export const ALLIN_UNSURE = ['ask', 'wait'] as const;
export type AllInUnsure = typeof ALLIN_UNSURE[number];
/** the stages a model may give — asset is reached only by the user's promotion */
export const JUDGED_STAGES: readonly LibraryStage[] = ['source', 'raw', 'semi', 'final'];
const ROLE: Record<string, MediaRole> = { source: 'input', raw: 'unknown', semi: 'intermediate', final: 'final' };
const IGNORED = /^(\.|_|desktop\.ini$|thumbs\.db$)/i;

export type AllInAction = 'filed' | 'unsure' | 'unknown' | 'failed' | 'waiting';
export const ALLIN_ACTIONS: readonly AllInAction[] = ['filed', 'unsure', 'unknown', 'failed', 'waiting'];

export interface AllInItem {
    file: string; base: string; action: AllInAction; why: string;
    engine?: string; stage?: LibraryStage; target?: string; id?: string; filled?: number; costUsd?: number;
}
export interface AllInReport {
    dryRun: boolean; unsure: AllInUnsure; bases: string[]; down?: Record<string, string>;
    counts: Record<AllInAction, number>; items: AllInItem[]; lines: string[]; asked?: string;
}
export type JudgePlan = Pick<EnrichPlan, 'model' | 'videoModel' | 'effort'>;

export interface AllInDeps {
    roots: readonly string[];
    listDir(dir: string): { name: string; dir: boolean }[];
    /** '' when the base's engine answers, else why not */
    up(base: string): Promise<string>;
    exec(want: OneShotWant & { cwd: string; timeoutMs?: number }): Promise<OneShotResult>;
    record(r: RecordRequest): Promise<RecordOutcome>;
    enrich(base: string, id: string): Promise<{ filled?: string[]; error?: string; skipped?: string }>;
    /** a question on Notices — its id, or undefined when the same one is still there */
    ask(title: string, body: string): string | undefined;
}

const ls = (d: AllInDeps, dir: string): { name: string; dir: boolean }[] => { try { return d.listDir(dir); } catch { return []; } };

/** Every file waiting in an all_in folder — of one base, or of every base under every root. */
export function scanAllIn(roots: readonly string[], base: string | undefined, d: Pick<AllInDeps, 'listDir'>): { file: string; base: string }[] {
    const out: { file: string; base: string }[] = [];
    const walk = (dir: string, b: string, depth: number): void => {
        for (const e of ls(d as AllInDeps, dir)) {
            if (IGNORED.test(e.name)) { continue; }
            const p = path.join(dir, e.name);
            if (e.dir) { if (depth < 3) { walk(p, b, depth + 1); } } else { out.push({ file: p, base: b }); }
        }
    };
    for (const root of roots) {
        for (const e of ls(d as AllInDeps, root)) {
            const b = e.name.slice('media_'.length);
            if (!e.dir || !/^media_./.test(e.name) || (base && b.toLowerCase() !== base.toLowerCase())) { continue; }
            walk(path.join(root, e.name, LIBRARY_INBOX), b, 0);
        }
    }
    return out;
}

export function judgePrompt(file: string, engine: string): string {
    return [
        `Look at this media file${engine === 'claude' ? ' (open it with the Read tool)' : ''}: ${file}`,
        'It was dropped into the waiting area of the user\'s media library and nobody has classified it yet. Say which stage folder it belongs in:',
        '- source: input material — a photo, footage, a reference or a recording meant to be used to make something',
        '- raw: unclassified but kept — nothing is thrown away',
        '- semi: half done — a draft, a work in progress, an intermediate render',
        '- final: truly succeeded — a finished piece ready to be published',
        '(asset is never yours to give — only the user promotes a file there.)',
        'Answer with ONLY one JSON object and nothing else, with three keys: stage (source, raw, semi or final), sure (true or false) and why (one sentence).',
        'Set sure to false whenever the file itself does not tell you — the user is asked then, and a wrong guess costs more than a question.'
    ].join('\n');
}

export function parseJudge(text: string): { stage: LibraryStage; sure: boolean; why: string } | { error: string } {
    const m = String(text ?? '').match(/\{[\s\S]*\}/);
    let j: Record<string, unknown> | undefined;
    // the prompt reaches the model through sanitizePrompt, which turns double quotes into single ones — so may the answer
    for (const s of m ? [m[0], m[0].replace(/'/g, '"')] : []) { try { j = JSON.parse(s); break; } catch { /* next form */ } }
    if (!j) { return { error: 'the answer was not the JSON asked for' }; }
    const stage = String(j.stage ?? '').trim().toLowerCase();
    if (!(JUDGED_STAGES as readonly string[]).includes(stage)) { return { error: `"${stage}" is not a stage it may give — ${JUDGED_STAGES.join(' | ')}` }; }
    return { stage: stage as LibraryStage, sure: j.sure === true, why: String(j.why ?? '').slice(0, 300) };
}

async function judge(f: { file: string }, engine: 'claude' | 'agy', plan: JudgePlan, d: AllInDeps): Promise<{ stage?: LibraryStage; sure?: boolean; why: string; costUsd?: number; error?: boolean }> {
    const res = await d.exec({
        cwd: path.dirname(f.file), engine, model: engine === 'claude' ? plan.model : plan.videoModel, prompt: sanitizePrompt(judgePrompt(f.file, engine)), timeoutMs: 300_000,
        ...(engine === 'claude' ? { json: true, effort: plan.effort } : { readOnly: true })
    });
    const env = engine === 'claude' ? oneShotEnvelope('claude', res.out) : null;
    const text = env ? env.result : res.out;
    const costUsd = env?.costUSD ? Math.round(env.costUSD * 10000) / 10000 : undefined;
    if ((res.error && !text) || env?.isError) { return { error: true, costUsd, why: `the ${engine} turn failed — ${turnFailure(res, env?.subtype)}` }; }
    const j = parseJudge(text);
    return 'error' in j ? { error: true, costUsd, why: j.error } : { ...j, costUsd };
}

function lines(r: Omit<AllInReport, 'lines'>): string[] {
    const c = r.counts;
    const down = Object.entries(r.down ?? {}).map(([b, w]) => `${b} not answering (${w}) — its files left alone`);
    const head = `${r.dryRun ? 'Dry run — nothing looked at, moved or written' : 'all_in'} · ${r.bases.join(', ') || 'no base'}: ${r.items.length} file(s)`
        + (r.dryRun ? ` · to look at ${c.waiting}` : ` · filed ${c.filed} · not sure ${c.unsure} · failed ${c.failed}`) + ` · not media ${c.unknown}`
        + (r.asked ? ' · asked on Notices' : '');
    const rows = r.items.filter(i => i.action !== 'waiting').slice(0, 50)
        .map(i => `${path.basename(i.file)} → ${i.action === 'filed' ? `${i.stage}${i.id ? ` · ${i.id}` : ''}${i.filled !== undefined ? ` · ${i.filled} field(s) filled` : ''}` : `stays (${i.action})`} — ${i.why}`);
    return [head, ...down, ...rows, ...(r.items.length ? [] : ['Nothing is waiting in all_in.'])];
}

/** One pass over the waiting area. apply=false lists what is waiting and which model would look at it. */
export async function intakeAllIn(o: { base?: string; apply: boolean; unsure: AllInUnsure; plan: JudgePlan; lang: string }, d: AllInDeps): Promise<AllInReport> {
    const files = scanAllIn(d.roots, o.base, d);
    const bases = [...new Set(files.map(f => f.base))];
    const down: Record<string, string> = {};
    if (o.apply) { for (const b of bases) { const w = await d.up(b); if (w) { down[b] = w; } } }
    const items: AllInItem[] = [];
    for (const f of files.filter(x => !down[x.base])) {
        const at = { file: f.file, base: f.base };
        if (!libraryType(f.file)) { items.push({ ...at, action: 'unknown', why: 'not an image, video or audio file — the library holds media only' }); continue; }
        const route = enrichModality(f.file);
        if (!route.engine) { items.push({ ...at, action: 'unsure', why: route.why ?? 'no model here can open it' }); continue; }
        if (!o.apply) { items.push({ ...at, action: 'waiting', engine: route.engine, why: `${route.engine} would look at it` }); continue; }
        const j = await judge(f, route.engine, o.plan, d);
        const base = { ...at, engine: route.engine, ...(j.costUsd ? { costUsd: j.costUsd } : {}) };
        if (j.error || !j.stage) { items.push({ ...base, action: 'failed', why: j.why }); continue; }
        if (!j.sure) { items.push({ ...base, action: 'unsure', stage: j.stage, why: `maybe ${j.stage} — ${j.why}` }); continue; }
        const r = await d.record({ file: f.file, base: f.base, lang: o.lang, autoStart: 'never', stage: j.stage, produced: { role: ROLE[j.stage], origin: 'user_submission', productionType: 'all_in' } });
        if (r.error || !r.id) { items.push({ ...base, action: 'failed', stage: j.stage, why: r.error ?? `the record waits in the pending list (${r.pending})` }); continue; }
        const it: AllInItem = { ...base, action: 'filed', stage: j.stage, target: r.file, id: r.id, why: j.why + (r.duplicate ? ' · the same bytes were already recorded' : '') };
        const e = await d.enrich(f.base, r.id).catch(err => ({ error: (err as Error).message } as { filled?: string[]; error?: string; skipped?: string }));
        if (e.filled) { it.filled = e.filled.length; }
        if (e.error || e.skipped) { it.why += ` · form: ${e.error ?? e.skipped}`; }
        items.push(it);
    }
    const counts = Object.fromEntries(ALLIN_ACTIONS.map(a => [a, items.filter(i => i.action === a).length])) as Record<AllInAction, number>;
    const open = items.filter(i => i.action === 'unsure' || i.action === 'unknown');
    let asked: string | undefined;
    if (o.apply && o.unsure === 'ask' && open.length) {
        asked = d.ask(`all_in: ${open.length} file(s) need your call`, [
            'These stayed in the waiting area. Answer with a stage per file (source | raw | semi | final), or move each into its stage folder yourself; an agent files an answered one with media.record.',
            '', ...open.map(i => `- ${i.file} — ${i.why}`)
        ].join('\n'));
    }
    const r = { dryRun: !o.apply, unsure: o.unsure, bases, ...(Object.keys(down).length ? { down } : {}), counts, items, ...(asked ? { asked } : {}) };
    return { ...r, lines: lines(r) };
}
