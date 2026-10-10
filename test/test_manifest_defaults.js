// A contributed setting's default travels to every machine the extension is installed on, so it never
// names a folder of the machine it was written on. `agentFarm.agentRoots` shipped the developer's own
// agent folder as its default until 3.916.0: a new user's first scan looked for D:/zone/agent/ajanlar.
// Every default is read out of package.json — none is listed here — and a path that must differ per
// machine is written with a variable (${vault}, ~, %USERPROFILE%) or left empty for the user to fill.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** A drive letter or a UNC host at the start of a word, or one of the roots a Unix home or install lives under. */
const MACHINE_PATH = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|\/(home|Users|mnt|opt|var|usr|etc|tmp)\/)/;

const strings = (v, out = []) => {
    if (typeof v === 'string') { out.push(v); }
    else if (Array.isArray(v)) { v.forEach(x => strings(x, out)); }
    else if (v && typeof v === 'object') { for (const k of Object.keys(v)) { out.push(k); strings(v[k], out); } }
    return out;
};

{
    const yes = ['D:/zone/agent/ajanlar', 'C:\\Users\\me\\.claude', 'run "E:\\tools\\x.exe"', '/home/me/agents', '/Users/me/agents', '\\\\nas\\share'];
    const no = ['', '${vault}/10_PROJECTS', '~/agents', '%USERPROFILE%\\.claude', '${env:APPDATA}/x', 'https://example.com/a/b', 'agents/developer', '/model', '5h:/w'];
    ok('the detector sees a machine path however it is written' + yes.filter(s => !MACHINE_PATH.test(s)).map(s => ' — missed ' + s).join(''),
        yes.every(s => MACHINE_PATH.test(s)));
    ok('…and leaves a variable, a relative path, a URL and a slash command alone' + no.filter(s => MACHINE_PATH.test(s)).map(s => ' — caught ' + s).join(''),
        no.every(s => !MACHINE_PATH.test(s)));
}

{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const conf = pkg.contributes.configuration;
    const props = (Array.isArray(conf) ? conf : [conf]).flatMap(s => Object.entries(s.properties || {}));
    const withDefault = props.filter(([, p]) => 'default' in p);
    ok('package.json contributes settings, and most carry a default', props.length > 0 && withDefault.length > props.length / 2);
    const hits = withDefault.flatMap(([key, p]) => strings(p.default).filter(s => MACHINE_PATH.test(s)).map(s => key + ' = ' + s));
    ok('‼️ no contributed default names a folder of one machine' + hits.map(h => ' — ' + h).join(''), hits.length === 0);
    const roots = props.find(([key]) => key === 'agentFarm.agentRoots');
    ok('…and the agent folders start empty: a new user adds their own', !!roots && Array.isArray(roots[1].default) && roots[1].default.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
