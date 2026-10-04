/**
 * X-482 — WHERE A LIVE EVENT'S TIME GOES, MEASURED. Every live event runs the
 * whole chain of listeners on the extension host's one thread; the record shows
 * ~300 ms between events in a mirror burst, and "which listener" is a question
 * only a measurement answers. Each subscription is timed under the place it
 * subscribed from (the running build's file:line), so the answer names code.
 */

export interface ListenerStat { site: string; calls: number; totalMs: number; maxMs: number }

type Listener<T> = (e: T) => unknown;
type Disposable = { dispose(): unknown };
export type ProfiledEvent<T> = (listener: Listener<T>, thisArgs?: unknown, disposables?: Disposable[]) => Disposable;

/** The first stack frame outside this file and `skip` — where a subscription was made. */
export function callerSite(stack: string | undefined, skip: RegExp): string {
    for (const line of String(stack ?? '').split('\n').slice(1)) {
        const m = /\(?([^\s()]+?):(\d+):\d+\)?\s*$/.exec(line.trim());
        if (!m || /listenerProfile/.test(m[1]) || skip.test(m[1])) { continue; }
        return `${m[1].split(/[\\/]/).pop()}:${m[2]}`;
    }
    return 'unknown';
}

export class ListenerProfile {
    private stats = new Map<string, ListenerStat>();
    private startedAt: number;

    constructor(private readonly now: () => number, private readonly skip: RegExp, private readonly clock: () => number = Date.now) {
        this.startedAt = clock();
    }

    /** The same event; each listener it is handed is timed under its subscription site. */
    wrap<T>(name: string, event: ProfiledEvent<T>): ProfiledEvent<T> {
        return (listener, thisArgs, disposables) => {
            const site = `${name} ${callerSite(new Error().stack, this.skip)}`;
            return event(e => this.time(site, () => listener.call(thisArgs, e)), undefined, disposables);
        };
    }

    time<R>(site: string, fn: () => R): R {
        const t0 = this.now();
        try { return fn(); } finally { this.add(site, this.now() - t0); }
    }

    private add(site: string, ms: number): void {
        const s = this.stats.get(site) ?? { site, calls: 0, totalMs: 0, maxMs: 0 };
        s.calls++;
        s.totalMs += ms;
        if (ms > s.maxMs) { s.maxMs = ms; }
        this.stats.set(site, s);
    }

    /** Heaviest first, figures rounded to a tenth of a millisecond. */
    report(): { since: number; sites: (ListenerStat & { avgMs: number })[] } {
        const r = (n: number) => Math.round(n * 10) / 10;
        const sites = [...this.stats.values()]
            .sort((a, b) => b.totalMs - a.totalMs)
            .map(s => ({ site: s.site, calls: s.calls, totalMs: r(s.totalMs), maxMs: r(s.maxMs), avgMs: r(s.totalMs / s.calls) }));
        return { since: this.startedAt, sites };
    }

    reset(): void {
        this.stats.clear();
        this.startedAt = this.clock();
    }
}
