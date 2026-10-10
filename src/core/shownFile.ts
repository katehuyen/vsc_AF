/**
 * X-443 — WHICH FILE A PHONE MAY READ: ONE THE FARM ALREADY SHOWS IT. On the PC a page's own "open
 * this file" (a card's chip, a report, a step's output, a note's file, a memory file) opens the
 * editor; a phone has none, so the same press opens the farm's file page, read-only.
 *
 * ‼️ THE PAGE SAYS WHERE IT IS, THE FARM FINDS THE FILE. Each page that shows a file is a source
 * here. What it sent — an item's id, or a path — is looked up in what that page shows: the item's
 * own file, or the path among the paths the page's data carries. A path the farm shows nowhere is
 * refused, so a phone never points the host at a file of its own choosing (editedFileTarget's rule,
 * one source wide). A file that can hold a key is in no source: an agent's settings, an MCP
 * definition and a skill stay on the PC.
 */
import * as fs from 'fs';
import { BridgeRefusal, BridgeRegistry } from './bridge';
import { collectEdits, groupByFile } from './codeedits';
import { editedFileTarget, readEditedFile, type EditedFileView } from './editedFile';

/** A work item's documents, as the Queue page names them (`kind`). */
export interface QueueDocs { reportPath?: string; sourceNoticeReportPath?: string; answerPath?: string }

/** The document of a work item a press asks for: its report, its source notice's report, or its answer. */
export function queueDocOf(item: QueueDocs | undefined, kind: unknown): string | undefined {
    return kind === 'report' ? item?.reportPath : kind === 'noticeReport' ? item?.sourceNoticeReportPath : item?.answerPath;
}

/** An agent's own documents. Its settings, MCP definitions and skills are deliberately not among them. */
export interface AgentDocs {
    claudeMdPath?: string;
    dutiesPath?: string;
    memoryIndexPath?: string;
    memoryFiles?: readonly { path: string }[];
}

/** What the farm's pages show, as the stores hold it. */
export interface ShownFileData {
    /** every file a hosted card's write tools name (editedFilesOf over the Console's sessions) */
    cards(): readonly string[];
    /** the transcript of a session the index knows, by its id */
    transcript(sessionId: string): string | undefined;
    queueItem(id: string): QueueDocs | undefined;
    notice(id: string): { reportPath?: string } | undefined;
    note(id: string): { contextFiles?: readonly string[] } | undefined;
    missionRuns(): readonly { rounds?: readonly { steps?: readonly { outputFile?: string }[] }[] }[];
    tasks(): readonly { outputFile?: string }[];
    agents(): readonly AgentDocs[];
}

type Named = readonly (string | undefined)[];

interface Source {
    /** the files this page shows for what it sent */
    files(args: Record<string, unknown>, d: ShownFileData): Named;
    /** the page sends an item, and the item names its one file: no path travels */
    item?: true;
    /** an agent's write tools named it, so its changes since the last commit can be asked too */
    edits?: true;
}

const id = (v: unknown): string => typeof v === 'string' ? v : '';
const memoryOf = (d: ShownFileData): Named => d.agents().flatMap(a => (a.memoryFiles ?? []).map(f => f.path));
const outputsOf = (d: ShownFileData): Named => d.tasks().map(t => t.outputFile);

/** The files a transcript's write tools name: what the viewer's own list of changed files draws. */
export function transcriptFiles(file: string | undefined): string[] {
    if (!file) { return []; }
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
    return groupByFile(collectEdits(raw.split('\n'))).map(f => f.file);
}

