// X-115 — THE SHAPES A REAL CREDENTIAL HAS, in one place, read by the package
// check (tools/verify_vsix.js) and by the commit hook (tools/scan_staged.js).
// Two copies of this list would drift, and the one that drifted would be the
// one guarding the surface nobody was looking at.
//
// ‼️ The vendors' own prefixes with a body long enough that a placeholder in a
// doc (`sk-ant-...`, `ghp_xxxx`) does not match: a check that cries wolf on the
// documentation gets switched off, and then it guards nothing.
//
// ‼️ AND A PLANTED CANARY IS NOT A LEAK. The leak tests push a credential-SHAPED
// value through every surface on purpose, and those values carry the word
// CANARY so both readers can tell them apart from a real key. A real key never
// contains it.
'use strict';

const CREDENTIAL_SHAPES = [
    ['an Anthropic key', /sk-ant-(?:api|oat|admin)\d{2}-[A-Za-z0-9_-]{20,}/g],
    ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/g],
    ['a GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{40,}/g],
    ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
    ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
    ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
    ['a private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g]
];

/** Files whose contents are text worth reading; everything else is skipped. */
const TEXT_FILE = /\.(js|cjs|mjs|ts|json|jsonc|md|txt|css|html|yml|yaml|env|ini|cfg|xml|svg|ps1|sh|toml)$/i;

/** What credential shapes a text holds, by KIND — never the value itself. */
function credentialFindings(text) {
    const found = [];
    for (const [what, re] of CREDENTIAL_SHAPES) {
        re.lastIndex = 0;
        for (const m of String(text || '').matchAll(re)) {
            if (/CANARY/.test(m[0])) { continue; }
            found.push(what);
            break;
        }
    }
    return found;
}

module.exports = { CREDENTIAL_SHAPES, TEXT_FILE, credentialFindings };
