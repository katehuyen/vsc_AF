/**
 * U-204 — WHAT A SCREEN SHOWS THAT AN EAR CAN ONLY USE AS A SIZE OR A NAME.
 *
 * `sanitizeForSpeech` already says a fenced block and a table by their size.
 * These are the shapes that were still spelled out (measured): code indented
 * instead of fenced, JSON in a sentence, ids and hashes, stack traces and log
 * runs, `file:line` references. Each becomes what a listener can use — its
 * size, its name, or "an id" — in the words of the voice that reads it.
 *
 * Pure and line-oriented; the cleaner calls each pass at the point in its own
 * order where the text it needs is still intact (see `sanitizeForSpeech`).
 */
import type { SpeechPhrases } from './speechPhrases';

/** A size said as a sentence of its own; U-205 — a phrase skipped ('') leaves no stray stop behind. */
export const spokenStop = (phrase: string): string => (phrase ? `${phrase}.` : '');

const BLANK = /^[ \t]*$/;
const INDENTED = /^(?: {4,}|\t)[ \t]*\S/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/;
const LIST_BODY = /^[ \t]{2,}\S/;
/** A stack frame: Node / Java / .NET all print `at <where>` indented, ending in a location. */
const FRAME = /^[ \t]+at [^\s(][^\n]*?(?:\)|:\d+|:line \d+)[ \t]*$/;
const FRAME_MORE = /^[ \t]+\.\.\. \d+ more[ \t]*$/;
const FRAME_LOCATION = /:\d+|\(native\)/;
const PY_TRACE = /^[ \t]*Traceback \(most recent call last\):?[ \t]*$/;
const PY_FRAME = /^[ \t]+\S/;
/** A log line begins with a timestamp or a bracketed / colon-ended level. */
const LOG_LINE = /^[ \t]*\[?(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\d{2}:\d{2}:\d{2}\b|(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)(?:\]|:))/;

/** How many lines from `i` are one stack trace (0 = none). The error's own
 *  message line above the frames is prose and stays. */
function traceRun(lines: string[], i: number): number {
    if (PY_TRACE.test(lines[i])) {
        let j = i + 1;
        while (j < lines.length && PY_FRAME.test(lines[j])) { j++; }
        return j - i >= 2 ? j - i : 0;
    }
    let j = i;
    while (j < lines.length && (FRAME.test(lines[j]) || (j > i && FRAME_MORE.test(lines[j])))) { j++; }
    // An indented prose line that happens to begin with "at" carries no location.
    return j > i && lines.slice(i, j).some(l => FRAME_LOCATION.test(l)) ? j - i : 0;
}

/** A run of two or more log lines (0 = none); one line alone is read as written. */
function logRun(lines: string[], i: number): number {
    let j = i;
    while (j < lines.length && LOG_LINE.test(lines[j])) { j++; }
    return j - i >= 2 ? j - i : 0;
}

/**
 * Indented code (0 = none): four spaces or a tab, after a blank line, and NOT
 * the body of a list item — "- item", a blank, then an indented paragraph is a
 * list's continuation, and saying it as code would drop words somebody wrote.
 */
function indentedRun(lines: string[], i: number): number {
    if (!INDENTED.test(lines[i]) || (i > 0 && !BLANK.test(lines[i - 1]))) { return 0; }
    let p = i - 1;
    while (p >= 0 && BLANK.test(lines[p])) { p--; }
    if (p >= 0 && (LIST_ITEM.test(lines[p]) || LIST_BODY.test(lines[p]))) { return 0; }
    let last = i;
    for (let j = i; j < lines.length; j++) {
        if (INDENTED.test(lines[j])) { last = j; } else if (!BLANK.test(lines[j])) { break; }
    }
    return last - i + 1;
}

/** Stack traces, log runs and indented code, each said as its size on a block of its own. */
export function sayBlocks(text: string, words: SpeechPhrases): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const t = traceRun(lines, i);
        const g = t ? 0 : logRun(lines, i);
        const c = t || g ? 0 : indentedRun(lines, i);
        const n = t || g || c;
        if (n) {
            out.push('', spokenStop(t ? words.trace(t) : g ? words.log(g) : words.codeBlock(c)), '');
            i += n;
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    return out.join('\n');
}

