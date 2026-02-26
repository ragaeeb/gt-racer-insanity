import { getHazardManifestById } from '@/shared/game/hazard/hazardManifest';
import { getPowerupManifestById } from '@/shared/game/powerup/powerupManifest';
import type { HazardTrigger } from './hazardSystem';
import type { PowerupTrigger } from './powerupSystem';
import type { ActiveHazard, ActivePowerup, SimRoomState } from './types';

const POWERUP_PICKUP_RADIUS = 4;
const POWERUP_PICKUP_RADIUS_SQ = POWERUP_PICKUP_RADIUS * POWERUP_PICKUP_RADIUS;
const HAZARD_CAR_HALF_LENGTH = 2;

export const checkPowerupCollisions = (
    activePowerups: ActivePowerup[],
    players: SimRoomState['players'],
    powerupTriggerQueue: PowerupTrigger[],
    nowMs: number,
): void => {
    for (const powerup of activePowerups) {
        if (powerup.collectedAtMs !== null) {
            if (powerup.respawnAtMs !== null && nowMs >= powerup.respawnAtMs) {
                powerup.collectedAtMs = null;
                powerup.respawnAtMs = null;
            }
            continue;
        }

        const manifest = getPowerupManifestById(powerup.powerupId);
        if (!manifest) {
            continue;
        }

        for (const player of players.values()) {
            const dx = player.motion.positionX - powerup.position.x;
            const dz = player.motion.positionZ - powerup.position.z;
            if (dx * dx + dz * dz < POWERUP_PICKUP_RADIUS_SQ) {
                powerup.collectedAtMs = nowMs;
                powerup.respawnAtMs = nowMs + manifest.respawnMs;
                powerupTriggerQueue.push({ playerId: player.id, powerupType: manifest.type });
                break;
            }
        }
    }
};

export const checkHazardCollisions = (
    hazards: ActiveHazard[],
    players: SimRoomState['players'],
    hazardTriggerQueue: HazardTrigger[],
): void => {
    for (const hazard of hazards) {
        const manifest = getHazardManifestById(hazard.hazardId);
        if (!manifest) {
            continue;
        }

        for (const player of players.values()) {
            if (player.activeEffects.some((e) => e.effectType === manifest.statusEffectId)) {
                continue;
            }

            const dx = player.motion.positionX - hazard.position.x;
            const dz = player.motion.positionZ - hazard.position.z;
            const collisionRadius = manifest.collisionRadius + HAZARD_CAR_HALF_LENGTH;
            if (dx * dx + dz * dz < collisionRadius * collisionRadius) {
                hazardTriggerQueue.push({
                    applyFlipOnHit: manifest.applyFlipOnHit,
                    effectDurationMs: manifest.statusEffectDurationMs,
                    effectType: manifest.statusEffectId,
                    hazardId: manifest.id,
                    playerId: player.id,
                });
            }
        }
    }
};
