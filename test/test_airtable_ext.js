// Airtable module, extension half: the store file as the SINGLE source of
// truth (load/save round-trip, legacy-key tolerance, patch merge), machine-
// independent tokenization for the ~/.claude.json registration, staging to
// globalStorage, registration state detection (up-to-date vs version-pinned),
// register/unregister round-trip on a fixture home, and the probe-side ${VAR}
// expansion that makes the probe launch exactly what claude would.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// Mock the vscode import so the compiled core modules load in plain node.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const air = require(path.resolve(__dirname, '../out/core/airtable.js'));
const probe = require(path.resolve(__dirname, '../out/core/mcpProbe.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-airext-'));

// ---------------------------------------------------------------- store (single source of truth)

const storeDir = path.join(tmp, 'store');
ok('missing store reads as empty', air.loadStore(storeDir).databaseRoots.length === 0);
air.saveStore(storeDir, { databaseRoots: ['X:/data/engines'], defaultInstance: 'alpha' });
const s1 = air.loadStore(storeDir);
ok('save→load round-trips', s1.databaseRoots[0] === 'X:/data/engines' && s1.defaultInstance === 'alpha');
air.saveStore(storeDir, { defaultLang: 'EN' });
const s2 = air.loadStore(storeDir);
ok('patch merges — earlier keys survive', s2.databaseRoots[0] === 'X:/data/engines' && s2.defaultLang === 'EN');
fs.writeFileSync(path.join(storeDir, 'airtable-config.json'),
    JSON.stringify({ roots: ['X:/old'], mediaRoots: ['Y:/m'] }));
ok('legacy "roots" key still reads', air.loadStore(storeDir).databaseRoots[0] === 'X:/old');
air.saveStore(storeDir, { databaseRoots: ['%USERPROFILE%\\data'] });
ok('env tokens in stored roots expand on demand',
    air.expandedDatabaseRoots(air.loadStore(storeDir))[0].toLowerCase() === (process.env.USERPROFILE + '\\data').toLowerCase());

