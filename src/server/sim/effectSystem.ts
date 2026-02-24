import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import type { StatusEffectType } from '@/shared/network/snapshot';
import type { SimPlayerState } from '@/server/sim/types';

export const applyStatusEffectToPlayer = (
    player: SimPlayerState,
    effectType: StatusEffectType,
    nowMs: number,
    intensity = 1,
    durationMsOverride?: number,
) => {
    const manifest = getStatusEffectManifestById(effectType);
    if (!manifest) {
        return;
    }

    const durationMs = durationMsOverride ?? manifest.defaultDurationMs;

    const existingEffectIndexes: number[] = [];
    for (let index = 0; index < player.activeEffects.length; index += 1) {
        if (player.activeEffects[index]?.effectType === effectType) {
            existingEffectIndexes.push(index);
        }
    }

    const existingEffectIndex = existingEffectIndexes[0] ?? -1;

    if (existingEffectIndex < 0) {
        player.activeEffects.push({
            appliedAtMs: nowMs,
            effectType,
            expiresAtMs: nowMs + durationMs,
            intensity: Math.max(0, intensity),
        });
        return;
    }

    const existingEffect = player.activeEffects[existingEffectIndex];
    if (!existingEffect) {
        return;
    }

    const nextEffect = {
        appliedAtMs: nowMs,
        effectType,
        expiresAtMs: nowMs + durationMs,
        intensity: Math.max(0, intensity),
    };

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
