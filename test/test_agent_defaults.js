// U-29 / U-33 — what "Default" means for an agent on an engine.
//
// The complaint, verbatim: "I may have set that agent's default to sonnet for
// Claude, but if I open the same agent with Codex, what does Default still mean
// there, and which model does it correspond to? That part is a mystery."
//
// It was a mystery because the one per-agent default was written to
// `<agent>/.claude/settings.local.json` — a file only Claude Code reads. These
// assertions pin both halves of the fix: the default is per engine, and every
// answer names the layer it came from.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { agentKey, storedDefault, withAgentDefault, resolveDefault, defaultLabel } =
    require(path.join(__dirname, '..', 'out', 'core', 'agentDefaults.js'));

// ---------- one agent, one key ----------
{
    ok('a Windows path and its slash-flipped twin are one agent',
        agentKey('D:\\zone\\x') === agentKey('d:/zone/x'));
    ok('…and a trailing slash does not make a second one',
        agentKey('D:/zone/x/') === agentKey('D:/zone/x'));
    ok('nothing is not an agent', agentKey('  ') === '');
}

// ---------- the store ----------
{
    let store = {};
    store = withAgentDefault(store, 'D:\\zone\\dev', 'codex', { model: 'gpt-5.6-terra' });
    ok('a choice is kept', storedDefault(store, 'd:/zone/dev', 'codex').model === 'gpt-5.6-terra');
    ok('‼️ …for that engine ONLY — the mistake the whole item is about',
        storedDefault(store, 'D:\\zone\\dev', 'claude').model === ''
        && storedDefault(store, 'D:\\zone\\dev', 'agy').model === '');
    ok('…and for that agent only', storedDefault(store, 'D:/other', 'codex').model === '');

    store = withAgentDefault(store, 'D:\\zone\\dev', 'codex', { effort: 'high' });
    const both = storedDefault(store, 'D:/zone/dev', 'codex');
    ok('a second field does not wipe the first', both.model === 'gpt-5.6-terra' && both.effort === 'high');

    // ‼️ an empty value CLEARS, so the layer below applies again. Storing '' would
    // pin the answer to "nothing" for ever, which is not what an empty box means.
    store = withAgentDefault(store, 'D:/zone/dev', 'codex', { model: '' });
    ok('‼️ clearing a box clears the record rather than storing an empty one',
        storedDefault(store, 'D:/zone/dev', 'codex').model === ''
        && storedDefault(store, 'D:/zone/dev', 'codex').effort === 'high');
    store = withAgentDefault(store, 'D:/zone/dev', 'codex', { effort: '' });
    ok('…and the last one out leaves no empty husk in the settings file',
        Object.keys(store).length === 0);
    ok('an agent with no path changes nothing',
        Object.keys(withAgentDefault({}, '', 'codex', { model: 'x' })).length === 0);
}

// ---------- the resolution: the sentence the box prints ----------
{
    const L = 'Claude Code';
    const file = resolveDefault('claude', 'model', { agentFile: 'sonnet', farm: '', launch: 'opus', engineLabel: L });
    ok('Claude reads the agent\'s own settings file first', file.value === 'sonnet' && file.origin === 'agent-file');
    ok('…and says why that one is special', /Claude Code reads/.test(file.note) && /terminal/.test(file.note));

    // ‼️ THE BUG ITSELF. The same file must never answer for another engine.
    const codex = resolveDefault('codex', 'model', {
        agentFile: 'sonnet', farm: '', launch: '', engineLabel: 'Codex'
    });
    ok('‼️ a Claude settings file is NOT an answer for Codex',
        codex.value === '' && codex.origin === 'cli');
    ok('…and the box says the CLI decides, naming the engine',
        /Codex decides/.test(codex.note));

    const farm = resolveDefault('codex', 'model', {
        agentFile: 'sonnet', farm: 'gpt-5.6-terra', launch: 'opus', engineLabel: 'Codex'
    });
    ok('the per-engine store outranks the fleet-wide default',
        farm.value === 'gpt-5.6-terra' && farm.origin === 'farm');
    ok('‼️ …and admits it only applies to sessions Agent Farm starts',
        /passes it as --model/.test(farm.note) && /terminal will not have it/.test(farm.note));

    const fleet = resolveDefault('agy', 'effort', { farm: '', launch: 'high', engineLabel: 'Antigravity' });
    ok('the fleet-wide default is the next layer down',
        fleet.value === 'high' && fleet.origin === 'launch-defaults');
    ok('…and says it applies to every agent', /every agent/.test(fleet.note));

    const none = resolveDefault('gemini', 'model', { engineLabel: 'Gemini' });
    ok('nothing set anywhere is still an answer', none.origin === 'cli' && none.value === '');

    // ‼️ the word that started all this never appears alone again
    ok('‼️ "Default" names what it resolves to', defaultLabel(farm) === 'Default → gpt-5.6-terra');
    ok('…and says who decides when it resolves to nothing',
        defaultLabel(none) === 'Default (the CLI decides)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