const DELIMITER_ROW = /^[ \t]*\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*$/;

/** A table's DATA rows: the delimiter row is markup and the row above it is the header. */
export function tableRows(block: string): number {
    const rows = block.trim().split('\n');
    const header = rows.length > 1 && DELIMITER_ROW.test(rows[1]) ? 1 : 0;
    return Math.max(0, rows.filter(l => !DELIMITER_ROW.test(l)).length - header);
}

/** Past this a span is not looked for a close in — the scan stays linear in practice. */
const JSON_SPAN_MAX = 8000;

function closeOf(s: string, i: number): number {
    let depth = 0;
    let inString = false;
    const max = Math.min(s.length, i + JSON_SPAN_MAX);
    for (let j = i; j < max; j++) {
        const c = s[j];
        if (inString) {
            if (c === '\\') { j++; } else if (c === '"') { inString = false; }
        } else if (c === '"') {
            inString = true;
        } else if (c === '{' || c === '[') {
            depth++;
        } else if (c === '}' || c === ']') {
            depth--;
            if (depth === 0) { return j; }
        }
    }
    return -1;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * How a span that PARSES as JSON is said (null = not JSON data, leave it).
 * One key with a plain value is a phrase ("op: farm.ops"); more is data, said
 * by its size; a pretty-printed span is said like the code block it is.
 */
function jsonSaid(span: string, words: SpeechPhrases): string | null {
    if (!/"\s*:/.test(span)) { return null; }
    let v: unknown;
    try { v = JSON.parse(span); } catch { return null; }
    const isList = Array.isArray(v);
    if (isList ? !(v as unknown[]).some(isObject) : !isObject(v) || !Object.keys(v).length) { return null; }
    if (span.includes('\n')) { return `\n\n${spokenStop(words.codeBlock(span.split('\n').length))}\n\n`; }
    if (isList) { return words.jsonList((v as unknown[]).length); }
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    const only = o[keys[0]];
    if (keys.length === 1 && (only === null || typeof only !== 'object')) { return `${keys[0]}: ${String(only)}`; }
    return words.jsonObject(keys.length);
}

/** JSON anywhere in the text — a sentence, inline code, a pasted block. Only a
 *  span that really parses is touched; a brace in prose is left alone. */
export function sayJson(s: string, words: SpeechPhrases): string {
    let out = '';
    let from = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ((c !== '{' && c !== '[') || /[\w)\]]/.test(s[i - 1] ?? '')) { continue; }
        const end = closeOf(s, i);
        if (end < 0) { continue; }
        const said = jsonSaid(s.slice(i, end + 1), words);
        if (said === null) { continue; }
        out += s.slice(from, i) + said;
        from = end + 1;
        i = end;
    }
    return out + s.slice(from);
}

/** `name.ext:LINE[:COL][-END]`; a host's port is not a line (`api.example.com:443`). */
const FILE_LINE = /(?<![\w./\\-])([\w-]+(?:\.[\w-]+)*\.([A-Za-z][A-Za-z0-9]{0,9})):(\d+)(?::\d+)?(?:-(\d+))?(?!\w)/g;
const HOST_SUFFIX = /^(?:com|org|net|io|dev|app|co|ai|local|internal)$/i;
const UUID = /(?<![\w-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\w-])/gi;
/** Agent Farm's own ids: a short lower-case prefix, an underscore, a long tail with a digit. */
const PREFIXED_ID = /(?<![\w-])[a-z]{2,6}_(?=[a-z0-9]*\d)[a-z0-9]{8,}(?![\w-])/g;
/** A hash: seven or more hex characters mixing digits and letters — a number or a word is neither. */
const HEX_ID = /(?<![\w-])(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}(?![\w-])/gi;

/** References after paths are cut to their file names: `file:line` and ids. */
export function sayRefs(s: string, words: SpeechPhrases): string {
    return s
        .replace(FILE_LINE, (m: string, file: string, ext: string, a: string, b?: string) =>
            HOST_SUFFIX.test(ext) ? m : words.fileLine(file, Number(a), b ? Number(b) : undefined))
        .replace(UUID, () => words.id)
        .replace(PREFIXED_ID, () => words.id)
        .replace(HEX_ID, () => words.id);
}
