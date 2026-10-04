/**
 * X-482 — a sampling CPU profile of this very process, taken through an
 * in-process inspector session: no port is opened and nothing outside the
 * process can attach. One at a time; the profiler is switched off afterwards.
 */
import * as inspector from 'inspector';
import type { CpuProfile } from '../core/cpuProfile';

let running = false;

export function cpuProfileRunning(): boolean { return running; }

export async function captureCpuProfile(ms: number, intervalUs = 1000): Promise<CpuProfile> {
    if (running) { throw new Error('a CPU profile is already being taken in this process — wait for it to end'); }
    running = true;
    const session = new inspector.Session();
    const post = <T = unknown>(method: string, params: object = {}) => new Promise<T>((resolve, reject) =>
        session.post(method, params, (err, res) => err ? reject(err) : resolve(res as T)));
    try {
        session.connect();
        await post('Profiler.enable');
        await post('Profiler.setSamplingInterval', { interval: intervalUs });
        await post('Profiler.start');
        await new Promise(r => setTimeout(r, ms));
        const { profile } = await post<{ profile: CpuProfile }>('Profiler.stop');
        return profile;
    } finally {
        try { await post('Profiler.disable'); } catch { /* the session already went down */ }
        try { session.disconnect(); } catch { /* never connected */ }
        running = false;
    }
}
