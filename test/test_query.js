// THE QUERY LANGUAGE (media/afQuery.js, and src/core/query.ts which loads it).
//
// Every filter box in the extension used to ask one question — "does this
// substring appear?" — which is the wrong one the moment a list is long: no
// two words that are not adjacent, no either/or, no whole-word, no exclusion.
// This is the grammar that replaced it, and the rule it must never break is
// the last group below: a bare word still means exactly what it always did.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Q = require(path.join(__dirname, '..', 'media', 'afQuery.js'));

/** does `q` match `text`? (an unparseable query matches nothing) */
const m = (q, text) => Q.compile(q).test(text);

// ------------------------------------------------------------ AND / OR / NOT
ok('one word is a substring', m('foo', 'a foo b') && !m('foo', 'a bar b'));
ok('two words mean BOTH, in any order',
    m('foo bar', 'bar then foo') && !m('foo bar', 'only foo'));
ok('OR means either', m('foo OR bar', 'only bar here') && !m('foo OR bar', 'neither'));
ok('| is OR too', m('foo | bar', 'bar'));
ok('AND may be written out', m('foo AND bar', 'foo bar') && !m('foo AND bar', 'foo'));
ok('-word excludes', m('-foo', 'bar') && !m('-foo', 'has foo'));
ok('NOT word excludes', m('NOT foo', 'bar') && !m('NOT foo', 'foo'));
ok('a word and an exclusion together',
    m('foo -bar', 'foo alone') && !m('foo -bar', 'foo and bar'));
ok('parentheses group',
    m('(red OR blue) car', 'a blue car') && !m('(red OR blue) car', 'a green car'));
ok('AND binds tighter than OR, as everywhere else',
    m('red blue OR green', 'just green')
    && m('red blue OR green', 'red and blue')
    && !m('red blue OR green', 'only red'));

// ‼️ the keywords are UPPERCASE ONLY — "or" is an ordinary word people search
ok('lowercase or is a search for the letters', m('or', 'a word with or in it'));
ok('…and does not split the query', !m('foo or bar', 'foo bar'));

// a hyphen inside a word is not an operator
ok('agent-farm is one word', m('agent-farm', 'the agent-farm repo'));

// ------------------------------------------------------------------ phrases
ok('a quoted phrase needs the words in order',
    m('"tool call"', 'a tool call here') && !m('"tool call"', 'call the tool'));
ok('‼️ a phrase is WHOLE-WORD: "log" is not inside "dialogue"',
    !m('"log"', 'a dialogue') && m('"log"', 'the log file'));
ok('…while a bare word still is', m('log', 'a dialogue'));
ok('a phrase tolerates any whitespace between its words',
    m('"tool call"', 'a tool\n   call'));
ok('the whole-word anchor respects Turkish letters, which \\b cannot',
    !m('"ol"', 'olsun') && m('"ol"', 'ol bakalım'));

// -------------------------------------------------------------- * wildcards
ok('* stands for any run of characters', m('kelime*', 'kelimelerin'));
ok('* works in the middle', m('ke*me', 'kelime var'));
ok('* does not cross a space', !m('"bir* iki"', 'bir sey arada iki'));

// ‼️ THE USER'S OWN EXAMPLE, which is why this exists at all: one query that
// finds two sentences that share a shape but not their endings.
ok('"kelime* bazıları ol*" finds "kelimelerin bazıları olsun"',
    m('"kelime* bazıları ol*"', 'kelimelerin bazıları olsun'));
ok('…and "kelimenin bazıları oldu"',
    m('"kelime* bazıları ol*"', 'kelimenin bazıları oldu'));
ok('…and not a sentence that only looks similar',
    !m('"kelime* bazıları ol*"', 'kelimenin bazilari oldu'));

// ------------------------------------------------------ X-24: whole-word mode
//
// ‼️ Whole-word matching existed only inside quotes, which is a rule you cannot
// discover by looking at a search box — the user's words were "I still do not
// know how to choose between whole word and partial". It is a MODE now, and the
// two must agree: what the mode does to a bare word is what quotes already do.
{
    const w = (q, text) => Q.compile(q, { wholeWord: true }).test(text);
    ok('whole word anchors a BARE word the way quotes do',
        !w('log', 'a dialogue') && w('log', 'the log file'));
    ok('…and the default is still the plain substring it always was',
        m('log', 'a dialogue'));
    ok('…it respects Turkish letters too, which \\b cannot',
        !w('ol', 'olsun') && w('ol', 'ol bakalım'));
    ok('‼️ a * still opens the end it is written on, even in the mode',
        w('refact*', 'refactoring') && w('*factor', 'refactor') && !w('refact', 'refactoring'));
    ok('a quoted phrase means the same in both modes',
        w('"tool call"', 'a tool call') && !w('"tool call"', 'a tool calls'));
    ok('AND / OR / NOT are unaffected',
        w('log OR trace', 'a trace here') && !w('log OR trace', 'a dialogue')
        && w('log -trace', 'the log file'));
    ok('regex mode ignores it — a raw pattern states its own boundaries',
        Q.compile('log', { regex: true, wholeWord: true }).test('a dialogue'));
}

