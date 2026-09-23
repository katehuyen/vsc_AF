/**
 * A notice that becomes a work item carries the notice WITH it (N-10).
 *
 * Two doors turn a notice into an item — the Notices page (convert, or answer a
 * question) and the bridge op `queue.fromNotice` — and both build their input
 * here, so they cannot disagree about what travels. What travels is the
 * notice's identity: who raised it, what kind of message it was, its words, its
 * sections, its report and its project. A title alone left the item an orphan
 * once the notice was deleted (the default), and left the asking agent unable
 * to find the answer to its own question.
 *
 * Pure: no vscode, no store. Types only from workqueue (erased at runtime).
 */
import type { WorkItemInput } from './workqueue';

export interface NoticeSourceSection { title: string; body: string; }

/** What the queue keeps of its source notice. `sourceNoticeId/Title` stay on
 *  WorkItem itself — they predate this and every legacy item has them. */
export interface NoticeSourceFields {
    /** Who raised the notice — the agent a question came FROM. */
    sourceNoticeAgent?: string;
    /** question · warning · report … — decides the badge. */
    sourceNoticeType?: string;
    /** The notice's own words (markdown), as it read when converted. */
    sourceNoticeBody?: string;
    sourceNoticeSections?: NoticeSourceSection[];
    /** The report the notice announced, if any. */
    sourceNoticeReportPath?: string;
}

/** The slice of a notice the conversion reads — NoticesStore.snapshotOf. */
export interface NoticeSource {
    title: string;
    agentName?: string;
    type?: string;
    body?: string;
    sections?: NoticeSourceSection[];
    reportPath?: string;
    projectId?: string;
}

const AGENT_MAX = 60, TYPE_MAX = 30, BODY_MAX = 8000, PATH_MAX = 500;
const SECTIONS_MAX = 20, SECTION_TITLE_MAX = 200, SECTION_BODY_MAX = 4000;

const str = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

/** Validated copy of the source fields — makeWorkItem's half of the contract. */
export function coerceNoticeSource(v: NoticeSourceFields): NoticeSourceFields {
    const out: NoticeSourceFields = {};
    const agent = str(v.sourceNoticeAgent, AGENT_MAX);
    const type = str(v.sourceNoticeType, TYPE_MAX).toLowerCase();
    const body = str(v.sourceNoticeBody, BODY_MAX);
    const report = str(v.sourceNoticeReportPath, PATH_MAX);
    if (agent) { out.sourceNoticeAgent = agent; }
    if (type) { out.sourceNoticeType = type; }
    if (body) { out.sourceNoticeBody = body; }
    if (report) { out.sourceNoticeReportPath = report; }
    const sections = (Array.isArray(v.sourceNoticeSections) ? v.sourceNoticeSections : [])
        .map(s => ({ title: str(s?.title, SECTION_TITLE_MAX), body: str(s?.body, SECTION_BODY_MAX) }))
        .filter(s => s.title || s.body)
        .slice(0, SECTIONS_MAX);
    if (sections.length) { out.sourceNoticeSections = sections; }
    return out;
}

/**
 * The one input both doors add. `isAgent` decides whether the notice's author
 * may become the item's TARGET: a question answered goes back to the agent that
 * asked it, but a notice raised by Agent Farm itself names nobody who takes
 * work, so it stays unrouted. A notice already gone yields the bare link.
 */
export function queueInputFromNotice(
    noticeId: string, text: string, n: NoticeSource | undefined, isAgent?: (name: string) => boolean
): WorkItemInput {
    const input: WorkItemInput = { text, author: 'user', sourceNoticeId: noticeId };
    if (!n) { return input; }
    input.sourceNoticeTitle = n.title;
    const agent = (n.agentName ?? '').trim();
    if (agent) {
        input.sourceNoticeAgent = agent;
        if (isAgent?.(agent)) { input.target = agent; }
    }
    if (n.type) { input.sourceNoticeType = n.type; }
    if (n.body) { input.sourceNoticeBody = n.body; }
    if (n.sections?.length) { input.sourceNoticeSections = n.sections.map(s => ({ title: s.title, body: s.body })); }
    if (n.reportPath) { input.sourceNoticeReportPath = n.reportPath; }
    if (n.projectId) { input.projectId = n.projectId; }
    return input;
}
