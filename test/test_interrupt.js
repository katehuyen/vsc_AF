// A3 — interrupt: which terminal does the Esc go to? (compiled
// core/interrupt.js, pure). Getting this wrong would type Esc into somebody
// else's session, so the resolver is checked case by case: the exact launch
// first, a name match second, an external window third, and an honest "no"
// when there is nothing to search by.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { resolveInterrupt, terminalNamePattern, INTERRUPT_KEY } =
    require(path.join(__dirname, '..', 'out', 'core', 'interrupt.js'));

// ---------- the key itself ----------
{
    ok('the interrupt key is a bare Esc', INTERRUPT_KEY === '\u001b');
    ok('it carries no newline — it is a keypress, not a line', !/\r|\n/.test(INTERRUPT_KEY));
}

// ---------- terminal name pattern ----------
{
    const p = terminalNamePattern('dev');
    ok('matches the launch naming', p.test('claude: dev #7') && p.test('claude: dev'));
    ok('matches another CLI of the same agent', p.test('gemini: dev'));
    ok('does not match another agent', !p.test('claude: developer') && !p.test('claude: dev2'));
    ok('does not match a shell', !p.test('powershell'));
    ok('a regex-special agent name is escaped',
        terminalNamePattern('a.b').test('claude: a.b') && !terminalNamePattern('a.b').test('claude: axb'));
    // the nameless pattern exists for callers that only need to FIND a claude
    // terminal; the interrupt resolver deliberately refuses to use it (below)
    ok('the nameless pattern matches any claude terminal',
        terminalNamePattern('').test('claude: whoever #2') && !terminalNamePattern('').test('bash'));
}

// ---------- 1. the exact launch wins ----------
{
    const t = resolveInterrupt({
        sessionId: 'sid1', agentName: 'dev',
        bindings: [
            { title: 'claude: dev #1', sessionId: 'other', hasTerminal: true, terminalIndex: 0 },
            { title: 'claude: dev #2', sessionId: 'sid1', hasTerminal: true, terminalIndex: 1 }
        ],
        terminalNames: ['claude: dev #1', 'claude: dev #2']
    });
    ok('the session\'s own terminal is picked', t.kind === 'integrated' && t.terminalIndex === 1);
    ok('and it says why', /launched in/.test(t.how));
}

// ---------- 2. no binding → newest matching terminal ----------
{
    const t = resolveInterrupt({
        sessionId: 'unbound', agentName: 'dev',
        bindings: [],
        terminalNames: ['claude: dev #1', 'bash', 'claude: dev #4']
    });
    ok('newest same-agent terminal wins', t.kind === 'integrated' && t.terminalIndex === 2);
    const other = resolveInterrupt({
        sessionId: 'unbound', agentName: 'psikolog',
        bindings: [], terminalNames: ['claude: dev #1']
    });
    ok('another agent\'s terminal is NOT grabbed', other.kind !== 'integrated');
}

// ---------- 3. external windows ----------
{
    // launched into an OS window: the binding exists but has no terminal
    const t = resolveInterrupt({
        sessionId: 'sid9', agentName: 'dev',
        bindings: [{ title: 'claude: dev #9', hasTerminal: false, sessionId: 'sid9' }],
        terminalNames: ['claude: dev #3']   // a DIFFERENT session's integrated terminal
    });
    ok('an external session never falls through to an integrated terminal', t.kind === 'external');
    ok('its own pinned title is searched first', t.titles[0] === 'claude: dev #9');
    ok('the agent titles follow as fallbacks', t.titles.indexOf('claude: dev') > 0);
    ok('it says Esc has to be pressed there', /press/i.test(t.how));

    const noTerm = resolveInterrupt({
        sessionId: 'x', agentName: 'dev', bindings: [], terminalNames: []
    });
    ok('with no integrated match, the agent is searched for outside', noTerm.kind === 'external');
}

// ---------- 4. nothing to go on ----------
{
    const t = resolveInterrupt({ sessionId: 'x', bindings: [], terminalNames: [] });
    ok('no session terminal, no agent name → an honest no', t.kind === 'none');
    ok('and it says so', /no terminal found/.test(t.how));

    // The dangerous case: an unidentifiable session and SOME claude terminal
    // open. Focusing a random window is harmless; typing Esc into one is not.
    const blind = resolveInterrupt({
        sessionId: 'unknown', bindings: [], terminalNames: ['claude: dev #1', 'claude: psikolog #2']
    });
    ok('an unidentifiable session never grabs a random claude terminal', blind.kind === 'none');
}

// ---------- a stale binding index is not trusted ----------
{
    const t = resolveInterrupt({
        sessionId: 'sid1', agentName: 'dev',
        bindings: [{ title: 'claude: dev #1', sessionId: 'sid1', hasTerminal: true, terminalIndex: 9 }],
        terminalNames: ['claude: dev #1']
    });
    ok('an out-of-range index falls back to the name match',
        t.kind === 'integrated' && t.terminalIndex === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
