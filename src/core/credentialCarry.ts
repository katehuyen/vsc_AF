/**
 * ‼️ X-286 — THE ONE PLACE THAT KNOWS WHICH FILES ARE LIVE SIGN-INS AND HOW THEY TRAVEL.
 *
 * The agent repo carries every account's tokens so a new machine comes up
 * signed in. The user chose PLAIN TEXT (K1, 2026-09-24) and asked that sealing
 * them later stay a small change: so every surface that speaks about carried
 * credentials — the acceptance gate, the SECURITY note — reads this module.
 * Sealing becomes `mode: 'sealed'` here plus a pack step before commit and an
 * unpack step in `_setup\Link-Folders.ps1`; no caller learns a second rule.
 */

import type { RepoWeight } from './repoWeight';

export type CarryMode = 'plain' | 'sealed';

export const CARRY_MODE: CarryMode = 'plain';

/** git pathspecs that find every candidate; `isCredentialFile` gives the verdict */
export const CREDENTIAL_PATHSPECS = ['*.credentials.json', '*.key'];

export interface CarriedCredential {
    file: string;
    /** the slot id under `accounts/<id>/`, else `main` — the machine's own sign-in */
    account: string;
    kind: 'sign-in' | 'key';
}

export interface CredentialCarry {
    mode: CarryMode;
    entries: CarriedCredential[];
    /** `main` first, then the slots by name */
    accounts: string[];
}

export type Visibility = 'public' | 'hidden' | 'unknown';

export interface RemoteRepo {
    host: string;
    owner: string;
    repo: string;
    /** an SSH alias such as `github-murposta` names GitHub by convention */
    github: boolean;
}

export interface AgentRepoCarry {
    /** '' when the claude dir lies in no git repo — then git carries nothing */
    root: string;
    /** the `origin` URL, '' when there is none */
    remote: string;
    visibility: Visibility;
    /** how the visibility was read, or why it could not be */
    why: string;
    carry: CredentialCarry;
    /** X-285 — the largest committed files and the big ones left outside every backup */
    weight?: RepoWeight;
}

const slash = (p: string) => p.replace(/\\/g, '/');

export function isCredentialFile(rel: string): boolean {
    const p = slash(rel);
    if (/(^|\/)node_modules\//.test(p)) { return false; }
    const base = p.slice(p.lastIndexOf('/') + 1);
    return base === '.credentials.json' || /\.key$/.test(base);
}

export function credentialAccount(rel: string): string {
    const m = /(?:^|\/)accounts\/([^/]+)\//.exec(slash(rel));
    return m ? m[1] : 'main';
}

export function credentialCarry(tracked: string[], mode: CarryMode = CARRY_MODE): CredentialCarry {
    const entries = tracked.filter(isCredentialFile).map(f => {
        const file = slash(f);
        return { file, account: credentialAccount(file), kind: file.endsWith('.credentials.json') ? 'sign-in' as const : 'key' as const };
    });
    const accounts = [...new Set(entries.map(e => e.account))]
        .sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)));
    return { mode, entries, accounts };
}

/** `git@host:owner/repo.git` · `ssh://git@host/owner/repo` · `https://host/owner/repo.git` */
export function remoteRepo(url: string): RemoteRepo | undefined {
    const u = (url || '').trim();
    const m = /^[^@\s/]+@([^:\s/]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(u)
        || /^(?:ssh|https?|git):\/\/(?:[^@/\s]+@)?([^/:\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(u);
    return m ? { host: m[1], owner: m[2], repo: m[3], github: /github/i.test(m[1]) } : undefined;
}

/** An anonymous GET of `api.github.com/repos/<owner>/<repo>`: 200 = anyone can read it, 404 = strangers cannot. */
export function visibilityFromStatus(status: number | undefined): Visibility {
    return status === 200 ? 'public' : status === 404 ? 'hidden' : 'unknown';
}
