/**
 * The query language, on the extension-host side — LOADED, not reimplemented.
 *
 * ‼️ THERE IS EXACTLY ONE GRAMMAR AND IT LIVES IN `media/afQuery.js`. The
 * transcript search runs here, in Node; every filter box runs in a webview,
 * which cannot import from `out/`. Writing the parser twice would guarantee the
 * two answer differently within a month — and two query languages wearing the
 * same clothes is worse than one weak one, because the disagreement is
 * invisible: the page says a row matches and the host says it does not, and
 * neither is obviously wrong.
 *
 * So this file is a typed door onto that file. `tsc` compiles this to
 * `out/core/query.js`, so `__dirname` is `<extension>/out/core` in development
 * and in the packaged VSIX alike, and `media/` sits two levels up in both.
 */
import * as path from 'path';

export interface QueryOptions {
    /** hand the string to RegExp untouched — the Search page's raw mode */
    regex?: boolean;
    caseSensitive?: boolean;
    /** X-24: anchor BARE words the way quotes anchor a phrase. Whole-word
     *  matching used to exist only inside quotes, which is a rule nobody can
     *  discover from looking at a search box. No effect in `regex` mode. */
    wholeWord?: boolean;
}

export interface CompiledQuery {
    /** nothing was typed: `test` is true for everything */
    empty: boolean;
    /** false = it could not be read; `error` says why, in words */
    ok: boolean;
    error: string;
    source: string;
    /** the positive leaves, for highlighting */
    terms: RegExp[];
    test(text: string): boolean;
    /** where the first positive term matched — what a snippet is cut around */
    find(text: string): { index: number; length: number } | null;
}

/** One row of the grammar, with its columns intact — what a help card draws. */
export interface QuerySyntaxRow { sym: string; what: string; example: string; }

interface QueryModule {
    compile(q: string, opts?: QueryOptions): CompiledQuery;
    matches(text: string, q: string, opts?: QueryOptions): boolean;
    tip(subject?: string, opts?: { wholeWord?: boolean }): string;
    SYNTAX: string;
    SYNTAX_ROWS: QuerySyntaxRow[];
    WHOLE_WORD_ON: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: QueryModule = require(path.join(__dirname, '..', '..', 'media', 'afQuery.js'));

export function compileQuery(q: string, opts: QueryOptions = {}): CompiledQuery {
    return impl.compile(q, opts);
}

/** Does this text match? The one-liner a list filter wants. */
export function queryMatches(text: string, q: string, opts: QueryOptions = {}): boolean {
    return impl.matches(text, q, opts);
}

/** The grammar, in the words the tooltips and the guide both use. */
export const QUERY_SYNTAX = impl.SYNTAX;
/** The same grammar with its columns intact — for a help card or a doc table. */
export const QUERY_SYNTAX_ROWS: QuerySyntaxRow[] = impl.SYNTAX_ROWS;
export const QUERY_WHOLE_WORD_NOTE = impl.WHOLE_WORD_ON;
export function queryTip(subject?: string, opts?: { wholeWord?: boolean }): string {
    return impl.tip(subject, opts);
}
