// X-115 — ‼️ THE REPO SURFACE: nothing credential-shaped is committed.
//
// Reads the STAGED content of every staged text file (`git show :path`), not
// the working copy — what the commit will record is the only thing that
// matters here, and a file edited after `git add` would otherwise be judged on
// text that is not going in. Prints the file and the KIND of credential, never
// the value: a hook that echoes a key into a terminal scrollback has moved the
// leak, not stopped it.
//
// Run by .githooks/pre-commit. Exit 1 blocks the commit.
'use strict';
const { execFileSync } = require('child_process');
const { TEXT_FILE, credentialFindings } = require('./credentialShapes');

let names = [];
try {
    names = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
        { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
} catch {
    // Not a repository, or git is missing: nothing is being committed here.
    process.exit(0);
}

const hits = [];
for (const name of names.filter(n => TEXT_FILE.test(n))) {
    let text = '';
    try {
        text = execFileSync('git', ['show', ':' + name],
            { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    } catch { continue; }
    for (const what of credentialFindings(text)) { hits.push(`${name} (${what})`); }
}

if (hits.length) {
    console.log('');
    console.log('COMMIT BLOCKED - a staged file holds something shaped like a real credential:');
    for (const h of hits) { console.log('  ' + h); }
    console.log('');
    console.log('Take it out of the file, or unstage the file. A test that plants one on purpose');
    console.log('marks it with the word CANARY (tools/credentialShapes.js).');
    process.exit(1);
}
process.exit(0);
