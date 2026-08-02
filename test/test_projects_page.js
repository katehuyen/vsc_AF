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
        /consoleHost\.onChange\(id => \{[\s\S]{0,320}stampSessionProject\(s\.sessionId, s\.projectId\)/.test(extTs));
    ok('…a terminal launch takes the project at LAUNCH time, not when the id turns up',
        /const projectId = activeProjectId\(\) \|\| undefined;/.test(extTs)
        && /termBindings\.push\(\{ title, cwd, term: terminal, launchedAt: Date\.now\(\), sessionId, projectId \}\)/.test(extTs));
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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
