/**
 * X-42 — THE SEARCH CORPUS: a normalized, role-split, persistent copy of what
 * is searchable, so a query stops paying for the transcripts.
 *
 * ‼️ WHY THIS EXISTS, MEASURED. The live pool on this machine is 381 sessions
 * and 664.105.497 bytes, and every Text query walked all of it synchronously on
 * the extension host's main thread: two consecutive fleet queries that matched
 * nothing took 9.670 ms and 13.151 ms, and the second was not faster, because
 * the LRU holds 80 files and the newest→oldest pass evicts itself in a circle.
 * A fixed-literal ripgrep candidate pass over the same raw tree took 182–215 ms.
 * The older "an index is unnecessary" decision was taken against 95 MB and 121
 * files; the data grew about sevenfold.
 *
 * ‼️ AND THE WORST OF IT WAS PAID FOR NOTHING. The parser produced — and cached
 * — every role even when the search was the default You+Agent: of 82.460.795
 * searchable characters in the real Claude tree, the dialogue is 2.366.249. The
 * default search was carrying about 80 million characters of tool traffic it
 * had been told not to look at. Hence one shard per ROLE: Dialog reads the
 * dialogue and nothing else, and the tool trail costs what it costs only when
 * somebody asks for it.
 *
 * THE THREE RULES THIS FILE IS BOUND BY:
 *
 *  1. **The answer does not change.** The candidate pass may only ever REMOVE
 *     work whose result is provably empty; every record it lets through is
 *     judged by the same `CompiledQuery.test/find` as before, through the same
 *     reducer (`search.ts` → `scanSession`). ripgrep produces a superset and
 *     never a verdict. `--fixed-strings` on literals the grammar itself
 *     extracted (`afQuery.prefilter`) is the whole of its authority.
 *  2. **It is a cache, so losing it is never data loss.** It lives under
 *     globalStorage, never beside the user's transcripts; a half-written shard,
 *     a corrupt manifest or a schema bump costs a rebuild and nothing else.
 *  3. **It never blocks activation.** Nothing is built until the Search page
 *     asks a question, the build yields to the event loop between files, and a
 *     superseded query aborts the one before it rather than queueing behind it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import {
    ALL_ROLES, ParseForeign, SearchOptions, SearchRecord, SearchResult, SearchRole,
    SearchableSession, buildMatcher, buildRecords, emptyResult, finishResult,
    orderSessions, readTranscript, scanLimits, scanSession, transcriptSignature
} from './search';
import { CompiledQuery, queryPrefilter } from './query';

/** Bump this and every shard is rebuilt — which is what a format change costs
 *  and the only honest way to pay for one. */
const SCHEMA = 1;
export const CORPUS_DIR = `search-corpus-v${SCHEMA}`;

const MANIFEST = 'manifest.json';
const SHARDS = 'sh';
/** Windows composes one command line and caps it near 32 KB; stay well under. */
const RG_BATCH_CHARS = 24_000;
const RG_BATCH_FILES = 400;
const RG_TIMEOUT_MS = 15_000;
/**
 * ‼️ BELOW THIS, RIPGREP IS THE SLOW WAY — MEASURED ON THIS MACHINE. Starting
 * one rg costs about 285 ms here (Windows, Defender in the path); the default
 * Dialog corpus of the real 405-session pool is 2.761.257 characters and Node
 * reads every byte of it in 84 ms. Four spawns to avoid 84 ms of reading is not
 * an optimization, it is 1.140 ms of ceremony — which is exactly what the first
 * cut of this file measured. So the process is spent only where it earns
 * itself: the tool trail, which is ~80 million characters.
 */
const RG_MIN_CHARS = 12_000_000;
/**
 * The ceiling on shard text kept in RAM. Deliberately BELOW what the old
 * transcript LRU allowed itself (48 million characters of parsed messages), and
 * it holds raw text rather than objects, so this is a smaller resident cost
 * than the thing it replaces — while covering the whole default corpus with
 * room to spare.
 */
const HOT_MAX_CHARS = 24_000_000;
/** Long enough that yielding is not the cost, short enough that the window
 *  never looks frozen while a first corpus is being built. */
const YIELD_MS = 12;
const PROGRESS_MS = 150;
const SAVE_EVERY = 25;

interface ShardInfo { f: string; n: number; c: number }

