/**
 * X-411 — what leaves the machine: the state serialized, every key/token
 * pattern (and every known secret value) masked, then trimmed from the middle
 * to a character budget with the cut marked. The hash is of what was sent,
 * never of the raw input.
 */
import * as crypto from 'crypto';
import { KapiciState } from './types';

/** 32k tokens with room for the instructions, even for Turkish text (~2 chars a token). */
export const DEFAULT_INPUT_BUDGET = 40000;
const MIN_BUDGET = 200;
export const MASK = '***';

const PATTERNS: RegExp[] = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bAIza[0-9A-Za-z_-]{35}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
    /(\b(?:Bearer|Basic|Key)\s+)[A-Za-z0-9._~+/=-]{16,}/g,
    /(\b[\w-]*(?:api[_-]?key|token|secret|password|passwd|pwd|authorization)[\w-]*["']?\s*[:=]\s*["']?)(?=[^\s"',;]*[A-Za-z])(?=[^\s"',;]*\d)[^\s"',;]{12,}/gi
];

export interface PreparedInput { text: string; chars: number; hash: string; trimmed: boolean; cutChars: number; masked: number }

export function serializeState(state: KapiciState): string {
    return typeof state === 'string' ? state : JSON.stringify(state, null, 1);
}

/** Every key/token pattern and every known secret value becomes ***. */
export function maskSecrets(text: string, known: string[] = []): { text: string; masked: number } {
    let masked = 0;
    let out = text;
    for (const v of [...new Set(known.filter(k => typeof k === 'string' && k.length >= 6))].sort((a, b) => b.length - a.length)) {
        const parts = out.split(v);
        masked += parts.length - 1;
        out = parts.join(MASK);
    }
    for (const re of PATTERNS) {
        out = out.replace(re, (m: string, lead?: unknown) => {
            masked++;
            return typeof lead === 'string' && m.startsWith(lead) ? lead + MASK : MASK;
        });
    }
    return { text: out, masked };
}

/** Head and tail kept by whole lines, the middle replaced by a marker; a text without usable lines is cut by characters. */
export function trimToBudget(text: string, budget: number): { text: string; trimmed: boolean; cutChars: number } {
    const b = Math.max(MIN_BUDGET, Math.floor(budget));
    if (text.length <= b) { return { text, trimmed: false, cutChars: 0 }; }
    const marker = (n: number) => `\n[... ${n} characters cut from the middle ...]\n`;
    const room = b - marker(text.length).length;
    const half = Math.floor(room / 2);
    const lines = text.split('\n');
    let head = '';
    for (const l of lines) { const next = head ? head + '\n' + l : l; if (next.length > half) { break; } head = next; }
    let tail = '';
    for (let i = lines.length - 1; i >= 0; i--) { const next = tail ? lines[i] + '\n' + tail : lines[i]; if (next.length > room - head.length) { break; } tail = next; }
    if (head.length + tail.length < room / 2) { head = text.slice(0, half); tail = text.slice(text.length - (room - half)); }
    const cut = text.length - head.length - tail.length;
    return { text: head + marker(cut) + tail, trimmed: true, cutChars: cut };
}

export function hashText(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/** Each string value masked on its own: JSON escapes a newline as \n, and "\nsk-..." has no word boundary before the key. */
function maskValues(v: unknown, known: string[], n: { c: number }): unknown {
    if (v && typeof (v as { toJSON?: unknown }).toJSON === 'function') { v = (v as { toJSON(): unknown }).toJSON(); }
    if (typeof v === 'string') { const m = maskSecrets(v, known); n.c += m.masked; return m.text; }
    if (Array.isArray(v)) { return v.map(x => maskValues(x, known, n)); }
    if (v && typeof v === 'object') { return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskValues(x, known, n)])); }
    return v;
}

/** The state as it will be sent: masked first (so no half-cut secret survives), then trimmed. */
export function prepareInput(state: KapiciState, o: { budget?: number; known?: string[] } = {}): PreparedInput {
    const n = { c: 0 };
    const pre = typeof state === 'string' ? state : maskValues(state, o.known ?? [], n) as KapiciState;
    const m = maskSecrets(serializeState(pre), o.known);
    const t = trimToBudget(m.text, o.budget ?? DEFAULT_INPUT_BUDGET);
    return { text: t.text, chars: t.text.length, hash: hashText(t.text), trimmed: t.trimmed, cutChars: t.cutChars, masked: n.c + m.masked };
}
