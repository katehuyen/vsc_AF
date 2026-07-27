// A1 — session launch: the vocabulary and the command line (compiled
// core/launch.js, pure). What a session starts with used to be typed into the
// terminal by hand; these checks pin down that the flags built here are the
// ones `claude --help` documents, that an unset field emits NO flag at all
// (so the default launch is still the bare `claude` it always was), and that
// free text can never break out of its quotes.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    buildLaunchCommand, describeLaunch, quoteArg, withDefaults, validateLaunch,
    modelChoices, EFFORT_CHOICES, PERMISSION_CHOICES
} = require(path.join(__dirname, '..', 'out', 'core', 'launch.js'));

// ---------- nothing set = nothing added ----------
{
    ok('empty options = bare claude', buildLaunchCommand('claude', {}) === 'claude');
    ok('no options object at all = bare claude', buildLaunchCommand('claude') === 'claude');
    ok('empty strings emit no flags',
        buildLaunchCommand('claude', { model: '', effort: '  ', permissionMode: '', name: '', prompt: '' })
        === 'claude');
    ok('exe is honoured', buildLaunchCommand('claude.cmd', {}) === 'claude.cmd');
    ok('missing exe falls back to claude', buildLaunchCommand('', {}) === 'claude');
}

// ---------- each dimension, and the whole line ----------
{
    ok('model', buildLaunchCommand('claude', { model: 'opus' }) === 'claude --model opus');
    ok('effort', buildLaunchCommand('claude', { effort: 'high' }) === 'claude --effort high');
    ok('permission mode',
        buildLaunchCommand('claude', { permissionMode: 'acceptEdits' }) === 'claude --permission-mode acceptEdits');
    ok('session name is quoted with -n',
        buildLaunchCommand('claude', { name: 'zen release' }) === 'claude -n "zen release"');
    ok('first prompt is the positional argument',
        buildLaunchCommand('claude', { prompt: 'fix the popup' }) === 'claude "fix the popup"');
    ok('resume', buildLaunchCommand('claude', { resume: 'abc-123' }) === 'claude --resume abc-123');
    ok('continue', buildLaunchCommand('claude', { continueLast: true }) === 'claude --continue');
    ok('resume wins over continue (they are exclusive)',
        buildLaunchCommand('claude', { resume: 'abc', continueLast: true }) === 'claude --resume abc');
    ok('full line, in CLI order',
        buildLaunchCommand('claude', {
            model: 'opus', effort: 'xhigh', permissionMode: 'plan', name: 'audit', prompt: 'start here'
        }) === 'claude --model opus --effort xhigh --permission-mode plan -n "audit" "start here"');
    ok('the prompt stays LAST even when everything is set',
        /"start here"$/.test(buildLaunchCommand('claude', {
            model: 'opus', name: 'audit', prompt: 'start here'
        })));
    ok('resume keeps the tuning flags after it',
        buildLaunchCommand('claude', { resume: 'sid', model: 'sonnet' })
        === 'claude --resume sid --model sonnet');
}

// ---------- quoting: three shells read this line ----------
{
    ok('a double quote can never close the quoting', quoteArg('say "hi"') === '"say \'hi\'"');
    ok('backticks (PowerShell escape) are dropped', quoteArg('fix `code` now') === '"fix code now"');
    ok('newlines can not submit the line early', quoteArg('one\ntwo') === '"one two"');
    ok('whitespace is collapsed and trimmed', quoteArg('  a   b  ') === '"a b"');
    ok('$ and % survive — the user\'s own text is not mangled',
        quoteArg('cost is $5 and 10%') === '"cost is $5 and 10%"');
    ok('a quote-heavy prompt still yields exactly one argument',
        (buildLaunchCommand('claude', { prompt: 'he said "go" now' }).match(/"/g) || []).length === 2);
    ok('undefined is quoted as empty', quoteArg(undefined) === '""');
}

// ---------- defaults: explicit beats default, empty default changes nothing ----------
{
    const d = { model: 'sonnet', effort: 'low', permissionMode: 'acceptEdits' };
    ok('defaults fill what the launch left open',
        buildLaunchCommand('claude', withDefaults({}, d))
        === 'claude --model sonnet --effort low --permission-mode acceptEdits');
    ok('an explicit choice wins over the default',
        withDefaults({ model: 'opus' }, d).model === 'opus');
    ok('empty defaults change nothing', buildLaunchCommand('claude', withDefaults({}, {})) === 'claude');
    ok('undefined defaults change nothing',
        buildLaunchCommand('claude', withDefaults({}, undefined)) === 'claude');
    ok('name and prompt are per-launch, never defaulted',
        withDefaults({ name: 'x', prompt: 'y' }, d).name === 'x'
        && withDefaults({ name: 'x', prompt: 'y' }, d).prompt === 'y');
    ok('defaults reach a resume too',
        buildLaunchCommand('claude', withDefaults({ resume: 'sid' }, { model: 'opus' }))
        === 'claude --resume sid --model opus');
}

// ---------- validation: a typo fails here, not in the terminal ----------
{
    ok('valid values pass', validateLaunch({ effort: 'max', permissionMode: 'plan' }).length === 0);
    ok('empty values pass', validateLaunch({}).length === 0);
    ok('a bad effort is caught', /effort "turbo"/.test(validateLaunch({ effort: 'turbo' })[0]));
    ok('a bad permission mode is caught',
        /permission mode "yolo"/.test(validateLaunch({ permissionMode: 'yolo' })[0]));
    ok('the error lists what IS allowed',
        /acceptEdits/.test(validateLaunch({ permissionMode: 'yolo' })[0]));
    ok('resume + continue is rejected',
        validateLaunch({ resume: 'a', continueLast: true }).some(e => /mutually exclusive/.test(e)));
    ok('a free-text model is NOT rejected (tomorrow\'s model id is unknown today)',
        validateLaunch({ model: 'claude-something-6' }).length === 0);
}

// ---------- the offered vocabulary ----------
{
    ok('every effort choice is a documented CLI level',
        EFFORT_CHOICES.filter(c => c.id).map(c => c.id).join(',') === 'low,medium,high,xhigh,max');
    ok('every permission choice is a documented CLI mode',
        PERMISSION_CHOICES.filter(c => c.id).sort((a, b) => a.id.localeCompare(b.id)).map(c => c.id).join(',')
        === 'acceptEdits,auto,bypassPermissions,dontAsk,manual,plan');
    ok('bypassPermissions is flagged as the dangerous one',
        PERMISSION_CHOICES.find(c => c.id === 'bypassPermissions').label.indexOf('⚠') === 0);
    ok('every dimension offers "leave it alone" first',
        EFFORT_CHOICES[0].id === '' && PERMISSION_CHOICES[0].id === '');
    ok('models come from the user\'s own alias list',
        modelChoices(['haiku', 'opus']).map(c => c.id).join(',') === ',haiku,opus');
    ok('blank alias entries are ignored', modelChoices(['', '  ', 'opus']).length === 2);
    ok('a model list of one still offers Default', modelChoices([])[0].id === '');
}

// ---------- the one-line summary the picker shows ----------
{
    ok('nothing set reads as CLI defaults', describeLaunch({}) === 'CLI defaults');
    ok('summary lists what is set',
        describeLaunch({ model: 'opus', effort: 'high' }) === 'opus · effort high');
    ok('a first prompt is announced without dumping it',
        /with a first prompt/.test(describeLaunch({ prompt: 'a very long instruction …' })));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
