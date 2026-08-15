// For each capability the gate says nothing links to its op, print the ops
// that DO share a symbol with it. The answer is usually right there.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const drift = fs.readFileSync(path.join(ROOT, 'par.out'), 'utf8').split('\n')
    .filter(l => /nothing links/.test(l))
    .map(l => l.trim().split(' — ')[0].replace(/^\S\s/, ''));
process.env.AF_PARITY_SUGGEST = drift.join(',');
execSync(`node "${path.join(ROOT, 'test', 'test_parity.js')}" --suggest`,
    { stdio: 'inherit', cwd: ROOT });
