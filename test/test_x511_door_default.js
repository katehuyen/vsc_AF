'use strict';
// X-511 — THE DOOR'S DEFAULT IS THE MANIFEST'S. When the registry leaves a declared key unanswered (X-84) and no
// settings file sets it, or a file sets it in the wrong shape and is refused, core/settingsDoor.ts answers with the
// manifest's own default — what the registry would have said — instead of undefined, which handed each reader's
// private fallback in (agentRoots read [] there: no agent root at all). The refusal's "using the default" is now true.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

const ANSWERS = {};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            workspace: {
                getConfiguration: () => ({ get: k => ANSWERS[k] }),
                workspaceFolders: [], workspaceFile: undefined,
                onDidChangeWorkspaceFolders: () => ({ dispose() { } })
            }
        };
    }
    return origLoad.apply(this, arguments);
};
const D = require(path.join(ROOT, 'out', 'core', 'settingsDoor.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x511-'));
try {
    const user = path.join(dir, 'User');
    fs.mkdirSync(user, { recursive: true });
    const props = {
        'agentFarm.roots': { type: 'array', default: ['/a/root'] },
        'agentFarm.port': { type: 'number', default: 8377 },
        'agentFarm.speak': { type: 'object', default: { voice: 'x', rate: 1 } },
        'agentFarm.name': { type: 'string', default: 'farm' }
    };
    const subs = [];
    D.installSettingsDoor({
        extension: { packageJSON: { contributes: { configuration: { properties: props } } } },
        globalStorageUri: { fsPath: path.join(user, 'globalStorage', 'muvusoft.agent-farm') },
        subscriptions: subs
    });
    fs.writeFileSync(path.join(user, 'settings.json'), JSON.stringify({ 'agentFarm.port': 'eighty', 'agentFarm.name': 'mine' }), 'utf8');

    ANSWERS['agentFarm.port'] = 9000;
    ok('the registry\'s answer comes first', D.cfgValueRaw('agentFarm.port') === 9000);
    delete ANSWERS['agentFarm.port'];

    const roots = D.cfgValueRaw('agentFarm.roots');
    ok('‼️ a dropped key no file sets reads as the manifest\'s default, not undefined',
        Array.isArray(roots) && roots.join() === '/a/root' && D.cfgRefusal('agentFarm.roots') === undefined);
    ok('‼️ …and a reader\'s own fallback no longer steps in', JSON.stringify(D.cfgValue('agentFarm.roots', [])) === '["/a/root"]'
        && D.afConfig().get('roots', []).join() === '/a/root');
    roots.push('/edited');
    const speak = D.cfgValueRaw('agentFarm.speak');
    speak.voice = 'edited';
    ok('the default handed out is a copy: a reader that edits it changes nothing for the next',
        D.cfgValueRaw('agentFarm.roots').join() === '/a/root' && D.cfgValueRaw('agentFarm.speak').voice === 'x' && props['agentFarm.roots'].default.length === 1);

    ok('‼️ a file value in the wrong shape is refused, and the default it says it uses is the manifest\'s',
        D.cfgValueRaw('agentFarm.port') === 8377 && /using the default/.test(D.cfgRefusal('agentFarm.port') || ''));
    ok('a file value in the right shape is used', D.cfgValueRaw('agentFarm.name') === 'mine' && D.cfgRefusal('agentFarm.name') === undefined);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
