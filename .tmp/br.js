// Farm Bridge, one call, from a FILE.
//
// `_REF/bridge.md` gives the PowerShell recipe; this is the same thing without
// the shell in the way. Markdown and multi-line bodies passed inline through
// PowerShell get mangled by backtick escaping — building the payload in a file
// is the documented way round it, so it lives here rather than being retyped
// as a here-string every session.
//
//   node .tmp/br.js farm.ops
//   node .tmp/br.js projects.tracks '{"project":"prj_xxxx","code":"X-45"}'
//
// Not shipped: .vscodeignore keeps .tmp/ out of the VSIX (X-54).
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'bridge');
const op = process.argv[2];
if (!op) { console.error('usage: node .tmp/br.js <op> [argsJson]'); process.exit(2); }
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

const name = 'developer-' + Date.now();
fs.writeFileSync(path.join(dir, name + '.request.json'), JSON.stringify({ op, args }), 'utf8');

const response = path.join(dir, name + '.response.json');
const startedAt = Date.now();
(function wait() {
    if (fs.existsSync(response)) {
        process.stdout.write(fs.readFileSync(response, 'utf8'));
        fs.unlinkSync(response);
        return;
    }
    // no RUNNER window: leave the request for the next one rather than deleting
    // it, and say so — a silent empty result reads as "the op returned nothing"
    if (Date.now() - startedAt > 60000) {
        console.error('no response in 60s — VS Code is probably closed; the request is left for the next window');
        process.exit(1);
    }
    setTimeout(wait, 400);
})();
