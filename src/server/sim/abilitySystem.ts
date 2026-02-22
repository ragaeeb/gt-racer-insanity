import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import type { AbilityActivatePayload } from '@/shared/network/types';
import type { SimPlayerState } from '@/server/sim/types';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';

type AbilityResolutionResult = {
    applied: boolean;
    reason: 'cooldown' | 'invalid_ability' | 'invalid_player' | 'ok';
};

export const applyAbilityActivation = (
    players: Map<string, SimPlayerState>,
    payload: AbilityActivatePayload,
    nowMs: number,
    cooldownStore: Map<string, number>
): AbilityResolutionResult => {
    const sourcePlayer = players.get(payload.targetPlayerId ?? '');
    const ability = getAbilityManifestById(payload.abilityId);

    if (!ability) {
        return { applied: false, reason: 'invalid_ability' };
    }

    if (!sourcePlayer) {
        return { applied: false, reason: 'invalid_player' };
    }

    const cooldownKey = `${sourcePlayer.id}:${ability.id}`;
    const nextReadyAt = cooldownStore.get(cooldownKey) ?? 0;
    if (nextReadyAt > nowMs) {
        return { applied: false, reason: 'cooldown' };
    }

    cooldownStore.set(cooldownKey, nowMs + ability.baseCooldownMs);
    applyStatusEffectToPlayer(sourcePlayer, ability.effectId as 'boosted' | 'flat_tire' | 'slowed' | 'stunned', nowMs, 1);
    return { applied: true, reason: 'ok' };
};