interface Entry {
    /** the transcript this was built from, kept so a deleted session can be pruned */
    p: string;
    sig: string;
    /** absent for a role with no records; `failed` entries have none at all */
    r: Record<string, ShardInfo>;
    /** the transcript could not be read as one — the same answer as a direct
     *  parse failure, remembered so it is not retried on every keystroke */
    failed?: boolean;
}

interface ManifestFile { v: number; entries: Record<string, Entry> }

export interface CorpusDeps {
    /** the extension's globalStorage folder — never the repo, never the vault */
    storageRoot: string;
    /**
     * An absolute ripgrep path, when one could be resolved. VS Code ships one
     * (`appRoot/node_modules.asar.unpacked/@vscode/ripgrep/bin/rg`), which is
     * why this is not a PATH lookup: the user's PATH is not ours to depend on,
     * and a wrong `rg` is worse than none.
     */
    rgPath?: string;
    parseForeign?: ParseForeign;
}

export interface CorpusSearchOptions extends SearchOptions {
    /** a superseded query aborts this one; nothing is posted after it fires */
    signal?: { aborted: boolean };
    /** how far the one-time build has got, for the page's own words */
    onProgress?(done: number, total: number): void;
}

export interface AbortedError extends Error { aborted: true }

const aborted = (): AbortedError => {
    const e = new Error('search aborted') as AbortedError;
    e.aborted = true;
    return e;
};

export const isAborted = (e: unknown): boolean =>
    !!e && typeof e === 'object' && (e as { aborted?: boolean }).aborted === true;

const sleep = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/** Tab and newline are the record separators, so the four SHORT fields escape
 *  them. The text does not need to: it is normalized, and normalization is
 *  exactly the removal of every character that could be a separator. */
const enc = (v: string): string => String(v ?? '')
    .replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
const dec = (v: string): string => String(v ?? '')
    .replace(/\\([\\tnr])/g, (_m, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : c === 'r' ? '\r' : '\\'));

export class TextSearchService {
    private readonly root: string;
    private readonly shardDir: string;
    private manifest: ManifestFile = { v: SCHEMA, entries: {} };
    private loaded = false;
    private pruned = false;
    private dirty = false;
    /** proven unusable this session (missing binary, a non-1 exit, a timeout) —
     *  asked once, not once per keystroke */
    private rgBroken = false;
    /** key → signature already proven complete IN THIS PROCESS. The manifest
     *  says what should be on disk and the first query checks that it is; a
     *  second one asking the same 1.321 `existsSync` questions costs 133 ms per
     *  keystroke to re-learn what only this process could have changed. */
    private verified = new Map<string, string>();
    /** shard file + signature → its raw text, most recently used last */
    private hot = new Map<string, string>();
    private hotChars = 0;

    constructor(private deps: CorpusDeps) {
        this.root = path.join(deps.storageRoot, CORPUS_DIR);
        this.shardDir = path.join(this.root, SHARDS);
    }

    // ------------------------------------------------------------- the manifest

    /** This service has no way to read this transcript — the same verdict, and
     *  the same silence, as the direct engine's own foreign-parser guard. */
    private unreadable(s: SearchableSession): boolean {
        return !!s.engine && s.engine !== 'claude' && !this.deps.parseForeign;
    }

    private keyOf(file: string): string {
        // Windows opens the same transcript under either case; one key per file.
        const norm = process.platform === 'win32'
            ? path.resolve(file).toLowerCase() : path.resolve(file);
        return crypto.createHash('sha1').update(norm).digest('hex').slice(0, 20);
    }

    private load(): void {
        if (this.loaded) { return; }
        this.loaded = true;
        try {
            const raw = fs.readFileSync(path.join(this.root, MANIFEST), 'utf8');
            const m = JSON.parse(raw) as ManifestFile;
            // A manifest from an older shape is not an error to report, it is a
            // cache miss: everything below rebuilds itself from the transcripts.
            if (m && m.v === SCHEMA && m.entries && typeof m.entries === 'object') {
                this.manifest = { v: SCHEMA, entries: m.entries };
            }
        } catch { /* no manifest yet, or a half-written one — rebuild */ }
    }

