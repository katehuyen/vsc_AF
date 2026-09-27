/**
 * M-51 — THE PUBLISH STEP. One platform per step: an approval gate (ask by
 * default; auto; never = a rehearsal that builds and records the payload and
 * sends nothing), then the connection — a webhook (the user's n8n flow does the
 * YouTube / Instagram / TikTok upload) — and the result written back to the
 * content calendar note (src/core/contentCalendar.ts) and the media record's
 * `publishing` fields. `schedule: planned` hands the calendar note's time on as
 * `publishAt` so the flow schedules it. Pure, apart from nothing.
 */
import { resolveFlex } from './flexResolve';
import { type CalEntry, whenOf } from './contentCalendar';

export const PUBLISH_CONNECTIONS = ['webhook'] as const;

export interface PublishSpec {
    platform: string;
    /** the connection's address — an n8n webhook; {secret:NAME} and the run's placeholders are filled */
    url: string;
    /** the calendar note this publish is (name, path or exact title; placeholders filled) */
    entry?: string;
    /** the platform's metadata template (JSON; filled inside its values) — handed on as `metadata` */
    body?: string;
    approval?: 'ask' | 'auto' | 'never';
    schedule?: 'now' | 'planned';
    connection?: 'webhook';
}

/** Why a publish step is refused, or ''. */
export function publishRefusal(p: unknown): string {
    if (!p || typeof p !== 'object') { return 'publish must be an object {platform, url, …}'; }
    const s = p as Partial<PublishSpec>;
    if (!String(s.platform ?? '').trim()) { return 'publish.platform is required (youtube, instagram, tiktok…)'; }
    if (!String(s.url ?? '').trim()) { return 'publish.url is required — the connection\'s webhook address'; }
    if (s.approval !== undefined && !['ask', 'auto', 'never'].includes(String(s.approval))) { return `publish.approval is ask, auto or never, not "${String(s.approval)}"`; }
    if (s.schedule !== undefined && !['now', 'planned'].includes(String(s.schedule))) { return `publish.schedule is now or planned, not "${String(s.schedule)}"`; }
    if (s.connection !== undefined && !(PUBLISH_CONNECTIONS as readonly string[]).includes(String(s.connection))) { return `publish.connection is ${PUBLISH_CONNECTIONS.join(' or ')} for now, not "${String(s.connection)}"`; }
    return '';
}

/** Approval and schedule, each through its flex point; `why` says where each came from. */
export function planPublish(p: PublishSpec, settingsApproval?: string): { approval: 'ask' | 'auto' | 'never'; schedule: 'now' | 'planned'; why: string[] } {
    const set = settingsApproval && settingsApproval !== 'ask' ? settingsApproval : undefined;
    const a = resolveFlex('publish.approval', { ...(set ? { settings: set } : {}), ...(p.approval ? { step: p.approval } : {}) });
    const s = resolveFlex('publish.schedule', { ...(p.schedule ? { step: p.schedule } : {}) });
    return {
        approval: a.value === 'auto' || a.value === 'never' ? a.value : 'ask',
        schedule: s.value === 'planned' ? 'planned' : 'now',
        why: [`approval: ${a.sentence}`, `schedule: ${s.sentence}`]
    };
}

const files = (j: unknown): string[] => {
    const o = j && typeof j === 'object' ? j as { outputs?: unknown; items?: unknown } : {};
    const list = Array.isArray(o.outputs) ? o.outputs : Array.isArray(o.items) ? o.items : [];
    return list.filter((x): x is string => typeof x === 'string');
};

/** What the connection is sent: the platform, the calendar note's facts, the previous step's files and text, the filled metadata. */
export function buildPublishPayload(o: {
    platform: string; stepTitle: string; schedule: 'now' | 'planned'; entry?: CalEntry;
    metadata?: unknown; prevJson?: unknown; prevText?: string; runId: string; workflowTitle: string;
}): Record<string, unknown> {
    const meta = o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata) ? o.metadata as Record<string, unknown> : undefined;
    return {
        platform: o.platform.toLowerCase(),
        title: (typeof meta?.title === 'string' && meta.title) || o.entry?.title || o.stepTitle,
        ...(o.schedule === 'planned' && o.entry ? { publishAt: new Date(whenOf(o.entry)).toISOString() } : {}),
        files: files(o.prevJson),
        text: String(o.prevText ?? '').slice(0, 4000),
        ...(o.entry ? { calendar: o.entry.name, ...(o.entry.record ? { record: o.entry.record } : {}) } : {}),
        ...(meta ? { metadata: meta } : {}),
        run: { id: o.runId, workflow: o.workflowTitle }
    };
}

/** What the connection answered: a URL, an id, when, whether it only scheduled it. Fail-soft: text is no result. */
export function readPublishResult(text: string): { url?: string; id?: string; publishedAt?: string; scheduled?: boolean } {
    let j: unknown;
    try { j = JSON.parse(text); } catch { return {}; }
    const o = (Array.isArray(j) ? j[0] : j) as Record<string, unknown> | undefined;
    if (!o || typeof o !== 'object') { return {}; }
    const str = (...k: string[]) => k.map(x => o[x]).find(v => typeof v === 'string' && v) as string | undefined;
    return {
        ...(str('url', 'pub_url', 'link') ? { url: str('url', 'pub_url', 'link') } : {}),
        ...(str('id', 'videoId', 'postId') ? { id: str('id', 'videoId', 'postId') } : {}),
        ...(str('publishedAt', 'published_at') ? { publishedAt: str('publishedAt', 'published_at') } : {}),
        ...(o.scheduled === true ? { scheduled: true } : {})
    };
}

/** The calendar note's new keys: published now, or ready when the flow only scheduled it. */
export function calendarPatchOf(r: ReturnType<typeof readPublishResult>, schedule: 'now' | 'planned', at: string): { status: string; url?: string; publishedAt?: string } {
    const scheduled = r.scheduled || (schedule === 'planned' && !r.url);
    return { status: scheduled ? 'ready' : 'published', ...(r.url ? { url: r.url } : {}), ...(scheduled ? {} : { publishedAt: r.publishedAt || at }) };
}

/** The media record's side: publishing.{status, platform, pub_url, status_date}, and published_at once it is out. */
export function applyPublished(item: Record<string, unknown>, r: { platform: string; status: string; url?: string; at: string }): void {
    const p = item.publishing && typeof item.publishing === 'object' ? item.publishing as Record<string, unknown> : {};
    item.publishing = { ...p, status: r.status, platform: r.platform, ...(r.url ? { pub_url: r.url } : {}), status_date: r.at };
    if (r.status === 'published') { item.published_at = r.at; }
}
