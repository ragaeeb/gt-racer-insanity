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
    if (!manifest) {
        return;
    }

    const existingEffectIndex = player.activeEffects.findIndex((effect) => effect.effectType === effectType);
    const existingEffectIndexes: number[] = [];
    for (let index = 0; index < player.activeEffects.length; index += 1) {
        if (player.activeEffects[index]?.effectType === effectType) {
            existingEffectIndexes.push(index);
        }
    }

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
    let mergedExpiresAtMs = Math.max(existingEffect.expiresAtMs, nextEffect.expiresAtMs);
    let mergedIntensity = Math.max(existingEffect.intensity, nextEffect.intensity);
    for (const effectIndex of existingEffectIndexes) {
        if (effectIndex === existingEffectIndex) {
            continue;
        }

        const duplicateEffect = player.activeEffects[effectIndex];
        if (!duplicateEffect) {
            continue;
        }

        mergedExpiresAtMs = Math.max(mergedExpiresAtMs, duplicateEffect.expiresAtMs);
        mergedIntensity = Math.max(mergedIntensity, duplicateEffect.intensity);
    }

    player.activeEffects[existingEffectIndex] = {
        ...existingEffect,
        appliedAtMs: nowMs,
        expiresAtMs: mergedExpiresAtMs,
        intensity: mergedIntensity,
    };

    for (let index = existingEffectIndexes.length - 1; index >= 0; index -= 1) {
        const duplicateIndex = existingEffectIndexes[index];
        if (duplicateIndex === existingEffectIndex) {
            continue;
        }
        player.activeEffects.splice(duplicateIndex, 1);
    }
};

export const tickStatusEffects = (player: SimPlayerState, nowMs: number) => {
    player.activeEffects = player.activeEffects.filter((effect) => effect.expiresAtMs > nowMs);
};
