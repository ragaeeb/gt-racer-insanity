import type { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import type { AbilityActivatePayload, RaceEventPayload } from '@/shared/network/types';
import { applyAbilityActivation, commitAbilityCooldown } from './abilitySystem';
import { checkDeployableCollisions, spawnDeployable, updateDeployables } from './deployableSystem';
import { applyHazardTriggers, type HazardTrigger } from './hazardSystem';
import { applyPowerupTriggers, type PowerupTrigger } from './powerupSystem';
import { createProjectile } from './projectileSystem';
import type { SimRoomState } from './types';

type CombatTuning = (typeof DEFAULT_GAMEPLAY_TUNING)['combat'];

export type AbilityActivationEnvelope = {
    playerId: string;
    payload: Omit<AbilityActivatePayload, 'roomId'>;
};

export const processAbilityQueue = (
    queue: AbilityActivationEnvelope[],
    players: SimRoomState['players'],
    activeProjectiles: SimRoomState['activeProjectiles'],
    cooldownStore: Map<string, number>,
    combatTuning: CombatTuning,
    roomId: string,
    pushRaceEvent: (event: RaceEventPayload) => void,
    nowMs: number,
): void => {
    if (queue.length === 0) {
        return;
    }

    for (const { playerId, payload } of queue.splice(0)) {
        const resolved = applyAbilityActivation(players, playerId, payload, nowMs, cooldownStore);

        if (resolved.spawnProjectile) {
            const sourcePlayer = players.get(resolved.sourcePlayerId);
            if (sourcePlayer) {
                const projectile = createProjectile(
                    sourcePlayer,
                    players,
                    activeProjectiles,
                    combatTuning,
                    nowMs,
                    resolved.targetPlayerId || undefined,
                );
                if (projectile) {
                    activeProjectiles.push(projectile);
                    commitAbilityCooldown(cooldownStore, resolved.sourcePlayerId, resolved.abilityId, nowMs);
                    pushRaceEvent({
                        kind: 'ability_activated',
                        metadata: { abilityId: resolved.abilityId, targetPlayerId: projectile.targetId },
                        playerId: resolved.sourcePlayerId,
                        roomId,
                        serverTimeMs: nowMs,
                    });
                }
            }
            continue;
        }

        if (!resolved.applied) {
            continue;
        }

        pushRaceEvent({
            kind: 'ability_activated',
            metadata: { abilityId: resolved.abilityId, targetPlayerId: resolved.targetPlayerId },
            playerId: resolved.sourcePlayerId,
            roomId,
            serverTimeMs: nowMs,
        });
    }
};

export const processHazardQueue = (
    queue: HazardTrigger[],
    players: SimRoomState['players'],
    roomId: string,
    pushRaceEvent: (event: RaceEventPayload) => void,
    nowMs: number,
): void => {
    if (queue.length === 0) {
        return;
    }

    const triggers = queue.splice(0);
    applyHazardTriggers(players, triggers, nowMs);

    for (const trigger of triggers) {
        pushRaceEvent({
            kind: 'hazard_triggered',
            metadata: {
                effectType: trigger.effectType,
                flippedPlayerId: trigger.applyFlipOnHit ? trigger.playerId : null,
                hazardId: trigger.hazardId ?? null,
            },
            playerId: trigger.playerId,
            roomId,
            serverTimeMs: nowMs,
        });
    }
};

export const processPowerupQueue = (
    queue: PowerupTrigger[],
    players: SimRoomState['players'],
    roomId: string,
    pushRaceEvent: (event: RaceEventPayload) => void,
    nowMs: number,
): void => {
    if (queue.length === 0) {
        return;
    }

    const triggers = queue.splice(0);
    applyPowerupTriggers(players, triggers, nowMs);

    for (const trigger of triggers) {
        pushRaceEvent({
            kind: 'powerup_collected',
            metadata: { powerupType: trigger.powerupType },
            playerId: trigger.playerId,
            roomId,
            serverTimeMs: nowMs,
        });
    }
};

export const processDeployableInputs = (
    players: SimRoomState['players'],
    activeDeployables: SimRoomState['activeDeployables'],
    deployInputPressedByPlayerId: Map<string, boolean>,
    deployableLifetimeTicks: number,
    combatTuning: CombatTuning,
    totalTrackLengthMeters: number,
): void => {
    for (const player of players.values()) {
        const isDeployPressed = player.inputState.boost;
        const wasDeployPressed = deployInputPressedByPlayerId.get(player.id) ?? false;

        if (isDeployPressed && !wasDeployPressed) {
            const deployable = spawnDeployable(
                'oil-slick',
                player,
                activeDeployables,
                deployableLifetimeTicks,
                combatTuning,
                totalTrackLengthMeters,
            );
            if (deployable) {
                activeDeployables.push(deployable);
            }
        }

        deployInputPressedByPlayerId.set(player.id, isDeployPressed);
    }
};

export const processDeployables = (
    activeDeployables: SimRoomState['activeDeployables'],
    players: SimRoomState['players'],
    combatTuning: CombatTuning,
    hazardTriggerQueue: HazardTrigger[],
): void => {
    const triggers = checkDeployableCollisions(activeDeployables, players.values(), combatTuning);
    for (const trigger of triggers) {
        hazardTriggerQueue.push(trigger);
    }
    updateDeployables(activeDeployables, 1);
};
