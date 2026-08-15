import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { applyDistilled, distillCandidates, distillFile, scanContradictions } from './distill';
import {
    addMemoryFile, applyIndexFixes, archiveMemoryFile, copyMemoryFileTo, IndexFix, MEMORY_TYPES,
    memoryDirOf, planIndexFixes, readMemoryFrontmatter, resolveMemoryFile
} from './memusage';
import {
    applyMergedContent, buildMergeDraft, DupGroup, findDuplicateGroups, syncGroup
} from './memorySync';

/**
 * Memory maintenance and semantic operations over the bridge (B-6).
 *
 * ‼️ MEMORY IS THE ONE STORE AN AGENT IS EXPECTED TO KEEP ITSELF, and until
 * this file it could make a note and nothing else. Every act that keeps a
 * memory folder honest — hand a fact to the agent that actually needs it, take
 * a dead file out of circulation, repair an index that points at nothing,
 * cross-check the corpus for claims that contradict each other, condense a
 * file that has grown into a book, ask the whole fleet what it knows about
 * something — lived on the Memory Graph page and nowhere else. An agent told
 * "tidy your memory" could only write more files.
 *
 * Four rules run through the file:
 *
 *  - **The plan and the write are two different calls.** Anything that
 *    overwrites, archives or repairs answers with what it WOULD do unless it
 *    is handed the explicit flag (`apply` / `confirm`). The plan is the thing
 *    a caller shows the user before it is allowed to matter.
 *  - **The path never leaves the agent's own memory/.** Every reference goes
 *    through `resolveMemoryFile`, because a bridge caller types the name and a
 *    page picks it from a list — those are not the same trust.
 *  - **The same core, the same backups.** Every op calls the function the page
 *    calls (`core/memusage.ts`, `core/memorySync.ts`, `core/distill.ts`), so
 *    the `.afbak` beside a file and the index write are identical from either
 *    door. Nothing here reimplements a write.
 *  - **A model call says what it cost.** The two cheap-model passes return
 *    `costUSD` and whether the result was APPLIED or is still a draft — the
 *    difference between "your memory has been rewritten" and "here is what it
 *    would become".
 */

export interface MemoryHit {
    agent: string;
    title: string;
    score: number;
    text: string;
    file: string;
}

export interface MemoryIndexReport {
    indexed: number;
    files: number;
    chunks: number;
    error?: string;
}

export interface MemoryBridgeDeps {
    getAgents(): AgentInfo[];
    /** Re-read the agent folders and repaint every tree and page. */
    refreshAll(): void;
    /** `agentFarm.judgeArgs` — the cheap model the maintenance passes run on. */
    judgeArgs(): string;
    /** `agentFarm.staleMemoryDays` — what counts as a stale memory file. */
    staleDays(): number;
    /** Whether an embeddings provider is configured at all. */
    embeddingsOn(): boolean;
    /** Embed whatever memory file moved since last time — the page's own path. */
    buildMemoryIndex(): Promise<MemoryIndexReport>;
    /** The fleet-wide semantic query the Memory Graph's Ask card runs. */
    askMemory(query: string, k: number): Promise<{ hits?: MemoryHit[]; error?: string }>;
}

/** A duplicate group as an answer — names and paths, no AgentInfo. */
function groupOut(g: DupGroup): Record<string, unknown> {
    return {
        name: g.name,
        identical: g.identical,
        copies: g.copies.map(c => ({
            agent: c.agent.name, agentId: c.agent.id,
            file: c.file.path, mtime: c.file.mtime, size: c.file.size
        }))
    };
}

