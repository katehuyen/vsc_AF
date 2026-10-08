// For each capability the gate says nothing links to its op, print the ops
// that DO share a symbol with it. The answer is usually right there.
//
// ‼️ IT RUNS THE GATE ITSELF RATHER THAN DEMANDING A SCRATCH FILE. This read
// `par.out` and nothing else, so a reader who had not happened to redirect the
// gate's output into that exact filename got an ENOENT stack instead of the
// answer — a tool whose first move is to crash on the person asking it for help.
// The file is still used when it is there (it is free, and it is what a reader
// who just ran the gate already has); otherwise the gate is run here.
//
// Naming capabilities on the command line skips both:
//   node tools/parity_suggest.js settingsAgentMessages.ts#agentAccount
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const GATE = path.join(ROOT, 'test', 'test_parity.js');

const named = process.argv.slice(2).filter(a => !a.startsWith('-'));

const gateOutput = () => {
    const cached = path.join(ROOT, 'par.out');
    if (fs.existsSync(cached)) { return fs.readFileSync(cached, 'utf8'); }
    try {
        return execSync(`node "${GATE}"`, { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
        // ‼️ THE GATE EXITS NON-ZERO EXACTLY WHEN IT HAS SOMETHING TO SAY, so a
        // failure here is the ordinary path and its output is the whole point.
        return String(e.stdout || '') + String(e.stderr || '');
    }
};

const drift = named.length ? named : gateOutput().split('\n')
    .filter(l => /nothing links|not in parity\.manifest\.json/.test(l))
    .map(l => l.trim().split(' — ')[0].replace(/^\S\s/, '').replace(/^page:/, ''));

if (!drift.length) {
    console.log('Nothing to suggest — the gate links every capability to an op.');
    process.exit(0);
}
process.env.AF_PARITY_SUGGEST = drift.join(',');
execSync(`node "${GATE}" --suggest`, { stdio: 'inherit', cwd: ROOT });
