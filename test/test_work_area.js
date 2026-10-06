// B-30 — THE AGENTS' SCRATCH FOLDER IS A SETTING THE SYSTEM HOLDS. Agents found
// one folder named in one session and kept writing there. Now agentFarm.workArea
// (default ${temp}/agent_farm) is told to every session at start and resume
// (SessionStart additionalContext), carried as AGENT_FARM_WORKAREA, and a write
// into a folder the setting moved away from is refused by the PreToolUse hook.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const out = m => require(path.join(ROOT, 'out', 'core', m + '.js'));
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const W = out('workArea'), V = out('pathVars');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const TEMP = 'C:\\Users\\u\\AppData\\Local\\Temp';
const build = t => { const r = V.resolvePathVars(t, { temp: TEMP, home: 'C:\\Users\\u' }); return { ...r, value: r.ok ? path.win32.normalize(r.value) : '' }; };
const abs = p => path.win32.isAbsolute(p);

console.log('\n== resolving the folder ==');
{
    ok('${temp} is a variable the resolver knows, and it is listed for the settings page',
        V.resolvePathVars('${temp}/x', { temp: TEMP }).value === TEMP + '/x' && V.PATH_VARS.some(v => v.name === 'temp'));
    const d = W.resolveWorkArea('', build, abs);
    ok('nothing set: the built-in ${temp}/agent_farm, no complaint',
        d.path === TEMP + '\\agent_farm' && d.source === 'default' && d.why === '' && d.template === W.WORK_AREA_DEFAULT);
    ok('the default typed back in is still the default', W.resolveWorkArea(W.WORK_AREA_DEFAULT, build, abs).source === 'default');
    const s = W.resolveWorkArea('D:\\Scratch', build, abs);
    ok('an absolute folder is used as it is', s.path === 'D:\\Scratch' && s.source === 'setting' && s.why === '');
    const rel = W.resolveWorkArea('scratch', build, abs);
    ok('a relative folder is refused and the default used, saying why',
        rel.path === TEMP + '\\agent_farm' && rel.source === 'default' && /not an absolute folder/.test(rel.why));
    const bad = W.resolveWorkArea('${nope}/x', build, abs);
    ok('an unknown variable falls back the same way, naming the variable', bad.source === 'default' && /\$\{nope\}/.test(bad.why));
}

console.log('\n== the retired list ==');
{
    let st = W.nextWorkAreaState(undefined, 'D:\\A', 1, true);
    ok('a first resolution retires nothing', st.last === 'D:\\A' && st.retired.length === 0);
    st = W.nextWorkAreaState(st, 'D:\\A\\', 2, true);
    ok('the same folder spelt differently is not a change', st.retired.length === 0);
    st = W.nextWorkAreaState(st, 'D:\\B', 3, true);
    ok('a change retires the folder in force before it', st.last === 'D:\\B' && st.retired.length === 1 && st.retired[0].path === 'D:\\A');
    ok('running it again (another window) changes nothing', JSON.stringify(W.nextWorkAreaState(st, 'D:\\B', 4, true)) === JSON.stringify(st));
    st = W.nextWorkAreaState(st, 'd:/a', 5, true);
    ok('coming back to a retired folder takes it off the list and retires the other',
        st.retired.length === 1 && st.retired[0].path === 'D:\\B');
    const h = W.retireWorkArea(st, 'D:\\Temporary Files\\WorkArea', 'd:/a', 6, true);
    ok('a habit folder is retired by hand', !h.refusal && h.state.retired.some(r => r.path === 'D:\\Temporary Files\\WorkArea'));
    ok('the folder in force, or one inside it, cannot be retired',
        !!W.retireWorkArea(st, 'D:\\A', 'd:/a', 6, true).refusal && !!W.retireWorkArea(st, 'D:\\A\\sub', 'd:/a', 6, true).refusal);
    ok('forget takes one off', W.forgetWorkArea(h.state, 'd:/temporary files/workarea', true).retired.length === 1);
    let big = { retired: [] };
    for (let i = 0; i < 20; i++) { big = W.nextWorkAreaState(big, 'D:\\F' + i, i, true); }
    ok('the list is capped', big.retired.length === W.WORK_AREA_RETIRED_CAP && big.retired[big.retired.length - 1].path === 'D:\\F18');
}

