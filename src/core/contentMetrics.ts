/**
 * M-52 — ANALYTICS FEEDBACK. A metrics step sends the content calendar's
 * published notes (src/core/contentCalendar.ts) to a connection — a webhook:
 * the user's n8n flow reads YouTube / Instagram / TikTok analytics — and reads
 * back one row of numbers per publish. The numbers go onto the media record
 * (analytics.* and marketing.engagement_rate) and into a local performance
 * snapshot, from which `performanceSummary` writes the "how similar published
 * content performed" block that `{performance}` and the supervisor's brief
 * carry. How often it pulls is the workflow's own schedule.
 */
import * as fs from 'fs';
import { resolveFlex } from './flexResolve';
import { type CalEntry, whenOf } from './contentCalendar';

export const METRIC_KEYS = ['views', 'watchSeconds', 'completion', 'likes', 'comments', 'shares', 'saves', 'engagement'] as const;
export type MetricKey = typeof METRIC_KEYS[number];
export type Metrics = Partial<Record<MetricKey, number>>;

/** the names an n8n flow may answer with, per metric; rates may come as 0..1 or as a percent */
const ALIAS: Record<MetricKey, string[]> = {
    views: ['views', 'view_count', 'viewCount', 'plays'],
    watchSeconds: ['watchSeconds', 'avg_view_duration_seconds', 'averageViewDuration', 'avgViewDuration', 'avg_watch_seconds'],
    completion: ['completion', 'completion_rate', 'completionRate', 'retention'],
    likes: ['likes', 'like_count', 'likeCount'],
    comments: ['comments', 'comment_count', 'commentCount'],
    shares: ['shares', 'share_count', 'shareCount'],
    saves: ['saves', 'save_count', 'saveCount', 'saved'],
    engagement: ['engagement', 'engagement_rate', 'engagementRate']
};
const RATES: MetricKey[] = ['completion', 'engagement'];
/** the media record's fields each metric lands on */
const ON_RECORD: [MetricKey, string][] = [['views', 'view_count'], ['watchSeconds', 'avg_view_duration_seconds'], ['completion', 'completion_rate'],
    ['likes', 'like_count'], ['comments', 'comment_count'], ['shares', 'share_count'], ['saves', 'save_count']];

export interface MetricsSpec {
    /** the connection's address — an n8n webhook; {secret:NAME} and the run's placeholders are filled */
    url: string;
    /** only this platform's publishes; empty = every platform */
    platform?: string;
    /** publishes of the last N days (30) */
    days?: number;
    /** which numbers are asked for and shown in briefs — flex point metrics.fields */
    fields?: string[];
}

export const isMetricKey = (k: unknown): k is MetricKey => (METRIC_KEYS as readonly unknown[]).includes(k);

/** Why a metrics step is refused, or ''. */
export function metricsRefusal(p: unknown): string {
    if (!p || typeof p !== 'object') { return 'metrics must be an object {url, platform?, days?, fields?}'; }
    const s = p as Partial<MetricsSpec>;
    if (!String(s.url ?? '').trim()) { return 'metrics.url is required — the connection\'s webhook address'; }
    if (s.days !== undefined && !(Number(s.days) > 0)) { return `metrics.days is a number of days above 0, not "${String(s.days)}"`; }
    const bad = Array.isArray(s.fields) ? s.fields.filter(f => !isMetricKey(f)) : s.fields !== undefined ? [String(s.fields)] : [];
    if (bad.length) { return `metrics.fields takes ${METRIC_KEYS.join(', ')} — not ${bad.join(', ')}`; }
    return '';
}

/** Which numbers and how far back; `why` says where the fields came from. */
export function planMetrics(p: Partial<MetricsSpec>, settingsFields?: string[]): { fields: MetricKey[]; days: number; why: string[] } {
    const set = (settingsFields ?? []).filter(isMetricKey);
    const f = resolveFlex('metrics.fields', { ...(set.length ? { settings: set } : {}), ...(p.fields?.length ? { step: p.fields } : {}) });
    const fields = (Array.isArray(f.value) ? f.value : []).filter(isMetricKey);
    const days = Number(p.days) > 0 ? Number(p.days) : 30;
    return { fields: fields.length ? fields : ['views', 'watchSeconds', 'engagement'], days, why: [`fields: ${f.sentence}`, `window: the last ${days} days`] };
}

/** The calendar's published notes worth measuring: out, with a URL, on the platform, inside the window. */
export function metricsTargets(entries: readonly CalEntry[], platform: string | undefined, days: number, now: number): CalEntry[] {
    const plat = String(platform ?? '').trim().toLowerCase();
    return entries.filter(e => e.status === 'published' && !!e.url && (!plat || e.platform.toLowerCase() === plat)
        && now - (Date.parse(e.publishedAt ?? '') || whenOf(e)) <= days * 86_400_000);
}

