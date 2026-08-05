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
    parseDocOpenConfig, obsidianUri, buildCustomArgv, registerDocOpenOps,
    obsidianVaultOf, hasAdvancedUri, obsidianLineUri
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

// ---------- a line number in the custom-app template ----------
//
// `{line}` exists so "open K-6" can mean the LINE, not the file, in whatever the
// user's own editor is. The hard case is what happens when there is no line: an
// argument left as a bare `+` or a path ending in `:` is worse than not passing it.
{
    const f = 'D:\\p\\Backlog.md';
    ok('+{line} becomes the line', buildCustomArgv('+{line} {file}', f, 74).join('|') === '+74|' + f);
    ok('a token that is only the line is DROPPED when there is none',
        buildCustomArgv('+{line} {file}', f).join('|') === f);
    ok('…and a separator left dangling beside the file is trimmed',
        buildCustomArgv('--goto {file}:{line}', f).join('|') === '--goto|' + f);
    ok('with a line, that same template keeps it',
        buildCustomArgv('--goto {file}:{line}', f, 12).join('|') === '--goto|' + f + ':12');
    ok('a line of 0 or nonsense counts as no line',
        buildCustomArgv('+{line} {file}', f, 0).join('|') === f
        && buildCustomArgv('+{line} {file}', f, NaN).join('|') === f);
    ok('the old two-argument form is untouched',
        buildCustomArgv('{file}', f).join('|') === f);
}

// ---------- Obsidian, at a line ----------
//
// ‼️ The vault has to be NAMED. Measured on the author's machine: two vaults open
// at once, and an adv-uri with no vault lands in whichever Obsidian last touched
// — i.e. it silently opens a different file about half the time.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-vault-'));
    const vault = path.join(dir, 'MyVault');
    const note = path.join(vault, '10_PROJECTS', 'Backlog.md');
    fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
    fs.mkdirSync(path.dirname(note), { recursive: true });
    fs.writeFileSync(note, '- [ ] P-1 x\n', 'utf8');

    const v = obsidianVaultOf(note);
    ok('the vault is found by walking up to .obsidian', !!v && v.root === vault && v.name === 'MyVault');
    ok('a file outside any vault has none', obsidianVaultOf(path.join(os.tmpdir(), 'loose.md')) === undefined
        || obsidianVaultOf(path.join(os.tmpdir(), 'loose.md')).root !== vault);

    ok('‼️ without the Advanced URI plugin there is no line URI at all — the caller opens the file instead',
        !hasAdvancedUri(vault) && obsidianLineUri(note, 74) === undefined);

    // Install it the way Obsidian does: the folder AND the enabled list.
    fs.mkdirSync(path.join(vault, '.obsidian', 'plugins', 'obsidian-advanced-uri'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.obsidian', 'plugins', 'obsidian-advanced-uri', 'main.js'), '', 'utf8');
    fs.writeFileSync(path.join(vault, '.obsidian', 'community-plugins.json'),
        JSON.stringify(['obsidian-advanced-uri']), 'utf8');
    ok('installed AND enabled is what counts', hasAdvancedUri(vault));

    const u = obsidianLineUri(note, 74);
    ok('the line URI is the adv-uri action', !!u && u.indexOf('obsidian://adv-uri?') === 0);
    ok('…it names a vault', /[?&]vault=MyVault(&|$)/.test(u));
    ok('…the path is vault-RELATIVE with forward slashes',
        u.indexOf('filepath=' + encodeURIComponent('10_PROJECTS/Backlog.md')) >= 0);
    ok('…the line is 1-based, as the plugin reads it', /[?&]line=74(&|$)/.test(u));
    ok('‼️ …and a column goes along: with none the plugin computes Math.min(NaN) and lands nowhere',
        /[?&]column=1(&|$)/.test(u));
    ok('a line below one is not a line', obsidianLineUri(note, 0) === undefined);

    // A folder that is merely inside a vault-looking path but not under it.
    fs.writeFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), '[]', 'utf8');
    ok('disabling the plugin takes the line URI away again', obsidianLineUri(note, 74) === undefined);

    fs.rmSync(dir, { recursive: true, force: true });
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
