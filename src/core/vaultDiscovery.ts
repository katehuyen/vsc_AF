/**
 * X-308 — WHERE `${vault}` POINTS WHEN NOBODY EVER TYPED IT.
 *
 * `agentFarm.vaultDir` had never been set on the machine this was measured on,
 * so `${vault}` resolved to nothing and X-188's law — an unresolved variable
 * CANCELS the path — silently skipped every path setting that used it. The law
 * is right. What was missing is that Obsidian already keeps the answer on disk,
 * in its own registry, and nothing was reading it.
 *
 * ‼️ THE SETTING ALWAYS WINS. This is a fallback, never an override: a person
 * who typed a folder has answered the question, and an extension that quietly
 * prefers its own guess over their answer is worse than one that guesses never.
 *
 * ‼️ AND IT REFUSES TO GUESS BETWEEN TWO OPEN VAULTS. Obsidian marks each vault
 * `open`, and more than one can carry it at once (measured in `docopen.ts`, on
 * this same machine, in the sibling problem of which vault a URI lands in).
 * Exactly one open vault is an answer; none or several is not, and this returns
 * `ok:false` with a sentence saying which — the caller then cancels the path
 * exactly as before. Silence was the whole defect; a wrong folder would be
 * worse than the silence.
 *
 * Pure apart from one injected reader, so the tests are a fixture rather than
 * this machine's real Obsidian.
 */

export interface VaultCandidate {
    /** the folder Obsidian has registered */
    path: string;
    /** Obsidian's own id for it */
    id: string;
    /** whether Obsidian currently has it open */
    open: boolean;
    /** Obsidian's last-touched stamp, when it carries one */
    ts: number;
}

export type VaultSource = 'setting' | 'obsidian' | 'none';

export interface VaultResolution {
    /** false = `${vault}` stays unresolved and every path using it is cancelled */
    ok: boolean;
    /** the folder, or '' when there is none — deliberately unusable */
    value: string;
    /** where the answer came from: what the user typed, Obsidian, or nowhere */
    source: VaultSource;
    /** one sentence a person can act on; '' only when the setting answered */
    why: string;
    /** every vault Obsidian knows, so a surface can show the choice that was
     *  refused rather than just saying it refused one */
    candidates: VaultCandidate[];
}

/** Where Obsidian keeps its vault list, per platform. A missing file is not an
 *  error — it means Obsidian is not installed, which is an answer. */
export function obsidianRegistryPath(env: {
    platform?: string; appData?: string; home?: string;
} = {}): string {
    const platform = env.platform ?? process.platform;
    const home = env.home ?? '';
    const join = (...parts: string[]): string => parts.filter(Boolean).join(platform === 'win32' ? '\\' : '/');
    if (platform === 'win32') {
        const appdata = env.appData || join(home, 'AppData', 'Roaming');
        return join(appdata, 'obsidian', 'obsidian.json');
    }
    if (platform === 'darwin') {
        return join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
    }
    return join(home, '.config', 'obsidian', 'obsidian.json');
}

/** Every vault in Obsidian's registry, in the order it happens to hold them.
 *  A registry that cannot be read or parsed yields an empty list — not an
 *  exception: this runs on a machine that may simply not have Obsidian. */
export function readVaultRegistry(raw: string | undefined): VaultCandidate[] {
    if (typeof raw !== 'string' || !raw.trim()) { return []; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^﻿/, '')); } catch { return []; }
    const vaults = (parsed as { vaults?: unknown } | null)?.vaults;
    if (!vaults || typeof vaults !== 'object') { return []; }
    const out: VaultCandidate[] = [];
    for (const [id, v] of Object.entries(vaults as Record<string, unknown>)) {
        const o = (v ?? {}) as { path?: unknown; open?: unknown; ts?: unknown };
        if (typeof o.path !== 'string' || !o.path.trim()) { continue; }
        out.push({
            path: o.path.trim(), id,
            open: o.open === true,
            ts: typeof o.ts === 'number' ? o.ts : 0
        });
    }
    return out;
}

/**
 * What `${vault}` is on this machine.
 *
 * `setting` is whatever `agentFarm.vaultDir` holds — already trimmed by the
 * caller, and already the winner if it says anything at all. `registry` is the
 * text of `obsidian.json`, or undefined when there is no such file.
 */
export function resolveVault(setting: string | undefined, registry: string | undefined): VaultResolution {
    const typed = String(setting ?? '').trim();
    const candidates = readVaultRegistry(registry);
    if (typed) {
        return { ok: true, value: typed, source: 'setting', why: '', candidates };
    }
    const open = candidates.filter(c => c.open);
    if (open.length === 1) {
        return {
            ok: true, value: open[0].path, source: 'obsidian',
            why: 'agentFarm.vaultDir is not set, so ${vault} is the vault Obsidian currently has open ('
                + open[0].path + '). Set the folder yourself to pin it.',
            candidates
        };
    }
    if (open.length > 1) {
        return {
            ok: false, value: '', source: 'none',
            why: 'agentFarm.vaultDir is not set and Obsidian has ' + open.length
                + ' vaults open at once (' + open.map(c => c.path).join(', ')
                + '), so ${vault} cannot be guessed — every path using it is skipped. Set the folder to say which one.',
            candidates
        };
    }
    if (candidates.length) {
        return {
            ok: false, value: '', source: 'none',
            why: 'agentFarm.vaultDir is not set and Obsidian has no vault open, so ${vault} cannot be '
                + 'resolved and every path using it is skipped. Set the folder, or open the vault in Obsidian.',
            candidates
        };
    }
    return {
        ok: false, value: '', source: 'none',
        why: 'agentFarm.vaultDir is not set and no Obsidian vault registry was found on this machine, '
            + 'so ${vault} cannot be resolved and every path using it is skipped.',
        candidates
    };
}
