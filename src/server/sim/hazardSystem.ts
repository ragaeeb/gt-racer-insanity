import type { SimPlayerState } from '@/server/sim/types';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';

export type HazardTrigger = {
    effectType: 'flat_tire' | 'slowed' | 'stunned';
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
        applyStatusEffectToPlayer(player, trigger.effectType, nowMs, 1);
    }
};
