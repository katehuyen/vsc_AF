// X-121 (U-100) — what the ORCHESTRATOR actually launches with.
//
// ‼️ THE DEFECT THIS MEASURES IS A REPORT, NOT A CRASH. The planner ran fine
// before this; what was wrong was that two pieces of code described the same
// command line and neither had read it. The preview answered `origin: cli` —
// "nobody set it, the CLI decided" — while `agentFarm.taskExtraArgs` or the
// lead folder's own `.claude/settings.json` were naming a model on that very
// line, and the launch pasted the extra args down and then appended its own
// `--model`, so the flag could appear twice with a precedence nobody had
// measured. So every assertion here is about AGREEMENT and about honesty:
// which rung answered, where it said so, and what the CLI is actually handed.
const path = require('path');
const {
    describePlannerLaunch, plannerCommand, resolvePlannerLaunch, splitArgTokens
} = require(path.join(__dirname, '..', 'out', 'core', 'plannerLaunch.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const LOCAL = 'D:/agents/lead/.claude/settings.local.json';
const PROJECT = 'D:/agents/lead/.claude/settings.json';
const USER = 'C:/Users/x/.claude/settings.json';
const layers = (over) => [
    { id: 'managed', file: 'C:/ProgramData/ClaudeCode/managed-settings.json', ...(over.managed !== undefined ? { text: over.managed } : {}) },
    { id: 'local', file: LOCAL, ...(over.local !== undefined ? { text: over.local } : {}) },
    { id: 'project', file: PROJECT, ...(over.project !== undefined ? { text: over.project } : {}) },
    { id: 'user', file: USER, ...(over.user !== undefined ? { text: over.user } : {}) }
];

// ---------------------------------------------------------------- tokenizing
console.log('\n-- the args string is read, not scanned');
ok('a quoted value is one token', splitArgTokens('--model "claude opus 5" --x')
    .join('|') === '--model|claude opus 5|--x');
ok('an empty string is no tokens', splitArgTokens('   ').length === 0);
ok('an empty quoted value survives as an empty token',
    splitArgTokens('--foo "" --bar').join('|') === '--foo||--bar');

// ---------------------------------------------------------------- the ladder
console.log('\n-- the ladder: mission, extra args, settings, then nobody');
{
    const r = resolvePlannerLaunch({ plannerModel: 'opus', plannerEffort: 'high' }, '', layers({}));
    ok('rung 1 — what the mission typed', r.model.value === 'opus' && r.model.origin === 'mission'
        && r.effort.value === 'high' && r.effort.origin === 'mission');
    ok('…and the mission rung needs no address', !r.model.source && !r.effort.source);
}
{
    const r = resolvePlannerLaunch({}, '--model sonnet --effort low', layers({}));
    ok('‼️ rung 2 — an empty box over extra args is NOT "the CLI decided"',
        r.model.value === 'sonnet' && r.model.origin === 'extra-args'
        && r.effort.value === 'low' && r.effort.origin === 'extra-args');
    ok('…and the flag is quoted back verbatim as the source',
        r.model.source === '--model sonnet' && r.effort.source === '--effort low');
}
{
    const r = resolvePlannerLaunch({}, '--model=haiku', layers({}));
    ok('the `--flag=value` form is read too', r.model.value === 'haiku'
        && r.model.origin === 'extra-args' && r.model.source === '--model=haiku');
}
{
    const r = resolvePlannerLaunch({}, '-m haiku', layers({}));
    ok('…and the short form, because it is the same flag on the same line',
        r.model.value === 'haiku' && r.model.origin === 'extra-args');
}
{
    const r = resolvePlannerLaunch({}, '', layers({ local: JSON.stringify({ model: 'sonnet' }) }));
    ok('‼️ rung 3 — the lead folder\'s own Claude settings, which the CLI reads itself',
        r.model.value === 'sonnet' && r.model.origin === 'settings' && r.model.source === LOCAL);
}
{
    // ‼️ FIRST LAYER WINS, IN THE CLI'S OWN ORDER — the same rule
    // `resolveEffectivePermission` follows, from the same path list.
    const r = resolvePlannerLaunch({}, '', layers({
        local: JSON.stringify({ model: 'local-one' }),
        project: JSON.stringify({ model: 'project-one' }),
        user: JSON.stringify({ model: 'user-one' })
    }));
    ok('local beats project beats user', r.model.value === 'local-one' && r.model.source === LOCAL);
    const u = resolvePlannerLaunch({}, '', layers({ user: JSON.stringify({ model: 'user-one' }) }));
    ok('…and the user layer answers when the folder says nothing',
        u.model.value === 'user-one' && u.model.source === USER);
}
{
    const r = resolvePlannerLaunch({}, '', layers({}));
    ok('rung 4 — nothing anywhere, and `cli` finally means it',
        r.model.origin === 'cli' && r.model.value === undefined
        && r.effort.origin === 'cli' && r.effort.value === undefined);
}
{
    // ‼️ EFFORT HAS NO SETTINGS RUNG. Claude Code's settings.json catalogues a
    // `model` key and no effort key, so a file that names one is not a source —
    // inventing a rung for it would be a layer that does not exist.
    const r = resolvePlannerLaunch({}, '', layers({ local: JSON.stringify({ model: 'sonnet', effort: 'high' }) }));
    ok('‼️ a settings file cannot set the planner\'s effort, and does not pretend to',
        r.model.origin === 'settings' && r.effort.origin === 'cli' && r.effort.value === undefined);
}

// ---------------------------------------------------------- the conflict
console.log('\n-- the conflict is resolved by removal, not by a bet on precedence');
{
    const r = resolvePlannerLaunch(
        { plannerModel: 'opus', plannerEffort: 'high' },
        '--verbose --model sonnet --effort low --add-dir D:/x',
        layers({}));
    ok('the mission wins', r.model.value === 'opus' && r.effort.value === 'high');
    ok('‼️ …and the displaced flags come OFF the line, so the CLI sees each once',
        r.extraArgs === '--verbose --add-dir D:/x');
    ok('…named, rather than dropped silently',
        r.displaced.join(' | ') === '--model sonnet | --effort low');
    const cmd = plannerCommand({ launch: r, disallowedTools: 'Bash', maxTurns: 15 });
    ok('‼️ the built command carries exactly one --model and one --effort',
        (cmd.match(/--model/g) || []).length === 1 && (cmd.match(/--effort/g) || []).length === 1
        && cmd.includes('--model opus') && cmd.includes('--effort high'));
}
{
    const r = resolvePlannerLaunch({}, '--model sonnet --verbose', layers({}));
    ok('nothing is displaced when the mission said nothing',
        r.displaced.length === 0 && r.extraArgs === '--model sonnet --verbose');
    const cmd = plannerCommand({ launch: r, disallowedTools: 'Bash', maxTurns: 15 });
    ok('‼️ …and the extra args\' own flag is not duplicated back onto the line',
        (cmd.match(/--model/g) || []).length === 1 && cmd.includes('--model sonnet'));
}
{
    // ‼️ A SETTINGS VALUE MUST NOT BECOME A FLAG. Passing a file's own value
    // back on the command line is a second source of truth silently overriding
    // a file the user may edit by hand — the same carve-out the worker ladder
    // makes for Claude.
    const r = resolvePlannerLaunch({}, '', layers({ local: JSON.stringify({ model: 'sonnet' }) }));
    const cmd = plannerCommand({ launch: r, disallowedTools: 'Bash', maxTurns: 15 });
    ok('‼️ a model that came from a settings file reaches no --model flag',
        !cmd.includes('--model') && r.model.value === 'sonnet');
}
{
    const r = resolvePlannerLaunch({ plannerModel: 'opus; rm -rf /' }, '--model sonnet', layers({}));
    ok('‼️ a mission value that is not one bare word is dropped, and the ladder continues under it',
        r.model.value === 'sonnet' && r.model.origin === 'extra-args' && r.displaced.length === 0);
}
{
    const r = resolvePlannerLaunch({}, '--model', layers({ local: JSON.stringify({ model: 'sonnet' }) }));
    ok('a flag with no value names nothing and is left on the line untouched',
        r.model.origin === 'settings' && r.extraArgs === '--model');
}
{
    const r = resolvePlannerLaunch({}, '--model a --model b', layers({}));
    ok('‼️ a repeated flag reports the LAST one — the end of the line the CLI reads',
        r.model.value === 'b');
}
{
    const r = resolvePlannerLaunch({}, '', layers({ local: '{ not json' }));
    ok('an unparseable settings file is skipped, not fatal', r.model.origin === 'cli');
    const arr = resolvePlannerLaunch({}, '', [{ id: 'local', file: LOCAL, text: '[]' }]);
    ok('…and a file that parses but is not an object is not a source', arr.model.origin === 'cli');
    const blank = resolvePlannerLaunch({}, '', [{ id: 'local', file: LOCAL, text: JSON.stringify({ model: '  ' }) }]);
    ok('…nor is a blank model key', blank.model.origin === 'cli');
}

// -------------------------------------------------- fresh, resume, and one command
console.log('\n-- the fresh round and the resumed round are the same launch');
{
    const spec = { plannerModel: 'opus' };
    const extra = '--verbose';
    const ls = layers({ local: JSON.stringify({ model: 'sonnet' }) });
    // ‼️ THE RESOLVER TAKES NO "IS THIS A RESUME" FLAG, and that absence is the
    // guarantee X-122 bought: the planner's pair is rebuilt identically on
    // every round. Two calls, one answer.
    const a = resolvePlannerLaunch(spec, extra, ls);
    const b = resolvePlannerLaunch(spec, extra, ls);
    ok('two resolutions of one mission are the same answer',
        JSON.stringify(a) === JSON.stringify(b));
    const fresh = plannerCommand({
        launch: a, disallowedTools: 'Bash', maxTurns: 15, contextFile: 'D:/brief.md'
    });
    const resumed = plannerCommand({
        launch: b, disallowedTools: 'Bash', maxTurns: 15, resumeSessionId: 'ses_1'
    });
    ok('the fresh round carries the project brief and no --resume',
        fresh.includes('--append-system-prompt-file "D:/brief.md"') && !fresh.includes('--resume'));
    ok('‼️ the resumed round carries --resume and NOT the brief again',
        resumed.includes('--resume ses_1') && !resumed.includes('--append-system-prompt-file'));
    ok('…and both run on the same model, from the same rung',
        fresh.includes('--model opus') && resumed.includes('--model opus'));
    ok('both are the same shape otherwise',
        fresh.includes('--disallowedTools "Bash"') && resumed.includes('--disallowedTools "Bash"')
        && fresh.endsWith('-p --output-format json') && resumed.endsWith('-p --output-format json'));
    ok('a context file with a quote in it is refused rather than escaped into the shell',
        !plannerCommand({ launch: a, disallowedTools: 'B', maxTurns: 1, contextFile: 'D:/a"b.md' })
            .includes('append-system-prompt-file'));
}

// ------------------------------------------------------------------ the line
console.log('\n-- one line for a narrow surface');
{
    ok('nothing resolved is no row at all',
        describePlannerLaunch(resolvePlannerLaunch({}, '', [])) === '');
    ok('a mission override needs no attribution',
        describePlannerLaunch(resolvePlannerLaunch({ plannerModel: 'opus' }, '', [])) === 'model opus');
    ok('…every other rung is named',
        describePlannerLaunch(resolvePlannerLaunch({}, '--model sonnet --effort low', []))
        === 'model sonnet (extra-args) · effort low (extra-args)');
}

// ------------------------------------------------- the two callers agree
console.log('\n-- the preview and the launch climb the same ladder');
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('there is ONE place that reads the layers off disk',
        (src.match(/const plannerLayersFor =/g) || []).length === 1
        && (src.match(/const plannerLaunchFor =/g) || []).length === 1);
    ok('‼️ the layer LIST is the CLI\'s own, not a second copy of the same file names',
        /permissionLayerPaths\(dir, os\.homedir\(\)\)/.test(src));
    ok('‼️ the launch and the preview both call it',
        (src.match(/plannerLaunchFor\(spec\)/g) || []).length === 2);
    ok('…and the command is built in one place, by the module',
        (src.match(/plannerCommand\(\{/g) || []).length === 1
        && !/const command = `claude /.test(src));
    ok('‼️ the preview no longer hard-codes the origin as `cli`',
        !/model: plannerModel \? 'mission' : 'cli'/.test(src)
        && /model: plannerRun\.model\.origin/.test(src));

    // ‼️ M-29 — AND THE ANSWER IS KEPT, because a run is read after it started.
    // Re-climbing this ladder on a reading surface would answer a question
    // about last week out of this morning's `taskExtraArgs` and settings.
    ok('‼️ M-29 — the launcher writes its resolved answer onto the run',
        /run\.plannerLaunch = launch/.test(src));
    ok('…and missions.status reports that record beside what the mission declared',
        /launch: r\.plannerLaunch \?/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
