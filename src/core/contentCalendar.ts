/**
 * M-51 — THE CONTENT CALENDAR. A fact, so it lives in the vault: one note per
 * publish in a folder (Farm Settings `contentCalendarDir`, built-in
 * `${vault}/01_INBOX/02_Calendar/CONTENT`), in the Full Calendar plugin's own
 * frontmatter (title · date · startTime · completed) plus the fields a publish
 * needs (platform · status · url · record · publishedAt). Obsidian shows it in
 * its calendar; Agent Farm reads it and, when a publish step ends, patches only
 * the keys it owns — the rest of the note is the user's and is never rewritten.
 */
import * as fs from 'fs';
import * as path from 'path';

export const CAL_STATUSES = ['planned', 'producing', 'ready', 'published', 'cancelled'] as const;
export type CalStatus = typeof CAL_STATUSES[number];
const SYNONYMS: Record<string, CalStatus> = {
    planlandi: 'planned', 'planlandı': 'planned', uretimde: 'producing', 'üretimde': 'producing', hazir: 'ready', 'hazır': 'ready',
    yayinlandi: 'published', 'yayınlandı': 'published', iptal: 'cancelled', 'canceled': 'cancelled'
};
const CLOSED: CalStatus[] = ['published', 'cancelled'];

export interface CalEntry {
    file: string; name: string; title: string; date: string; startTime?: string;
    platform: string; status: CalStatus; url?: string; record?: string; publishedAt?: string;
}

const unquote = (v: string): string => {
    const t = v.trim();
    if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === '\'' && t.endsWith('\'')))) {
        try { return t[0] === '"' ? JSON.parse(t) : t.slice(1, -1).split('\'\'').join('\''); } catch { return t.slice(1, -1); }
    }
    return t;
};
// written the way Full Calendar writes its own (startTime: 09:00, a title bare) — quoted only where YAML would misread it
const quote = (v: string): string => (v === '' || /: | #|^[-?:,[\]{}#&*!|>'"%@`\s]|\s$|\n/.test(v) ? JSON.stringify(v) : v);

/** The frontmatter's `key: value` lines (flat — lists and nested keys are left alone), and where it ends. */
export function readFrontmatter(text: string): { data: Record<string, string>; end: number } | undefined {
    const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
    if (!m) { return undefined; }
    const data: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
        if (kv) { data[kv[1]] = unquote(kv[2]); }
    }
    return { data, end: m[0].length };
}

/** The note with `patch`'s keys replaced in place (or added before the closing ---); every other line kept byte for byte. */
export function patchFrontmatter(text: string, patch: Record<string, string | undefined>): string {
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    const keys = Object.keys(patch).filter(k => patch[k] !== undefined);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
    if (!fm) { return ['---', ...keys.map(k => `${k}: ${quote(patch[k]!)}`), '---', ''].join(nl) + text; }
    const lines = fm[1].split(/\r?\n/);
    const seen = new Set<string>();
    const out = lines.map(line => {
        const kv = /^([A-Za-z_][\w-]*):/.exec(line);
        if (kv && keys.includes(kv[1])) { seen.add(kv[1]); return `${kv[1]}: ${quote(patch[kv[1]]!)}`; }
        return line;
    });
    for (const k of keys) { if (!seen.has(k)) { out.push(`${k}: ${quote(patch[k]!)}`); } }
    return `---${nl}${out.join(nl)}${nl}---${fm[2] || nl}` + text.slice(fm[0].length);
}

export function statusOf(v: string | undefined): CalStatus {
    const k = String(v ?? '').trim().toLowerCase();
    return (CAL_STATUSES as readonly string[]).includes(k) ? k as CalStatus : SYNONYMS[k] ?? 'planned';
}

function entryOf(file: string, text: string): CalEntry | undefined {
    const fm = readFrontmatter(text);
    const d = fm?.data;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) { return undefined; }
    return {
        file, name: path.basename(file, '.md'), title: d.title || path.basename(file, '.md'), date: d.date,
        ...(d.startTime ? { startTime: d.startTime } : {}), platform: (d.platform || '').toLowerCase(), status: statusOf(d.status),
        ...(d.url ? { url: d.url } : {}), ...(d.record ? { record: d.record } : {}), ...(d.publishedAt ? { publishedAt: d.publishedAt } : {})
    };
}