export function registerMemoryOps(bridge: BridgeRegistry, deps: MemoryBridgeDeps): void {
    const findAgent = (ref: string): AgentInfo => {
        const a = deps.getAgents().find(x =>
            x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };

    /** The agent's own files, index excluded — the set every maintenance op works on. */
    const ownFiles = (agent: AgentInfo): AgentInfo['memoryFiles'] =>
        agent.memoryFiles.filter(f => f.name.toLowerCase() !== 'memory.md');

    /** The shared file this name refers to, or a refusal that says why. */
    const findGroup = (name: string): DupGroup => {
        const groups = findDuplicateGroups(deps.getAgents());
        const key = /\.md$/i.test(name) ? name.toLowerCase() : `${name.toLowerCase()}.md`;
        const g = groups.find(x => x.name === key);
        need(g, `"${name}" is not held by two or more agents — memory.duplicates lists the ${groups.length} that are.`);
        return g as DupGroup;
    };

    bridge.register([
        {
            /**
             * ‼️ MEMORY HAD NO OPS AT ALL — not even a read.
             *
             * The memory page learned to MAKE a file in 3.91.0 and the bridge
             * was never told, which is the rule in `_REF/agentfarm-dev.md`
             * being broken in the same commit that wrote it down. It matters
             * more here than almost anywhere else: an agent's memory is the one
             * store an agent is expected to keep itself, and until then it
             * could only do so by writing files behind the extension's back —
             * no index entry, no refresh, no frontmatter convention.
             */
            op: 'memory.list',
            describe: 'An agent\'s memory files: name, path, type and the one-line description that IS its index entry, plus whether the index still points at it. `tokens` and `staleDays` are the two figures a maintenance decision is made on — a big file is a distillation candidate, an untouched one is an archive candidate. args: agent (name|id)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const dir = memoryDirOf(agent.dir);
                const index = path.join(dir, 'MEMORY.md');
                const indexText = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
                const staleMs = deps.staleDays() * 24 * 3600 * 1000;
                const now = Date.now();
                return {
                    agent: agent.name,
                    dir,
                    indexed: fs.existsSync(index),
                    files: ownFiles(agent).map(f => {
                        const meta = readMemoryFrontmatter(f.path);
                        return {
                            name: f.name.replace(/\.md$/i, ''), file: f.path,
                            type: meta.type ?? null, description: meta.description ?? null,
                            tokens: f.tokens, mtime: f.mtime,
                            staleDays: Math.floor((now - f.mtime) / (24 * 3600 * 1000)),
                            stale: now - f.mtime > staleMs,
                            // ‼️ The honest question about a memory file is not
                            // "does it exist" but "will the agent ever open it":
                            // the index is the only thing loaded every session.
                            inIndex: indexText.includes(f.name)
                        };
                    })
                };
            }
        },
        {
            op: 'memory.add',
            describe: 'Make one memory file on an agent — scaffolded with the frontmatter convention and registered in MEMORY.md in the same write, so it is never born an orphan. ‼️ The description is not decoration: that line IS the index entry, and the index is what the agent reads to decide whether to open the file. args: agent (name|id), name (kebab-case, no .md), description, type? (' + MEMORY_TYPES.join('|') + ', default project)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const name = argStr(args, 'name');
                need(/^[a-z0-9][a-z0-9_-]*$/.test(name),
                    'name: lowercase letters, digits, - and _ only — it becomes a file name and an index target');
                const description = argStr(args, 'description');
                need(!!description, 'description is required — it is the line the index carries');
                const type = optStr(args, 'type') || 'project';
                need((MEMORY_TYPES as readonly string[]).includes(type),
                    `type must be one of: ${MEMORY_TYPES.join(', ')}`);
                const file = addMemoryFile(agent.dir, name, type, description);
                deps.refreshAll();
                return { agent: agent.name, name, type, file };
            }
        },
        {
            op: 'memory.copy',
            describe: 'Copy one memory file onto ANOTHER agent and register it in that agent\'s MEMORY.md in the same write — a copy never arrives orphaned. This is how a fact one agent learned reaches the agent that needs it. It refuses rather than overwrites when the target already holds a file of that name: use memory.sync to make two existing copies agree. args: agent (name|id — who has it), file (name, no path needed), to (name|id — who gets it)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const target = findAgent(argStr(args, 'to'));
                need(target.id !== agent.id, 'source and target are the same agent — nothing to copy.');
                const src = resolveMemoryFile(agent.dir, argStr(args, 'file'));
                const dest = copyMemoryFileTo(src, target.dir);
                deps.refreshAll();
                return {
                    from: agent.name, to: target.name, source: src, file: dest,
                    note: `Copied to ${target.name} and indexed in its MEMORY.md.`
                };
            }
        },
        {
            op: 'memory.archive',
            describe: '‼️ ARCHIVE, NOT DELETE — and it PLANS FIRST. The file moves to memory/archive/ (out of the discovery scan, so it stops loading and stops counting) and its pointer line leaves MEMORY.md with a timestamped .afbak of the index beside it. Nothing is ever removed from disk. Called bare it answers with where the file would go and which index lines would be dropped; only `confirm:true` moves it. args: agent (name|id), file (name), confirm? (default false = plan only)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const file = resolveMemoryFile(agent.dir, argStr(args, 'file'));
                const name = path.basename(file);
                need(name.toLowerCase() !== 'memory.md',
                    'MEMORY.md is the index, not a memory — archiving it would blind the agent. Use memory.index.fix to repair it.');
                if (args.confirm !== true) {
                    const index = path.join(memoryDirOf(agent.dir), 'MEMORY.md');
                    const raw = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
                    const base = name.toLowerCase();
                    const wiki = `[[${path.basename(name, '.md').toLowerCase()}]]`;
                    const lines = raw.split('\n').filter(l => {
                        const s = l.toLowerCase();
                        return s.includes(`(${base})`) || s.includes(`/${base})`) || s.includes(wiki);
                    });
                    return {
                        planned: true, agent: agent.name, file,
                        movesTo: path.join(memoryDirOf(agent.dir), 'archive', name),
                        indexLines: lines,
                        note: 'Nothing was changed. Pass confirm:true to archive it.'
                    };
                }
                const res = archiveMemoryFile(agent.dir, name);
                deps.refreshAll();
                return {
                    agent: agent.name, archived: name, movedTo: res.movedTo,
                    indexUpdated: res.indexUpdated, indexBackup: res.indexBackup ?? null,
                    note: `"${name}" is in memory/archive/${res.indexUpdated ? ' and out of MEMORY.md' : ''} — still on disk, no longer loaded.`
                };
            }
        },
        {
            op: 'memory.index.plan',
            describe: 'What is wrong with an agent\'s MEMORY.md, as a list of fixes and NOTHING ELSE — this call never writes. `add` = a file on disk the index does not mention (the agent will never open it); `remove` = an index line whose every target is gone (a pointer at nothing). An empty list is the answer you want. Feed the `line` values you accept to memory.index.fix. args: agent (name|id)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const fixes = planIndexFixes(agent.dir, agent.memoryFiles);
                return {
                    agent: agent.name,
                    index: path.join(memoryDirOf(agent.dir), 'MEMORY.md'),
                    fixes,
                    orphans: fixes.filter(f => f.kind === 'add').length,
                    dead: fixes.filter(f => f.kind === 'remove').length,
                    note: fixes.length ? 'Nothing was changed — memory.index.fix writes.' : 'The index is consistent. 🌿'
                };
            }
        },
        {
            op: 'memory.index.fix',
            describe: 'Write the index repairs, with a timestamped .afbak of MEMORY.md beside it. ‼️ It takes the exact `line` strings memory.index.plan returned, so a plan recomputed between reading and writing cannot apply a fix the caller never saw; `all:true` accepts whatever the plan says right now, which is the shortcut and says so. Needs `apply:true` either way. args: agent (name|id), lines? (string[] from the plan), all? (accept the whole current plan), apply (must be true)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const plan = planIndexFixes(agent.dir, agent.memoryFiles);
                need(plan.length, 'The index is already consistent — there is nothing to fix.');
                const wanted = Array.isArray(args.lines) ? (args.lines as unknown[]).map(String) : [];
                need(args.all === true || wanted.length,
                    'Say WHICH fixes: pass `lines` from memory.index.plan, or all:true to accept the current plan.');
                const fixes: IndexFix[] = args.all === true
                    ? plan
                    : plan.filter(f => wanted.includes(f.line));
                need(fixes.length,
                    'None of those lines is in the current plan — the index changed since it was read. Call memory.index.plan again.');
                if (args.apply !== true) {
                    return {
                        planned: true, agent: agent.name, fixes,
                        note: 'Nothing was written. Pass apply:true to change MEMORY.md.'
                    };
                }
                const backup = applyIndexFixes(agent.dir, fixes);
                deps.refreshAll();
                const added = fixes.filter(f => f.kind === 'add').length;
                return {
                    agent: agent.name, added, removed: fixes.length - added,
                    backup: backup ?? null,
                    note: `MEMORY.md updated — ${added} added, ${fixes.length - added} removed`
                        + (backup ? ' (a timestamped .afbak backup is next to it).' : '.')
                };
            }
        },
        {
            op: 'memory.duplicates',
            describe: 'Memory files two or more agents both hold, and whether their copies still say the same thing. `identical:false` is the one that matters — the same file name carrying two different facts is how a fleet ends up disagreeing with itself. Read-only. Reconcile with memory.sync (one copy wins) or memory.merge.draft (write the union by hand). args: none',
            handler: () => {
                const groups = findDuplicateGroups(deps.getAgents());
                return {
                    groups: groups.map(groupOut),
                    diverged: groups.filter(g => !g.identical).length,
                    note: groups.length
                        ? `${groups.filter(g => !g.identical).length} of ${groups.length} shared file(s) have drifted apart.`
                        : 'No memory file is held by more than one agent.'
                };
            }
        },
        {
            op: 'memory.sync',
            describe: '‼️ ONE COPY WINS AND OVERWRITES THE OTHERS, so it plans first. Bare, it names every file that would be rewritten and does nothing; `confirm:true` writes, keeping a timestamped .afbak beside each target. The source is the copy you trust — name the agent that holds it. Use this when the copies drifted and one of them is right; when both are right, memory.merge.draft is the honest tool. args: name (the shared file, e.g. "project_agentfarm"), source (name|id of the agent whose copy wins), confirm? (default false = plan only)',
            handler: (args) => {
                const group = findGroup(argStr(args, 'name'));
                const source = findAgent(argStr(args, 'source'));
                const from = group.copies.find(c => c.agent.id === source.id);
                need(from, `${source.name} does not hold "${group.name}" — its holders are: `
                    + group.copies.map(c => c.agent.name).join(', '));
                const targets = group.copies.filter(c => c !== from);
                if (args.confirm !== true) {
                    return {
                        planned: true, name: group.name, source: from!.file.path,
                        identical: group.identical,
                        overwrites: targets.map(t => ({ agent: t.agent.name, file: t.file.path })),
                        note: `Nothing was changed. confirm:true would overwrite ${targets.length} copy/copies with ${source.name}'s.`
                    };
                }
                const result = syncGroup(group, from!.file.path);
                deps.refreshAll();
                return {
                    name: group.name, source: from!.file.path,
                    written: result.written, backups: result.backups, errors: result.errors,
                    note: result.errors.length
                        ? `Synced ${result.written.length}, but: ${result.errors.join('; ')}`
                        : `"${group.name}" synced to ${result.written.length} agent(s) — ${result.backups.length} backup(s) kept.`
                };
            }
        },
        {
            op: 'memory.merge.draft',
            describe: 'The editable union of every copy of a shared memory file, newest first, with `=== FROM <agent> ===` markers between them — returned as TEXT, not opened in an editor. Edit it down to the one version that should exist everywhere and hand it back to memory.merge.apply. This is the answer when two copies each know something the other does not and picking a winner would lose half of it. args: name (the shared file)',
            handler: (args) => {
                const group = findGroup(argStr(args, 'name'));
                return {
                    name: group.name,
                    identical: group.identical,
                    files: group.copies.map(c => ({ agent: c.agent.name, file: c.file.path })),
                    draft: buildMergeDraft(group),
                    note: 'Edit this into the final version, then memory.merge.apply with confirm:true.'
                };
            }
        },
        {
            op: 'memory.merge.apply',
            describe: 'Write ONE agreed version of a shared memory file over every copy of it, with a timestamped .afbak beside each. The draft markers are stripped for you, so the text memory.merge.draft returned can come back edited but otherwise as-is; empty content is refused rather than written. Bare it names its targets, `confirm:true` writes. args: name (the shared file), content (the merged text), confirm? (default false = plan only)',
            handler: (args) => {
                const group = findGroup(argStr(args, 'name'));
                const content = argStr(args, 'content');
                const files = group.copies.map(c => c.file.path);
                if (args.confirm !== true) {
                    return {
                        planned: true, name: group.name, files,
                        note: `Nothing was written. confirm:true would write ${content.length} characters to ${files.length} file(s).`
                    };
                }
                const result = applyMergedContent(files, content);
                need(!result.errors.length || result.written.length,
                    `Nothing was written — ${result.errors.join('; ')}`);
                deps.refreshAll();
                return {
                    name: group.name, written: result.written, backups: result.backups,
                    errors: result.errors,
                    note: `"${group.name}" written to ${result.written.length} agent(s).`
                };
            }
        },
        {
            op: 'memory.contradictions',
            describe: '‼️ SPENDS A CHEAP-MODEL CALL, so it only ever runs when asked. Reads an agent\'s memory corpus as one text and reports claims that genuinely disagree — not "this is older", but "these two cannot both be true and nothing says which is". Nothing is written: the answer is a list to act on. `truncated:true` means the corpus did not fit the budget and the largest files went in first. The cost of the call is reported. args: agent (name|id)',
            handler: async (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const files = ownFiles(agent);
                need(files.length >= 2, `${agent.name} has ${files.length} memory file(s) — cross-checking needs at least two.`);
                const res = await scanContradictions(agent.dir, deps.judgeArgs(),
                    files.map(f => ({ name: f.name, path: f.path })));
                need(!res.error, `Contradiction scan failed — ${res.error}`);
                const list = res.contradictions ?? [];
                return {
                    agent: agent.name, contradictions: list,
                    scanned: res.scanned, truncated: res.truncated,
                    costUSD: res.costUSD ?? null, callTokens: res.callTokens ?? null,
                    note: list.length
                        ? `${list.length} contradiction(s) across ${res.scanned.length} file(s) — nothing was changed.`
                        : `No contradictions across ${res.scanned.length} memory file(s). 🌿`
                };
            }
        },
        {
            op: 'memory.distill',
            describe: '‼️ SPENDS A CHEAP-MODEL CALL AND CAN OVERWRITE — read both halves. A bloated or stale memory file goes to the cheap model, which condenses it WITHOUT losing facts: duplicates merged, prose tightened, dead lines moved to an "## Arşiv adayı" section, disagreements marked rather than resolved. Called bare it returns the DRAFT and writes nothing (`applied:false`); `apply:true` writes it over the original with a timestamped .afbak — one model call either way, so ask for the draft first if a human should see it. Called with no `file` it lists what is worth distilling and spends nothing. The cost of the call is reported. args: agent (name|id), file? (name — omit to list candidates), apply? (default false = draft only)',
            handler: async (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const ref = optStr(args, 'file');
                if (!ref) {
                    const candidates = distillCandidates(ownFiles(agent), { staleDays: deps.staleDays() });
                    return {
                        agent: agent.name, candidates,
                        note: candidates.length
                            ? `${candidates.length} file(s) are oversized or stale — pass one as \`file\`. Nothing was spent.`
                            : 'Nothing is big or stale enough to be worth a model call. Nothing was spent.'
                    };
                }
                const file = resolveMemoryFile(agent.dir, ref);
                need(path.basename(file).toLowerCase() !== 'memory.md',
                    'MEMORY.md is curated by hand — it is the index, and a model condensing it would drop pointers. Use memory.index.plan.');
                const res = await distillFile(agent.dir, deps.judgeArgs(), file);
                const spent = { costUSD: res.costUSD ?? null, callTokens: res.callTokens ?? null };
                need(!res.error && res.draft, `Distillation failed — ${res.error ?? 'no draft came back'}`);
                if (args.apply !== true) {
                    return {
                        agent: agent.name, file, applied: false, draft: res.draft,
                        tokensBefore: res.tokensBefore, tokensAfter: res.tokensAfter ?? null, ...spent,
                        note: `Draft only — ~${res.tokensBefore} → ~${res.tokensAfter} tokens. NOTHING was written; apply:true would, and would not call the model again for free.`
                    };
                }
                const backup = applyDistilled(file, res.draft as string);
                deps.refreshAll();
                return {
                    agent: agent.name, file, applied: true, backup,
                    tokensBefore: res.tokensBefore, tokensAfter: res.tokensAfter ?? null, ...spent,
                    note: `Distilled ✓ — ~${res.tokensBefore} → ~${res.tokensAfter} tokens, with a .afbak backup beside it.`
                };
            }
        },
        {
            op: 'memory.semantic.build',
            describe: 'Embed whatever memory file has changed since the last run, so memory.ask has something to search. Incremental by mtime — a second call right after the first indexes nothing and says so — and files that vanished are pruned out. Needs an embeddings provider (agentFarm.embeddingsProvider); without one it refuses rather than returning an empty index. memory.ask does this for itself, so this is for warming the index deliberately. args: none',
            handler: async () => {
                need(deps.embeddingsOn(),
                    'No embeddings provider — set agentFarm.embeddingsProvider ("gemini", or an OpenAI-compatible endpoint via agentFarm.embeddingsBaseUrl) first.');
                const res = await deps.buildMemoryIndex();
                need(!res.error, `Indexing stopped — ${res.error}`);
                return {
                    indexed: res.indexed, files: res.files, chunks: res.chunks,
                    note: res.indexed
                        ? `${res.indexed} file(s) newly embedded — the index holds ${res.files} file(s), ${res.chunks} chunk(s).`
                        : `Already up to date — ${res.files} file(s), ${res.chunks} chunk(s).`
                };
            }
        },
        {
            op: 'memory.ask',
            describe: '"What does the FLEET know about X?" — a meaning-based search across every agent\'s memory files, not a grep. Answers point at the memory records themselves: which agent, which file, the passage, and how close it scored. It re-embeds anything that moved before searching, so it is always current. ‼️ This is knowledge, not history — for what was SAID in a session use sessions.find / search ops. Needs an embeddings provider. args: query, k? (how many hits, default 12)',
            handler: async (args) => {
                need(deps.embeddingsOn(),
                    'No embeddings provider — set agentFarm.embeddingsProvider ("gemini", or an OpenAI-compatible endpoint via agentFarm.embeddingsBaseUrl) first.');
                const query = argStr(args, 'query');
                const k = Number(args.k);
                const res = await deps.askMemory(query, Number.isFinite(k) && k > 0 ? Math.trunc(k) : 12);
                need(!res.error, res.error ?? '');
                const hits = res.hits ?? [];
                return {
                    query, hits,
                    note: hits.length
                        ? `${hits.length} passage(s) across ${new Set(hits.map(h => h.agent)).size} agent(s).`
                        : 'Nothing in the fleet\'s memory is close to that. An empty index answers the same way — memory.semantic.build says which it is.'
                };
            }
        }
    ]);
}
