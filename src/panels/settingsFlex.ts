/**
 * U-152 — the Farm Settings "Flow & Content" card's messages. Each arm calls the
 * action the bridge op of the same job calls (`core/flexActions.ts`), so the page
 * and `flex.set` / `presets.*` cannot drift apart.
 */
import {
    applyPresetAt, currentSettingsValues, deletePresetNamed, FlexDeps, savePresetAs, setFlexSetting
} from '../core/flexActions';

/** Handles the card's own message types; false = not one of them. A refusal goes to `refused`. */
export async function flexCardMessage(
    msg: { type: string; [k: string]: unknown }, deps: FlexDeps, refused: (error: string) => void
): Promise<boolean> {
    try {
        switch (msg.type) {
            case 'flexSet':
                await setFlexSetting(deps, String(msg.point ?? ''), msg.value);
                return true;
            case 'flexReset':
                await setFlexSetting(deps, String(msg.point ?? ''), undefined);
                return true;
            case 'presetApply':
                await applyPresetAt(deps, String(msg.name ?? ''), 'settings');
                return true;
            case 'presetSave':
                await savePresetAs(deps, {
                    name: String(msg.name ?? ''), values: currentSettingsValues(deps), scope: 'global'
                });
                return true;
            case 'presetDelete':
                await deletePresetNamed(deps, String(msg.name ?? ''));
                return true;
            default:
                return false;
        }
    } catch (e) {
        refused(String((e as Error)?.message ?? e));
        return true;
    }
}
