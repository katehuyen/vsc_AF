/**
 * The smart flex forms on the extension-host side — LOADED from
 * `media/afFlexForms.js` (X-370), which the page shares.
 */
import * as path from 'path';

export interface FlexRange<T = string> { lo: T; hi: T }
export interface FlexCap { soft?: number; hard?: number }
export type CapLevel = 'ok' | 'soft' | 'hard';

interface FlexFormsModule {
    rangeError(ladder: readonly string[], r: FlexRange): string;
    clampToRange(ladder: readonly string[], r: FlexRange, v: string): string;
    stepInRange(ladder: readonly string[], r: FlexRange, v: string, dir: number): { value: string; moved: boolean; why: string };
    triState(states: Record<string, string>, stored: string): '' | 'ask' | 'auto' | 'never';
    capError(c: FlexCap): string;
    capVerdict(c: FlexCap, spent: number, unit?: string): { level: CapLevel; sentence: string };
    deadReason(engine: string, needs: readonly string[]): string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: FlexFormsModule = require(path.join(__dirname, '..', '..', 'media', 'afFlexForms.js'));

export const rangeError = impl.rangeError;
export const clampToRange = impl.clampToRange;
export const stepInRange = impl.stepInRange;
export const triState = impl.triState;
export const capError = impl.capError;
export const capVerdict = impl.capVerdict;
export const deadReason = impl.deadReason;
