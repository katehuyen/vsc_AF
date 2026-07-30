// A4 — the Quick Menu and the keyboard set. The menu is data (compiled
// core/quickmenu.js) and this walks it against package.json: a row that names
// a command which does not exist, or prints a shortcut that is not the one
// really bound, is a menu that lies — worse than no menu. The keyboard set
// itself is checked for collisions and for the one thing this user's Turkish-Q
// layout makes non-negotiable: AltGr (= Ctrl+Alt) must stay off the letters
// that type a character.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
// ‼️ Print the offenders and STILL FAIL. This was written as
// `cond || !console.log(detail)` — and `!undefined` is `true`, so every check
// using it printed its diagnostic and then passed. The Turkish-Q AltGr rule and
// the "the menu must not lie about its shortcuts" rule were both silently
// disarmed that way; a rule that cannot fail is not a rule.
const why = detail => { console.log('    ' + detail); return false; };

const { QUICK_MENU, QUICK_MENU_GROUPS } =
    require(path.join(__dirname, '..', 'out', 'core', 'quickmenu.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const commands = pkg.contributes.commands;
const commandIds = new Set(commands.map(c => c.command));
const keybindings = pkg.contributes.keybindings;
const keyOf = cmd => (keybindings.find(k => k.command === cmd) || {}).key;

// ---------- every row is real ----------
{
    const missing = QUICK_MENU.filter(e => !commandIds.has(e.command));
    ok('every menu row names a registered command',
        missing.length === 0 || why('missing: ' + missing.map(m => m.command).join(', ')));
    ok('every row has a label and a detail',
        QUICK_MENU.every(e => e.label.trim() && e.detail.trim()));
    ok('every row carries an icon', QUICK_MENU.every(e => /^\$\([a-z0-9-]+\)/.test(e.label)));
    ok('no duplicate commands in the menu',
        new Set(QUICK_MENU.map(e => e.command)).size === QUICK_MENU.length);
    ok('every row belongs to a declared group',
        QUICK_MENU.every(e => QUICK_MENU_GROUPS.includes(e.group)));
    ok('every declared group has rows',
        QUICK_MENU_GROUPS.every(g => QUICK_MENU.some(e => e.group === g)));
}

// ---------- the shortcuts it prints are the shortcuts that exist ----------
{
    const wrong = QUICK_MENU.filter(e => e.key && keyOf(e.command) !== e.key);
    ok('every printed shortcut matches package.json',
        wrong.length === 0 || why('wrong: ' + wrong.map(w =>
            `${w.command} says ${w.key}, bound ${keyOf(w.command)}`).join(' · ')));
    // the reverse: a bound key the menu forgot to advertise
    const unadvertised = keybindings.filter(k =>
        QUICK_MENU.some(e => e.command === k.command && !e.key));
    ok('no menu row hides a shortcut it has', unadvertised.length === 0);
}

// ---------- the new commands are wired end to end ----------
{
    const NEW = [
        'agentfarm.launchSession', 'agentfarm.pinSession', 'agentfarm.tagSession',
        'agentfarm.sessionShelf', 'agentfarm.interruptSession', 'agentfarm.quickMenu'
    ];
    for (const id of NEW) {
        const cmd = commands.find(c => c.command === id);
        ok(`${id} is declared`, !!cmd);
        ok(`${id} is in the Agent Farm category`, cmd && cmd.category === 'Agent Farm');
    }
    const menus = [].concat(...Object.values(pkg.contributes.menus));
    ok('the launcher has a UI button, not just a command',
        menus.some(m => m.command === 'agentfarm.launchSession' && /view\/title|agents/.test(m.when || '')));
    ok('the shelf has a UI button', menus.some(m => m.command === 'agentfarm.sessionShelf'));
    ok('pin is on the session rows (inline)',
        menus.some(m => m.command === 'agentfarm.pinSession' && /inline/.test(m.group || '')));
    ok('label and interrupt are on the session context menu',
        menus.some(m => m.command === 'agentfarm.tagSession')
        && menus.some(m => m.command === 'agentfarm.interruptSession'));
    // the pin suffix on contextValue would break an == when clause
    ok('no session menu uses an exact viewItem == session-resumable',
        !menus.some(m => /viewItem == session-resumable/.test(m.when || '')));
    ok('resume still reaches pinned rows',
        menus.some(m => m.command === 'agentfarm.resumeSession'
            && /viewItem =~ \/\^session-resumable\//.test(m.when || '')));
}

// ---------- the keyboard set ----------
{
    const keys = keybindings.map(k => k.key);
    ok('no two Agent Farm bindings share a key', new Set(keys).size === keys.length);
    ok('every binding has a mac form', keybindings.every(k => k.mac));
    ok('every bound command exists', keybindings.every(k => commandIds.has(k.command)));
    ok('add-to-queue is on ctrl+alt+a', keyOf('agentfarm.queueAdd') === 'ctrl+alt+a');
    // ‼️ Turkish-Q: AltGr+Q/E/T type @ € ₺. Ctrl+Alt IS AltGr on Windows, so a
    // binding on those letters eats a character the user types daily. This used
    // to carry an exemption for queueAdd ("left as it was for backwards
    // compatibility") — which is precisely the binding that fired every time an
    // e-mail address was typed. There is no exemption any more: the rule holds
    // for every binding, old ones included.
    const TR_ALTGR = ['q', 'e', 't'];
    const clashes = keybindings
        .filter(k => TR_ALTGR.includes(k.key.replace('ctrl+alt+', '')));
    ok('no binding sits on a Turkish AltGr character key',
        clashes.length === 0 || why('clash: ' + clashes.map(c => c.key).join(', ')));
    // Ctrl+Q is VS Code's own "Open View" (workbench.action.quickOpenView) and
    // is a global hotkey for many people — the extension never takes it.
    ok('nothing in the extension binds a bare ctrl+q',
        !keybindings.some(k => /^(ctrl|cmd)\+q$/.test(k.key)));
    ok('the hub key is ctrl+alt+f', keyOf('agentfarm.quickMenu') === 'ctrl+alt+f');
    ok('the keyboard set stays small enough to remember', keybindings.length <= 10);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
