import * as fs from 'fs';

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function fmtUSD(v: number): string {
    if (v >= 100) { return '$' + v.toFixed(0); }
    if (v >= 1) { return '$' + v.toFixed(2); }
    return '$' + v.toFixed(3);
}

export function fmtTokens(n: number): string {
    if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
    if (n >= 1_000) { return (n / 1_000).toFixed(1) + 'k'; }
    return String(n);
}

export function fmtBytes(n: number): string {
    if (n >= 1_048_576) { return (n / 1_048_576).toFixed(1) + ' MB'; }
    if (n >= 1024) { return (n / 1024).toFixed(1) + ' KB'; }
    return n + ' B';
}

export function relTime(ts: number, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) { return s + 's ago'; }
    const m = Math.round(s / 60);
    if (m < 60) { return m + 'm ago'; }
    const h = Math.round(m / 60);
    if (h < 24) { return h + 'h ago'; }
    const d = Math.round(h / 24);
    return d + 'd ago';
}

/** Local-time day key YYYY-MM-DD. */
export function dayKey(ts: number): string {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function safeReadFile(p: string): string | undefined {
    try { return fs.readFileSync(p, 'utf8'); } catch { return undefined; }
}

export function safeStat(p: string): fs.Stats | undefined {
    try { return fs.statSync(p); } catch { return undefined; }
}

export function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

export function truncate(s: string, n: number): string {
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function normPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
    let timer: NodeJS.Timeout | undefined;
    return ((...args: never[]) => {
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}
