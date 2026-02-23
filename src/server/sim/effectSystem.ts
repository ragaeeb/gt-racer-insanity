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
    const existingEffectIndex = player.activeEffects.findIndex((effect) => effect.effectType === effectType);
    const nextEffect = {
        appliedAtMs: nowMs,
        effectType,
        expiresAtMs: nowMs + manifest.defaultDurationMs,
        intensity: Math.max(0, intensity),
    };

    if (existingEffectIndex < 0) {
        player.activeEffects.push(nextEffect);
        return;
    }

    const existingEffect = player.activeEffects[existingEffectIndex];
    player.activeEffects[existingEffectIndex] = {
        ...existingEffect,
        appliedAtMs: nowMs,
        expiresAtMs: Math.max(existingEffect.expiresAtMs, nextEffect.expiresAtMs),
        intensity: Math.max(existingEffect.intensity, nextEffect.intensity),
    };
};

export const tickStatusEffects = (player: SimPlayerState, nowMs: number) => {
    player.activeEffects = player.activeEffects.filter((effect) => effect.expiresAtMs > nowMs);
};
