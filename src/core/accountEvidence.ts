/**
 * X-333 — READING THE ENGINES' OWN RECORDS OFF A SLOT DIRECTORY.
 *
 * The rules for what those records mean live in `accountAttribution.ts`, which
 * is pure. This is the half that touches the disk, and it is deliberately the
 * thin half: it collects, it never decides.
 *
 * ‼️ WHICH FILES IS DERIVED FROM THE ADAPTER, NEVER TYPED HERE. A list of file
 * names in this file would be a second place the slot layout lives, and it goes
 * stale the first time an engine changes shape — the same failure `slotWatch`
 * was built to avoid. Two questions are asked of the adapter and both are
 * already answered there:
 *
 *   · is `sessions` one of this engine's SHARED paths? If it is a junction into
 *     the common pool (Codex), a record under the slot says nothing about the
 *     slot. If it is the slot's own (Claude), a record under it is a process
 *     that ran with that directory as its config dir — which is certain, and is
 *     the only thing that can place a session started from a bare terminal.
 *   · which files are the slot's OWN? Those are what the capture copies and
 *     what a run rewrites, so their mtime is the slot being touched. A shared
 *     path's mtime is the whole machine's and means nothing per account.
 *
 * ‼️ AND NOTHING HERE IS FATAL. A slot directory can be half-made, locked by a
 * running CLI, or simply not exist yet. Every read is guarded and a failure
 * yields less evidence, never an exception: an accounts page that cannot draw
 * because one file was busy is worse than one drawing the four sign-ins it
 * could read.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AccountEvidence, RegistryRecord, SlotRecord, SlotTouch } from './accountAttribution';
import { adapterFor } from './engineAccounts';

/** What this module needs off a stored account; `EngineAccountSlot` satisfies it. */
export interface EvidenceSlot {
    id: string;
    engine: string;
    dir: string;
    /** when the slot was made — a touch at or before it is the capture itself */
    capturedAt?: number;
}

const readJson = (file: string): Record<string, unknown> | undefined => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>; }
    catch { return undefined; }
};

const mtimeOf = (file: string): number => {
    try { return fs.statSync(file).mtimeMs; } catch { return 0; }
};

/**
 * `<slot>/sessions/<pid>.json` — the CLI's own registry of the processes it is
 * running. Read only where `sessions` is NOT shared with the main directory,
 * because under a junction the record belongs to the machine, not the slot.
 */
function registryOf(slot: EvidenceSlot): RegistryRecord[] {
    const a = adapterFor(slot.engine);
    if (a.sharedPaths.includes('sessions')) { return []; }
    const dir = path.join(slot.dir, 'sessions');
    let names: string[] = [];
    try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json')); } catch { return []; }
    const out: RegistryRecord[] = [];
    for (const n of names) {
        const j = readJson(path.join(dir, n));
        const sessionId = String(j?.sessionId ?? '').trim();
        if (sessionId) { out.push({ slot: slot.id, sessionId }); }
    }
    return out;
}

/**
 * The slot's own `.claude.json` — `projects[<cwd>].lastSessionId`, the CLI
 * writing down what it last did where.
 *
 * ‼️ THIS FILE IS COPIED BY THE CAPTURE, so its history can belong to another
 * sign-in entirely. Nothing is filtered here — the copy is only detectable
 * ACROSS slots and that comparison is `uniqueSlotRecords`, in the pure half.
 * Filtering half of it here would leave two places deciding one question.
 */
function slotRecordsOf(slot: EvidenceSlot): SlotRecord[] {
    const a = adapterFor(slot.engine);
    const own = a.ownFiles.find(f => f.endsWith('.claude.json'));
    if (!own) { return []; }
    const j = readJson(path.join(slot.dir, own));
    const projects = j?.projects as Record<string, Record<string, unknown>> | undefined;
    if (!projects) { return []; }
    const out: SlotRecord[] = [];
    for (const v of Object.values(projects)) {
        const sessionId = String(v?.lastSessionId ?? '').trim();
        if (!sessionId) { continue; }
        const at = typeof v?.lastStartTime === 'number' ? v.lastStartTime : 0;
        out.push({ slot: slot.id, sessionId, ...(at > 0 ? { at } : {}) });
    }
    return out;
}

/**
 * The slot was touched — the newest mtime across the files that are ITS OWN.
 * Shared paths are excluded by construction: their mtime is the machine's and
 * would make every sign-in look busy whenever any of them ran.
 */
function touchOf(slot: EvidenceSlot): SlotTouch | undefined {
    const a = adapterFor(slot.engine);
    const files = [...a.ownFiles, ...(a.carryFiles ?? [])];
    let at = 0;
    for (const f of files) { at = Math.max(at, mtimeOf(path.join(slot.dir, f))); }
    if (!(at > 0)) { return undefined; }
    return { slot: slot.id, at, ...(slot.capturedAt ? { capturedAt: slot.capturedAt } : {}) };
}

/**
 * Everything the disk can say about which sign-in ran what.
 *
 * `manifest` is not collected here: it is the farm's own launch record, it is
 * already in memory, and reading it off a file again would be a second copy of
 * a truth that has one owner.
 */
export function readSlotEvidence(slots: readonly EvidenceSlot[]): AccountEvidence {
    const registry: RegistryRecord[] = [];
    const slotRecords: SlotRecord[] = [];
    const touches: SlotTouch[] = [];
    for (const slot of slots) {
        if (!slot?.id || !slot?.dir) { continue; }
        registry.push(...registryOf(slot));
        slotRecords.push(...slotRecordsOf(slot));
        const t = touchOf(slot);
        if (t) { touches.push(t); }
    }
    return { registry, slotRecords, touches };
}