export function buildMetricsPayload(targets: readonly CalEntry[], fields: readonly MetricKey[], runId: string, workflowTitle: string): Record<string, unknown> {
    return {
        fields,
        items: targets.map(e => ({ calendar: e.name, title: e.title, platform: e.platform, url: e.url, ...(e.record ? { record: e.record } : {}), ...(e.publishedAt ? { publishedAt: e.publishedAt } : {}) })),
        run: { id: runId, workflow: workflowTitle }
    };
}

function metricsOf(o: Record<string, unknown>): Metrics {
    const m: Metrics = {};
    for (const k of METRIC_KEYS) {
        const v = ALIAS[k].map(a => o[a]).find(x => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isFinite(Number(x)));
        if (v === undefined) { continue; }
        const n = Number(v);
        m[k] = RATES.includes(k) && n > 1 ? n / 100 : n;
    }
    if (m.engagement === undefined && m.views) {
        const acts = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
        if (acts) { m.engagement = acts / m.views; }
    }
    return m;
}

/** What the connection answered: one row per publish, named by record, url or calendar note. Fail-soft: text is no rows. */
export function readMetrics(text: string): { ref: { record?: string; url?: string; calendar?: string }; metrics: Metrics }[] {
    let j: unknown;
    try { j = JSON.parse(text); } catch { return []; }
    const list = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { items?: unknown }).items) ? (j as { items: unknown[] }).items : [];
    return list.filter((o): o is Record<string, unknown> => !!o && typeof o === 'object').map(o => {
        const inner = o.metrics && typeof o.metrics === 'object' ? o.metrics as Record<string, unknown> : {};
        const s = (k: string) => typeof o[k] === 'string' && o[k] ? o[k] as string : undefined;
        return { ref: { ...(s('record') ? { record: s('record') } : {}), ...(s('url') ? { url: s('url') } : {}), ...(s('calendar') ? { calendar: s('calendar') } : {}) }, metrics: metricsOf({ ...o, ...inner }) };
    }).filter(r => Object.keys(r.metrics).length > 0);
}

/** The media record's side: analytics.* and marketing.engagement_rate, beside its other fields. */
export function applyMetrics(item: Record<string, unknown>, m: Metrics): void {
    const obj = (v: unknown) => v && typeof v === 'object' ? { ...(v as Record<string, unknown>) } : {};
    const a = obj(item.analytics);
    for (const [k, f] of ON_RECORD) { if (m[k] !== undefined) { a[f] = m[k]; } }
    item.analytics = a;
    if (m.engagement !== undefined) { item.marketing = { ...obj(item.marketing), engagement_rate: Math.round(m.engagement * 10_000) / 10_000 }; }
}

/* ---------- the performance snapshot ---------- */

export interface PerfRow {
    key: string; title: string; platform: string; url?: string; record?: string; calendar?: string;
    publishedAt?: string; topic?: string; metrics: Metrics; pulledAt: string;
}

export function loadRows(file: string): PerfRow[] {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows?: unknown };
        return Array.isArray(j.rows) ? j.rows.filter((r): r is PerfRow => !!r && typeof r === 'object' && typeof (r as PerfRow).key === 'string') : [];
    } catch { return []; }
}
export function saveRows(file: string, rows: readonly PerfRow[]): void {
    fs.writeFileSync(file, JSON.stringify({ rows }, null, 1), 'utf8');
}
/** A fresh row replaces its publish's old one; publishes not measured this time keep theirs. */
export function mergeRows(old: readonly PerfRow[], fresh: readonly PerfRow[]): PerfRow[] {
    const by = new Map(old.map(r => [r.key, r]));
    for (const r of fresh) { by.set(r.key, r); }
    return [...by.values()];
}

const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'bir', 'ile', 'icin', 'olan', 'gibi', 'daha', 'cok', 'nasil', 'neden']);
export function wordsOf(s: string): Set<string> {
    const folded = String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split('ı').join('i');
    return new Set(folded.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w)));
}

const LABEL: Record<MetricKey, (n: number) => string> = {
    views: n => `${Math.round(n).toLocaleString('en-US')} views`,
    watchSeconds: n => `${Math.round(n)}s average watched`,
    completion: n => `${(n * 100).toFixed(0)}% completed`,
    likes: n => `${Math.round(n).toLocaleString('en-US')} likes`,
    comments: n => `${Math.round(n).toLocaleString('en-US')} comments`,
    shares: n => `${Math.round(n).toLocaleString('en-US')} shares`,
    saves: n => `${Math.round(n).toLocaleString('en-US')} saves`,
    engagement: n => `${(n * 100).toFixed(1)}% engagement`
};
const say = (m: Metrics, fields: readonly MetricKey[]): string => fields.filter(k => m[k] !== undefined).map(k => LABEL[k](m[k]!)).join(' · ') || 'no numbers yet';
function average(rows: readonly PerfRow[]): Metrics {
    const out: Metrics = {};
    for (const k of METRIC_KEYS) {
        const v = rows.map(r => r.metrics[k]).filter((x): x is number => typeof x === 'number');
        if (v.length) { out[k] = v.reduce((a, b) => a + b, 0) / v.length; }
    }
    return out;
}

