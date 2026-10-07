/**
 * S-141 — THE PAUSE MENU's rows, from where the chain stands (its board row)
 * and whether a HANDOVER order already reached its running leg. A row is
 * offered only where chains.pause / chains.resume would accept it, so a pick is
 * never answered "nothing to do". Pure; batonPauseUi.ts shows and applies them.
 */
import type { ChainRow } from './chainBoard';

export type PauseAct = 'here' | 'pass' | 'resume';
export interface PauseChoice { act: PauseAct; label: string; detail: string }

type Row = Pick<ChainRow, 'chainId' | 'state' | 'leg' | 'live' | 'lastLeg' | 'paused'>;

export function pauseChoices(row: Row | undefined, handover: boolean): PauseChoice[] {
    if (!row) { return []; }
    const out: PauseChoice[] = [];
    const p = row.paused;
    if (p) {
        out.push({
            act: 'resume', label: '▶ Continue',
            detail: p.held ? 'The waiting leg goes through the door now.'
                : p.closed ? 'Reopens the chain from the words the leg left at the pause.'
                    : p.mode === 'here' ? 'RESUME is said into the same session; it carries on where it stopped.'
                        : 'The pause is cancelled before the pass: the leg passes as usual and the next leg opens at once.'
        });
    }
    const running = row.state === 'running' && !row.lastLeg && (row.live === 'working' || row.live === 'idle');
    if (running && !p) {
        if (!handover) {
            out.push({ act: 'here', label: '⏸ Short break in place', detail: 'The leg finishes its step, commits and stops without passing. Its card stays; Continue resumes the same session.' });
        }
        out.push({ act: 'pass', label: '⏸⑂ Pass and pause', detail: 'The leg passes as usual; the next leg waits at the door until you continue. Survives a restart.' });
    } else if (running && p && p.mode === 'here' && !p.held) {
        out.push({ act: 'pass', label: '⏸⑂ Pass and pause instead', detail: 'For a restart or a long break: the leg is told to pass now, and the next leg waits for you.' });
    } else if (row.state === 'waiting' && !p) {
        out.push({ act: 'pass', label: '⏸⑂ Hold the waiting leg', detail: 'The next leg stays at the door until you continue.' });
    }
    return out;
}

/** The menu's title: where the chain stands. */
export function pauseTitle(row: Row): string {
    const p = row.paused;
    const at = p ? (p.held ? 'paused — the next leg waits' : p.closed ? 'paused in place — closed by a restart' : p.mode === 'here' ? 'paused in place' : 'pauses at the pass') : row.state;
    return `Agent Farm — chain ${row.chainId} · leg ${row.leg} · ${at}`;
}