// ---------------------------------------------------------------- one folder at a time (B-16)
// The page's + Add / remove and airtable.folders.add / .remove are one act:
// both go through these two, so "already listed" means the same on both.
{
    const dir = path.join(tmp, 'folders');
    air.saveStore(dir, { databaseRoots: ['D:\\zone\\db'], mediaRoots: [], defaultInstance: 'keep-me' });
    const dup = air.addStoreFolder(dir, 'databaseRoots', 'd:/ZONE/db');
    ok('‼️ a folder already listed (other case, other slash) is not doubled',
        dup.added === false && air.loadStore(dir).databaseRoots.length === 1);
    const add = air.addStoreFolder(dir, 'mediaRoots', 'E:\\media');
    ok('a new folder is appended to its own list only',
        add.added && add.store.mediaRoots.join() === 'E:\\media' && air.loadStore(dir).databaseRoots.length === 1);
    air.addStoreFolder(dir, 'databaseRoots', 'F:\\more');
    ok('…after the ones already there', air.loadStore(dir).databaseRoots.join('|') === 'D:\\zone\\db|F:\\more');
    const rm = air.removeStoreFolder(dir, 'databaseRoots', 'd:/zone/DB');
    ok('remove matches the same way add refuses a duplicate',
        rm.removed && air.loadStore(dir).databaseRoots.join() === 'F:\\more');
    const none = air.removeStoreFolder(dir, 'mediaRoots', 'Z:\\never');
    ok('…and says so when the folder is not listed, writing nothing',
        none.removed === false && air.loadStore(dir).mediaRoots.join() === 'E:\\media');
    ok('other keys survive a folder write', air.loadStore(dir).defaultInstance === 'keep-me');

    const src = (f) => fs.readFileSync(path.resolve(__dirname, '..', 'src', f), 'utf8');
    const page = src('panels/airtablePanel.ts');
    ok('‼️ the page adds and removes through the shared core',
        /addStoreFolder\(this\.deps\.storageDir, key, folder\)/.test(page)
        && /removeStoreFolder\(this\.deps\.storageDir, key, value\)/.test(page));
    const ext = src('extension.ts');
    const body = (op) => { const at = ext.indexOf(`op: '${op}'`); return at < 0 ? '' : ext.slice(at, ext.indexOf('\n        },', at)); };
    ok('airtable.folders.add is registered on the same core', /addStoreFolder\(airtableStorage/.test(body('airtable.folders.add')));
    ok('…and refuses an engine folder with no instance unless anyway:true, the page\'s own question',
        /validateDatabaseRoot\(/.test(body('airtable.folders.add')) && /anyway === true/.test(body('airtable.folders.add')));
    ok('airtable.folders.remove is registered on the same core', /removeStoreFolder\(airtableStorage/.test(body('airtable.folders.remove')));
}

// ---------------------------------------------------------------- expandMcpConfig (probe side)

const env = { APPDATA: 'C:\\Users\\demo\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\demo', X: 'val' };
const expanded = probe.expandMcpConfig({
    command: 'node',
    args: ['${APPDATA}\\Code\\srv\\index.js', '%X%', '${env:X}', '${NOPE_UNSET}'],
    env: { CFG: '${USERPROFILE}\\cfg.json' },
    url: undefined
}, env);
ok('${VAR} expands in args', expanded.args[0] === 'C:\\Users\\demo\\AppData\\Roaming\\Code\\srv\\index.js');
ok('%VAR% and ${env:VAR} expand', expanded.args[1] === 'val' && expanded.args[2] === 'val');
ok('unknown variable stays visible', expanded.args[3] === '${NOPE_UNSET}');
ok('env values expand too', expanded.env.CFG === 'C:\\Users\\demo\\cfg.json');

// ---------------------------------------------------------------- tokenize / expand

const tok = air.tokenizeForClaude('C:\\Users\\demo\\AppData\\Roaming\\Code\\User\\globalStorage\\x\\mcp\\airtable\\index.js', env);
ok('APPDATA wins over USERPROFILE (longest root)', tok.startsWith('${APPDATA}'));
ok('outside any root → unchanged', air.tokenizeForClaude('D:\\elsewhere\\a.js', env) === 'D:\\elsewhere\\a.js');
ok('expandClaudeVars round-trips', probe.expandMcpConfig({ command: tok }, env).command.toLowerCase()
    .includes('globalstorage'));

// ---------------------------------------------------------------- staging

const extPath = path.join(tmp, 'ext');
fs.mkdirSync(path.join(extPath, 'out', 'mcp', 'airtable'), { recursive: true });
for (const f of ['index.js', 'engine.js', 'tools.js']) {
    fs.writeFileSync(path.join(extPath, 'out', 'mcp', 'airtable', f), '// v1 ' + f);
}
const storage = path.join(tmp, 'storage');
const st1 = air.stageMcpServer(extPath, storage, '3.0.0');
ok('first staging copies + stamps', st1.updated && fs.existsSync(path.join(st1.dir, 'index.js'))
    && fs.readFileSync(path.join(st1.dir, '.version'), 'utf8') === '3.0.0');
const st2 = air.stageMcpServer(extPath, storage, '3.0.0');
ok('same version → no restage', !st2.updated);
fs.writeFileSync(path.join(extPath, 'out', 'mcp', 'airtable', 'index.js'), '// v2 index.js');
const st3 = air.stageMcpServer(extPath, storage, '3.1.0');
ok('new version restages the files', st3.updated
    && fs.readFileSync(path.join(st3.dir, 'index.js'), 'utf8').includes('v2'));

// ---------------------------------------------------------------- registration state

const home = path.join(tmp, 'home');
fs.mkdirSync(home, { recursive: true });

ok('no .claude.json → not registered', air.registrationState(storage, home).registered === false);

// old, version-pinned registration (the exact failure the staging exists to kill)
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
    mcpServers: {
        airtable: { command: 'node', args: ['C:\\Users\\demo\\.vscode\\extensions\\muvusoft.agent-farm-2.87.0\\out\\mcp\\airtable\\index.js'] }
    },
    projects: { 'D:/keep': { history: [1, 2, 3] } }
}, null, 2));
const pinned = air.registrationState(storage, home);
ok('version-pinned path detected as needing repair', pinned.registered && !pinned.upToDate
    && pinned.currentPath.includes('2.87.0'));

// register → points at the staged copy (tokens intact in the file, expanded for compare)
ok('registerMcp writes', air.registerMcp(storage, home) === true);
const after = air.registrationState(storage, home);
ok('after register: up to date', after.registered && after.upToDate);
const rawFile = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
ok('registration carries the AIRTABLE_MCP_CONFIG env', !!rawFile.mcpServers.airtable.env.AIRTABLE_MCP_CONFIG);
ok('other keys in .claude.json survive', rawFile.projects['D:/keep'].history.length === 3);
ok('safety backup taken', fs.existsSync(path.join(home, '.claude.json.airtable-bak')));

ok('unregister removes only our server', air.unregisterMcp(home) === true
    && !('airtable' in JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers));

// desired registration shape
const want = air.desiredRegistration(storage);
ok('desired registration = node + single script arg', want.command === 'node' && want.args.length === 1
    && want.args[0].endsWith('index.js'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
