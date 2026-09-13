/**
 * A bounded append-only journal on disk, for EVIDENCE ABOUT THE MACHINE.
 *
 * Deliberately dumber than a store of the user's own work: a file that cannot
 * be read is set aside and measurement starts again rather than freezing every
 * write until a person deals with it. Losing a week of rows costs a diagnosis
 * that the next week reproduces; refusing to write costs the next diagnosis
 * outright.
 *
 * ‼️ ONE CLASS BECAUSE THERE ARE TWO OF THEM. The repair journal (X-292) and
 * the promotion journal (X-291) differ in one thing — what a row is — and
 * copying the load/rotate/write body for the second would guarantee that the
 * third is written a third time and that a fix to one never reaches the others.
 */

export interface JsonJournalFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    renameSync(from: string, to: string): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
}

const SCHEMA = 1;
const KEEP = 500;

export class JsonJournal<T> {
    private events: T[] = [];
    private loaded = false;
    private note?: string;

    constructor(
        private readonly file: string,
        private readonly fs: JsonJournalFs,
        private readonly isRow: (v: unknown) => v is T,
        private readonly what = 'journal',
        private readonly keep = KEEP
    ) { }

    get degraded(): string | undefined { return this.note; }

    private load(): void {
        if (this.loaded) { return; }
        this.loaded = true;
        if (!this.fs.existsSync(this.file)) { return; }
        try {
            const doc = JSON.parse(this.fs.readFileSync(this.file, 'utf8')) as { v?: number; events?: unknown };
            if (Array.isArray(doc?.events)) { this.events = (doc.events as unknown[]).filter(this.isRow); }
            if (typeof doc?.v === 'number' && doc.v > SCHEMA) {
                this.note = 'the ' + this.what + ' was written by a newer version (schema ' + doc.v
                    + ') - it is read as far as this build understands it';
            }
        } catch (e) {
            const dest = this.file.replace(/\.json$/i, '') + '.corrupt-' + Date.now() + '.json';
            try { this.fs.renameSync(this.file, dest); } catch { /* locked - it will be written over */ }
            this.note = 'the ' + this.what + ' was unreadable (' + String((e as Error)?.message ?? e)
                + ') - measurement starts from an empty list';
        }
    }

    all(): readonly T[] { this.load(); return this.events; }

    /** Nothing to say is the common case and must cost no write. */
    record(events: readonly T[]): void {
        if (!events.length) { return; }
        this.load();
        this.events = [...this.events, ...events].slice(-this.keep);
        const dir = this.file.replace(/[\\/][^\\/]*$/, '');
        try { this.fs.mkdirSync(dir, { recursive: true }); } catch { /* already there */ }
        const tmp = this.file + '.writing';
        try {
            this.fs.writeFileSync(tmp, JSON.stringify({ v: SCHEMA, events: this.events }, null, 2), 'utf8');
            this.fs.renameSync(tmp, this.file);
        } catch (e) {
            this.note = 'the ' + this.what + ' could not be written ('
                + String((e as Error)?.message ?? e) + ')';
        }
    }
}
