import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import {
    AgentRepoCarry, credentialCarry, CREDENTIAL_PATHSPECS, remoteRepo, visibilityFromStatus
} from '../core/credentialCarry';
import { largestBlobs, leftOutBig, RepoWeight } from '../core/repoWeight';

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

/** X-285 — committed sizes in one git call; untracked files are few, so they are stat'ed. */
async function weigh(root: string): Promise<RepoWeight> {
    const top = largestBlobs(await git(root, ['ls-tree', '-r', '-l', '-z', 'HEAD']));
    const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)
        .map(file => {
            let bytes = 0;
            try { bytes = fs.statSync(path.join(root, file)).size; } catch { bytes = 0; }
            return { file, bytes };
        });
    return { top, leftOut: leftOutBig(untracked) };
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
