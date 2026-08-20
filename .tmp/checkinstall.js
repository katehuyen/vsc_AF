const fs = require('fs'), os = require('os'), path = require('path');
const p = path.join(os.homedir(), '.vscode', 'extensions', 'extensions.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const e = j.filter(x => x.identifier && String(x.identifier.id).toLowerCase() === 'muvusoft.agent-farm');
for (const x of e) {
    console.log(x.version, '| location:', (x.location && x.location.path) || '', '| metadata:', JSON.stringify(x.metadata || {}));
}
