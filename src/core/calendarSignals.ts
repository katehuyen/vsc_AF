/**
 * M-61 — THE CONTENT CALENDAR ON LIVING AND NEEDS YOU. A publish past its time
 * and still open (src/core/contentCalendar.ts calendarView) is a loop that did
 * not close: Living carries one row for the calendar — overdue = warn, else the
 * next one due — and Needs You one row per overdue publish, which opens its
 * note or the workflow step that publishes it. Pure.
 */
import { type CalEntry, findEntry, whenOf } from './contentCalendar';
import type { LivingSignal } from './living';
import type { NeedItem } from './needs';

export interface PublishView { upcoming: CalEntry[]; overdue: CalEntry[] }

/** where a note is published from: the workflow and step whose publish.entry names it */
export interface PublishStepRef { workflowId: string; workflowTitle: string; stepIndex: number }

export interface OverduePublish { entry: CalEntry; lateMs: number; step?: PublishStepRef }

export function span(ms: number): string {
    const h = Math.abs(ms) / 3_600_000;
    if (h < 1) { return `${Math.max(1, Math.round(h * 60))} min`; }
    if (h < 48) { return `${Math.round(h)} h`; }
    return `${Math.round(h / 24)} days`;
}

const when = (e: CalEntry) => `${e.date}${e.startTime ? ` ${e.startTime}` : ''}`;

export function publishSignals(v: PublishView | undefined, now: number): LivingSignal[] {
    if (!v || (!v.upcoming.length && !v.overdue.length)) { return []; }
    if (v.overdue.length) {
        const late = [...v.overdue].sort((a, b) => whenOf(a) - whenOf(b));
        const n = late.length;
        return [{
            id: 'calendar',
            label: n === 1 ? '1 publish is overdue' : `${n} publishes are overdue`,
            state: 'warn',
            detail: late.slice(0, 4).map(e => `"${e.title}" (${e.platform}) ${span(now - whenOf(e))} late`).join(' · ') + (n > 4 ? ` · +${n - 4} more` : ''),
            hint: 'Needs You has a row for each: open its note to move the date or mark it, or open the publish step that sends it.',
            ageMs: now - whenOf(late[0]),
            goto: 'needs',
            weight: 55
        }];
    }
    const next = v.upcoming[0];
    return [{
        id: 'calendar', label: 'Content calendar on time', state: 'ok',
        detail: `next: "${next.title}" on ${next.platform} in ${span(whenOf(next) - now)}${v.upcoming.length > 1 ? ` · ${v.upcoming.length} due this week` : ''}`,
        goto: 'tasks', weight: 12
    }];
}

/** The workflow step whose publish.entry names this note — only a literal name can; a placeholder is filled per run. */
export function publishStepOf(e: CalEntry, workflows: readonly { id: string; title: string; steps: readonly { publish?: { entry?: string } }[] }[]): PublishStepRef | undefined {
    for (const w of workflows) {
        const i = w.steps.findIndex(s => {
            const ref = String(s.publish?.entry ?? '').trim();
            return !!ref && !ref.includes('{') && !!findEntry([e], ref);
        });
        if (i >= 0) { return { workflowId: w.id, workflowTitle: w.title, stepIndex: i }; }
    }
    return undefined;
}

export function publishNeedItems(list: readonly OverduePublish[], urgency: number): NeedItem[] {
    return list.map(({ entry: e, lateMs, step }) => ({
        urgency, kind: 'publish-overdue' as const, agentName: 'calendar',
        title: `"${e.title}" was due on ${e.platform} ${span(lateMs)} ago`,
        detail: `${when(e)} · ${e.status} · ${step ? `published by "${step.workflowTitle}" step ${step.stepIndex + 1}` : 'no publish step names this note'}`,
        ts: whenOf(e),
        ref: { filePath: e.file, ...(step ? { workflowId: step.workflowId, stepIndex: step.stepIndex } : {}) },
        actions: [
            { id: 'open-note', label: 'Open the note' },
            step ? { id: 'open-publish', label: 'Open its publish step' } : { id: 'open-tasks', label: 'Tasks' }
        ]
    }));
}
