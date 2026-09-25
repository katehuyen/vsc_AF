import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import {
    AgentRepoCarry, credentialCarry, CREDENTIAL_PATHSPECS, remoteRepo, visibilityFromStatus
} from '../core/credentialCarry';
import { batchSizes, headBlobs, indexSizes, largestBlobs, leftOutBig, RepoWeight } from '../core/repoWeight';

const git = (cwd: string, args: string[]) => new Promise<string>(resolve =>
    cp.execFile('git', ['-C', cwd, ...args], { windowsHide: true, timeout: 15000, maxBuffer: 8 << 20 },
        (err, out) => resolve(err ? '' : String(out))));

const anonymousStatus = (owner: string, repo: string) => new Promise<number | undefined>(resolve => {
    const req = https.get({
        host: 'api.github.com',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        headers: { 'User-Agent': 'agent-farm', Accept: 'application/vnd.github+json' },
        timeout: 8000
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('timeout', () => { req.destroy(); resolve(undefined); });
    req.on('error', () => resolve(undefined));
});

/** A git read that says why it failed; `input` goes to stdin, which execFile cannot feed. */
const gitRead = (root: string, args: string[], input = '') => new Promise<{ out: string; err: string }>(resolve => {
    const p = cp.spawn('git', ['-C', root, '-c', 'core.quotepath=off', ...args], { windowsHide: true });
    let out = '', errText = '', failed = '';
    const timer = setTimeout(() => { failed = `git ${args[0]} timed out after 60 s`; p.kill(); }, 60000);
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    p.stderr.setEncoding('utf8').on('data', (d: string) => { errText += d; });
    p.stdin.on('error', () => undefined);
    p.on('error', e => { failed = failed || String(e.message); });
    p.on('close', code => {
        clearTimeout(timer);
        const err = failed || (code === 0 ? '' : `git ${args[0]} exit ${code}: ${errText.split('\n')[0]}`);
        resolve({ out: err ? '' : out, err: err.slice(0, 160) });
    });
    p.stdin.end(input);
});

/**
 * X-285 / X-401 — committed sizes from HEAD + the index, the rest in one batch; untracked files
 * are few, so they are stat'ed. A failed read is carried as `unread`: right after a window reload
 * the call timed out and came back empty, and the gate read that as "nothing committed" — a pass
 * it never measured. A failed index read only costs speed: every blob is then asked.
 */
async function weigh(root: string): Promise<RepoWeight> {
    const tree = await gitRead(root, ['ls-tree', '-r', 'HEAD']);
    const head = headBlobs(tree.out);
    const cached = indexSizes((await gitRead(root, ['ls-files', '-s', '--debug'])).out, head);
    const ask = [...new Set([...head].filter(([file]) => !cached.has(file)).map(([, hash]) => hash))];
    const batch = ask.length ? await gitRead(root, ['cat-file', '--batch-check'], ask.join('\n') + '\n') : { out: '', err: '' };
    const top = largestBlobs(head, cached, batchSizes(batch.out));
    const unread = tree.err || batch.err;
    const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)
        .map(file => {
            let bytes = 0;
            try { bytes = fs.statSync(path.join(root, file)).size; } catch { bytes = 0; }
            return { file, bytes };
        });
    return { top, leftOut: leftOutBig(untracked), ...(unread ? { unread } : {}) };
}

/** X-286 — the repo the claude dir's link lands in, its carried sign-ins and whether strangers can read it. */
export async function measureAgentRepo(claudeDir: string): Promise<AgentRepoCarry> {
    const none: AgentRepoCarry = { root: '', remote: '', visibility: 'unknown', why: '', carry: credentialCarry([]) };
    let real = '';
    try { real = fs.realpathSync(claudeDir); } catch { return none; }
    const root = (await git(real, ['rev-parse', '--show-toplevel'])).trim();
    if (!root) { return none; }
    const tracked = (await git(root, ['ls-files', '-z', '--', ...CREDENTIAL_PATHSPECS])).split('\0').filter(Boolean);
    const remote = (await git(root, ['remote', 'get-url', 'origin'])).trim();
    const base = { root, remote, carry: credentialCarry(tracked), weight: await weigh(root) };
    if (!remote) { return { ...base, visibility: 'unknown', why: 'no origin remote' }; }
    const r = remoteRepo(remote);
    if (!r) { return { ...base, visibility: 'unknown', why: `origin is not a URL this can read: ${remote}` }; }
    if (!r.github) { return { ...base, visibility: 'unknown', why: `${r.host} is not GitHub — no anonymous way to ask` }; }
    const status = await anonymousStatus(r.owner, r.repo);
    const visibility = visibilityFromStatus(status);
    return {
        ...base, visibility,
        why: status === undefined
            ? `api.github.com did not answer for ${r.owner}/${r.repo}`
            : `anonymous GET api.github.com/repos/${r.owner}/${r.repo} → ${status}`
    };
}
