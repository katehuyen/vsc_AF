// Cross-engine lanes and the shared constitution.
//
//   <dir>/AGENTS.md         → every walking engine (Codex, OpenCode, Antigravity):
//                             a constitution one level up reaches them on its
//                             own — never duplicated here
//   <dir>/.agents/AGENTS.md → X-476: ONLY where Antigravity's walk (cwd → repo
//                             root) does not reach the mirror, and then the
//                             constitution alone. These fixtures live in the
//                             temp dir with no repository above, which is that
//                             case; test_rule_walk.js covers the one-repository case.
// And the invariant that guards the Claude side: no generated text, above all
// no constitution block, is ever written into an agent's own CLAUDE.md.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const {
    ANTIGRAVITY_RULES_REL, CONSTITUTION_BEGIN, CONSTITUTION_END,
    buildAntigravityRules, stripConstitution, stripMarker,
    antigravityStatus, syncToAntigravity, syncToClaude, SYNC_MARKER
} = require(path.join(ROOT, 'out/core/antigravity.js'));
const { scanRoots } = require(path.join(ROOT, 'out/core/agents.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };

const CONST_BODY = '# Agent Constitution\n\nShared rules. See CLAUDE.md of each agent.\n';
const AGENT_BODY = '# Developer Agent\n\nMission text. Also mentions CLAUDE.md.\n';

// --- 1) buildAntigravityRules: marker and the fenced constitution, nothing else ---
{
    const withConst = buildAntigravityRules(CONST_BODY);
    check('rules file starts with the sync marker', withConst.startsWith(SYNC_MARKER));
    check('constitution is fenced by both markers',
        withConst.includes(CONSTITUTION_BEGIN) && withConst.includes(CONSTITUTION_END));
    check('constitution body is inside the fence',
        withConst.indexOf('Shared rules') > withConst.indexOf(CONSTITUTION_BEGIN) &&
        withConst.indexOf('Shared rules') < withConst.indexOf(CONSTITUTION_END));
    // Self-references follow the file they live in (the generated-from note in
    // the fence comment deliberately still names the Claude-side source).
    check('self-references transformed for the other engine', withConst.includes('See AGENTS.md of each agent'));
}

// --- 2) stripConstitution: the guard on every write back to Claude ---
{
    const withConst = buildAntigravityRules(CONST_BODY) + '\n' + AGENT_BODY;
    const stripped = stripConstitution(stripMarker(withConst));
    check('strip removes the whole block', !stripped.includes('Shared rules') &&
        !stripped.includes(CONSTITUTION_BEGIN) && !stripped.includes(CONSTITUTION_END));
    check('strip keeps the agent body', stripped.includes('Mission text'));
    check('strip is a no-op without a block', stripConstitution('# Plain\n') === '# Plain\n');
    check('unterminated block is left alone (never half-eaten)',
        stripConstitution(CONSTITUTION_BEGIN + '\nx\n').includes('x'));
    // X-476 reworded the fence; a file written under the old wording is still a fence
    const oldFence = '<!-- agent-farm:shared-constitution — generated from the shared CLAUDE.md one level up. '
        + 'Antigravity reads no file above the workspace, so it is carried here. Edit the source, not this block. -->';
    check('an older fence wording is still found and stripped',
        stripConstitution(oldFence + '\n\nShared rules\n\n' + CONSTITUTION_END + '\n# Body\n').trim() === '# Body');
}

// --- 3) a nest on disk: root CLAUDE.md + one agent folder ---
const nest = fs.mkdtempSync(path.join(os.tmpdir(), 'af-nest-'));
const agentDir = path.join(nest, 'developer');
fs.mkdirSync(agentDir);
fs.writeFileSync(path.join(nest, 'CLAUDE.md'), CONST_BODY);
fs.writeFileSync(path.join(agentDir, 'CLAUDE.md'), AGENT_BODY);
const constitutionPath = path.join(nest, 'CLAUDE.md');
const rulesPath = path.join(agentDir, ANTIGRAVITY_RULES_REL);
const codexPath = path.join(agentDir, 'AGENTS.md');

// scanRoots must recognise the nest and hand the constitution to its children
{
    const { agents, reports } = scanRoots([nest]);
    check('nest root detected', reports[0].kind === 'nest');
    check('child agent gets constitutionPath', agents.length === 1 &&
        agents[0].constitutionPath === constitutionPath);
    const { agents: plain } = scanRoots([agentDir]);
    check('a single-agent root has no constitution', plain.length === 1 && !plain[0].constitutionPath);
}

// --- 4) forward sync writes both lanes, each with the right payload ---
{
    const r = syncToAntigravity(agentDir, [], { constitutionPath });
    check('both lanes written', r.written.includes('AGENTS.md') && r.written.includes(ANTIGRAVITY_RULES_REL));

    const codex = fs.readFileSync(codexPath, 'utf8');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    check('Antigravity lane carries the constitution', rules.includes('Shared rules'));
    check('‼️ …and NOT the agent body — AGENTS.md beside it is always read (X-476)', !rules.includes('Mission text'));
    check('Codex lane does NOT duplicate the constitution (it walks parents itself)',
        !codex.includes('Shared rules') && codex.includes('Mission text'));
    check('a note explains why the constitution is inline',
        r.notes.some(n => /Antigravity/.test(n) && /constitution/.test(n)));

    check('agent CLAUDE.md untouched', fs.readFileSync(path.join(agentDir, 'CLAUDE.md'), 'utf8') === AGENT_BODY);
    check('shared CLAUDE.md untouched', fs.readFileSync(constitutionPath, 'utf8') === CONST_BODY);
    check('state is in-sync right after a sync',
        antigravityStatus(agentDir, constitutionPath).state === 'in-sync');
}

// --- 5) constitution drift is detected (the whole point of the feature) ---
{
    fs.writeFileSync(constitutionPath, CONST_BODY + '\nRule 5: new.\n');
    const st = antigravityStatus(agentDir, constitutionPath);
    check('constitution change makes the Claude side ahead', st.state === 'claude-ahead');
    check('and is reported as such, not as a plain CLAUDE.md edit', st.constitutionChanged === true);

    syncToAntigravity(agentDir, [], { constitutionPath });
    check('re-sync carries the new rule into the Antigravity lane',
        fs.readFileSync(rulesPath, 'utf8').includes('Rule 5: new.'));
    check('back to in-sync', antigravityStatus(agentDir, constitutionPath).state === 'in-sync');

    // A missing rules file is drift too — an older sidecar must not read as done.
    fs.unlinkSync(rulesPath);
    check('missing Antigravity rules file counts as claude-ahead',
        antigravityStatus(agentDir, constitutionPath).state === 'claude-ahead');
    syncToAntigravity(agentDir, [], { constitutionPath });
    check('rules file restored', fs.existsSync(rulesPath));
}

// --- 6) hand-written rules files are never clobbered ---
{
    const foreignDir = path.join(nest, 'genel');
    fs.mkdirSync(path.join(foreignDir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'CLAUDE.md'), AGENT_BODY);
    const foreignRules = path.join(foreignDir, ANTIGRAVITY_RULES_REL);
    fs.writeFileSync(foreignRules, '# Elle yazılmış kurallar\n');

    const r = syncToAntigravity(foreignDir, [], { constitutionPath });
    check('foreign rules file skipped, not overwritten',
        r.skipped.includes(ANTIGRAVITY_RULES_REL) &&
        fs.readFileSync(foreignRules, 'utf8') === '# Elle yazılmış kurallar\n');
    check('the skip is explained', r.notes.some(n => /did not generate/.test(n)));

    const forced = syncToAntigravity(foreignDir, [], { constitutionPath, force: true });
    check('force overwrites it', fs.readFileSync(foreignRules, 'utf8').includes('Shared rules'));
    check('and keeps a backup', forced.backups.length === 1 && fs.existsSync(forced.backups[0]));

    // Now edit ours by hand: still ours (marker intact) but changed since we wrote it.
    fs.appendFileSync(foreignRules, '\nAntigravity oturumunda eklendi.\n');
    const r2 = syncToAntigravity(foreignDir, [], { constitutionPath });
    check('hand-edited generated rules file left untouched',
        r2.skipped.includes(ANTIGRAVITY_RULES_REL) &&
        fs.readFileSync(foreignRules, 'utf8').includes('Antigravity oturumunda eklendi.'));
    // The hand edit sits in a generated-only file, outside the CLAUDE.md ↔
    // AGENTS.md state machine — so it is reported on its own rather than being
    // reconciled through a path that would read the wrong file.
    check('a hand-edited rules file is reported as diverged',
        antigravityStatus(foreignDir, constitutionPath).rulesDiverged === true);
    check('and the skip did not advance the fingerprints',
        syncToAntigravity(foreignDir, [], { constitutionPath }).skipped.includes(ANTIGRAVITY_RULES_REL));
}

// --- 7) reverse sync never leaks the constitution into CLAUDE.md ---
{
    const revDir = path.join(nest, 'reverse');
    fs.mkdirSync(revDir);
    fs.writeFileSync(path.join(revDir, 'CLAUDE.md'), AGENT_BODY);
    syncToAntigravity(revDir, [], { constitutionPath });

    // Simulate an engine that pasted the constitution into the cross-tool file.
    fs.writeFileSync(path.join(revDir, 'AGENTS.md'),
        buildAntigravityRules(CONST_BODY) + '\n' + AGENT_BODY + '\nAntigravity katkısı.\n');

    const r = syncToClaude(revDir, constitutionPath);
    const claude = fs.readFileSync(path.join(revDir, 'CLAUDE.md'), 'utf8');
    check('reverse sync keeps the engine-side gain', claude.includes('Antigravity katkısı.'));
    check('reverse sync does NOT write the constitution into CLAUDE.md',
        !claude.includes('Shared rules') && !claude.includes(CONSTITUTION_BEGIN));
    check('the drop is reported, not silent', r.notes.some(n => /shared-constitution/.test(n)));
    check('shared CLAUDE.md still untouched by a reverse sync',
        fs.readFileSync(constitutionPath, 'utf8').includes('Rule 5: new.'));
    const lane = fs.readFileSync(path.join(revDir, ANTIGRAVITY_RULES_REL), 'utf8');
    check('the Antigravity lane still carries the constitution alone after a reverse sync',
        lane.includes('Shared rules') && !lane.includes('Antigravity katkısı.'));
}

// --- 8) the nest itself: the one mirror, and no rules file beside it (X-476) ---
{
    const before = fs.readFileSync(constitutionPath, 'utf8');
    // a copy an earlier build generated there, nobody edited
    fs.mkdirSync(path.join(nest, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(nest, ANTIGRAVITY_RULES_REL), SYNC_MARKER + '\n\n' + CONST_BODY);
    const r = syncToAntigravity(nest, []);
    check('nest AGENTS.md mirror written', r.written.includes('AGENTS.md') &&
        fs.readFileSync(path.join(nest, 'AGENTS.md'), 'utf8').includes('Shared rules'));
    check('‼️ no .agents/AGENTS.md at the nest — the same text would be loaded twice',
        !fs.existsSync(path.join(nest, ANTIGRAVITY_RULES_REL)) && (r.removed || []).includes(ANTIGRAVITY_RULES_REL));
    check('the constitution file itself is never written', fs.readFileSync(constitutionPath, 'utf8') === before);
    fs.writeFileSync(path.join(nest, ANTIGRAVITY_RULES_REL), '# Kendi notlarım\n');
    check('…while one Agent Farm did not write is kept and reported',
        syncToAntigravity(nest, [], { force: true }).skipped.includes(ANTIGRAVITY_RULES_REL)
        && fs.existsSync(path.join(nest, ANTIGRAVITY_RULES_REL)));
}

try { fs.rmSync(nest, { recursive: true, force: true }); } catch { }

// ---------- ⚖ the operation has a button, and it is on the Toolbox ----------
//
// It was reachable from the command palette and the bridge only — so the one
// operation that touches EVERY agent at once was the one you could not click.
// U-83 moved it off the Dashboard onto the Toolbox: what it mirrors is Claude's
// own extension model into the files the other engines read, which is what that
// page is about, and there it has the room for its whole name.
{
    const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const js = rd('media/toolbox.js');
    const head = rd('media/pageHeader.js');
    check('the Toolbox asks for a Sync Constitution button',
        /action: 'syncConstitution'/.test(js) && /Sync Constitution/.test(js));
    check('…spelled out on the button, not shortened to "Sync Cons."',
        /label: '⚖ Sync Constitution'/.test(js));
    // The Dashboard has a header action of its own now (U-85, the web view),
    // so "no headerAction case" stopped meaning "no Sync button" — ask for the
    // thing itself on both sides.
    check('…and the Dashboard no longer draws one',
        !/syncConstitution/.test(rd('media/dashboard.js'))
        && !/syncConstitution/.test(rd('src/panels/dashboard.ts')));
    check('the header renders a `related` entry that is an ACTION as a button',
        /if \(r\.action\)/.test(head) && /data-afact="\$\{r\.action\}"/.test(head));
    check('…and wires it to one message the page owns',
        /data-afact\]/.test(head) && /type: 'headerAction', action: b\.dataset\.afact/.test(head));
    // ‼️ The second row is INSIDE .af-head, because wire() scopes header
    // actions to `.af-head [data-afact]` — lifted out of that box, this very
    // button would stop posting and nothing else would notice.
    check('…from the second row too, which stays inside the header block',
        head.indexOf('af-head-more') > 0
        && /<div class="af-head-more">/.test(head)
        && head.indexOf('${moreRow}') > head.indexOf('<div class="af-head-bar">'));

    // The handler CALLS the palette command — the divergence checks, the modal
    // and the .afbak backups are that command's, and there is one of them.
    const panel = rd('src/panels/toolboxPanel.ts');
    check('the panel routes headerAction to the command the palette calls',
        /case 'headerAction'/.test(panel)
        && /msg\.action === 'syncConstitution'/.test(panel)
        && /executeCommand\('agentfarm\.syncConstitution'\)/.test(panel));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