    private save(force = false): void {
        if (!this.dirty && !force) { return; }
        try {
            fs.mkdirSync(this.shardDir, { recursive: true });
            const tmp = path.join(this.root, `${MANIFEST}.tmp`);
            fs.writeFileSync(tmp, JSON.stringify(this.manifest), 'utf8');
            fs.renameSync(tmp, path.join(this.root, MANIFEST));
            this.dirty = false;
        } catch { /* a cache that cannot be written is still a working search */ }
    }

    /** Sessions that are gone take their shards with them. Only ever this
     *  cache's own files — a transcript is never touched from here. */
    private prune(): void {
        if (this.pruned) { return; }
        this.pruned = true;
        for (const [key, e] of Object.entries(this.manifest.entries)) {
            if (!e?.p || fs.existsSync(e.p)) { continue; }
            this.dropShards(e);
            delete this.manifest.entries[key];
            this.dirty = true;
        }
    }

    private dropShards(e: Entry): void {
        for (const info of Object.values(e.r ?? {})) {
            try { fs.unlinkSync(path.join(this.shardDir, info.f)); } catch { /* already gone */ }
        }
    }

    // -------------------------------------------------------------- the shards

    private writeShards(key: string, records: SearchRecord[]): Record<string, ShardInfo> {
        const byRole = new Map<SearchRole, string[]>();
        let i = 0;
        for (const m of records) {
            const line = [
                String(i), String(m.ts || 0), String(m.turn || 0),
                enc(m.tool ?? ''), enc(m.turnLabel ?? ''), m.text
            ].join('\t');
            const list = byRole.get(m.role);
            if (list) { list.push(line); } else { byRole.set(m.role, [line]); }
            i++;
        }
        const out: Record<string, ShardInfo> = {};
        fs.mkdirSync(this.shardDir, { recursive: true });
        for (const [role, lines] of byRole) {
            const name = `${key}.${role}.tsv`;
            const body = lines.join('\n');
            const tmp = path.join(this.shardDir, `${name}.tmp`);
            // Same folder, then rename: a reader sees the whole shard or the old
            // one, never half of a new one.
            fs.writeFileSync(tmp, body, 'utf8');
            fs.renameSync(tmp, path.join(this.shardDir, name));
            out[role] = { f: name, n: lines.length, c: body.length };
        }
        return out;
    }

    /**
     * ‼️ A BOUNDED WORKING SET IN RAM, ON TOP OF THE DISK CACHE — NOT A COPY OF
     * THE CORPUS. The default Dialog corpus of the real pool is 2.761.521
     * characters in 733 files, and on Windows the cost of asking for those 733
     * files again is most of what a warm query pays. Held as raw text, keyed by
     * the entry signature that produced them, they cost about 5,5 MB; the cap
     * below is what stops the tool trail (about 80 million characters) from
     * turning that into a resident copy of everything. The disk cache remains
     * the source of truth: this is only what the last few queries touched.
     */
    private shardText(info: ShardInfo, sig: string): string | undefined {
        const key = `${info.f}:${sig}`;
        const hot = this.hot.get(key);
        if (hot !== undefined) {
            this.hot.delete(key); this.hot.set(key, hot);
            return hot;
        }
        let raw: string;
        try { raw = fs.readFileSync(path.join(this.shardDir, info.f), 'utf8'); }
        catch { return undefined; }
        this.hot.set(key, raw);
        this.hotChars += raw.length;
        while (this.hotChars > HOT_MAX_CHARS) {
            const oldest = this.hot.keys().next().value as string | undefined;
            if (oldest === undefined) { break; }
            this.hotChars -= this.hot.get(oldest)?.length ?? 0;
            this.hot.delete(oldest);
        }
        return raw;
    }

