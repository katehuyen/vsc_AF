/**
 * Close (or touch) a backlog item through the Farm Bridge.
 *
 * ‼️ The payload is built in a FILE and handed to `af.js` as `@args.json`.
 * PowerShell 5.1 re-encodes strings piped to a native process, which eats the
 * Turkish characters in a closing note before Node ever sees them.
 *
 *   node scratchpad/af_close.js <payload.json>
 *
 * The payload is `{ op, args }`.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const file = process.argv[2];
if (!file) { console.error('usage: node af_close.js <payload.json>'); process.exit(2); }
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = path.join(__dirname, 'args.json');
fs.writeFileSync(args, JSON.stringify(payload.args), 'utf8');

const af = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage',
    'muvusoft.agent-farm', 'bridge', 'af.js');
const r = cp.spawnSync(process.execPath, [af, payload.op, '@' + args],
    { encoding: 'utf8', timeout: 60000 });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
try { fs.unlinkSync(args); } catch { /* best effort */ }
process.exit(r.status ?? 1);
