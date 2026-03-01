import type { SimPlayerState } from '@/server/sim/types';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';
import { getVehicleModifiers } from '@/shared/game/vehicle/vehicleClassManifest';

export type PowerupTrigger = {
    playerId: string;
    powerupType: 'ability-charge' | 'shield' | 'speed-boost';
};

export const applyPowerupTriggers = (
    players: Map<string, SimPlayerState>,
    triggers: PowerupTrigger[],
    nowMs: number
) => {
    for (const trigger of triggers) {
        const player = players.get(trigger.playerId);
        if (!player) {
            continue;
        }

        if (trigger.powerupType === 'speed-boost') {
            const { powerupSpeedMultiplier } = getVehicleModifiers(player.vehicleId);
            applyStatusEffectToPlayer(player, 'speed_burst', nowMs, powerupSpeedMultiplier);
        }
    }
};