    /**
     * ‼️ THE SHARD IS TESTED BEFORE IT IS TAKEN APART.
     *
     * Turning every line of a shard into a record object costs far more than
     * reading it: a fleet query over the default corpus produces a hundred
     * thousand objects, throws all of them away, and does it again on the next
     * keystroke — which is what made an early cut of this file SLOWER on the
     * dialogue than the ripgrep path was on eighty megabytes of tool trail.
     *
     * So the whole shard is matched first, then the surviving LINES, and only a
     * line that could carry a hit is parsed. Both tests are supersets by
     * construction: a record's text sits verbatim in its line and the line sits
     * verbatim in the shard, so anything the real matcher would find in a record
     * is found here too. What comes back is a candidate list; `scanSession`
     * still passes the only judgement there is.
     */
    private readShardCandidates(
        info: ShardInfo, role: SearchRole, matcher: CompiledQuery,
        block: boolean, sig: string, out: SearchRecord[]
    ): boolean {
        const raw = this.shardText(info, sig);
        if (raw === undefined) { return false; }
        if (!raw) { return true; }
        if (block && !matcher.test(raw)) { return true; }
        for (const line of raw.split('\n')) {
            if (!line || (block && !matcher.test(line))) { continue; }
            const p = line.split('\t');
            if (p.length < 6) { continue; }
            const tool = dec(p[3]);
            out.push({
                role,
                // the text is the last field and was never escaped — the whole
                // point of putting it there
                text: p.slice(5).join('\t'),
                ts: Number(p[1]) || 0,
                turn: Number(p[2]) || 0,
                turnLabel: dec(p[4]),
                ...(tool ? { tool } : {}),
                // carried only to restore the transcript's own order below
                ...({ __i: Number(p[0]) || 0 } as object)
            } as SearchRecord);
        }
        return true;
    }

    /** The selected roles, back in the order the transcript had them — which is
     *  the order the hits and the per-file preview cap depend on. */
    private recordsOf(
        e: Entry, roles: SearchRole[], matcher: CompiledQuery, block: boolean
    ): SearchRecord[] | undefined {
        const parts: SearchRecord[] = [];
        for (const role of roles) {
            const info = e.r?.[role];
            if (!info) { continue; }
            if (!this.readShardCandidates(info, role, matcher, block, e.sig, parts)) { return undefined; }
        }
        const at = (m: SearchRecord): number => (m as unknown as { __i: number }).__i ?? 0;
        return parts.sort((a, b) => at(a) - at(b));
    }

    // --------------------------------------------------------------- the build

    private buildOne(s: SearchableSession, sig: string): Entry {
        const key = this.keyOf(s.file);
        const old = this.manifest.entries[key];
        if (old) { this.dropShards(old); }
        let raw = '';
        let records: SearchRecord[] | undefined;
        try { raw = fs.readFileSync(s.file, 'utf8'); records = buildRecords(raw, s, this.deps.parseForeign); }
        catch { records = undefined; }
        const entry: Entry = records
            ? { p: path.resolve(s.file), sig, r: this.writeShards(key, records) }
            : { p: path.resolve(s.file), sig, r: {}, failed: true };
        this.manifest.entries[key] = entry;
        this.verified.set(key, sig);
        this.dirty = true;
        return entry;
    }

    /**
     * Bring the corpus up to date for exactly these sessions — newest first, so
     * the part of the answer a reader is most likely to want exists first, and
     * yielding between files so the window stays alive while it happens.
     */
    private async prepare(
        ordered: SearchableSession[], opts: CorpusSearchOptions
    ): Promise<Map<string, Entry>> {
        this.load();
        this.prune();
        const sigs = new Map<string, { s: SearchableSession; sig: string; key: string }>();
        const stale: { s: SearchableSession; sig: string; key: string }[] = [];
        for (const s of ordered) {
            // ‼️ NO PARSER IS NOT A PARSE RESULT (X-35). A foreign transcript
            // this service cannot read must not be INDEXED as unreadable, or the
            // next caller — the one that does carry the CLI viewer's parser —
            // would be handed a cached "failed" and find nothing in it. The
            // direct engine refuses to cache the same case for the same reason.
            if (this.unreadable(s)) { continue; }
            const key = this.keyOf(s.file);
            const sig = transcriptSignature(s);
            sigs.set(key, { s, sig, key });
            if (this.verified.get(key) === sig) { continue; }
            const e = this.manifest.entries[key];
            const fresh = e && e.sig === sig
                && (e.failed === true || Object.values(e.r ?? {}).every(
                    i => fs.existsSync(path.join(this.shardDir, i.f))));
            if (fresh) { this.verified.set(key, sig); } else { stale.push({ s, sig, key }); }
        }
        if (stale.length) {
            let done = 0;
            let lastYield = Date.now();
            let lastTick = 0;
            for (const item of stale) {
                if (opts.signal?.aborted) { this.save(); throw aborted(); }
                this.buildOne(item.s, item.sig);
                done++;
                if (done % SAVE_EVERY === 0) { this.save(); }
                const now = Date.now();
                if (opts.onProgress && now - lastTick > PROGRESS_MS) {
                    lastTick = now;
                    opts.onProgress(done, stale.length);
                }
                if (now - lastYield > YIELD_MS) { lastYield = now; await sleep(); }
            }
            this.save();
            opts.onProgress?.(stale.length, stale.length);
        }
        const out = new Map<string, Entry>();
        for (const [key] of sigs) {
            const e = this.manifest.entries[key];
            if (e) { out.set(key, e); }
        }
        return out;
    }

