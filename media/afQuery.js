// Agent Farm — THE QUERY LANGUAGE. One grammar, every box that searches.
//
// ‼️ WHY THIS FILE IS LOADED BY BOTH SIDES. Every filter box in the extension
// used to do the same thing: lowercase the row, lowercase what you typed, and
// ask whether one contained the other. That answers exactly one question —
// "does this substring appear?" — and it is the wrong one nearly every time you
// have more than fifty rows: you cannot ask for two words that are not next to
// each other, you cannot ask for either of two things, you cannot say "the
// whole word, not inside another", and you cannot exclude. So the box was
// honest and useless at the same time, and the way out was always to squint at
// a long list.
//
// The transcript search runs in the extension host (src/core/query.ts loads
// THIS FILE) and the page filters run in a webview. Writing the grammar twice
// would guarantee they answer differently within a month, and the one thing
// worse than a weak query language is two of them wearing the same clothes.
// Hence the UMD wrapper: `window.AFQuery` in a page, `module.exports` in Node,
// one parser.
//
// ---------------------------------------------------------------- the grammar
//
//   foo bar        BOTH — whitespace means AND
//   foo OR bar     either (also `|`)
//   -foo           NOT: rows that do not contain it (also `NOT foo`)
//   (a OR b) c     parentheses group
//   "exact words"  a PHRASE, and whole-word: "log" does not match "dialogue"
//   kel*           `*` stands for any run of non-space characters
//   "kelime* bazıları ol*"
//                  the two together: the phrase is anchored and its words may
//                  each be partial — matches "kelimelerin bazıları olsun" and
//                  "kelimenin bazıları oldu" alike.
//
// A BARE word is a substring, which is what every one of these boxes has always
// done and what people type without thinking. Quotes are how you ask for more
// precision, not less — that is the whole design: nothing anybody typed before
// this file existed behaves differently now.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFQuery = api; }
})(function () {
    'use strict';

    /** What counts as being INSIDE a word, for whole-word anchoring. `\b` is no
     *  use here: it is defined on `[A-Za-z0-9_]`, so in "kelimeler" the boundary
     *  test would pass in the middle of the Turkish letters it is meant to
     *  respect. Unicode letters and digits, with lookaround, or nothing. */
    const WORD = '[\\p{L}\\p{N}_]';

    function escapeRe(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** One word of a query → its pattern. `*` is the only character that keeps
     *  a meaning; everything else is literal. */
    function wordPattern(w) {
        return escapeRe(w).replace(/\\\*/g, '[^\\s]*');
    }

    /**
     * A phrase: the words in order, any whitespace between them, and anchored
     * at both ends so "log" is not found inside "dialogue".
     *
     * The anchor is a lookaround rather than a `\b` (see WORD), and it is only
     * applied where it can mean anything: a phrase that starts with `*` is
     * explicitly saying "I do not know how this begins", so anchoring it would
     * contradict what was typed. `unclosed` is the same idea for the other end
     * — a phrase whose closing quote has not been typed yet is a prefix, and
     * anchoring it would make the list go empty for exactly as long as it takes
     * to reach for the " key.
     */
    function phrasePattern(text, unclosed) {
        const words = String(text).trim().split(/\s+/).filter(Boolean);
        if (!words.length) { return null; }
        const body = words.map(wordPattern).join('\\s+');
        const openEnded = /^\*/.test(words[0]);
        const tailOpen = unclosed || /\*$/.test(words[words.length - 1]);
        return (openEnded ? '' : `(?<!${WORD})`) + body + (tailOpen ? '' : `(?!${WORD})`);
    }

    // -------------------------------------------------------------- tokenizer

    const OPEN = '(', CLOSE = ')';

    function tokenize(q) {
        const out = [];
        const s = String(q);
        let i = 0;
        /** Could a new term begin right here? What decides it is the CHARACTER
         *  in front — `foo -bar` has a space, `agent-farm` does not, and that is
         *  the whole difference between an operator and a hyphen. */
        const atTermStart = () => i === 0 || /[\s(]/.test(s[i - 1]);
        while (i < s.length) {
            const ch = s[i];
            if (/\s/.test(ch)) { i++; continue; }
            if (ch === OPEN) { out.push({ t: 'open' }); i++; continue; }
            if (ch === CLOSE) { out.push({ t: 'close' }); i++; continue; }
            if (ch === '"' || ch === '“' || ch === '”') {
                // ‼️ A CLOSING QUOTE IS OPTIONAL. Half a phrase is what a box
                // that filters AS YOU TYPE looks like for as long as it takes to
                // type the rest, and answering that with "syntax error" would
                // empty the list under the user's hands on every second
                // keystroke. An unterminated phrase runs to the end.
                let j = i + 1;
                let text = '';
                while (j < s.length && s[j] !== '"' && s[j] !== '“' && s[j] !== '”') {
                    text += s[j]; j++;
                }
                out.push({ t: 'term', phrase: true, value: text, unclosed: j >= s.length });
                i = j < s.length ? j + 1 : j;
                continue;
            }
            if (ch === '|') { out.push({ t: 'op', op: 'or' }); i++; continue; }
            // `-` is NOT only where a term could begin; `agent-farm` is one word
            if (ch === '-' && atTermStart() && i + 1 < s.length && !/[\s)]/.test(s[i + 1])) {
                out.push({ t: 'op', op: 'not' }); i++; continue;
            }
            let j = i;
            let word = '';
            while (j < s.length && !/[\s()"]/.test(s[j]) && s[j] !== '“' && s[j] !== '”') {
                word += s[j]; j++;
            }
            i = j;
            if (!word) { continue; }
            // The keywords are UPPERCASE ONLY, deliberately: "or" and "not" are
            // ordinary words in the text people search, and in Turkish "and"
            // is not a word at all — so a lowercase `or` must stay a search for
            // the letters o and r.
            if (word === 'OR') { out.push({ t: 'op', op: 'or' }); continue; }
            if (word === 'AND') { out.push({ t: 'op', op: 'and' }); continue; }
            if (word === 'NOT') { out.push({ t: 'op', op: 'not' }); continue; }
            out.push({ t: 'term', phrase: false, value: word });
        }
        return out;
    }

    // ----------------------------------------------------------------- parser
    //   or   := and ( ('OR'|'|') and )*
    //   and  := not ( ('AND')? not )*      — juxtaposition is AND
    //   not  := ('-'|'NOT') not | atom
    //   atom := '(' or ')' | term

    function parse(tokens, flags) {
        let at = 0;
        const peek = () => tokens[at];
        const bad = m => { const e = new Error(m); e.afQuery = true; throw e; };

        function atom() {
            const t = peek();
            if (!t) { bad('the query ends where a word was expected'); }
            if (t.t === 'open') {
                at++;
                const node = orExpr();
                if (peek() && peek().t === 'close') { at++; }
                // an unclosed ( is the same "still typing" case as an unclosed
                // quote — it closes at the end rather than blanking the list
                return node;
            }
            if (t.t === 'close') { bad('a ) with no ( in front of it'); }
            if (t.t === 'op') { bad(`"${t.op.toUpperCase()}" needs something after it`); }
            at++;
            const pattern = t.phrase ? phrasePattern(t.value, t.unclosed) : wordPattern(t.value);
            if (pattern === null) { bad('an empty phrase matches nothing — put a word inside the quotes'); }
            return { t: 'leaf', re: new RegExp(pattern, flags) };
        }

        function notExpr() {
            const t = peek();
            if (t && t.t === 'op' && t.op === 'not') { at++; return { t: 'not', a: notExpr() }; }
            return atom();
        }

        function andExpr() {
            let node = notExpr();
            for (;;) {
                const t = peek();
                if (!t || t.t === 'close') { break; }
                if (t.t === 'op' && t.op === 'or') { break; }
                if (t.t === 'op' && t.op === 'and') { at++; }
                node = { t: 'and', a: node, b: notExpr() };
            }
            return node;
        }

        function orExpr() {
            let node = andExpr();
            while (peek() && peek().t === 'op' && peek().op === 'or') {
                at++;
                node = { t: 'or', a: node, b: andExpr() };
            }
            return node;
        }

        const root = orExpr();
        if (peek()) { bad('a ) with no ( in front of it'); }
        return root;
    }

    function evaluate(node, text) {
        switch (node.t) {
            case 'leaf': node.re.lastIndex = 0; return node.re.test(text);
            case 'not': return !evaluate(node.a, text);
            case 'and': return evaluate(node.a, text) && evaluate(node.b, text);
            case 'or': return evaluate(node.a, text) || evaluate(node.b, text);
            default: return false;
        }
    }

    /** The leaves a HIT is actually made of — everything not under a NOT. This
     *  is what a snippet is cut around and what a page highlights; a negated
     *  term is by definition not in the text. */
    function positives(node, out) {
        if (node.t === 'leaf') { out.push(node.re); }
        else if (node.t === 'and' || node.t === 'or') { positives(node.a, out); positives(node.b, out); }
        return out;
    }

    /**
     * compile(q, opts) — the only entry point.
     *
     * opts: { caseSensitive?, regex? } — `regex: true` hands the whole string to
     * RegExp untouched, which is the Search page's raw mode and stays exactly
     * what it was. Returns an object that is always safe to use:
     *   empty  — nothing was typed; test() is true for everything
     *   ok     — it parsed; when false, `error` says what is wrong IN WORDS
     *   test(text)  — does this text match?
     *   find(text)  — where the first positive term matched: {index,length}|null
     *   terms       — the positive leaves, for highlighting
     */
    function compile(q, opts) {
        const o = opts || {};
        const src = String(q === undefined || q === null ? '' : q);
        const flags = (o.caseSensitive ? '' : 'i') + 'u';
        const blank = {
            empty: true, ok: true, error: '', source: src, terms: [],
            test: () => true, find: () => null
        };
        if (!src.trim()) { return blank; }
        if (o.regex) {
            let re;
            try { re = new RegExp(src, o.caseSensitive ? '' : 'i'); }
            catch (e) {
                return {
                    empty: false, ok: false, error: 'Invalid regex: ' + String(e.message).slice(0, 120),
                    source: src, terms: [], test: () => false, find: () => null
                };
            }
            return {
                empty: false, ok: true, error: '', source: src, terms: [re],
                test: t => { re.lastIndex = 0; return re.test(t); },
                find: t => { re.lastIndex = 0; const m = re.exec(t); return m && m[0] ? { index: m.index, length: m[0].length } : null; }
            };
        }
        let root;
        try { root = parse(tokenize(src), flags); }
        catch (e) {
            return {
                empty: false, ok: false,
                error: e && e.afQuery ? e.message : 'That query could not be read: ' + String(e && e.message).slice(0, 120),
                source: src, terms: [], test: () => false, find: () => null
            };
        }
        const terms = positives(root, []);
        return {
            empty: false, ok: true, error: '', source: src, terms,
            test: text => evaluate(root, String(text === undefined || text === null ? '' : text)),
            find: text => {
                const s = String(text === undefined || text === null ? '' : text);
                let best = null;
                for (const re of terms) {
                    re.lastIndex = 0;
                    const m = re.exec(s);
                    if (m && m[0] && (!best || m.index < best.index)) {
                        best = { index: m.index, length: m[0].length };
                    }
                }
                return best;
            }
        };
    }

    /** Does this text match? The one-liner every page filter wants. */
    function matches(text, q, opts) { return compile(q, opts).test(text); }

    // -------------------------------------------------------------- the words
    // Said once, here, so twenty boxes cannot explain the same grammar twenty
    // ways — and so the guide (docs/BLUEPRINT) and the tooltips agree by
    // construction rather than by somebody remembering.
    const SYNTAX = [
        'two words = both  ·  OR = either  ·  -word = without it  ·  ( ) group',
        '"in quotes" = that phrase, whole words: "log" is not found in "dialogue"',
        '* = any run of characters — kelime* finds kelimeler, kelimenin',
        '…and together: "kelime* bazıları ol*" finds both',
        '"kelimelerin bazıları olsun" and "kelimenin bazıları oldu".',
        'A bare word is still a plain substring — nothing you typed before behaves differently.'
    ].join('\n');

    /** The tooltip a box gets: what it searches, then the grammar. */
    function tip(subject) {
        return (subject ? String(subject).trim() + '\n\n' : '') + SYNTAX;
    }

    return { compile, matches, tip, SYNTAX, WORD };
});
