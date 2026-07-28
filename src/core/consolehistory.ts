/**
 * The conversation a resumed session already had — read back from its own
 * transcript so the Console does not open on an empty screen.
 *
 * Resuming is supposed to mean *continuing*: `claude --resume` restores the
 * model's context, but the panel used to show nothing until the next turn, so
 * the one thing a resume is for — picking up where you left off, with what was
 * said still in front of you — was missing from the surface that exists to show
 * conversations.
 *
 * **Display only.** These rows come off disk (`~/.claude/projects/…jsonl`);
 * nothing here is sent anywhere, no token is spent, and the model's own context
 * is restored by `--resume` independently of this. Scrolling up in the Console
 * after a resume is exactly as expensive as scrolling up in a text file.
 *
 * Pure: takes the transcript's lines, returns messages. No io, no vscode.
 */

import { ConsoleMessage, shortArg, WRITE_TOOLS } from './consoleproto';

/** How many messages the backfill carries by default — enough to be the
 *  conversation, small enough that a 40 MB transcript cannot stall the panel.
 *  Whatever is older stays one click away in the transcript viewer. */
export const HISTORY_MAX = 150;

/** Tool results are a preview here, exactly as they are in the live stream. */
const RESULT_PREVIEW = 400;

/** Only the tail of the file is parsed. A transcript can be tens of megabytes
 *  and we want its last ~150 messages; parsing every line of it to throw the
 *  first 99% away would put that cost on the click that resumes a session. */
const SCAN_LINES = 4000;

function tsOf(line: Record<string, unknown>, fallback: number): number {
    const t = line['timestamp'];
    if (typeof t === 'string') {
        const ms = Date.parse(t);
        if (!Number.isNaN(ms)) { return ms; }
    }
    return fallback;
}

/**
 * Transcript lines → the rows the Console renders.
 *
 * Sidechains (sub-agent runs) and meta lines are left out: they are not what
 * the two of you said to each other, and the transcript viewer is where that
 * detail belongs.
 */
export function transcriptHistory(
    lines: string[], opts?: { max?: number; now?: number }
): ConsoleMessage[] {
    const max = opts?.max ?? HISTORY_MAX;
    const now = opts?.now ?? Date.now();
    const out: ConsoleMessage[] = [];
    let n = 0;
    const push = (m: Omit<ConsoleMessage, 'id'>): void => {
        out.push({ ...m, id: `h${++n}` } as ConsoleMessage);
    };
    const scanned = lines.length > SCAN_LINES ? lines.slice(-SCAN_LINES) : lines;
    const partial = scanned.length < lines.length;

    for (const raw of scanned) {
        if (!raw.trim()) { continue; }
        let line: Record<string, unknown>;
        try { line = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
        if (line['isMeta'] === true || line['isSidechain'] === true) { continue; }
        const type = String(line['type'] ?? '');
        const msg = line['message'] as { content?: unknown } | undefined;
        const ts = tsOf(line, now);

        if (type === 'user') {
            const content = msg?.content;
            if (typeof content === 'string') {
                if (content.trim()) { push({ role: 'user', ts, text: content }); }
                continue;
            }
            if (!Array.isArray(content)) { continue; }
            for (const b of content as Record<string, unknown>[]) {
                const bt = String(b?.['type'] ?? '');
                if (bt === 'text' && String(b['text'] ?? '').trim()) {
                    push({ role: 'user', ts, text: String(b['text']) });
                } else if (bt === 'tool_result') {
                    const text = typeof b['content'] === 'string'
                        ? b['content'] as string
                        : JSON.stringify(b['content'] ?? '');
                    push({
                        role: 'tool', ts, isError: b['is_error'] === true,
                        text: text.replace(/\s+/g, ' ').trim().slice(0, RESULT_PREVIEW)
                    });
                }
            }
            continue;
        }

        if (type === 'assistant') {
            const content = msg?.content;
            if (!Array.isArray(content)) { continue; }
            for (const b of content as Record<string, unknown>[]) {
                const bt = String(b?.['type'] ?? '');
                if (bt === 'text' && String(b['text'] ?? '').trim()) {
                    push({ role: 'agent', ts, text: String(b['text']) });
                } else if (bt === 'tool_use' && b['name']) {
                    const name = String(b['name']);
                    const input = b['input'] as Record<string, unknown> | undefined;
                    push({
                        role: 'tool', ts,
                        tool: {
                            id: typeof b['id'] === 'string' ? b['id'] as string : undefined,
                            name, detail: shortArg(name, input),
                            file: WRITE_TOOLS.has(name)
                                ? String(input?.['file_path'] ?? input?.['notebook_path'] ?? '') || undefined
                                : undefined
                        }
                    });
                }
            }
        }
        // summaries, system lines, thinking blocks: not conversation
    }

    if (!out.length) { return out; }
    // Keep the END of the conversation — where you left off is what you came
    // back for. Anything cut is still in the transcript, and the row says so.
    const kept = out.slice(-max);
    const dropped = out.length - kept.length;
    const head: ConsoleMessage[] = [{
        id: 'h0', ts: kept[0].ts, role: 'system',
        text: partial
            ? '↑ earlier messages are in the transcript — "Open transcript" has the whole session.'
            : dropped
                ? `↑ ${dropped} older message(s) are in the transcript — "Open transcript" has the whole session.`
                : '↑ the start of this session'
    }];
    const tail: ConsoleMessage[] = [{
        id: 'h-end', ts: kept[kept.length - 1].ts, role: 'system',
        text: '— read back from the transcript · resumed here —'
    }];
    return [...head, ...kept, ...tail];
}