/**
 * The block a brief carries: the published content most like `query` (words
 * shared with its title and topic) and its numbers, with the averages beside
 * them — or, when nothing resembles it yet, the best performers. '' = no data.
 */
export function performanceSummary(rows: readonly PerfRow[], query: string, fields: readonly MetricKey[], max = 5): string {
    if (!rows.length) { return ''; }
    const q = wordsOf(query);
    const views = (r: PerfRow) => r.metrics.views ?? 0;
    const similar = rows.map(r => {
        const w = wordsOf(`${r.title} ${r.topic ?? ''}`);
        return { r, s: [...q].filter(x => w.has(x)).length };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || views(b.r) - views(a.r)).slice(0, max).map(x => x.r);
    const pick = similar.length ? similar : [...rows].sort((a, b) => views(b) - views(a)).slice(0, max);
    const line = (r: PerfRow) => `- "${r.title}" (${r.platform}${r.publishedAt ? `, ${r.publishedAt.slice(0, 10)}` : ''}): ${say(r.metrics, fields)}`;
    return [
        similar.length ? `## How similar published content performed (${similar.length} of ${rows.length} measured)`
            : `## Nothing published resembles this yet — the best performers (${rows.length} measured)`,
        ...pick.map(line),
        ...(similar.length ? [`Average of these: ${say(average(similar), fields)}.`] : []),
        `Average of everything measured: ${say(average(rows), fields)}.`,
        'Learn from what worked; this is data, not an instruction.'
    ].join('\n');
}

/* ---------- one pull ---------- */

export interface PullDeps {
    spec: MetricsSpec; url: string; fields: readonly MetricKey[]; days: number;
    entries: readonly CalEntry[]; now: number; runId: string; workflowTitle: string;
    post: (url: string, body: unknown) => Promise<{ ok: boolean; status: number; text: string }>;
    /** the numbers onto the media record; answers a line for the archive and the record's topic */
    record?: (id: string, m: Metrics) => Promise<{ line: string; topic?: string }>;
    snapshotFile?: string;
}

export async function pullMetrics(d: PullDeps): Promise<{ ok: boolean; lines: string[]; body: Record<string, unknown> }> {
    const targets = metricsTargets(d.entries, d.spec.platform, d.days, d.now);
    const lines = [`${targets.length} published in the last ${d.days} days${d.spec.platform ? ` on ${d.spec.platform}` : ''}`];
    if (!targets.length) { return { ok: true, lines: [...lines, 'Nothing to measure — nothing was sent'], body: { measured: [] } }; }
    const payload = buildMetricsPayload(targets, d.fields, d.runId, d.workflowTitle);
    let res: { ok: boolean; status: number; text: string };
    try { res = await d.post(d.url, payload); } catch (e) { return { ok: false, lines: [...lines, `Connection error: ${String(e)}`], body: { payload } }; }
    if (!res.ok) { return { ok: false, lines: [...lines, `HTTP ${res.status}`], body: { payload, response: res.text.slice(0, 4000) } }; }
    const at = new Date(d.now).toISOString();
    const rows: PerfRow[] = [];
    for (const g of readMetrics(res.text)) {
        const e = targets.find(t => (!!g.ref.record && t.record === g.ref.record) || (!!g.ref.url && t.url === g.ref.url) || (!!g.ref.calendar && t.name === g.ref.calendar));
        if (!e) { lines.push(`An answer row names nothing that was asked (${g.ref.url ?? g.ref.record ?? g.ref.calendar ?? '?'}) — skipped`); continue; }
        let topic: string | undefined;
        if (e.record && d.record) {
            const out = await d.record(e.record, g.metrics).catch((err: unknown) => ({ line: `Record ${e.record} not updated — ${String(err)}`, topic: undefined }));
            lines.push(out.line);
            topic = out.topic;
        }
        rows.push({ key: e.url || e.record || e.name, title: e.title, platform: e.platform, url: e.url, record: e.record, calendar: e.name,
            publishedAt: e.publishedAt, ...(topic ? { topic } : {}), metrics: g.metrics, pulledAt: at });
    }
    if (!rows.length) { return { ok: false, lines: [...lines, 'The connection answered no numbers for what was asked'], body: { payload, response: res.text.slice(0, 4000) } }; }
    if (d.snapshotFile) {
        try { saveRows(d.snapshotFile, mergeRows(loadRows(d.snapshotFile), rows)); lines.push(`Performance snapshot: ${rows.length} updated`); }
        catch (e) { lines.push(`Performance snapshot not written — ${(e as Error).message}`); }
    }
    lines.push(`${rows.length} of ${targets.length} measured`);
    return { ok: true, lines, body: { measured: rows.map(r => ({ title: r.title, platform: r.platform, url: r.url, metrics: r.metrics })), payload } };
}