// ------------------------------------------------------------------- corners
ok('an empty query matches everything', Q.compile('   ').empty && Q.compile('').test('x'));
ok('case is ignored by default', m('AGENT', 'agent') && m('agent', 'AGENT'));
ok('…unless you ask for it',
    Q.compile('AGENT', { caseSensitive: true }).test('AGENT')
    && !Q.compile('AGENT', { caseSensitive: true }).test('agent'));
ok('a stray ) is refused IN WORDS, not with a stack trace',
    !Q.compile('a )').ok && /\) with no \(/.test(Q.compile('a )').error));
ok('an operator with nothing after it is refused', !Q.compile('foo OR').ok);
// ‼️ a box that filters AS YOU TYPE is half-typed most of the time
ok('an unclosed quote is the middle of typing, not an error',
    Q.compile('"tool cal').ok && m('"tool cal', 'a tool call'));
ok('an unclosed ( is too', Q.compile('(a OR b').ok && m('(a OR b', 'b'));
ok('regex mode is untouched and still its own thing',
    Q.compile('^a.c$', { regex: true }).test('abc')
    && !Q.compile('[', { regex: true }).ok);

// -------------------------------------------------------------------- find()
{
    const c = Q.compile('"kelime* bazıları ol*"');
    const at = c.find('xx kelimelerin bazıları olsun yy');
    ok('find() reports where the snippet should be cut',
        at && at.index === 3 && at.length === 'kelimelerin bazıları olsun'.length);
    ok('…and picks the EARLIEST term, not the first one written',
        (() => {
            const q = Q.compile('zebra OR apple');
            const p = q.find('apple then zebra');
            return p && p.index === 0;
        })());
    ok('a purely negative query has nothing to point at', Q.compile('-foo').find('bar') === null);
}

// ------------------------------------------------------- one grammar, two homes
{
    const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'query.ts'), 'utf8');
    ok('the host side LOADS the media file rather than reimplementing it',
        /media', 'afQuery\.js'/.test(core) && !/function tokenize/.test(core));
    const search = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'search.ts'), 'utf8');
    ok('the transcript search compiles queries through it',
        /from '\.\/query'/.test(search) && /compileQuery\(/.test(search));
    const base = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    ok('…and every page is shipped the same file', /'afQuery\.js'/.test(base));
}

// ------------------------------------------------------------ it is written down
{
    ok('the grammar explains itself in one place', /uppercase OR/.test(Q.SYNTAX));
    ok('…and a box can put its own subject in front of it',
        Q.tip('Search the backlog.').startsWith('Search the backlog.')
        && Q.tip('x').includes(Q.SYNTAX));
    ok('a box in whole-word mode says so, above the grammar',
        Q.tip('x', { wholeWord: true }).includes(Q.WHOLE_WORD_ON)
        && !Q.tip('x').includes(Q.WHOLE_WORD_ON));

    // ‼️ X-24 — THE EXAMPLES ARE IN THE LANGUAGE OF THE INTERFACE. They were
    // Turkish in an English-language extension, which is a help text saying out
    // loud that nobody read it. The guard is the alphabet, not a word list.
    ok('‼️ the shipped grammar carries no Turkish examples',
        !/[çğıöşüÇĞİÖŞÜ]/.test(Q.SYNTAX)
        && !Q.SYNTAX_ROWS.some(r => /[çğıöşüÇĞİÖŞÜ]/.test(r.sym + r.what + r.example)));
    ok('the grammar is also available with its columns intact, for a help card',
        Array.isArray(Q.SYNTAX_ROWS) && Q.SYNTAX_ROWS.length >= 7
        && Q.SYNTAX_ROWS.every(r => r.sym && r.what && r.example));
    ok('…and every one of those examples is a query this grammar accepts',
        Q.SYNTAX_ROWS.every(r => Q.compile(r.example).ok));

    const en = fs.readFileSync(path.join(__dirname, '..', 'docs', 'BLUEPRINT.en.md'), 'utf8');
    const tr = fs.readFileSync(path.join(__dirname, '..', 'docs', 'BLUEPRINT.tr.md'), 'utf8');
    const documented = doc => /The query language|Sorgu dili/.test(doc)
        && /`foo OR bar`/.test(doc) && /`-foo`/.test(doc)
        && /"refact\* the pars\*"/.test(doc) && /afQuery\.js/.test(doc);
    ok('the English guide documents the query language, with the table', documented(en));
    ok('the Turkish guide documents it too', documented(tr));
    const wholeWorded = doc => /whole word|Whole word|tam kelime|Tam kelime/.test(doc);
    ok('…and both guides document the whole-word mode', wholeWorded(en) && wholeWorded(tr));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
