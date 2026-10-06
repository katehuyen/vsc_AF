// U-201 — VS CODE'S OWN DEFAULT SHORTCUTS, as the first chord each one starts with, for the
// test that holds Agent Farm's reading chord off them (test/test_read_commands.js). The lists
// are VS Code's "Preferences: Open Default Keyboard Shortcuts (JSON)" as published per release
// by github.com/codebling/vs-code-default-keybindings; a test never goes to the network, so the
// first chords are kept in test/fixtures/vscode_default_keys.json and refreshed by hand:
//   node tools/vscode_default_keys.js            → rewrites the fixture from the newest lists
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/codebling/vs-code-default-keybindings/master/';
const OUT = path.join(__dirname, '..', 'test', 'fixtures', 'vscode_default_keys.json');

async function list(file) {
    const r = await fetch(BASE + file);
    if (!r.ok) { throw new Error(`${file}: HTTP ${r.status}`); }
    const text = await r.text();
    const version = (/Visual Studio Code ([\d.]+)/.exec(text) || [])[1] || '';
    const rows = JSON.parse(text.replace(/^\s*\/\/.*$/mg, ''));
    return { version, first: [...new Set(rows.map(k => String(k.key).split(' ')[0]))].sort() };
}

(async () => {
    const [win, mac] = await Promise.all([list('windows.keybindings.json'), list('macos.keybindings.json')]);
    const data = { source: BASE, windows: win, macos: mac };
    fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n', 'utf8');
    console.log(`${OUT}: windows ${win.version} ${win.first.length} first chords, macos ${mac.version} ${mac.first.length}`);
})().catch(e => { console.error(e.message); process.exit(1); });
