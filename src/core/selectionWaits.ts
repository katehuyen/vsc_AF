/** What a workflow "select" step asks: keep min..max of these candidate assets. */
export interface SelectionAsk {
    title: string;
    message: string;
    min: number;
    max?: number;
    candidates: { taskId: string; title: string; url: string; file?: string; kind: string }[];
}

export interface OpenSelection extends SelectionAsk {
    id: string;
    askedAt: number;
}

/**
 * ‼️ X-53 — A SELECTION STEP WAITS ON TWO DOORS. The picker page was the only
 * way to answer one, so a chain an agent was running stood still until a person
 * opened a webview. The step's promise lives here; the page and the bridge
 * settle the same entry and the first answer wins.
 */
export class SelectionWaits {
    private readonly open = new Map<string, {
        sel: OpenSelection; resolve: (r: string[] | null) => void; promise: Promise<string[] | null>;
    }>();
    private seq = 0;

    add(ask: SelectionAsk, now = Date.now()): { id: string; promise: Promise<string[] | null> } {
        const id = `sel-${now.toString(36)}-${++this.seq}`;
        let resolve!: (r: string[] | null) => void;
        const promise = new Promise<string[] | null>(r => { resolve = r; });
        this.open.set(id, { sel: { ...ask, id, askedAt: now }, resolve, promise });
        return { id, promise };
    }

    /** X-456 — the answer an open selection waits for, to a door opened after it was asked (a phone's view). */
    whenAnswered(id: string): Promise<string[] | null> | undefined {
        return this.open.get(id)?.promise;
    }

    list(): OpenSelection[] {
        return [...this.open.values()].map(x => x.sel);
    }

    get(id: string): OpenSelection | undefined {
        return this.open.get(id)?.sel;
    }

    /** false when it was already answered — somebody else got there first. */
    settle(id: string, urls: string[] | null): boolean {
        const x = this.open.get(id);
        if (!x) { return false; }
        this.open.delete(id);
        x.resolve(urls);
        return true;
    }
}

/** The page's own rule (media/selection.js): at least min, at most max when max > 0, only candidates. */
export function selectionRefusal(sel: SelectionAsk, urls: string[]): string | undefined {
    const known = new Set(sel.candidates.map(c => c.url));
    const stranger = urls.find(u => !known.has(u));
    if (stranger) { return `"${stranger}" is not one of its candidates.`; }
    if (new Set(urls).size !== urls.length) { return 'A candidate is named twice.'; }
    if (urls.length < sel.min) { return `Keep at least ${sel.min} (got ${urls.length}).`; }
    if (sel.max && sel.max > 0 && urls.length > sel.max) { return `Keep at most ${sel.max} (got ${urls.length}).`; }
    return undefined;
}

/** 1-based candidate numbers → their urls; undefined when a number names no candidate. */
export function urlsOfPicks(sel: SelectionAsk, picks: number[]): string[] | undefined {
    const out: string[] = [];
    for (const n of picks) {
        const c = Number.isInteger(n) ? sel.candidates[n - 1] : undefined;
        if (!c) { return undefined; }
        out.push(c.url);
    }
    return out;
}