/** Every dated note in the folder, earliest first. A missing folder is an empty calendar. */
export function readCalendar(dir: string): CalEntry[] {
    let names: string[] = [];
    try { names = fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.md')); } catch { return []; }
    const out: CalEntry[] = [];
    for (const n of names) {
        try { const e = entryOf(path.join(dir, n), fs.readFileSync(path.join(dir, n), 'utf8')); if (e) { out.push(e); } } catch { /* unreadable note */ }
    }
    return out.sort((a, b) => whenOf(a) - whenOf(b));
}

/** The moment a publish is due, local time; a note with no time is due at the start of its day. */
export function whenOf(e: { date: string; startTime?: string }): number {
    const [y, m, d] = e.date.split('-').map(Number);
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(e.startTime ?? '') ? e.startTime!.split(':').map(Number) : [0, 0];
    return new Date(y, m - 1, d, hh, mm).getTime();
}

/** Due in the next `days` and not yet published; past due and still open. */
export function calendarView(entries: CalEntry[], now: number, days = 7): { upcoming: CalEntry[]; overdue: CalEntry[] } {
    const open = entries.filter(e => !CLOSED.includes(e.status));
    return {
        overdue: open.filter(e => whenOf(e) < now),
        upcoming: open.filter(e => whenOf(e) >= now && whenOf(e) < now + days * 86_400_000)
    };
}

/** An entry by its note name (with or without .md), its path, or its exact title. */
export function findEntry(entries: CalEntry[], ref: string): CalEntry | undefined {
    const r = String(ref ?? '').trim();
    if (!r) { return undefined; }
    const low = r.toLowerCase().replace(/\.md$/, '');
    return entries.find(e => e.file.toLowerCase() === r.toLowerCase() || e.name.toLowerCase() === low)
        ?? entries.find(e => e.title.toLowerCase() === low);
}

export interface NewEntry { title: string; date: string; startTime?: string; platform: string; status?: string; record?: string; body?: string }

/** Why an entry cannot be added, or ''. */
export function newEntryRefusal(n: Partial<NewEntry>): string {
    if (!String(n.title ?? '').trim()) { return 'title is required'; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(n.date ?? ''))) { return 'date is YYYY-MM-DD'; }
    if (n.startTime && !/^\d{1,2}:\d{2}$/.test(n.startTime)) { return 'startTime is HH:MM'; }
    if (!String(n.platform ?? '').trim()) { return 'platform is required (youtube, instagram, tiktok…)'; }
    return '';
}

/** A new note in Full Calendar's shape; never replaces one that is there. */
export function addEntry(dir: string, n: NewEntry): CalEntry {
    const no = newEntryRefusal(n);
    if (no) { throw new Error(no); }
    const safe = n.title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    const file = path.join(dir, `${n.date} ${n.platform.toLowerCase()} - ${safe}.md`);
    if (fs.existsSync(file)) { throw new Error(`${path.basename(file)} is already in the calendar`); }
    const fm: Record<string, string | undefined> = {
        title: n.title, date: n.date, startTime: n.startTime, allDay: n.startTime ? 'false' : 'true', type: 'single', completed: 'false',
        platform: n.platform.toLowerCase(), status: statusOf(n.status), record: n.record
    };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, patchFrontmatter('', fm) + (n.body ? `\n${n.body.trim()}\n` : ''), 'utf8');
    return entryOf(file, fs.readFileSync(file, 'utf8'))!;
}

/** Patch the keys Agent Farm owns on one note; `published` also ticks Full Calendar's completed. */
export function updateEntry(file: string, patch: { status?: string; url?: string; publishedAt?: string; date?: string; startTime?: string; record?: string }): CalEntry {
    const text = fs.readFileSync(file, 'utf8');
    const status = patch.status !== undefined ? statusOf(patch.status) : undefined;
    const next = patchFrontmatter(text, {
        status, url: patch.url, publishedAt: patch.publishedAt, date: patch.date, startTime: patch.startTime, record: patch.record,
        ...(status ? { completed: status === 'published' ? 'true' : 'false' } : {})
    });
    fs.writeFileSync(file, next, 'utf8');
    return entryOf(file, next)!;
}
