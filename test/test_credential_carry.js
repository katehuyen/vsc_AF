// X-286 — the agent repo carries live sign-ins: one module knows which files they
// are and how they travel, and the acceptance gate fails when the repo is public.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const C = require(path.join(ROOT, 'out/core/credentialCarry.js'));
const { migrationGate } = require(path.join(ROOT, 'out/core/migrationGate.js'));

// ---------- which files are sign-ins, and whose ----------
const tracked = [
    '_run_folder_move/claude/.credentials.json',
    '_run_folder_move/claude/daemon/control.key',
    '_run_folder_move/vscode/muvusoft.agent-farm/accounts/claude-b/.credentials.json',
    '_run_folder_move/vscode/muvusoft.agent-farm/accounts/claude-a/sessions/1.abc.key',
    '_run_folder_move/gemini/x/node_modules/pkg/server.key',
    '_run_folder_move/claude/settings.json',
    'notes/keychain.md'
];
const carry = C.credentialCarry(tracked);
ok('the mode is PLAIN today (K1, 2026-09-24)', C.CARRY_MODE === 'plain' && carry.mode === 'plain');
ok('.credentials.json and *.key are credentials, node_modules and look-alikes are not',
    carry.entries.length === 4 && !carry.entries.some(e => /node_modules|settings|keychain/.test(e.file)));
ok('a file under accounts/<id>/ belongs to that slot, anything else to the main sign-in',
    carry.entries.find(e => e.file.endsWith('claude-b/.credentials.json')).account === 'claude-b'
    && carry.entries.find(e => e.file.endsWith('control.key')).account === 'main');
ok('…kinds are named', carry.entries.filter(e => e.kind === 'sign-in').length === 2 && carry.entries.filter(e => e.kind === 'key').length === 2);
ok('accounts are listed main first, then by name', JSON.stringify(carry.accounts) === JSON.stringify(['main', 'claude-a', 'claude-b']));
ok('Windows separators are read the same', C.credentialAccount('a\\accounts\\claude-z\\.credentials.json') === 'claude-z');
ok('the git pathspecs find both kinds', C.CREDENTIAL_PATHSPECS.includes('*.credentials.json') && C.CREDENTIAL_PATHSPECS.includes('*.key'));

// ---------- the remote, whatever shape it is written in ----------
const alias = C.remoteRepo('git@github-murposta:murposta/agent.git');
ok('an SSH alias remote names GitHub, owner and repo', alias && alias.github && alias.owner === 'murposta' && alias.repo === 'agent');
const h = C.remoteRepo('https://github.com/o/r.git');
ok('an https remote is read', h && h.github && h.owner === 'o' && h.repo === 'r');
const s = C.remoteRepo('ssh://git@gitlab.example.com:2222/o/r');
ok('an ssh:// remote on another host is read and is not GitHub', s && !s.github && s.repo === 'r');
ok('garbage is undefined, not a guess', C.remoteRepo('not a url') === undefined && C.remoteRepo('') === undefined);
ok('200 = public, 404 = hidden, anything else = unknown',
    C.visibilityFromStatus(200) === 'public' && C.visibilityFromStatus(404) === 'hidden'
    && C.visibilityFromStatus(403) === 'unknown' && C.visibilityFromStatus(undefined) === 'unknown');

// ---------- the gate ----------
const base = repo => ({
    roots: [], fs: { lstatSync: () => ({ isSymbolicLink: () => true, isDirectory: () => true }) },
    completeness: () => [], twins: () => new Map(), unportable: () => [], stores: () => [],
    repo: () => repo
});
const repo = (visibility, extra) => Object.assign({ root: 'D:/zone/agent', remote: 'git@github-x:o/agent.git', visibility, why: 'anonymous GET → n', carry }, extra);
{
    const v = migrationGate(base(repo('public')));
    const vis = v.items[0];
    ok('‼️ a PUBLIC repo fails the gate, and it is the FIRST item', !v.ok && vis.id === 'repo:visibility' && !vis.ok && vis.area === 'repo');
    ok('…naming the accounts whose sign-ins are exposed', /main, claude-a, claude-b/.test(vis.detail) && /PUBLIC/.test(vis.detail));
    ok('…and saying private is not enough: revoke too', /revoke/.test(vis.fix) && /private/.test(vis.fix));
}
{
    const v = migrationGate(base(repo('hidden')));
    ok('a hidden repo passes', v.ok && v.items[0].ok && /not visible to strangers/.test(v.items[0].detail));
    const c = v.items.find(i => i.id === 'repo:credentials');
    ok('‼️ the carried sign-ins are listed by account, in PLAIN mode', c && c.ok && /4 live credential/.test(c.detail) && /PLAIN/.test(c.detail) && /main, claude-a, claude-b/.test(c.detail));
}
{
    const v = migrationGate(base(repo('unknown', { why: 'api.github.com did not answer' })));
    ok('an unmeasured visibility is SAID, not failed', v.ok && /NOT MEASURED — api\.github\.com did not answer/.test(v.items[0].detail));
}
{
    const v = migrationGate(base(repo('unknown', { remote: '' })));
    ok('no remote: nothing is published', v.ok && /has no remote/.test(v.items[0].detail));
}
{
    const v = migrationGate(base({ root: '', remote: '', visibility: 'unknown', why: '', carry: C.credentialCarry([]) }));
    ok('no repo: one item, git carries nothing', v.items.filter(i => i.area === 'repo').length === 1 && /no git repo/.test(v.items[0].detail));
}
{
    const v = migrationGate(base(repo('hidden', { carry: C.credentialCarry(tracked, 'sealed') })));
    const c = v.items.find(i => i.id === 'repo:credentials');
    ok('‼️ the seam: in SEALED mode a plain credential file in git fails the gate', !v.ok && c && !c.ok && /git rm --cached/.test(c.fix));
    const clean = migrationGate(base(repo('hidden', { carry: C.credentialCarry([], 'sealed') })));
    ok('…and a sealed repo with none tracked passes, saying so', clean.ok && /travel sealed/.test(clean.items.find(i => i.id === 'repo:credentials').detail));
}
{
    const src = base();
    src.repo = () => { throw new Error('git missing'); };
    const v = migrationGate(src);
    ok('a repo read that throws is a failing item, not a crash', !v.ok && v.items[0].id === 'repo:visibility' && /git missing/.test(v.items[0].detail));
    delete src.repo;
    ok('without a repo source the gate carries no repo item', !migrationGate(src).items.some(i => i.area === 'repo'));
}

// ---------- the wire ----------
{
    const svc = fs.readFileSync(path.join(ROOT, 'src/service/agentRepo.ts'), 'utf8');
    ok('the measurement uses the module\'s pathspecs and verdicts, no second rule',
        /CREDENTIAL_PATHSPECS/.test(svc) && /credentialCarry\(tracked\)/.test(svc) && /visibilityFromStatus\(status\)/.test(svc) && /remoteRepo\(remote\)/.test(svc));
    ok('…asks GitHub anonymously (no token leaves the machine)', /api\.github\.com/.test(svc) && !/Authorization/.test(svc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
