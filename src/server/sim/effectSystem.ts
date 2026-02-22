import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import type { StatusEffectType } from '@/shared/network/snapshot';
import type { SimPlayerState } from '@/server/sim/types';

export const applyStatusEffectToPlayer = (
    player: SimPlayerState,
    effectType: StatusEffectType,
    nowMs: number,
    intensity = 1
) => {
    const manifest = getStatusEffectManifestById(effectType);
    player.activeEffects.push({
        appliedAtMs: nowMs,
        effectType,
        expiresAtMs: nowMs + manifest.defaultDurationMs,
        intensity,
    });
};

export const tickStatusEffects = (player: SimPlayerState, nowMs: number) => {
    player.activeEffects = player.activeEffects.filter((effect) => effect.expiresAtMs > nowMs);
};
