/**
 * U-207 — A PAGE'S OWN TEXTS READ ALOUD: a notice, its report, a question, an article.
 *
 * The same one reading channel as a conversation (alerts.readNow / alerts.reading),
 * for pages that are not a conversation. The page draws AFRead.textBtn(key) and says
 * what each key is (AFRead.texts): the text it holds, or a pick only its panel can
 * answer — a notice's report is read from the notice's own record (`resolve`), never
 * from a path the page names. Every change of the reading repaints the buttons on
 * every such page (pushPageReading, from the one readingRepaint).
 */
import * as fs from 'fs';
import type { HostWebview } from './panelHost';
import { readingAct, readingView, readNow, spokenReading, type ReaderDeps } from '../core/readerOps';

let reader: ReaderDeps | undefined;
type PageWebview = Pick<HostWebview, 'postMessage'>;
const pages = new Set<PageWebview>();

export function setPageReader(deps: ReaderDeps): void { reader = deps; }

/** What a page paints its buttons from when it is first drawn (AFRead.init). */
export function pageReadingNow(): ReturnType<typeof readingView> { return readingView(reader); }

/** A page that reads its own texts hears every change of the reading while it lives. */
export function attachPageReading(webview: PageWebview): { dispose(): void } {
    pages.add(webview);
    return { dispose: () => { pages.delete(webview); } };
}

export function pushPageReading(): void {
    const reading = readingView(reader);
    for (const w of [...pages]) {
        try {
            void Promise.resolve(w.postMessage({ type: 'reading', reading }))
                .then(delivered => { if (!delivered) { pages.delete(w); } }, () => pages.delete(w));
        } catch { pages.delete(w); }
    }
}

/** A markdown file as it is read: its frontmatter is metadata, not text. */
export function fileForReading(file: string): string | { error: string } {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return { error: `the file is not there any more: ${file}` }; }
    const text = raw.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
    return text.trim() ? text : { error: `there is nothing to read in ${file}` };
}

/** `resolve`: a pick only this panel answers — the text, a refusal, or undefined when it is not one of its picks. */
export interface PageReadingAsk {
    surface: string;
    resolve?(pick: Record<string, unknown>): string | { error: string } | undefined;
}

/** Takes a reading message before the panel's own handler sees it; false = not one, the panel's turn. */
export function pageReads(msg: { type: string;[k: string]: unknown }, webview: PageWebview, ask: PageReadingAsk): boolean {
    if (!msg || (msg.type !== 'readAloud' && msg.type !== 'readControl' && msg.type !== 'readFor')) { return false; }
    void handlePageReading(msg, webview, ask);
    return true;
}

/** The page's 🔊 and its ■ / ▶: the bodies of alerts.readNow / alerts.reading; a refusal is a toast. */
export async function handlePageReading(msg: { type: string;[k: string]: unknown }, webview: PageWebview, ask: PageReadingAsk): Promise<boolean> {
    const refuse = (e: unknown): void => { void webview.postMessage({ type: 'readRefused', error: String((e as Error)?.message ?? e).slice(0, 300) }); };
    switch (msg.type) {
        case 'readAloud': {
            if (!reader) { return true; }
            let pick: Record<string, unknown> = msg.pick && typeof msg.pick === 'object' ? { ...(msg.pick as Record<string, unknown>) } : {};
            const own = ask.resolve?.(pick);
            if (typeof own === 'object') { refuse(own.error); return true; }
            if (typeof own === 'string') { pick = { text: own, ...(typeof pick.key === 'string' ? { key: pick.key } : {}) }; }
            await readNow(reader, { ...pick, sessionId: String(msg.sessionId ?? '') }, ask.surface).catch(refuse);
            return true;
        }
        case 'readControl':
            if (!reader) { return true; }
            try { readingAct(reader, String(msg.action ?? '')); } catch (e) { refuse(e); }
            return true;
        // U-209 — a phone's 🔊: the same pick, prepared and handed back for the phone's own voice
        case 'readFor': {
            if (!reader) { return true; }
            let pick: Record<string, unknown> = msg.pick && typeof msg.pick === 'object' ? { ...(msg.pick as Record<string, unknown>) } : {};
            const own = ask.resolve?.(pick);
            const answer = (m: Record<string, unknown>): void => { void webview.postMessage({ ...m, token: msg.token }); };
            if (typeof own === 'object') { answer({ type: 'readRefused', error: own.error.slice(0, 300) }); return true; }
            if (typeof own === 'string') { pick = { text: own, ...(typeof pick.key === 'string' ? { key: pick.key } : {}) }; }
            await spokenReading(reader, { ...pick, sessionId: String(msg.sessionId ?? '') })
                .then(r => answer({ type: 'readText', ...r }), e => answer({ type: 'readRefused', error: String((e as Error)?.message ?? e).slice(0, 300) }));
            return true;
        }
    }
    return false;
}
