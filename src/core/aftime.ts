/**
 * The clock, on the extension-host side — LOADED, not reimplemented.
 *
 * ‼️ THERE IS EXACTLY ONE CLOCK AND IT LIVES IN `media/afTime.js`. The status
 * bar, the sidebar trees and the panel tooltips render in Node; every page
 * renders in a webview, which cannot import from `out/`. The rule this exists to
 * keep — every time carries UTC in its hover, and a time with room around it
 * carries UTC inline — is worth nothing if the two sides round a minute
 * differently or disagree about which offset they were in.
 *
 * Same arrangement as `src/core/query.ts`: `tsc` compiles this to
 * `out/core/aftime.js`, so `__dirname` is `<extension>/out/core` in development
 * and in the packaged VSIX alike, and `media/` sits two levels up in both.
 */
import * as path from 'path';

export interface TimeOpts { seconds?: boolean }

interface TimeModule {
    at(ts: unknown): Date | null;
    clock(ts: unknown, opts?: TimeOpts): string;
    utc(ts: unknown, opts?: TimeOpts): string;
    utcClock(ts: unknown, opts?: TimeOpts): string;
    clockUtc(ts: unknown, opts?: TimeOpts): string;
    stamp(ts: unknown, opts?: TimeOpts): string;
    full(ts: unknown, opts?: TimeOpts): string;
    tip(ts: unknown, label?: string): string;
    ago(ts: unknown): string;
    offset(ts: unknown): string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: TimeModule = require(path.join(__dirname, '..', '..', 'media', 'afTime.js'));

/** The local time of day — `20:14`. Pair it with `timeTip` on the hover. */
export const clock = (ts: unknown, opts?: TimeOpts): string => impl.clock(ts, opts);
/** `17:14 UTC`. */
export const utc = (ts: unknown, opts?: TimeOpts): string => impl.utc(ts, opts);
/** `20:14 (17:14 UTC)` — a clock with room around it. */
export const clockUtc = (ts: unknown, opts?: TimeOpts): string => impl.clockUtc(ts, opts);
/** `8 Aug 2026, 20:14` — date and time, local, no UTC. */
export const stamp = (ts: unknown, opts?: TimeOpts): string => impl.stamp(ts, opts);
/** `8 Aug 2026, 20:14 (17:14 UTC)` — the full inline form. */
export const full = (ts: unknown, opts?: TimeOpts): string => impl.full(ts, opts);
/** The three-line hover EVERY clock gets: the moment, its UTC, this machine's
 *  offset. `label` says which of a row's dates it is. */
export const timeTip = (ts: unknown, label?: string): string => impl.tip(ts, label);
/** `4h ago`. */
export const ago = (ts: unknown): string => impl.ago(ts);
/** `UTC+03:00` at that moment. */
export const tzOffset = (ts: unknown): string => impl.offset(ts);
