/**
 * X-115 — ‼️ WHAT A PROCESS SAYS BACK IS SCRUBBED OF WHAT WAS PUT INTO IT.
 *
 * A route's key goes to exactly one place: the child's environment (X-101).
 * But Agent Farm then KEEPS what the child says — a task's output file, a
 * provider test's verdict — and a CLI that quotes its own environment in an
 * error is not hypothetical: a proxy error echoing a header, a debug line
 * printing the request. Keeping that text unscrubbed turns an artefact Agent
 * Farm owns into a copy of a credential it was trusted to hand over once.
 *
 * So every value that was injected as a secret is removed from the text before
 * anything stores it. Pure, and shared by every path that keeps what a spawned
 * engine said.
 */

import { StringDecoder } from 'string_decoder';

const MARK = '‹redacted›';

/**
 * ‼️ A SHORT VALUE IS NOT A SECRET, and treating it as one shreds ordinary
 * words. The floor is eight characters — shorter than any real key, longer
 * than any word a model id or a flag is made of.
 */
function secretsOf(values: readonly string[] | undefined): string[] {
    return [...new Set((values ?? []).map(v => String(v ?? '')).filter(v => v.length >= 8))]
        // Longest first, so a value that contains another is not half-replaced.
        .sort((a, b) => b.length - a.length);
}

export function scrubSecrets(text: string, values: readonly string[]): string {
    let out = String(text ?? '');
    for (const s of secretsOf(values)) { out = out.split(s).join(MARK); }
    return out;
}

/**
 * The injected values that are SECRETS rather than public route facts.
 *
 * The route's endpoint and the model a tier resolves to are injected too, and
 * both are public — they are in the launch manifest on purpose, and scrubbing
 * them out of an error would remove exactly the words that say WHICH endpoint
 * refused. Everything else a route injects is treated as secret, because the
 * list of names that can carry a credential is longer than any list of names
 * that cannot (X-101 measured 75 `ANTHROPIC_*` names in the binary).
 */
export function secretValuesOf(spawnEnv: Record<string, string> | undefined): string[] {
    return Object.entries(spawnEnv ?? {})
        // X-522 — a route's context window is a figure, not a secret: masked, every 1000000 in run output would go
        .filter(([name]) => !/_URL$|MODEL|^CLAUDE_CODE_MAX_CONTEXT_TOKENS$/.test(name))
        .map(([, v]) => v);
}

/**
 * ‼️ THE SAME SCRUB ON A STREAM, WHERE A KEY CAN BE CUT IN HALF.
 *
 * A process writes in chunks and a chunk boundary can fall in the middle of a
 * key: scrubbing each chunk on its own would pass both halves straight through.
 * So the last (longest secret − 1) characters are held back until the next
 * chunk arrives — a secret that is not complete yet must START inside that
 * window, so nothing emitted can ever be the first half of one.
 *
 * ‼️ AND WITH NOTHING TO SCRUB IT IS NOT IN THE WAY AT ALL. Almost every run
 * injects no secret; for those `active` is false and the caller writes the raw
 * bytes exactly as before — no decoding, no holding back, no behaviour change
 * on a live product for the case that did not need one.
 */
export class SecretScrubber {
    private readonly secrets: string[];
    private readonly keep: number;
    private readonly decoder = new StringDecoder('utf8');
    private tail = '';

    constructor(values: readonly string[] | undefined) {
        this.secrets = secretsOf(values);
        this.keep = this.secrets.length ? this.secrets[0].length - 1 : 0;
    }

    get active(): boolean { return this.secrets.length > 0; }

    /** Feed a chunk; get back what is safe to write NOW. */
    push(chunk: Buffer | string): string {
        const text = this.tail + (typeof chunk === 'string' ? chunk : this.decoder.write(chunk));
        const clean = scrubSecrets(text, this.secrets);
        if (clean.length <= this.keep) { this.tail = clean; return ''; }
        this.tail = this.keep ? clean.slice(clean.length - this.keep) : '';
        return this.keep ? clean.slice(0, clean.length - this.keep) : clean;
    }

    /** Whatever is still held back, scrubbed — call once, before the stream ends. */
    flush(): string {
        const rest = scrubSecrets(this.tail + this.decoder.end(), this.secrets);
        this.tail = '';
        return rest;
    }

    /** A one-off line written beside the stream (an error, a footer). */
    text(s: string): string { return scrubSecrets(s, this.secrets); }
}
