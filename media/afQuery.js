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
//   refact*        `*` stands for any run of non-space characters
//   "refact* the pars*"
//                  the two together: the phrase is anchored and its words may
//                  each be partial — matches "refactor the parser" and
//                  "refactored the parsing" alike.
//
// A BARE word is a substring, which is what every one of these boxes has always
// done and what people type without thinking. Quotes are how you ask for more
// precision, not less — that is the whole design: nothing anybody typed before
// this file existed behaves differently now.
//
// ‼️ …AND `wholeWord` IS THAT PRECISION WITHOUT THE QUOTES (X-24). Whole-word
// matching existed only inside quotes, which is a rule you cannot discover by
// looking at a search box: the user's own words were "I still do not know how
// to choose between whole-word and partial". So it is a MODE now — one tick,
// the same anchoring applied to bare words, and `*` still opens whichever end
// it is written on, because a mode must never contradict what was typed.
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
     * A BARE word — the thing people type without thinking.
     *
     * Plain, it is a substring and always has been. Under `wholeWord` it gets
     * exactly the anchoring a quoted phrase gets, and for the same reason: the
     * two must not disagree, or the mode would mean one thing inside quotes and
     * another outside them. A `*` on either end says "I do not know how this
     * ends", so that end is left open even in the mode — anchoring it would
     * contradict what was typed, which no mode is allowed to do.
     */
    function barePattern(w, whole) {
        const body = wordPattern(w);
        if (!whole) { return body; }
        const openStart = /^\*/.test(w);
        const openEnd = /\*$/.test(w);
        return (openStart ? '' : `(?<!${WORD})`) + body + (openEnd ? '' : `(?!${WORD})`);
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

    function parse(tokens, flags, whole) {
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
            const pattern = t.phrase ? phrasePattern(t.value, t.unclosed) : barePattern(t.value, whole);
            if (pattern === null) { bad('an empty phrase matches nothing — put a word inside the quotes'); }
            // `term` is the token this leaf was built from, kept so the candidate
            // prefilter below can read the LITERAL out of it. Deriving it from
            // the compiled RegExp instead would mean parsing our own escaping
            // back out, which is the second grammar this file exists against.
            return { t: 'leaf', re: new RegExp(pattern, flags), term: t };
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
     * opts: { caseSensitive?, regex?, wholeWord? } — `regex: true` hands the
     * whole string to RegExp untouched, which is the Search page's raw mode and
     * stays exactly what it was (and where `wholeWord` therefore does nothing:
     * a raw pattern already says its own boundaries). Returns an object that is
     * always safe to use:
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
        try { root = parse(tokenize(src), flags, o.wholeWord === true); }
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

    // ------------------------------------------------- the candidate prefilter
    //
    // ‼️ A PLAN IS A SUPERSET PROMISE, NOT A SECOND SEARCH (X-42).
    //
    // Scanning 664 MB of transcript to answer one word is the whole cost of the
    // Search page, and the way out is to let a fast literal scanner say which
    // FILES could possibly match before the real matcher reads any of them. The
    // danger in that is obvious and fatal: a candidate list that is too small
    // loses hits silently, and a search that quietly answers less is worse than
    // a slow one. So the plan comes from THIS parse tree — the only grammar —
    // and it obeys one rule: a record may be excluded only where a false
    // negative is impossible.
    //
    //   leaf   → the longest run of characters the pattern cannot match without
    //   and    → the more selective side; an unusable side is simply dropped,
    //            because the other side alone is already a superset
    //   or     → the union, and ONLY if both sides are usable
    //   not    → nothing: a negated term is by definition absent from the hit
    //
    // Anything else — a negative-only query, a term too short to be worth
    // scanning for, raw regex — returns `all`, meaning "read everything". The
    // caller then runs the real `test()`/`find()` over whatever the plan let
    // through, so AND/OR/NOT, parentheses, phrases, wildcards, Turkish Unicode,
    // case and whole-word all behave exactly as they did.
    //
    // ‼️ The literals are matched against text whose whitespace has been
    // collapsed to single spaces (what the corpus stores); nothing here spans
    // a word gap, so that assumption only ever costs candidates, never hits.

    /** Below this a literal is not worth a scan — and `*` on both ends of a
     *  two-letter word is not a filter, it is a full read with extra steps. */
    const PREFILTER_MIN = 3;

    /** The longest invariant literal a term must contain. `*` is the only
     *  character with a meaning left, so the runs between the stars are exactly
     *  what any matching text has to carry, whole-word anchoring included. */
    function literalOf(term) {
        const words = term.phrase
            ? String(term.value).trim().split(/\s+/).filter(Boolean)
            : [String(term.value)];
        let best = '';
        for (const w of words) {
            for (const part of w.split('*')) {
                if (part.length > best.length) { best = part; }
            }
        }
        return best.length >= PREFILTER_MIN ? best : null;
    }

    /** How much a literal set is worth: its WEAKEST member decides, since the
     *  set is an OR and one short literal drags the whole scan back to reading
     *  everything. Fewer literals break the tie. */
    function selectivity(list) {
        let min = Infinity;
        for (const s of list) { if (s.length < min) { min = s.length; } }
        return min - (list.length - 1) / 1000;
    }

    function planOf(node) {
        switch (node.t) {
            case 'leaf': { const lit = literalOf(node.term); return lit ? [lit] : null; }
            case 'not': return null;
            case 'or': {
                const a = planOf(node.a), b = planOf(node.b);
                return a && b ? a.concat(b) : null;
            }
            case 'and': {
                const a = planOf(node.a), b = planOf(node.b);
                if (!a) { return b; }
                if (!b) { return a; }
                return selectivity(a) >= selectivity(b) ? a : b;
            }
            default: return null;
        }
    }

    /**
     * ‼️ IS THIS QUERY MONOTONE — does matching a piece of text still hold when
     * that text is put inside a longer one?
     *
     * It sounds pedantic and it is the difference between a correct fast path
     * and a silently wrong one. A reader that wants to test a whole BLOCK of
     * records at once, and only take it apart when the block matches, is
     * relying on exactly this. It is true of everything positive: a word, a
     * phrase, a wildcard, an AND, an OR — all of them still match with more
     * text around them. It is false the moment a NOT appears, because "does not
     * contain zebrafish" is true of one line and false of the file it lives in.
     * Raw regex is false too: `^` and `$` are anchors on the WHOLE string, so a
     * pattern that matches a record on its own can fail against the block.
     */
    function isMonotone(node) {
        switch (node.t) {
            case 'leaf': return true;
            case 'not': return false;
            case 'and': case 'or': return isMonotone(node.a) && isMonotone(node.b);
            default: return false;
        }
    }

    /**
     * prefilter(q, opts) → { mode: 'all' } | { mode: 'any', literals: [...] }
     *
     * `any` means: a record that contains NONE of these literals cannot match,
     * so a file that contains none of them may be skipped entirely. `all` means
     * no such promise could be made and everything must be read. Case follows
     * `opts.caseSensitive`, exactly as the matcher does; `regex: true` is always
     * `all`, because a raw pattern's invariants are not ours to guess.
     */
    function prefilter(q, opts) {
        const o = opts || {};
        const src = String(q === undefined || q === null ? '' : q);
        const everything = { mode: 'all', literals: [], monotone: false };
        if (!src.trim() || o.regex) { return everything; }
        const flags = (o.caseSensitive ? '' : 'i') + 'u';
        let root;
        try { root = parse(tokenize(src), flags, o.wholeWord === true); }
        catch (e) { return everything; }
        const monotone = isMonotone(root);
        const list = planOf(root);
        if (!list || !list.length) { return { mode: 'all', literals: [], monotone }; }
        return { mode: 'any', literals: Array.from(new Set(list)), monotone };
    }

    // -------------------------------------------------------------- the words
    // Said once, here, so twenty boxes cannot explain the same grammar twenty
    // ways — and so the guide (docs/BLUEPRINT) and the tooltips agree by
    // construction rather than by somebody remembering.
    //
    // ‼️ AND THE EXAMPLES ARE IN THE LANGUAGE OF THE INTERFACE. They were
    // Turkish, in an English-language extension, which is a help text telling
    // the reader that nobody looked at it. An example is the part of a
    // grammar people actually read; it is not a place to be careless.
    //
    // SYNTAX_ROWS is the knowledge with its columns intact, so a page can draw a
    // real help CARD (symbol · meaning · example) instead of squeezing a grammar
    // into a one-line hover. The flat SYNTAX below is BUILT from it — two texts
    // saying different things is the failure this file exists against.
    const SYNTAX_ROWS = [
        { sym: 'a b', what: 'both terms must appear; their order does not matter', example: 'parser error' },
        { sym: 'OR', what: 'either side may appear (OR must be uppercase)', example: 'codex OR gemini' },
        { sym: '-a', what: 'exclude records containing this term', example: 'parser -test' },
        { sym: '( )', what: 'keep a combined choice together', example: '(codex OR gemini) install' },
        { sym: '"…"', what: 'find these words together, as a whole phrase', example: '"session id"' },
        { sym: '*', what: 'accept any continuation inside this term', example: 'refact*' },
        { sym: '"a* b*"', what: 'combine a phrase with unfinished words', example: '"refact* the pars*"' }
    ];

    /** The one thing a row cannot say in a `sym` column, and the thing people
     *  are surprised by: a bare word is a SUBSTRING. Stated in a form every box
     *  can act on — a hover on a plain filter must not point at a Whole word
     *  toggle that only the Search page has. */
    const BARE_WORD_NOTE = 'A plain word also matches inside a longer word; '
        + 'put it in "quotes" when it has to stand on its own.';

    /**
     * ‼️ THE HOVER IS BUILT FROM THE CARD'S OWN ROWS, NOT WRITTEN BESIDE THEM.
     *
     * This used to be a second hand-written list that claimed in a comment to be
     * derived from SYNTAX_ROWS and was not — so the Search page's Syntax card
     * grew a rule (`"a* b*"`) that twenty hovers never learned, and the hovers
     * kept telling every box in the extension to turn on a Whole word toggle
     * that exists on exactly one page. Deriving it is the only version of "say
     * it once" that a future edit cannot undo by accident.
     */
    const SYNTAX = SYNTAX_ROWS
        .map(r => r.sym + '  —  ' + r.what + '  ·  ' + r.example)
        .concat([BARE_WORD_NOTE])
        .join('\n');

    /** What the whole-word mode changes, in one line, for the box that is in it. */
    const WHOLE_WORD_ON = 'Whole word is ON: a bare word must match a whole word '
        + '("log" no longer matches "dialogue"). A * still opens the end it is written on.';

    /**
     * The tooltip a box gets: what it searches, then the grammar.
     * `opts.wholeWord` adds the one line that says what the mode is doing —
     * a mode nobody can see from the box is a mode that reads as a bug.
     */
    function tip(subject, opts) {
        const o = opts || {};
        return (subject ? String(subject).trim() + '\n\n' : '')
            + (o.wholeWord ? WHOLE_WORD_ON + '\n\n' : '') + SYNTAX;
    }

    return {
        compile, matches, prefilter, tip,
        SYNTAX, SYNTAX_ROWS, WHOLE_WORD_ON, BARE_WORD_NOTE, WORD, PREFILTER_MIN
    };
});