/** Every page that shows a file, by the name its view is served under (/view/<page>). */
export const SHOWN_FILE_SOURCES: Readonly<Record<string, Source>> = {
    console: { edits: true, files: (_a, d) => d.cards() },
    session: { edits: true, files: (a, d) => transcriptFiles(id(a.session) ? d.transcript(id(a.session)) : undefined) },
    queue: { item: true, files: (a, d) => [id(a.id) ? queueDocOf(d.queueItem(id(a.id)), a.kind) : undefined] },
    notices: { item: true, files: (a, d) => [id(a.id) ? d.notice(id(a.id))?.reportPath : undefined] },
    a2anotes: { files: (a, d) => (id(a.id) ? d.note(id(a.id))?.contextFiles : undefined) ?? [] },
    missions: { files: (_a, d) => d.missionRuns().flatMap(r => (r.rounds ?? []).flatMap(x => (x.steps ?? []).map(s => s.outputFile))) },
    tasks: { files: (_a, d) => outputsOf(d) },
    // the board is the Tasks page on its Run tab (remotePages)
    board: { files: (_a, d) => outputsOf(d) },
    agent: { files: (_a, d) => d.agents().flatMap(a => [a.claudeMdPath, a.dutiesPath, a.memoryIndexPath, ...(a.memoryFiles ?? []).map(f => f.path)]) },
    // a memory hit
    search: { files: (_a, d) => memoryOf(d) }
};

export interface ShownFileTarget { file: string; diff: boolean; edits: boolean }

/** The file a press on the phone names, found in what the page it came from shows — or nothing. */
export function shownFileTarget(args: Record<string, unknown> | undefined, d: ShownFileData): ShownFileTarget | undefined {
    const a = args ?? {};
    const from = id(a.from);
    const src = Object.prototype.hasOwnProperty.call(SHOWN_FILE_SOURCES, from) ? SHOWN_FILE_SOURCES[from] : undefined;
    if (!src) { return undefined; }
    const known = src.files(a, d).filter((f): f is string => typeof f === 'string' && !!f);
    const hit = editedFileTarget({ file: src.item ? known[0] : a.file, diff: src.edits === true && a.diff === true }, known);
    return hit ? { ...hit, edits: src.edits === true } : undefined;
}

/** Prose is read wrapped, without line numbers; anything else is code, numbered and scrolled sideways. */
export function readsAsProse(file: string): boolean { return /\.(md|markdown|mdx|txt)$/i.test(file); }

export interface ShownFileDeps {
    data: ShownFileData;
    readEdited?: (file: string, diff: boolean) => Promise<EditedFileView>;
}

export function registerShownFileOp(bridge: BridgeRegistry, deps: ShownFileDeps): void {
    bridge.register([
        {
            op: 'files.read',
            describe: 'X-443 — A FILE A PAGE SHOWS, READ AS IT IS ON DISK NOW: what a phone reads when a page\'s own "open this file" is pressed, because it has no editor. '
                + 'The farm finds the file in what that page shows; a path it shows nowhere is refused by name, and an agent\'s settings, MCP definitions and skills are in no source. '
                + '`from` names the page and decides what else is read: console → file (one a card\'s write tools name) · session → session (its id) + file (one that transcript\'s write tools name) · '
                + 'queue → id + kind (report | noticeReport | answer) · notices → id (its report) · a2anotes → id + file (one of the note\'s contextFiles) · missions → file (a step\'s output) · '
                + 'tasks → file (a task\'s output) · agent → file (an agent\'s CLAUDE.md, DUTIES.md, memory index or memory file) · search → file (a memory file). '
                + 'diff:true adds `git diff HEAD -- <file>` for console and session, whose files an agent wrote. Nothing is written. '
                + 'args: from, file?, id?, kind?, session?, diff? (default false). Answer: console.file.read\'s own, plus edits (whether the diff can be asked).',
            handler: async (args) => {
                const t = shownFileTarget(args, deps.data);
                if (!t) {
                    throw new BridgeRefusal('no page shows that file — `from` names a page (' + Object.keys(SHOWN_FILE_SOURCES).join(' · ')
                        + ') and the file must be one that page shows.', { step: 'known' });
                }
                return { ...await (deps.readEdited ?? readEditedFile)(t.file, t.diff), edits: t.edits };
            }
        }
    ]);
}
