import type { SimPlayerState } from '@/server/sim/types';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';
import type { StatusEffectType } from '@/shared/network/snapshot';

export type HazardTrigger = {
    applyFlipOnHit?: boolean;
    effectDurationMs?: number;
    effectType: StatusEffectType;
    hazardId?: string;
    playerId: string;
};

export const applyHazardTriggers = (
    players: Map<string, SimPlayerState>,
    triggers: HazardTrigger[],
    nowMs: number
) => {
    for (const trigger of triggers) {
        const player = players.get(trigger.playerId);
        if (!player) continue;
        applyStatusEffectToPlayer(player, trigger.effectType, nowMs, 1, trigger.effectDurationMs);
        if (trigger.applyFlipOnHit) {
            applyStatusEffectToPlayer(player, 'flipped', nowMs, 1);
        }
    }
};
