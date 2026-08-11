// The Projects PAGE — creation, and the two buttons that used to lie.
//
// Three things were true of the projects axis and are asserted here to stay
// false: a project could only be made through a prompt sequence (an input box
// and two quick-picks) even though the page it belonged on was already open;
// the page's "Sessions" button opened an unfiltered dashboard and left the
// reader to find the filter; and the active project stamped nothing at all.
//
// These are source-shape checks, the same kind test_planusage.js makes: the
// wiring runs inside VS Code, so what can be pinned down here is that the
// wiring exists and says what it claims.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const pageJs = read('media', 'projects.js');
const panelTs = read('src', 'panels', 'projectsPanel.ts');
const extTs = read('src', 'extension.ts');
const treeTs = read('src', 'views', 'projectsTree.ts');

// ---------- a project is created ON THE PAGE ----------
{
    ok('the page has its own create form', /function createHtml\(\)/.test(pageJs));
    ok('…with a name and a folder on it',
        /id="n-name"/.test(pageJs) && /id="n-folder"/.test(pageJs));
    ok('…and it sends the whole form in one message',
        /type: 'create',\s*\n?\s*form: \{/.test(pageJs));
    ok('…the ＋ button opens that form instead of asking the host to run a flow',
        /case 'create':\s*\n\s*creating = newForm\(null\);/.test(pageJs));

    ok('the panel forwards the form to the host',
        /create\(input: \{/.test(panelTs) && /this\.deps\.create\(\{/.test(panelTs));
    ok('…and the command opens the page rather than a prompt sequence',
        /registerCommand\('agentfarm\.newProject', \(seed\?: \{ suggestName\?: string \}\): void => \{[\s\S]{0,160}ProjectsPanel\.show/.test(extTs));
    ok('‼️ no input box is left in the create path',
        !/showInputBox\(\{[\s\S]{0,200}Project name/.test(extTs));

    // One implementation, so the skeleton and the error wording cannot differ
    // depending on which button was pressed.
    ok('every create route lands on one host function', /const createProject = \(input: \{/.test(extTs));
    ok('…including "new project from this session", which seeds the same form',
        /projectFromSession[\s\S]{0,600}ProjectsPanel\.show\(projectsPanelDeps\(\), undefined, \{/.test(extTs));
    ok('…carrying the sessions it should file once the project exists',
        /sessionIds\?: string\[\]/.test(panelTs)
        && /if \(input\.sessionIds\?\.length\) \{ projectStore\.assignSessions\(input\.sessionIds, res\.project\.id\); \}/.test(extTs));

    // The folder follows the name until the user takes it over — after that it
    // is theirs, and a repaint must not steal it back.
    ok('the suggested folder comes from the host, not from a guess in the page',
        /type: 'suggestFolder'/.test(pageJs) && /suggestFolder\(name: string\): string/.test(panelTs));
    ok('…and a folder the user chose is never overwritten by the name',
        /if \(creating && !creating\.folderTouched\)/.test(pageJs)
        && /creating\.folderTouched = true/.test(pageJs));
    ok('a seed is one-shot — a refresh must not drag the reader back into the form',
        /const seed = this\.seed;\s*\n\s*this\.seed = undefined;/.test(panelTs));
    ok('‼️ a FRESH panel reads the seed off the initial payload, not off a message it missed',
        /if \(DATA\.newForm\) \{ creating = newForm\(DATA\.newForm\); \}\s*\n\s*render\(\);/.test(pageJs));
    // ‼️ A jump to another project (a tree row, "open project", a fresh create)
    // moves the reader before the page has asked for anything. Sending the open
    // tab built for the project they LEFT prints one frame of another project's
    // money under this project's name — and a wrong number reads as an answer.
    ok('‼️ a focus jump does not ship the tab data of the project just left',
        /const stale = !!this\.focusId && this\.focusId !== this\.tabProject;/.test(panelTs)
        && /const tabData = seed \|\| stale\s*\n?\s*\? \{\}/.test(panelTs));
}

// ---------- "Sessions" goes somewhere real ----------
{
    ok('the button asks for the dashboard SCOPED to the project',
        /openSessions: id => \{[\s\S]{0,240}projectFilter: p\.name/.test(extTs));
    const dashJs = read('media', 'dashboard.js');
    ok('…a page already open is told to scope itself',
        /if \(ev\.data\.type === 'projectFilter'\) \{ sessTable\.setProjectFilter\(ev\.data\.name\)/.test(dashJs));
    ok('…and a fresh one arrives scoped, since its script is not listening yet',
        /if \(DATA\.projectFilter !== undefined\) \{ sessTable\.setProjectFilter\(DATA\.projectFilter\); \}/.test(dashJs));
    ok('…the filter is scrolled to, so an off-screen change is not mistaken for nothing',
        /function scrollToSessions\(\)/.test(dashJs));
    ok('‼️ the dashboard no longer claims an agent belongs to exactly one project',
        !/An agent belongs to exactly one project/.test(dashJs));
}

// ---------- the active project actually files something ----------
{
    ok('there is one stamp function and it is the only writer',
        /const stampSessionProject = \(sessionId: string, projectId: string\): void =>/.test(extTs));
    ok('…the Console stamps on the first change that carries an id',
        /consoleHost\.onChange\(id => \{[\s\S]{0,420}stampSessionProject\(s\.sessionId, s\.projectId\)/.test(extTs));
    // ‼️ A RESUME is not a start. Filing it under the window's active project
    // both told the agent the wrong project's brief and moved a session into a
    // project it had never run in — an explicit assignment beats every rule, so
    // the move would have been permanent and silent.
    ok('‼️ …but a RESUME is not filed, and is told about its OWN project',
        /const sessionOwnProject = \(/.test(extTs)
        && /if \(s\?\.sessionId && s\.projectId && !s\.resumed\)/.test(extTs)
        && /projectId: sessionOwnProject\(s\)/.test(extTs));
    ok('…and a terminal resume is re-told too — the flag does not survive --resume',
        /const own = sessionOwnProject\(s\);[\s\S]{0,400}projectContextFile: projectContextFileFor\(own \|\| undefined\)/.test(extTs));
    ok('…a terminal launch takes the project at LAUNCH time, not when the id turns up',
        /const projectId = \(project !== undefined \? project : activeProjectId\(\)\) \|\| undefined;/.test(extTs)
        && /termBindings\.push\(\{ title, cwd, term: terminal, launchedAt: Date\.now\(\), sessionId, projectId \}\)/.test(extTs));
    // ‼️ ONE read, used for both halves. Reading activeProjectId() again for the
    // stamp could land the other side of a change and file a session under a
    // project it was never told about.
    // ‼️ Scoped to the function instead of counted in characters. The rule is
    // "ONE read of the project, used for both halves"; a fixed-width window
    // around it fails every time an unrelated line lands in between (it did,
    // when the engine axis arrived), which teaches the next person to widen the
    // number rather than to check the rule.
    const startAt = extTs.indexOf('const startClaudeSession = (');
    const startClaude = extTs.slice(startAt,
        extTs.indexOf('// Claude only announces its session id via hook events', startAt));
    ok('…and what a terminal session is TOLD and what it is FILED under come from one read',
        /const projectId = project !== undefined \? project : activeProjectId\(\);/.test(startClaude)
        && /projectContextFileFor\(projectId \|\| undefined\)/.test(startClaude)
        && /sessionId, projectId\);/.test(startClaude)
        // …and only ONE read of the window: the context file and the stamp both
        // come off `projectId`, so a second `activeProjectId()` CALL here would
        // be the bug this rule exists to prevent. (The prose above it names the
        // function, hence `activeProjectId();` with the semicolon.)
        && (startClaude.match(/activeProjectId\(\);/g) || []).length === 1);
    ok('…and stamps it the moment the live monitor binds an id to that launch',
        /if \(hit\.projectId\) \{ stampSessionProject\(s\.sessionId, hit\.projectId\); \}/.test(extTs));

    // What the surfaces promise must be what the code does. They used to
    // promise tasks, missions and notices too — none of which is filed yet.
    const promises = [pageJs, treeTs, extTs].join('\n');
    ok('‼️ nothing claims tasks/missions/notices are stamped yet',
        !/tasks, missions and notices you start here are filed/.test(promises)
        && !/New sessions, tasks and notices get stamped/.test(promises)
        && !/new sessions, tasks and notices started in this window/i.test(promises));
    ok('…and what IS promised is sessions',
        /sessions started here are filed under it/.test(treeTs));
}

// ---------- Faz 7: parts, templates, the handover and the archive ----------
{
    // sub-projects: one place in the list, and a sum that is never merged in
    ok('the list nests a part under its parent and nowhere else',
        /function listRow\(p, isPart\)/.test(pageJs)
        && /!p\.parentId \|\| !has\(p\.parentId\)/.test(pageJs));
    ok('‼️ an orphan (a parent this list does not hold) is a top-level row, not a hidden one',
        /const has = id => DATA\.projects\.some/.test(pageJs));
    ok('a part carries its own status, because its group heading is its parent\'s',
        /pj-partstate/.test(pageJs));
    ok('…and the group count is by STATUS rather than by rows',
        /g\.statuses\.indexOf\(c\.status\) >= 0/.test(pageJs));
    ok('the parts card lists each part as a project you can open',
        /function partsHtml\(p\)/.test(pageJs) && /data-pick="\$\{C\.esc\(c\.id\)\}"/.test(pageJs));
    ok('‼️ the rolled-up figure says out loud that it is NOT inside the row next to it',
        /counted on their own rows, not in this project's/i.test(pageJs)
        && /const PARTS_TIP/.test(pageJs));
    ok('a part\'s page says what it is part of, and the parent is one press away',
        /pj-partof/.test(pageJs) && /Part of/.test(pageJs));
    ok('the same sum has ONE implementation, shared by the page and the sidebar',
        /partsTotals/.test(treeTs) && /const projectParts = \(\)/.test(extTs));
    ok('‼️ the sidebar nests parts too, and never lists one twice',
        /private rootRows\(/.test(treeTs) && /private partsOf\(/.test(treeTs));
    ok('…and a brief tells an agent inside a part that it IS one',
        /Part of: \$\{o\.parent\}/.test(read('src', 'core', 'projectDocs.ts')));

    // templates
    ok('the create form offers a template', /id="n-template"/.test(pageJs));
    ok('‼️ with none saved it is a SENTENCE, not an empty dropdown',
        /No templates yet — <b>Save as template<\/b>/.test(pageJs));
    ok('choosing one repaints, so the line under it describes THAT template',
        /creating\.template = template\.value; render\(\)/.test(pageJs));
    ok('the form carries the template and the parent to the host',
        /template: creating\.template, parentId: creating\.parentId/.test(pageJs));
    ok('‼️ what the person typed beats what the template carries',
        /applyTemplate\(template, \{/.test(extTs)
        && /THE EXPLICIT ARGUMENT ALWAYS WINS/.test(read('src', 'core', 'projectTemplates.ts')));
    ok('saving one is a multi-select — what is not ticked does not travel',
        /What travels into/.test(extTs) && /canPickMany: true/.test(extTs));

    // the handover
    ok('the handover has a button where a project is being read',
        /data-act="handover"/.test(pageJs) && /const HANDOVER_TIP/.test(pageJs));
    ok('…the panel forwards it and the host writes and opens the document',
        /case 'handover'/.test(panelTs) && /handover\(id: string\)/.test(panelTs)
        && /const buildProjectHandover = \(/.test(extTs));
    ok('‼️ writing it is a MERGE — that is why the button can write rather than preview',
        /mergeHandoverNotes/.test(extTs));

    // the archive
    ok('the archive button says it MOVES a folder, and names where to',
        /data-act="archive"/.test(pageJs) && /Archiving MOVES the folder to/.test(pageJs));
    ok('…restore is the inverse, offered on a project already in the archive',
        /data-act="restore"/.test(pageJs) && /function archiveButtonHtml\(p\)/.test(pageJs));
    ok('‼️ the confirmation is a MODAL in the host with both paths in it',
        /modal: true,[\s\S]{0,200}From:\\n\$\{plan\.from\}\\n\\nTo:\\n\$\{plan\.to\}/.test(extTs));
    ok('‼️ the status is a SEPARATE decision — moving the folder does not set it',
        /the status is the OTHER decision, so it is offered, not applied/.test(extTs));
    ok('…and the registry follows the folder, so nothing points at what is not there',
        /projectStore\.update\(p\.id, \{ folder: res\.path \}\)/.test(extTs));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
