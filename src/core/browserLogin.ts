/**
 * M-54 — SIGN IN ONCE. A recipe's profile is a plain Chrome user-data folder;
 * the person signs in there in an ordinary Chrome window (never an automated
 * one — Google refuses sign-in in a browser under automation), closes it, and
 * every later recipe step's Playwright opens the same folder signed in. A
 * separate profile is a separate Chrome process: the user's own windows are
 * never touched, and no debugging port is opened.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { BROWSER_RECIPES, browserRecipe, chromeCandidates, loginArgs } from './browserRecipes';

export function browserProfilesRoot(globalStorage: string): string {
    return path.join(globalStorage, 'browser-profiles');
}

/** A Chrome holds its profile's `lockfile` open exclusively while it runs (measured on Windows: EBUSY) — a second one cannot open the profile. */
export function profileInUse(profileDir: string): boolean {
    try { fs.closeSync(fs.openSync(path.join(profileDir, 'lockfile'), 'r+')); return false; }
    catch (e) { const c = (e as NodeJS.ErrnoException).code; return c === 'EBUSY' || c === 'EPERM' || c === 'EACCES'; }
}

/** Every recipe, with its profile folder, whether anybody has opened it yet, and whether a Chrome holds it now. */
export function listBrowserRecipes(root: string): { id: string; label: string; url: string; hosts: string[]; note: string; profileDir: string; profileExists: boolean; inUse: boolean }[] {
    return BROWSER_RECIPES.map(r => {
        const profileDir = path.join(root, r.id);
        return { id: r.id, label: r.label, url: r.url, hosts: r.hosts, note: r.note, profileDir, profileExists: fs.existsSync(profileDir), inUse: profileInUse(profileDir) };
    });
}

/** Opens Chrome on a recipe's profile at its URL (or `url`) so the person can sign in. */
export function openRecipeLogin(o: {
    recipe: string; root: string; url?: string; env?: Record<string, string | undefined>;
    exists?: (p: string) => boolean; run?: (cmd: string, args: string[]) => void;
}): { ok: true; profileDir: string; chrome: string; url: string; note: string } | { ok: false; error: string } {
    const r = browserRecipe(o.recipe);
    if (!r) { return { ok: false, error: `No browser recipe "${o.recipe}" (${BROWSER_RECIPES.map(x => x.id).join(', ')}).` }; }
    const url = String(o.url ?? '').trim() || r.url;
    if (!url) { return { ok: false, error: `The "${r.id}" recipe has no site of its own — pass url=<the site to sign in to>.` }; }
    const exists = o.exists ?? fs.existsSync;
    const chrome = chromeCandidates(o.env ?? process.env).find(p => exists(p));
    if (!chrome) { return { ok: false, error: 'Google Chrome was not found — Playwright MCP drives the installed Chrome, so install it first.' }; }
    const profileDir = path.join(o.root, r.id);
    fs.mkdirSync(profileDir, { recursive: true });
    const run = o.run ?? ((cmd: string, args: string[]) => spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref());
    run(chrome, loginArgs(profileDir, url));
    return {
        ok: true, profileDir, chrome, url,
        note: 'Sign in in the Chrome window that opened, then CLOSE it: a recipe step cannot open the profile while that window holds it.'
    };
}
