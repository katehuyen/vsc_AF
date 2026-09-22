import { argStr, BridgeRegistry, need } from './bridge';

/**
 * The terminal-rendering repair: the VS Code `terminal.integrated` keys that
 * garble a claude TUI (ghost spaces, lost lines, restored terminals coming back
 * scrambled), plus the farm's own switch that sidesteps xterm.js by opening
 * claude sessions in the OS terminal.
 *
 * ‼️ `settings.set` is fenced to the agentFarm schema on purpose, so this is the
 * ONE door into `terminal.integrated`, and it can only write the keys named in
 * TERMINAL_RENDER_KEYS. The palette command and `terminal.render.apply` both
 * write through `applyTerminalRender`.
 */

export const TERMINAL_RENDER_KEYS = ['gpuAcceleration', 'smoothScrolling', 'enablePersistentSessions'] as const;
export type TerminalRenderAction = 'fix' | 'external' | 'persist' | 'restore';
export const TERMINAL_RENDER_ACTIONS: readonly TerminalRenderAction[] = ['fix', 'external', 'persist', 'restore'];

/** One settings section as the host sees it — `update` writes the user (global) scope. */
export interface SettingsSection {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

export interface TerminalRenderState {
    gpuAcceleration: string;
    smoothScrolling: boolean;
    enablePersistentSessions: boolean;
    externalTerminal: boolean;
    /** gpuAcceleration off and smoothScrolling off — the repair is in place */
    fixed: boolean;
}

export function terminalRenderState(term: SettingsSection, farm: SettingsSection): TerminalRenderState {
    const gpuAcceleration = term.get<string>('gpuAcceleration', 'auto');
    const smoothScrolling = term.get<boolean>('smoothScrolling', false);
    return {
        gpuAcceleration, smoothScrolling,
        enablePersistentSessions: term.get<boolean>('enablePersistentSessions', true),
        externalTerminal: farm.get<boolean>('externalTerminal', false),
        fixed: gpuAcceleration === 'off' && !smoothScrolling
    };
}

/**
 * Apply one repair and answer what was written, by full setting name (null =
 * the override was removed). `external` sets the farm's switch to `on`, or
 * flips it when `on` is not given — which is what the palette item does.
 */
export async function applyTerminalRender(
    action: TerminalRenderAction, term: SettingsSection, farm: SettingsSection, on?: boolean
): Promise<Record<string, unknown>> {
    const written: Record<string, unknown> = {};
    const setTerm = async (key: typeof TERMINAL_RENDER_KEYS[number], value: unknown) => {
        await term.update(key, value);
        written[`terminal.integrated.${key}`] = value === undefined ? null : value;
    };
    switch (action) {
        case 'fix':
            await setTerm('gpuAcceleration', 'off');
            await setTerm('smoothScrolling', false);
            break;
        case 'persist':
            await setTerm('enablePersistentSessions', false);
            break;
        case 'restore':
            for (const key of TERMINAL_RENDER_KEYS) { await setTerm(key, undefined); }
            break;
        case 'external': {
            const next = on ?? !farm.get<boolean>('externalTerminal', false);
            await farm.update('externalTerminal', next);
            written['agentFarm.externalTerminal'] = next;
            break;
        }
    }
    return written;
}

export function registerTerminalRenderOps(
    bridge: BridgeRegistry, io: { term(): SettingsSection; farm(): SettingsSection }
): void {
    bridge.register([
        {
            op: 'terminal.render.get',
            describe: 'The terminal rendering settings that garble a claude TUI, read from the user scope: terminal.integrated gpuAcceleration / smoothScrolling / enablePersistentSessions, agentFarm.externalTerminal, and `fixed` (the repair is in place). args: none',
            handler: () => terminalRenderState(io.term(), io.farm())
        },
        {
            op: 'terminal.render.apply',
            describe: 'Repair terminal rendering — the palette\'s "Fix Terminal Rendering". The only op that writes terminal.integrated, and only these keys. action: "fix" (gpuAcceleration off + smoothScrolling off — ghost spaces, lost lines) · "external" (claude sessions open in the OS terminal instead of xterm.js; `on` true/false, a flip when omitted) · "persist" (enablePersistentSessions off — restored terminals coming back garbled) · "restore" (removes the three terminal.integrated overrides). A NEW terminal picks the change up; open ones keep their renderer. args: action, on?',
            handler: async (args) => {
                const action = argStr(args, 'action') as TerminalRenderAction;
                need(TERMINAL_RENDER_ACTIONS.includes(action),
                    `action is ${TERMINAL_RENDER_ACTIONS.join(', ')} — not "${action}"`);
                const written = await applyTerminalRender(action, io.term(), io.farm(),
                    typeof args.on === 'boolean' ? args.on : undefined);
                return {
                    action, written, now: terminalRenderState(io.term(), io.farm()),
                    note: 'open a NEW terminal for it to take effect — the ones already open keep their renderer'
                };
            }
        }
    ]);
}
