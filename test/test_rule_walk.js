// X-476 — WHAT A WALKING ENGINE REACHES, AND WHAT ANTIGRAVITY ENDS UP LOADING.
//
// The incident: an Antigravity session in `developer` was handed the
// constitution three times (ajanlar/AGENTS.md, ajanlar/.agents/AGENTS.md and the
// copy embedded in developer/.agents/AGENTS.md) because its walk runs from the
// cwd to the repository root and de-duplicates by PATH. The rules overflowed
// its budget and the overflow was reduced to a bare path. This pins the walk,
// the decision to embed only where the walk falls short, the clean-up of our
// own stale copies, and the measurement that would show a copy coming back.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'out/core/ruleWalk.js'));
const A = require(path.join(ROOT, 'out/core/antigravity.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

const CONST_BODY = '# Agent Constitution\n\n' + 'Shared rule line that is long enough to count as a body. '.repeat(8) + '\n';
const AGENT_BODY = '# Developer Agent\n\n' + 'Mission text of the developer agent, long enough to compare. '.repeat(6) + '\n';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-rulewalk-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
try {
    // --- the walk itself ---
    const repo = path.join(tmp, 'agent');           // stands for D:/zone/agent, the repository root
    const nest = path.join(repo, 'ajanlar');
    const dev = path.join(nest, 'developer');
    fs.mkdirSync(dev, { recursive: true });
    fs.writeFileSync(path.join(nest, 'CLAUDE.md'), CONST_BODY);
    fs.writeFileSync(path.join(dev, 'CLAUDE.md'), AGENT_BODY);
    const constitutionPath = path.join(nest, 'CLAUDE.md');
    const rules = path.join(dev, A.ANTIGRAVITY_RULES_REL);

    ok('no repository anywhere: no git root', W.gitRootOf(dev, p => p === '/none') === '');
    ok('…and then the walk is not trusted to reach the nest',
        A.syncToAntigravity(nest, []) && W.antigravityReachesConstitution(dev, constitutionPath, p => fs.existsSync(p) && !p.endsWith('.git')) === false);

    fs.mkdirSync(path.join(repo, '.git'));
    ok('the git root is the nearest folder holding .git', W.samePath(W.gitRootOf(dev), repo));
    ok('‼️ inside one repository the walk reaches the nest mirror', W.antigravityReachesConstitution(dev, constitutionPath) === true);
    ok('a nest never mirrored is out of reach whatever the walk',
        W.antigravityReachesConstitution(dev, constitutionPath, p => !p.endsWith(path.join('ajanlar', 'AGENTS.md')) && fs.existsSync(p)) === false);

    // --- the incident, rebuilt: an embedded copy beside a reachable mirror ---
    fs.mkdirSync(path.dirname(rules), { recursive: true });
    const embeddedOld = A.SYNC_MARKER + '\n\n' + A.CONSTITUTION_BEGIN + '\n\n' + CONST_BODY.trim() + '\n\n' + A.CONSTITUTION_END + '\n\n' + AGENT_BODY.trim() + '\n';
    fs.writeFileSync(path.join(dev, 'AGENTS.md'), A.SYNC_MARKER + '\n\n' + AGENT_BODY);
    fs.writeFileSync(rules, embeddedOld);
    fs.mkdirSync(path.join(nest, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(nest, '.agents', 'AGENTS.md'), fs.readFileSync(path.join(nest, 'AGENTS.md'), 'utf8'));
    const before = W.antigravityRuleLoad(dev, { home });
    ok('the walk finds the four files of the incident', before.files.length === 4);
    ok('‼️ and names the two that repeat another file whole', before.duplicates.length === 2
        && before.duplicates.some(d => d.file === rules)
        && before.duplicates.some(d => d.file === path.join(nest, '.agents', 'AGENTS.md')));
    ok('it ends at the repository root', W.samePath(before.walkEnd, repo));
    ok('the total is the bytes of what it found', before.totalBytes === before.files.reduce((s, f) => s + f.bytes, 0));

    // --- the sync clears our own stale copies, and nothing else ---
    const agentSync = A.syncToAntigravity(dev, [], { constitutionPath });
    ok('‼️ the agent sync deletes its own copy where the walk reaches the mirror',
        !fs.existsSync(rules) && (agentSync.removed || []).includes(A.ANTIGRAVITY_RULES_REL));
    const nestSync = A.syncToAntigravity(nest, []);
    ok('‼️ the nest sync deletes its own .agents/AGENTS.md too', !fs.existsSync(path.join(nest, '.agents', 'AGENTS.md'))
        && (nestSync.removed || []).includes(A.ANTIGRAVITY_RULES_REL));
    const after = W.antigravityRuleLoad(dev, { home });
    ok('after the sync Antigravity loads each text once', after.duplicates.length === 0 && after.files.length === 2);
    const st = A.antigravityStatus(dev, constitutionPath);
    ok('…and the agent reads as in sync, with no stray rules file', st.state === 'in-sync' && st.rulesStray === false);
    ok('a constitution change does not make this agent stale — the mirror carries it',
        (fs.appendFileSync(constitutionPath, '\nRule 9.\n'), A.antigravityStatus(dev, constitutionPath).constitutionChanged === false));

    // a hand-written one is reported, never deleted, force or not
    fs.writeFileSync(rules, '# My own Antigravity notes\n');
    const kept = A.syncToAntigravity(dev, [], { constitutionPath, force: true });
    ok('‼️ a rules file Agent Farm did not write is kept, even forced', fs.existsSync(rules) && kept.skipped.includes(A.ANTIGRAVITY_RULES_REL));
    ok('…said so in a note', kept.notes.some(n => /ON TOP/.test(n)));
    ok('…and read as stray by the status Insights use', A.antigravityStatus(dev, constitutionPath).rulesStray === true);
    fs.unlinkSync(rules);

    // --- the agent folder becomes its own repository: the copy comes back, constitution only ---
    fs.mkdirSync(path.join(dev, '.git'));
    ok('its own repository stops the walk below the nest', W.antigravityReachesConstitution(dev, constitutionPath) === false);
    A.syncToAntigravity(dev, [], { constitutionPath });
    const own = fs.readFileSync(rules, 'utf8');
    ok('‼️ the constitution is embedded for it', own.includes('Shared rule line') && own.includes('Rule 9.'));
    ok('…and ONLY the constitution — its AGENTS.md beside it is always read', !own.includes('Mission text'));
    ok('the status follows the embed rule there', A.antigravityStatus(dev, constitutionPath).state === 'in-sync'
        && A.antigravityStatus(dev, constitutionPath).rulesStray === false);
    fs.appendFileSync(constitutionPath, '\nRule 10.\n');
    ok('…including a constitution change, which makes it stale', A.antigravityStatus(dev, constitutionPath).constitutionChanged === true);

    // --- the per-file cap and the global slots ---
    fs.writeFileSync(path.join(home, '.gemini', 'GEMINI.md'), 'x'.repeat(W.ANTIGRAVITY_FILE_CAP_BYTES + 1));
    const capped = W.antigravityRuleLoad(dev, { home });
    ok('the global GEMINI.md is counted', capped.files.some(f => f.path === path.join(home, '.gemini', 'GEMINI.md')));
    ok('a file past the per-file cap is named', capped.overFileCap.length === 1);
    ok('its own repository ends the walk at the folder', W.samePath(capped.walkEnd, dev));
} finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
