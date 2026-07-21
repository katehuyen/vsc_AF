// Portable stores (compiled core/portablePaths.js + core/util.js):
// tokenize/expand round-trips machine roots through ${claudeDir}/${globalStorage}/${home},
// legacy absolute paths from ANOTHER machine heal onto this machine's roots,
// prose is never mangled — and expandEnvPath lets settings say %USERPROFILE%.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const pp = require(path.join(__dirname, '..', 'out', 'core', 'portablePaths.js'));
const { expandEnvPath } = require(path.join(__dirname, '..', 'out', 'core', 'util.js'));

const roots = pp.standardRoots({
    claudeDir: 'C:\\Users\\me\\.claude',
    globalStorage: 'C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm',
    home: 'C:\\Users\\me'
});

// ---------- tokenize: machine roots leave as tokens ----------
{
    ok('claudeDir wins over home (most specific first)',
        pp.tokenizePath('C:\\Users\\me\\.claude\\projects\\x\\s.jsonl', roots) === '${claudeDir}\\projects\\x\\s.jsonl');
    ok('globalStorage tokenized',
        pp.tokenizePath('C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\task-outputs\\a.md', roots)
        === '${globalStorage}\\task-outputs\\a.md');
    ok('bare home tokenized', pp.tokenizePath('C:\\Users\\me\\Desktop\\n.txt', roots) === '${home}\\Desktop\\n.txt');
    ok('slash style and case insensitive',
        pp.tokenizePath('c:/users/ME/.claude/x', roots) === '${claudeDir}/x');
    ok('mid-prose occurrences tokenize too (prompts stay portable)',
        pp.tokenizePath('read C:\\Users\\me\\.claude\\a and report', roots) === 'read ${claudeDir}\\a and report');
    ok('unrelated paths untouched', pp.tokenizePath('D:\\zone\\agent\\ajanlar\\basit', roots) === 'D:\\zone\\agent\\ajanlar\\basit');
}

// ---------- expand: tokens become THIS machine's roots ----------
{
    ok('token expands', pp.expandPath('${claudeDir}\\projects\\x\\s.jsonl', roots) === 'C:\\Users\\me\\.claude\\projects\\x\\s.jsonl');
    ok('round-trip is lossless', (() => {
        const orig = 'C:\\Users\\me\\.claude\\projects\\D--x\\abc.jsonl';
        return pp.expandPath(pp.tokenizePath(orig, roots), roots) === orig;
    })());
}

// ---------- healing: another machine's absolute paths re-root here ----------
{
    ok('foreign .claude path heals onto current claudeDir',
        pp.expandPath('C:\\Users\\rotam\\.claude\\projects\\D--a\\s.jsonl', roots)
        === 'C:\\Users\\me\\.claude\\projects\\D--a\\s.jsonl');
    ok('foreign globalStorage path heals onto current storage',
        pp.expandPath('C:\\Users\\rotam\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\task-outputs\\a.md', roots)
        === 'C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\task-outputs\\a.md');
    ok('current-machine paths never rewritten',
        pp.expandPath('C:\\Users\\me\\.claude\\projects\\s.jsonl', roots) === 'C:\\Users\\me\\.claude\\projects\\s.jsonl');
    ok('prose mentioning .claude is not healed (only whole-string paths)',
        pp.expandPath('see C:\\Users\\rotam\\.claude\\x for details', roots) === 'see C:\\Users\\rotam\\.claude\\x for details');
    ok('non-path strings untouched', pp.expandPath('just a prompt', roots) === 'just a prompt');
    ok('unrelated absolute paths untouched', pp.expandPath('E:\\data\\file.txt', roots) === 'E:\\data\\file.txt');
}

// ---------- deep walk: whole store shapes ----------
{
    const store = {
        tasks: [{ id: 't1', costSessionFile: 'C:\\Users\\me\\.claude\\projects\\D--x\\s.jsonl', tokens: 5, done: true }],
        schedules: [{ agentId: 'd:/zone/agent/ajanlar/basit' }]
    };
    const tokenized = pp.tokenizeDeep(store, roots);
    ok('deep tokenize hits nested fields', tokenized.tasks[0].costSessionFile === '${claudeDir}\\projects\\D--x\\s.jsonl');
    ok('deep tokenize leaves non-strings and D: ids alone',
        tokenized.tasks[0].tokens === 5 && tokenized.tasks[0].done === true
        && tokenized.schedules[0].agentId === 'd:/zone/agent/ajanlar/basit');
    const back = pp.expandDeep(tokenized, roots);
    ok('deep round-trip', JSON.stringify(back) === JSON.stringify(store));
    // a legacy store written by another machine heals wholesale on load
    const legacy = pp.expandDeep({ tasks: [{ costSessionFile: 'C:\\Users\\rotam\\.claude\\projects\\D--a\\z.jsonl' }] }, roots);
    ok('deep heal fixes legacy foreign paths', legacy.tasks[0].costSessionFile === 'C:\\Users\\me\\.claude\\projects\\D--a\\z.jsonl');
}

// ---------- expandEnvPath: %VAR% / ${env:VAR} / ~ in settings ----------
{
    process.env.AF_TEST_ROOT = 'D:\\some\\where';
    ok('%VAR% expands', expandEnvPath('%AF_TEST_ROOT%\\agents') === 'D:\\some\\where\\agents');
    ok('${env:VAR} expands', expandEnvPath('${env:AF_TEST_ROOT}/agents') === 'D:\\some\\where/agents');
    ok('~ expands to home', expandEnvPath('~/x') === require('os').homedir() + '/x');
    ok('unknown var left visible', expandEnvPath('%NOPE_NOT_SET%\\x') === '%NOPE_NOT_SET%\\x');
    ok('plain paths untouched', expandEnvPath('D:\\zone\\agent\\ajanlar') === 'D:\\zone\\agent\\ajanlar');
    delete process.env.AF_TEST_ROOT;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
