// S-13: what is allowed to NAME a session.
//
// The failure: a real session came out called `[Request interrupted by user]` —
// named after a STATE rather than after anything anybody said. Several kinds of
// machinery ride in a transcript as ordinary user messages, and the rule that
// kept them out only knew about three opening characters.
//
// ‼️ The line this test is really drawing is the one that makes the fix safe:
// only a message that is ENTIRELY a bracketed notice is machinery. Measured
// across this vault's 333 named sessions, exactly one was noise and one more
// began with a bracket and was a REAL title (`[Image #2] …`) — so a blanket
// "starts with [" rule would have destroyed a good name while fixing a bad one.
const Module = require('module');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// The index pulls in `vscode` for its watchers; nothing under test touches it.
class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { EventEmitter: Emitter, workspace: { createFileSystemWatcher: () => ({ onDidChange: () => ({ dispose() { } }), onDidCreate: () => ({ dispose() { } }), onDidDelete: () => ({ dispose() { } }), dispose() { } }) }, window: {}, commands: {}, RelativePattern: class { } };
    }
    return origLoad.apply(this, arguments);
};

const { conversationTitle } = require(path.resolve(__dirname, '..', 'out', 'core', 'sessions.js'));

// ---- what a person said names the session ---------------------------------
ok('an ordinary prompt is the name',
    conversationTitle('backlog en üst 7 kalemi yap tamamla') === 'backlog en üst 7 kalemi yap tamamla');
ok('whitespace is normalised, not preserved',
    conversationTitle('  fix\n  the   parser  ') === 'fix the parser');
ok('a long ask is cut rather than refused',
    conversationTitle('x'.repeat(400)).length <= 80);

// ---- machinery does not ----------------------------------------------------
ok('a command block does not name a session', conversationTitle('<command-name>/goal</command-name>') === '');
ok('local command output does not either', conversationTitle('<local-command-stdout>Goal set: …</local-command-stdout>') === '');
ok('a typed slash command does not', conversationTitle('/loop 5m check the deploy') === '');
ok('nor shell passthrough', conversationTitle('!git status') === '');
ok('nor an empty message', conversationTitle('   ') === '');

// ‼️ THE ONE THAT GOT THROUGH, and the reported bug.
ok('‼️ a bracketed notice is the harness talking, not the user',
    conversationTitle('[Request interrupted by user]') === '');
ok('…whatever the notice says — the shape is the rule, not a list of wordings',
    conversationTitle('[Request interrupted by user for tool use]') === ''
    && conversationTitle('[Something nobody has written yet]') === '');

// ---- ‼️ …and the distinction that keeps a good name -------------------------
ok('‼️ an attachment marker with a real sentence after it IS a name — the marker comes off',
    conversationTitle('[Image #2] D:\\Temporary Files\\ içindeki Capture isimli .JPG dosyası buna bir bak')
    === 'D:\\Temporary Files\\ içindeki Capture isimli .JPG dosyası buna bir bak');
ok('…more than one marker comes off',
    conversationTitle('[Image #1] [Pasted text #2 +40 lines] look at these')
    === 'look at these');
ok('…and a marker with nothing after it names nothing rather than naming itself',
    conversationTitle('[Image #2]') === '');
ok('a bracket that is part of a sentence is left alone',
    conversationTitle('[bug] the counter is wrong') === '[bug] the counter is wrong');

