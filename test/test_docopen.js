// Doc-open modes — the shared "open with" for report/answer .md links (compiled
// core/docopen.js, pure): mode coercion, the module-store round-trip, the
// obsidian:// URI, the space-safe custom-app argv builder, and the §19.C bridge
// ops (docopen.get / docopen.set) dispatched through a real registry. The
// vscode-side launcher (panels/openDoc.ts) is not exercised here — it needs the
// VS Code host — but every decision it depends on lives in these pure helpers.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    DocOpenStore, DOC_OPEN_MODES, DEFAULT_DOC_OPEN_CONFIG, coerceMode,
    parseDocOpenConfig, obsidianUri, buildCustomArgv, registerDocOpenOps
} = require(path.join(__dirname, '..', 'out', 'core', 'docopen.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- coercion + parse ----------
{
    ok('modes are the four expected', DOC_OPEN_MODES.join() === 'vscode,preview,obsidian,custom');
    ok('coerceMode keeps a known mode', coerceMode('obsidian') === 'obsidian');
    ok('coerceMode is case-insensitive', coerceMode('PREVIEW') === 'preview');
    ok('coerceMode falls back on junk', coerceMode('nope') === 'vscode' && coerceMode(undefined) === 'vscode');
    ok('coerceMode honours a custom fallback', coerceMode('nope', 'custom') === 'custom');

    const def = parseDocOpenConfig(null);
    ok('parse of nothing → defaults', def.defaultMode === 'vscode' && def.customArgs === '{file}' && def.customCommand === '');
    const p = parseDocOpenConfig({ defaultMode: 'custom', customCommand: '  typora.exe  ', customArgs: '' });
    ok('parse trims command + empty args reverts to {file}', p.defaultMode === 'custom' && p.customCommand === 'typora.exe' && p.customArgs === '{file}');
    ok('parse rejects a bad mode → vscode', parseDocOpenConfig({ defaultMode: 'zzz' }).defaultMode === 'vscode');
}

// ---------- obsidian URI ----------
{
    const u = obsidianUri('D:\\zone\\know\\note\\obsidian\\01_INBOX\\r.md');
    ok('obsidian uri uses the path form', u.indexOf('obsidian://open?path=') === 0);
    ok('backslashes normalised + encoded', u.indexOf('D%3A%2Fzone%2Fknow') >= 0 && u.indexOf('\\') < 0);
    ok('spaces in the path are encoded', obsidianUri('D:/a b/c d.md').indexOf('a%20b') >= 0);
}

// ---------- custom argv (space-safe, no shell) ----------
{
    const withSpaces = 'D:\\my reports\\a b.md';
    const argv = buildCustomArgv('{file}', withSpaces);
    ok('{file} yields ONE argv entry even with spaces', argv.length === 1 && argv[0] === withSpaces);
    const argv2 = buildCustomArgv('--new-window {file}', withSpaces);
    ok('flags stay separate tokens; file stays whole', argv2.length === 2 && argv2[0] === '--new-window' && argv2[1] === withSpaces);
    const argv3 = buildCustomArgv('--file={file}', withSpaces);
    ok('embedded {file} keeps the token intact', argv3.length === 1 && argv3[0] === '--file=' + withSpaces);
    const argv4 = buildCustomArgv('--no-placeholder', withSpaces);
    ok('a template without {file} still appends the file', argv4.length === 2 && argv4[1] === withSpaces);
    const argv5 = buildCustomArgv('', withSpaces);
    ok('empty template falls back to just the file', argv5.length === 1 && argv5[0] === withSpaces);
}

// ---------- module store round-trip ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-docopen-'));
    const file = path.join(dir, 'doc-open-config.json');
    const store = new DocOpenStore(file);
    ok('fresh store returns defaults', store.get().defaultMode === 'vscode');

    const set1 = store.set({ defaultMode: 'obsidian' });
    ok('set persists + returns config', set1.defaultMode === 'obsidian' && fs.existsSync(file));

    const store2 = new DocOpenStore(file);
    ok('a second store reads the persisted default', store2.get().defaultMode === 'obsidian');

    store2.set({ defaultMode: 'custom', customCommand: 'code.cmd', customArgs: '-g {file}' });
    const reloaded = new DocOpenStore(file);
    ok('custom command + args survive a reload', reloaded.get().customCommand === 'code.cmd' && reloaded.get().customArgs === '-g {file}');

    // BOM tolerance: an agent writing with PowerShell utf8 prepends a BOM.
    fs.writeFileSync(file, '\uFEFF' + JSON.stringify({ defaultMode: 'preview' }), 'utf8');
    const bomStore = new DocOpenStore(file);
    ok('BOM-prefixed config still parses', bomStore.get().defaultMode === 'preview');

    // A corrupt file falls back to defaults rather than throwing.
    fs.writeFileSync(file, '{not json', 'utf8');
    ok('corrupt file → defaults, no throw', new DocOpenStore(file).get().defaultMode === 'vscode');

    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- §19.C bridge ops ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-docopen-b-'));
    const store = new DocOpenStore(path.join(dir, 'cfg.json'));
    let changes = 0;
    const reg = new BridgeRegistry();
    registerDocOpenOps(reg, { store, onChange: () => changes++ });

    const cat = reg.catalog().map(c => c.op);
    ok('docopen ops catalogued', cat.includes('docopen.get') && cat.includes('docopen.set'));

    const got = await reg.dispatch('docopen.get', {});
    ok('docopen.get returns config + modes', got.ok && got.result.defaultMode === 'vscode' && got.result.modes.length === 4);

    const set = await reg.dispatch('docopen.set', { defaultMode: 'obsidian' });
    ok('docopen.set updates + returns config + fires onChange', set.ok && set.result.defaultMode === 'obsidian' && changes === 1);

    const got2 = await reg.dispatch('docopen.get', {});
    ok('the change is visible on the next get', got2.result.defaultMode === 'obsidian');

    const setCustom = await reg.dispatch('docopen.set', { defaultMode: 'custom', customCommand: 'app.exe', customArgs: '{file} --wait' });
    ok('docopen.set carries the custom app', setCustom.ok && setCustom.result.customCommand === 'app.exe' && setCustom.result.customArgs === '{file} --wait');

    // An invalid mode never throws and leaves the current default UNCHANGED
    // (the previous set left it 'custom') — safer than silently resetting.
    const badMode = await reg.dispatch('docopen.set', { defaultMode: 'zzz' });
    ok('an invalid mode is ignored, keeping the current default', badMode.ok && badMode.result.defaultMode === 'custom');

    fs.rmSync(dir, { recursive: true, force: true });

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
