import * as fs from 'fs';

/**
 * J2 — Farm Relay (panel half). Tails the synced relay feed files written by
 * farmRelay.js on other machines and hands each event to a callback; the
 * extension converts them into synthetic live-monitor payloads. Polling
 * (not fs.watch) because sync tools replace files wholesale.
 */

export interface RelayFeed {
    name: string;
    file: string;
}

export interface RelayEvent {
    ts: number;
    machine: string;
    sessionId: string;
    cwd?: string;
    kind: 'prompt' | 'tool' | 'working' | 'stop';
    tool?: string;
    detail?: string;
}

export class RelayTailer {
    private offsets = new Map<string, number>();
    private timer?: NodeJS.Timeout;

    constructor(
        private getFeeds: () => RelayFeed[],
        private onEvent: (feedName: string, event: RelayEvent) => void,
        private pollMs = 3000
    ) {}

    start(): void {
        this.stop();
        // First pass primes offsets to EOF so old events aren't replayed.
        for (const feed of this.getFeeds()) {
            try { this.offsets.set(feed.file, fs.statSync(feed.file).size); }
            catch { /* not synced yet */ }
        }
        this.timer = setInterval(() => this.poll(), this.pollMs);
    }

    stop(): void {
        if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    }

    poll(): void {
        for (const feed of this.getFeeds()) {
            if (!feed?.file) { continue; }
            let size: number;
            try { size = fs.statSync(feed.file).size; } catch { continue; }
            const prev = this.offsets.get(feed.file);
            if (prev === undefined) { this.offsets.set(feed.file, size); continue; }
            if (size === prev) { continue; }
            if (size < prev) { this.offsets.set(feed.file, size); continue; } // rotated/truncated
            try {
                const fd = fs.openSync(feed.file, 'r');
                const buf = Buffer.alloc(Math.min(size - prev, 256 * 1024));
                fs.readSync(fd, buf, 0, buf.length, prev);
                fs.closeSync(fd);
                this.offsets.set(feed.file, size);
                for (const lineText of buf.toString('utf8').split('\n')) {
                    if (!lineText.trim()) { continue; }
                    try {
                        const ev = JSON.parse(lineText) as RelayEvent;
                        if (ev && ev.sessionId && ev.kind) { this.onEvent(feed.name, ev); }
                    } catch { /* partial line — picked up next poll */ }
                }
            } catch { /* locked by sync — next poll */ }
        }
    }

    dispose(): void {
        this.stop();
    }
}
