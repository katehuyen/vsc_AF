import * as fs from 'fs';
import * as os from 'os';

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** Expand %VAR%, ${env:VAR} and a leading ~ in a user-supplied path setting —
 *  git-synced settings can say %USERPROFILE%\.claude instead of hardcoding
 *  C:\Users\<name>. Unknown variables are left as written (visible, not
 *  silently dropped). */
export function expandEnvPath(p: string): string {
    let out = p
        .replace(/\$\{env:([^}]+)\}/gi, (m, v) => process.env[String(v)] ?? m)
        .replace(/%([^%]+)%/g, (m, v) => process.env[String(v)] ?? m);
    if (out === '~' || out.startsWith('~/') || out.startsWith('~\\')) {
        out = os.homedir() + out.slice(1);
    }
    return out;
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

/** Rewrite stored absolute paths after a publisher/extension-id rename:
 *  any `<oldPublisher>.agent-farm` globalStorage segment becomes the current
 *  one, so task/mission records keep pointing at their output files. Pure —
 *  callers read the JSON file, pass it through, and write back on change. */
export function remapStorageIds(text: string, currentBase: string): string {
    return text.replace(/[\w-]+\.agent-farm/g, currentBase);
}

/** Last `maxBytes` of a file without reading the whole thing — live-tail views
 *  poll this on growing task outputs, so it must stay O(maxBytes). */
export function readFileTail(p: string, maxBytes = 8192): { text: string; size: number } | undefined {
    try {
        const st = fs.statSync(p);
        const start = Math.max(0, st.size - maxBytes);
        const fd = fs.openSync(p, 'r');
        try {
            const buf = Buffer.alloc(Math.min(maxBytes, st.size));
            fs.readSync(fd, buf, 0, buf.length, start);
            let text = buf.toString('utf8');
            if (start > 0) {
                // drop the partial first line a mid-file cut leaves behind
                const nl = text.indexOf('\n');
                if (nl >= 0 && nl < 300) { text = text.slice(nl + 1); }
            }
            return { text, size: st.size };
        } finally { fs.closeSync(fd); }
    } catch { return undefined; }
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

/** Make a prompt safe to pass through a shell command line. */
export function sanitizePrompt(p: string): string {
    return p.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

export function tryParseJson(s: string): unknown {
    try { return JSON.parse(s); } catch { return undefined; }
}

/** Parse JSON that models love to wrap: plain, ```json fenced, or embedded in prose. */
export function extractJson(s: string): unknown {
    const direct = tryParseJson(s.trim());
    if (direct !== undefined) { return direct; }
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) {
        const fenced = tryParseJson(fence[1].trim());
        if (fenced !== undefined) { return fenced; }
    }
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return tryParseJson(s.slice(start, end + 1));
    }
    return undefined;
}

/**
 * A duration read at a glance: `34s` · `3m-29s` · `1h-4m-23s` · `1d-7h-54m-41s`.
 *
 * ‼️ THE WEBVIEWS HAVE THEIR OWN COPY OF THIS (`fmtDur` in media/charts.js) AND
 * THAT IS DELIBERATE — a webview cannot import from src/. The two are kept
 * identical by test_turn_figures.js, which runs both over the same list of
 * durations: a Markdown export and the table it was exported from must not
 * describe the same turn with two different strings.
 */
export function fmtDuration(ms: number): string {
    const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d) { return `${d}d-${h}h-${m}m-${sec}s`; }
    if (h) { return `${h}h-${m}m-${sec}s`; }
    if (m) { return `${m}m-${sec}s`; }
    return `${sec}s`;
}

/** Round trips · every step they carried — see media/charts.js fmtSteps for the
 *  why, including why the separator is a dot and not a slash. */
export function fmtStepPair(apiCalls: number, steps: number): string {
    const a = Number(apiCalls) || 0;
    const s = Number(steps) || 0;
    const st = `${s}${s === 1 ? 'step' : 'steps'}`;
    return a ? `${a}api·${st}` : st;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
    let timer: NodeJS.Timeout | undefined;
    return ((...args: never[]) => {
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}