// ---- the real transcript, read the way the index reads it -------------------
//
// Not a hand-written fixture: the actual shape that produced the bad name — a
// `/goal` command, its stdout, the hook's own meta announcement, the interrupt
// notice, and only then a person speaking.
{
    const lines = [
        { type: 'user', message: { content: '<command-name>/goal</command-name>\n<command-args>bitir</command-args>' } },
        { type: 'user', message: { content: '<local-command-stdout>Goal set: bitir</local-command-stdout>' } },
        { type: 'user', isMeta: true, message: { content: 'A session-scoped Stop hook is now active with condition: "bitir".' } },
        { type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
        { type: 'user', message: { content: [{ type: 'text', text: 'devam et' }] } }
    ];
    // The index's own walk, reduced to the decision under test.
    let title = '';
    let first;
    for (const line of lines) {
        if (line.type !== 'user' || !line.message) { continue; }
        const c = line.message.content;
        const texts = typeof c === 'string'
            ? (line.isMeta ? [] : [c])
            : (line.isMeta ? [] : c.filter(b => b.type === 'text').map(b => b.text));
        for (const t of texts) {
            const said = conversationTitle(t);
            if (!title) { title = said; }
            if (first === undefined && said) { first = t; }
        }
    }
    ok('‼️ the session is named after what the person said, not after the interrupt',
        title === 'devam et');
    ok('…and the opening prompt the hover shows is the same message',
        first === 'devam et');
}

// ---- U-17: the command is machinery, its ARGUMENT is the brief -------------
//
// `/goal finish the top eight backlog items` reaches the transcript as a command
// block, and the block starts with `<` — so the whole opening turn was thrown
// away and the session went on to be named by whatever came next, which in a
// long run is a continuation ("devam et"). The sentence saying what the work IS
// sat in the first turn, discarded.
//
// ‼️ The shape test is what makes this safe, and it is the same kind of rule as
// the bracket one above: an argument earns the name by reading like PROSE.
const GOAL = a => `<command-name>/goal</command-name>\n            <command-message>goal</command-message>\n            <command-args>${a}</command-args>`;

ok('‼️ what was typed after the command names the session',
    conversationTitle(GOAL("backlog'daki en üst 8 kalemi tamamla")) === "backlog'daki en üst 8 kalemi tamamla");
ok('…the command name itself is never part of it',
    !/goal/.test(conversationTitle(GOAL('rewrite the parser and measure it again'))));
ok('…and a long argument is cut like any other title',
    conversationTitle(GOAL('x '.repeat(200))).length <= 80);

ok('a one-word argument is a flag, not a description',
    conversationTitle(GOAL('clear')) === '' && conversationTitle(GOAL('bitir')) === '');
ok('…nor is a short pair of tokens',
    conversationTitle('<command-name>/loop</command-name><command-args>5m /babysit</command-args>') === ''
    && conversationTitle('<command-name>/model</command-name><command-args>opus 5</command-args>') === '');
ok('a command with no argument at all still names nothing',
    conversationTitle(GOAL('')) === '' && conversationTitle('<command-name>/context</command-name>') === '');
ok('an argument that is itself machinery gets the same judgment as any text',
    conversationTitle(GOAL('[Request interrupted by user]')) === ''
    && conversationTitle(GOAL('/loop 5m check the deploy')) === '');
ok('command OUTPUT is still not a name — only the argument is',
    conversationTitle('<local-command-stdout>Goal set: backlog\'daki en üst 8 kalemi tamamla</local-command-stdout>') === '');

// The reported session, in the shape the transcript actually has it: a `/goal`
// carrying the whole brief, then hours of work, then a bare "devam et" after a
// limit cut the turn off. The name must come from the first line, not the last.
{
    const lines = [
        GOAL("session ID'yi oku ve orada plan dosyasını da göreceksin zaten onu da oku"),
        '<local-command-stdout>Goal set: …</local-command-stdout>',
        'devam et'
    ];
    let title = '';
    for (const t of lines) { if (!title) { title = conversationTitle(t); } }
    ok('‼️ a session briefed through /goal is named after the brief, not after "devam et"',
        title === "session ID'yi oku ve orada plan dosyasını da göreceksin zaten onu da oku");
}

// ---- one judgment, not two -------------------------------------------------
//
// The viewer used to carry its own copy, which is how the two drifted apart —
// and a page disagreeing with the tables about a session's name is a bug that
// cannot be explained from either side alone.
{
    const fs = require('fs');
    const viewer = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', 'sessionViewer.ts'), 'utf8');
    ok('‼️ the session viewer asks the index rather than deciding for itself',
        /const titleCandidate = conversationTitle;/.test(viewer)
        // The list grows as the page borrows more shared judgments (S-35 added
        // sessionHeadless); what must not change is WHERE they come from.
        && /import \{ conversationTitle,[^}]*\} from '\.\.\/core\/sessions'/.test(viewer));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