    // ----------------------------------------------------------- the candidates

    private shardsFor(
        entries: Map<string, Entry>, roles: SearchRole[]
    ): { byPath: Map<string, string>; chars: number } {
        const byPath = new Map<string, string>();
        let chars = 0;
        for (const [key, e] of entries) {
            if (e.failed) { continue; }
            for (const role of roles) {
                const info = e.r?.[role];
                if (info) { byPath.set(path.join(this.shardDir, info.f), key); chars += info.c; }
            }
        }
        return { byPath, chars };
    }

    /**
     * ‼️ EXIT 1 IS THE ONLY HONEST ZERO. ripgrep says "no match" with exit 1 and
     * "I failed" with 2 or more; a missing binary, a timeout and an unreadable
     * batch are all the second thing. Treating any of them as "nothing matched"
     * is how a search reports an empty page quickly and wrongly — so every one
     * of them gives up the narrowing entirely and everything is read.
     */
    private rgCandidates(files: string[], literals: string[], caseSensitive: boolean): Promise<Set<string> | null> {
        const rg = this.deps.rgPath;
        if (!rg || this.rgBroken || !files.length) { return Promise.resolve(null); }
        const batches: string[][] = [];
        let batch: string[] = [];
        let chars = 0;
        for (const f of files) {
            if (batch.length && (batch.length >= RG_BATCH_FILES || chars + f.length > RG_BATCH_CHARS)) {
                batches.push(batch); batch = []; chars = 0;
            }
            batch.push(f); chars += f.length + 1;
        }
        if (batch.length) { batches.push(batch); }

        const base = [
            '--no-config', '--no-ignore', '--text', '--fixed-strings',
            '--files-with-matches', '--no-messages',
            ...(caseSensitive ? [] : ['--ignore-case']),
            ...literals.flatMap(l => ['-e', l]), '--'
        ];
        const hit = new Set<string>();
        const runOne = (paths: string[]): Promise<boolean> => new Promise(resolve => {
            execFile(rg, [...base, ...paths], {
                timeout: RG_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true
            }, (err, stdout) => {
                const code = (err as { code?: unknown } | null)?.code;
                if (err && code !== 1) { resolve(false); return; }
                if (code !== 1) {
                    for (const line of String(stdout).split('\n')) {
                        const p = line.trim();
                        if (p) { hit.add(p); }
                    }
                }
                resolve(true);
            });
        });
        // In parallel: the cost of ripgrep here is almost entirely the process,
        // and four of them one after another is four times a fixed toll for no
        // reason. Measured on the real pool: 1.140 ms sequential, 383 ms not.
        return Promise.all(batches.map(runOne)).then(results => {
            if (results.some(r => !r)) { this.rgBroken = true; return null; }
            return hit;
        });
    }

    // ---------------------------------------------------------------- the query