console.log('\n== the guard ==');
{
    const retired = [{ path: 'D:\\Temporary Files\\WorkArea', since: 1 }];
    const cur = 'C:\\T\\agent_farm';
    const v = (tool, input, r = retired, c = cur) => W.workAreaVerdict({ tool, input, current: c, retired: r, win: true });
    const w = v('Write', { file_path: 'D:/temporary files/workarea/x.txt' });
    ok('a Write into a retired folder is refused, naming the folder in force and the variable',
        w && w.id === 'write' && w.reason.includes(cur) && w.reason.includes(W.WORK_AREA_ENV) && !w.reason.includes(W.WORK_AREA_ESCAPE));
    ok('Edit and NotebookEdit are held too', !!v('Edit', { file_path: 'D:\\Temporary Files\\WorkArea\\a.js' }) && !!v('NotebookEdit', { notebook_path: 'D:\\Temporary Files\\WorkArea\\n.ipynb' }));
    ok('a Write anywhere else runs', !v('Write', { file_path: 'D:\\Temporary Files\\WorkArea2\\x' }) && !v('Write', { file_path: cur + '\\x' }));
    ok('Read is never held', !v('Read', { file_path: 'D:\\Temporary Files\\WorkArea\\x' }));
    const sh = v('Bash', { command: 'node x.js > "/d/Temporary Files/WorkArea/out.log"' });
    ok('a shell command naming it (Git Bash spelling) is refused and offered the escape', sh && sh.id === 'shell' && sh.reason.includes(W.WORK_AREA_ESCAPE));
    ok('…and runs with the escape', !v('Bash', { command: 'cat "D:/Temporary Files/WorkArea/a" # af:allow-workarea' }));
    ok('a longer folder name that only starts the same is not a mention', !v('Bash', { command: 'ls "D:/Temporary Files/WorkAreaOld"' }));
    ok('PowerShell is held the same way', !!v('PowerShell', { command: 'Set-Location "D:\\Temporary Files\\WorkArea"' }));
    const nest = [{ path: 'C:\\T', since: 1 }];
    ok('the folder in force inside a retired one always runs',
        !v('Write', { file_path: cur + '\\x' }, nest) && !v('Bash', { command: 'ls "C:/T/agent_farm/x"' }, nest) && !!v('Bash', { command: 'ls C:/T/other' }, nest));
    ok('nothing retired: nothing held', !v('Write', { file_path: 'D:\\Temporary Files\\WorkArea\\x' }, []));
    ok('posix paths keep their case', !W.workAreaVerdict({ tool: 'Write', input: { file_path: '/tmp/A/x' }, current: '/w', retired: [{ path: '/tmp/a', since: 1 }], win: false }));
}

console.log('\n== telling the session ==');
{
    const t = W.workAreaStartText('C:\\T\\agent_farm');
    ok('the start line names the folder, the setting and the variable',
        t.includes('C:\\T\\agent_farm') && t.includes(W.WORK_AREA_SETTING) && t.includes(W.WORK_AREA_ENV));
    const b = JSON.parse(W.startContextBody('SessionStart', t));
    ok('it rides in the SessionStart additionalContext shape', b.hookSpecificOutput.hookEventName === 'SessionStart' && b.hookSpecificOutput.additionalContext === t);
    ok('no other event is answered with it', W.startContextBody('PreToolUse', t) === undefined && W.startContextBody('SessionStart', '') === undefined);
    ok('the settings row says what is in force and what is refused',
        /In force: C:\\T — Writes refused in: D:\\Old/.test(W.workAreaInForceNote({ path: 'C:\\T', why: '' }, [{ path: 'D:\\Old', since: 1 }])));
}

console.log('\n== wired end to end ==');
{
    const ext = src('extension.ts');
    const live = src('core/live.ts');
    ok('the listener answers SessionStart through startContext, after a refusal and before the signal',
        /cfg\.toolGuard\?\.\(payload\)\s*\?\? cfg\.startContext\?\.\(payload\)\s*\?\? hookResponseBody/.test(live));
    ok('the host hands it the start line, creating the folder first',
        /startContext: \(p\) => startContextBody\(p\.hook_event_name, \[\s*p\.hook_event_name === 'SessionStart' && ensureWorkArea\(\) \? workAreaStartText\(workArea\.path\) : ''/.test(ext));
    ok('the tool guard asks the work-area verdict and logs what it stops', /workAreaVerdict\(\{/.test(ext) && /workAreaGuardLog\.add\(/.test(ext));
    ok('the folder goes into this host\'s environment and every terminal\'s',
        /process\.env\[WORK_AREA_ENV\] = r\.path/.test(ext) && /environmentVariableCollection\.replace\(WORK_AREA_ENV, r\.path\)/.test(ext));
    ok('a change of the setting re-resolves it', /affectsConfiguration\(WORK_AREA_SETTING\)\) \{ refreshWorkArea\(\); \}/.test(ext));
    ok('the bridge answers farm.workArea and farm.health carries the line', /op: 'farm\.workArea'/.test(ext) && /workArea: \{ path: workArea\.path/.test(ext));
    ok('the settings row carries the in-force note', /key === WORK_AREA_SETTING\) \{ return workAreaInForceNote/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    const s = props['agentFarm.workArea'];
    ok('the setting: default ${temp}/agent_farm, one value for the machine, a folder picker',
        s && s.default === W.WORK_AREA_DEFAULT && s.scope === 'application' && s['x-af-browse'] === 'folder');
    ok('it is a flex point', /id: 'workArea'[^\n]*default: '\$\{temp\}\/agent_farm'/.test(fs.readFileSync(path.join(ROOT, 'media', 'afFlex.js'), 'utf8')));
}

console.log(`test_work_area: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
