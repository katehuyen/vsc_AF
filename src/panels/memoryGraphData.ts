import { buildMemoryGraph } from '../core/memgraph';
import { MEMORY_TYPES, memoryUsage, planIndexFixes } from '../core/memusage';
import { DupGroup, findDuplicateGroups } from '../core/memorySync';
import type { MemoryGraphDeps } from './memoryGraph';

/** What the Memory Graph page draws, built fresh on every open and refresh. */

const WINDOW_MS = 30 * 24 * 3600 * 1000;

/** A duplicate group as the page needs it — names and paths, no AgentInfo. */
function groupRow(g: DupGroup): Record<string, unknown> {
    return {
        name: g.name,
        identical: g.identical,
        copies: g.copies.map(c => ({
            agentId: c.agent.id, agentName: c.agent.name,
            path: c.file.path, mtime: c.file.mtime, size: c.file.size
        }))
    };
}

export function buildData(deps: MemoryGraphDeps): Record<string, unknown> {
    const all = deps.getAgents();
    const agents = all.filter(a => a.memoryFiles.length > 0);
    const staleMs = (deps.staleDays?.() ?? 45) * 24 * 3600 * 1000;
    const now = Date.now();
    return {
        generatedAt: now,
        agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            graph: buildMemoryGraph(a, memoryUsage(deps.index, a.id, WINDOW_MS, a.dir)),
            // The index repair plan, computed here rather than behind a
            // round trip: the button that opens it can then say how many
            // there are before it is pressed.
            fixes: planIndexFixes(a.dir, a.memoryFiles),
            // What a distillation would be offered for. `stale` and `big` are
            // the two reasons the picker used to state as a `description`.
            files: a.memoryFiles
                .filter(f => f.name.toLowerCase() !== 'memory.md')
                .map(f => ({
                    name: f.name, path: f.path, tokens: f.tokens, mtime: f.mtime,
                    staleDays: Math.floor((now - f.mtime) / (24 * 3600 * 1000)),
                    stale: now - f.mtime > staleMs
                }))
        })),
        // ‼️ Every agent, not only the ones with memory: a copy has to be able
        // to land on an agent whose memory folder is still empty.
        allAgents: all.map(a => ({ id: a.id, name: a.name })),
        memoryTypes: MEMORY_TYPES.slice(),
        duplicates: findDuplicateGroups(all).map(groupRow),
        embeddingsOn: deps.embeddingsOn ? deps.embeddingsOn() : false,
        canDistill: !!deps.distill
    };
}
