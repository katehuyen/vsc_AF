import * as fs from 'fs';
import * as path from 'path';
import { CardSetup, ClosingSetup, SETUP_DIMS, SetupObsMap, observeCard, transcriptSetup } from './closingSetup';

/**
 * ‼️ S-109 — THE CLOSING SETUP, ON DISK: one small file per session under
 * `globalStorage/closing-setup/`, so what a card was last set to survives the
 * card closing, the window reloading and the host crashing. It is fed by a
 * listener beside the card (it never changes what the card does) and written
 * only when one of the four answers actually changed. A write that fails is
 * dropped silently: losing one observation must never break a live session.
 */
export class ClosingSetupStore {
    private readonly cache = new Map<string, ClosingSetup | null>();

    constructor(private readonly dir: string, private readonly now: () => number = Date.now) { }

    private fileOf(sessionId: string): string {
        return path.join(this.dir, sessionId.replace(/[^\w.-]/g, '_') + '.json');
    }

    read(sessionId: string): ClosingSetup | undefined {
        const sid = String(sessionId ?? '').trim();
        if (!sid) { return undefined; }
        if (this.cache.has(sid)) { return this.cache.get(sid) ?? undefined; }
        let rec: ClosingSetup | null = null;
        try {
            const j = JSON.parse(fs.readFileSync(this.fileOf(sid), 'utf8')) as ClosingSetup;
            if (j && j.sessionId === sid && j.dims && typeof j.dims === 'object') { rec = j; }
        } catch { /* no record yet */ }
        this.cache.set(sid, rec);
        return rec ?? undefined;
    }

    /** Feed one card state; true when the record changed (and was written). */
    observe(card: CardSetup): boolean {
        const sid = String(card.sessionId ?? '').trim();
        if (!sid) { return false; }
        const next = observeCard(this.read(sid), card, this.now());
        if (!next) { return false; }
        this.cache.set(sid, next);
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            const file = this.fileOf(sid);
            const tmp = `${file}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(next), 'utf8');
            fs.renameSync(tmp, file);
        } catch { /* an observation lost is never a session broken */ }
        return true;
    }
}

/**
 * The last model/effort/permission a Claude transcript states, with times.
 * Read from the TAIL first; only when the tail leaves a dimension unanswered
 * is the file read further back, up to `maxBytes`.
 */
export function transcriptSetupOf(file: string | undefined, maxBytes = 64 * 1024 * 1024): SetupObsMap {
    if (!file) { return {}; }
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, 'r');
        const st = fs.fstatSync(fd);
        const fallbackAt = st.mtimeMs;
        let span = Math.min(st.size, 512 * 1024);
        for (;;) {
            const buf = Buffer.alloc(span);
            fs.readSync(fd, buf, 0, span, st.size - span);
            const got = transcriptSetup(buf.toString('utf8'), fallbackAt);
            const whole = span >= st.size || span >= maxBytes;
            if (whole || SETUP_DIMS.every(d => d === 'account' || got[d])) { return got; }
            span = Math.min(st.size, maxBytes, span * 8);
        }
    } catch {
        return {};
    } finally {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* closed */ } }
    }
}
