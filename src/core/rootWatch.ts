/**
 * X-512 — the agent roots are watched by the list the setting holds NOW. A root added to
 * `agentFarm.agentRoots` is watched from that moment and a removed one is let go, so a new agent made
 * there shows without a window reload. A root is expanded the way discovery expands it (agents.ts
 * scanRoots: %VAR%, ${env:VAR}, ~), so a portable root is watched as well as found.
 * Pure: the watch itself is handed in.
 */
import { expandEnvPath, normPath } from './util';

export interface RootWatchDeps {
    exists: (dir: string) => boolean;
    /** a recursive watch of one folder; may throw where the platform has none */
    watch: (dir: string, onChange: () => void) => { close(): void };
    onChange: () => void;
}

export interface RootWatchers {
    /** watch exactly these roots (a missing one is skipped, a failed one is tried again next time); the folders watched */
    sync(roots: readonly string[]): string[];
    dispose(): void;
}

export function rootWatchers(deps: RootWatchDeps): RootWatchers {
    const open = new Map<string, { dir: string; w: { close(): void } }>();
    const close = (key: string): void => {
        try { open.get(key)?.w.close(); } catch { /* already gone */ }
        open.delete(key);
    };
    return {
        sync(roots) {
            const want = new Map<string, string>();
            for (const r of roots) {
                const dir = r ? expandEnvPath(String(r)) : '';
                if (dir && !want.has(normPath(dir)) && deps.exists(dir)) { want.set(normPath(dir), dir); }
            }
            for (const key of [...open.keys()]) { if (!want.has(key)) { close(key); } }
            for (const [key, dir] of want) {
                if (open.has(key)) { continue; }
                try { open.set(key, { dir, w: deps.watch(dir, () => deps.onChange()) }); }
                catch { /* recursive watch unavailable */ }
            }
            return [...open.values()].map(o => o.dir);
        },
        dispose() { for (const key of [...open.keys()]) { close(key); } }
    };
}
