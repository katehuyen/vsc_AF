/**
 * What the agent did to the code.
 *
 * A code-agent command centre could show cost, tokens, turns and duties — and
 * not one line the agent actually wrote. The data was never missing: every
 * `Edit` / `Write` / `MultiEdit` / `NotebookEdit` call is in the transcript
 * **with its own before-and-after text**. This module reads it back.
 *
 * The diff shown therefore comes from the session itself, not from git: it is
 * what THIS session changed, at the moment it changed it — not what the file
 * happens to look like now after three other sessions and two commits. Git is
 * offered separately (diff against HEAD) for the other question, "what is
 * still uncommitted right now", and the two are never mixed up.
 *
 * Pure parsing over transcript lines; the panel does the rendering.
 */

export type WriteTool = 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit';

export interface EditRecord {
    /** full path as the tool was called with it */
    file: string;
    tool: WriteTool;
    ts: number;
    /** 1-based turn this edit happened in (viewer/turn-table numbering) */
    turn: number;
    /** replaced text (Edit / MultiEdit hunks) */
    oldText?: string;
    /** new text (Edit hunks) or the whole file (Write) */
    newText?: string;
    /** Write: how many characters were written */
    bytes?: number;
    /** the tool call came back as an error — the change did NOT happen */
    failed?: boolean;
    /** MultiEdit: which hunk of the call this is (1-based) */
    hunk?: number;
}

export interface FileChanges {
    file: string;
    /** number of successful write calls (hunks count individually) */
    edits: number;
    /** at least one call created/overwrote the whole file */
    written: boolean;
    failed: number;
    firstTs: number;
    lastTs: number;
    turns: number[];
    records: EditRecord[];
}

interface ToolUseBlock {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

interface ResultBlock {
    type?: string;
    tool_use_id?: string;
    is_error?: boolean;
}

const WRITE_TOOLS = new Set<string>(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function str(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
}

/**
 * Read every file-writing tool call out of a transcript.
 *
 * `lines` are the raw JSONL lines (the caller owns the file reading, so the
 * same parser serves the panel, the bridge and the tests). Turn numbering
 * follows the viewer: a turn opens at each non-sidechain user text message.
 */
export function collectEdits(lines: string[]): EditRecord[] {
    const out: EditRecord[] = [];
    const failedIds = new Set<string>();
    const byId: Record<string, EditRecord[]> = {};
    let turn = 0;

    for (const raw of lines) {
        if (!raw.trim()) { continue; }
        let line: Record<string, unknown>;
        try { line = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
        const ts = typeof line.timestamp === 'string' ? Date.parse(line.timestamp) : 0;
        const msg = line.message as { content?: unknown } | undefined;

        if (line.type === 'user' && msg) {
            const content = msg.content;
            if (typeof content === 'string') {
                if (!line.isMeta && !line.isSidechain) { turn++; }
            } else if (Array.isArray(content)) {
                for (const b of content as ResultBlock[]) {
                    if (b?.type === 'tool_result' && b.is_error && b.tool_use_id) {
                        failedIds.add(b.tool_use_id);
                    } else if ((b as { type?: string }).type === 'text'
                        && !line.isMeta && !line.isSidechain) {
                        turn++;
                    }
                }
            }
            continue;
        }
        if (line.type !== 'assistant' || !msg || !Array.isArray(msg.content)) { continue; }

        for (const block of msg.content as ToolUseBlock[]) {
            if (block?.type !== 'tool_use' || !block.name || !WRITE_TOOLS.has(block.name)) { continue; }
            const input = block.input ?? {};
            const file = str(input['file_path']) ?? str(input['notebook_path']) ?? '';
            if (!file) { continue; }
            const tool = block.name as WriteTool;
            const base = { file, tool, ts, turn: Math.max(turn, 1) };
            const made: EditRecord[] = [];
            if (tool === 'MultiEdit' && Array.isArray(input['edits'])) {
                (input['edits'] as Record<string, unknown>[]).forEach((e, i) => {
                    made.push({
                        ...base, hunk: i + 1,
                        oldText: str(e?.['old_string']), newText: str(e?.['new_string'])
                    });
                });
            } else if (tool === 'Write') {
                const content = str(input['content']) ?? '';
                made.push({ ...base, newText: content, bytes: content.length });
            } else if (tool === 'NotebookEdit') {
                made.push({ ...base, newText: str(input['new_source']) });
            } else {
                made.push({
                    ...base,
                    oldText: str(input['old_string']),
                    newText: str(input['new_string'])
                });
            }
            if (block.id) { byId[block.id] = made; }
            out.push(...made);
        }
    }
    // A tool call that came back with an error changed nothing — mark it so the
    // panel can show it as attempted, never as done.
    for (const id of failedIds) {
        for (const rec of byId[id] ?? []) { rec.failed = true; }
    }
    return out;
}

/** Group the records by file, newest activity first. */
export function groupByFile(records: EditRecord[]): FileChanges[] {
    const map = new Map<string, FileChanges>();
    for (const r of records) {
        const f = map.get(r.file) ?? {
            file: r.file, edits: 0, written: false, failed: 0,
            firstTs: r.ts || 0, lastTs: r.ts || 0, turns: [], records: []
        };
        if (r.failed) { f.failed++; } else {
            f.edits++;
            if (r.tool === 'Write') { f.written = true; }
        }
        if (r.ts) {
            f.firstTs = f.firstTs ? Math.min(f.firstTs, r.ts) : r.ts;
            f.lastTs = Math.max(f.lastTs, r.ts);
        }
        if (!f.turns.includes(r.turn)) { f.turns.push(r.turn); }
        f.records.push(r);
        map.set(r.file, f);
    }
    const out = [...map.values()];
    out.forEach(f => f.turns.sort((a, b) => a - b));
    return out.sort((a, b) => b.lastTs - a.lastTs);
}

/** Line counts of one hunk — "+12 −3" without rendering the whole thing. */
export function hunkStats(rec: EditRecord): { added: number; removed: number } {
    const count = (s?: string) => (s === undefined || s === '' ? 0 : s.split('\n').length);
    return { added: count(rec.newText), removed: count(rec.oldText) };
}

/** Roll a file's hunks up into one +/− pair. */
export function fileStats(f: FileChanges): { added: number; removed: number } {
    let added = 0, removed = 0;
    for (const r of f.records) {
        if (r.failed) { continue; }
        const s = hunkStats(r);
        added += s.added;
        removed += s.removed;
    }
    return { added, removed };
}
