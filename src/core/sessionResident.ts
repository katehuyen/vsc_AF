/**
 * What the RESIDENT session index keeps, as opposed to what the store remembers.
 *
 * ‼️ X-129 — THE INDEX IS IN THE EXTENSION HOST'S ONLY HEAP, AND IT WAS GROWING
 * WITH THE WHOLE HISTORY. Measured on 848 stored sessions
 * (`tools/measure_session_heap.js`): a whole `SessionInfo` retains 23.9 KB, of
 * which `events` is 11.3 KB and `recentMsgs` 4.0 KB — 64% of the index, and the
 * only two fields that grow with the length of the CONVERSATION rather than
 * with the number of sessions. At 10 000 sessions that is 233 MB resident for
 * data no surface can reach.
 *
 * ‼️ AND NEITHER FIELD IS DROPPED BLIND — BOTH HAVE A HORIZON THAT ALREADY
 * EXISTED. `recentMsgs` is filtered to 48 hours at parse time and every reader
 * (the 5-hour window, the lap meter, the dashboard's exact tier) asks for less
 * than that, so a session last touched a week ago holds messages nobody may
 * read. `events` has ONE reader — `SessionIndex.feed(n)`, the newest n across
 * the farm — so per-session arrays are pointless: one bounded, sorted feed
 * answers it exactly and costs a fixed 400 events instead of 40 × every
 * session that ever ran.
 *
 * The store on disk keeps the whole record either way: it is the archive, and
 * re-reading it is a background file read rather than a permanent heap cost.
 *
 * This module holds the rule alone, with no vscode import, so the measuring
 * tool applies the SAME projection the extension does instead of a copy of it
 * that can drift.
 */
import type { FeedEvent, RecentMsg, SessionInfo } from './sessions';

/**
 * How far back a per-message figure is ever read.
 *
 * Every reader of `recentMsgs` is a window shorter than this one: the rolling
 * 5-hour plan window, the lap meter, and the dashboard's hour-exact tier
 * (24 hours, falling back to `daily` beyond it).
 */
export const RECENT_MSG_WINDOW_MS = 48 * 3600 * 1000;

/**
 * Newest events kept across the WHOLE index.
 *
 * `feed()` is asked for 60. The margin above it is what absorbs a session
 * leaving the index between full scans without leaving a hole in the feed.
 */
export const FEED_KEEP = 400;

/** Messages still inside the window — the rest can never be read again. */
export function freshMsgs(msgs: readonly RecentMsg[], now: number): RecentMsg[] {
    const cut = now - RECENT_MSG_WINDOW_MS;
    if (!msgs.length) { return []; }
    // Parsed newest-last, so the common case is "all of them" or "none".
    if (msgs[0].ts >= cut) { return msgs as RecentMsg[]; }
    return msgs.filter(m => m.ts >= cut);
}

/**
 * The copy the index holds, beside the whole record the store keeps.
 *
 * ‼️ A COPY, NEVER A TRIM IN PLACE: `scanAll` hands the same object to the
 * store and to the index, so emptying the original would write an index to
 * disk with no events in it and lose the archive in one pass. Every other
 * field is shared by reference — `daily`, `turns`, `heat` and the rest cost
 * nothing twice.
 */
export function residentSession(info: SessionInfo, now: number): SessionInfo {
    return { ...info, events: [], recentMsgs: freshMsgs(info.recentMsgs, now) };
}

/**
 * Put one session's events into the shared feed, replacing whatever it
 * contributed before. Newest first, capped — mutated in place because the
 * caller's array is the live one.
 */
export function mergeFeed(feed: FeedEvent[], events: readonly FeedEvent[], file: string): void {
    dropFromFeed(feed, file);
    if (!events.length) { return; }
    for (const ev of events) { feed.push(ev); }
    feed.sort((a, b) => b.ts - a.ts);
    if (feed.length > FEED_KEEP) { feed.length = FEED_KEEP; }
}

/** Forget one session's contribution — it left the index. */
export function dropFromFeed(feed: FeedEvent[], file: string): void {
    for (let i = feed.length - 1; i >= 0; i--) {
        if (feed[i].sessionFile === file) { feed.splice(i, 1); }
    }
}