    /**
     * The same contract as `searchTranscripts`, asynchronous and cancellable.
     * Every counter means what it meant: `filesScanned` is the sessions the
     * question was actually put to (a candidate pass that excludes one has
     * PROVEN it holds no match, so it is scanned, not skipped), `matchesFound`
     * is every match there is, and `parseFailures` is the transcripts that could
     * not be read as such.
     */
    async search(
        sessions: SearchableSession[], query: string, opts: CorpusSearchOptions = {}
    ): Promise<SearchResult> {
        const result = emptyResult();
        if (!query.trim()) { return result; }
        const matcher = buildMatcher(query, opts);
        if (!matcher.ok) { result.error = matcher.error; return result; }

        const ordered = orderSessions(sessions, opts);
        const lim = scanLimits(opts);
        const roles = ALL_ROLES.filter(r => lim.roles.has(r));
        const entries = await this.prepare(ordered, opts);
        if (opts.signal?.aborted) { throw aborted(); }

        // The plan is the grammar's own promise about what cannot match. Raw
        // regex never gets one — a pattern's invariants are not ours to guess.
        const plan = queryPrefilter(query, {
            regex: opts.regex, caseSensitive: opts.caseSensitive, wholeWord: opts.wholeWord
        });
        // ‼️ NARROWING IS ITSELF A COST, AND ON THE DEFAULT SEARCH IT IS THE
        // BIGGER ONE. The candidate pass reads every selected shard and then the
        // scan reads the survivors AGAIN — worth it against 80 million
        // characters of tool trail, absurd against the 2,8 million of dialogue,
        // which Node reads in full in 84 ms. So below the threshold, and
        // whenever ripgrep cannot be used, there is no candidate pass at all:
        // the shards are simply scanned with the real matcher, which is the same
        // answer by construction and one read instead of two.
        let candidateKeys: Set<string> | null = null;
        if (plan.mode === 'any' && plan.literals.length) {
            const { byPath, chars } = this.shardsFor(entries, roles);
            if (chars >= RG_MIN_CHARS) {
                const matched = await this.rgCandidates(
                    [...byPath.keys()], plan.literals, opts.caseSensitive === true);
                if (matched) {
                    candidateKeys = new Set<string>();
                    for (const f of matched) {
                        const key = byPath.get(f);
                        if (key) { candidateKeys.add(key); }
                    }
                }
            }
        }
        if (opts.signal?.aborted) { throw aborted(); }

        const deadline = Date.now() + (opts.timeBudgetMs ?? 10_000);
        let lastYield = Date.now();
        for (const s of ordered) {
            if (opts.signal?.aborted) { throw aborted(); }
            if (Date.now() > deadline) { result.timedOut = true; result.truncated = true; break; }
            const key = this.keyOf(s.file);
            const e = this.unreadable(s) ? undefined : entries.get(key);
            if (!e || e.failed) { result.parseFailures++; continue; }
            result.filesScanned++;
            if (candidateKeys && !candidateKeys.has(key)) { continue; }
            let records = this.recordsOf(e, roles, matcher, plan.monotone === true);
            if (!records) {
                // A shard vanished under us (a cleaner, a sync tool, a crash
                // mid-write). Rebuild it; if the transcript itself is the
                // problem, fall back to reading it the direct way rather than
                // reporting a hole in the answer.
                const rebuilt = this.buildOne(s, transcriptSignature(s));
                entries.set(key, rebuilt);
                records = rebuilt.failed
                    ? undefined : this.recordsOf(rebuilt, roles, matcher, plan.monotone === true);
                if (!records) { records = readTranscript(s, this.deps.parseForeign) ?? []; }
            }
            scanSession(records, s, matcher, lim, result);
            const now = Date.now();
            if (now - lastYield > YIELD_MS) { lastYield = now; await sleep(); }
        }
        this.save();
        return finishResult(result);
    }

    /** What the corpus costs on disk and how much of it is dialogue — the
     *  figures a report quotes rather than an estimate somebody made up. */
    stats(): { sessions: number; failed: number; shards: number; chars: number; dialogChars: number } {
        this.load();
        let shards = 0, chars = 0, dialogChars = 0, failed = 0;
        for (const e of Object.values(this.manifest.entries)) {
            if (e.failed) { failed++; continue; }
            for (const [role, info] of Object.entries(e.r ?? {})) {
                shards++;
                chars += info.c;
                if (role === 'user' || role === 'assistant') { dialogChars += info.c; }
            }
        }
        return { sessions: Object.keys(this.manifest.entries).length, failed, shards, chars, dialogChars };
    }
}

/**
 * VS Code ships ripgrep beside itself; that copy is the one to use. A PATH
 * lookup would depend on whatever the user installed, and a search whose
 * candidate pass changes with somebody's `%PATH%` is not a search anybody can
 * reason about. Returns undefined when it is not where it should be — the
 * Node fallback covers that case in full.
 */
export function resolveRipgrep(appRoot: string): string | undefined {
    if (!appRoot) { return undefined; }
    const exe = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const candidates = [
        path.join(appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', exe),
        path.join(appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', exe),
        path.join(appRoot, 'node_modules.asar.unpacked', 'vscode-ripgrep', 'bin', exe),
        path.join(appRoot, 'node_modules', 'vscode-ripgrep', 'bin', exe)
    ];
    for (const c of candidates) {
        try { if (fs.statSync(c).isFile()) { return c; } } catch { /* next */ }
    }
    return undefined;
}
