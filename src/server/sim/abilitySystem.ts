import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';
import type { SimPlayerState } from '@/server/sim/types';
import { type AbilityTargeting, getAbilityManifestById } from '@/shared/game/ability/abilityManifest';

type AbilityActivationRequest = {
    abilityId: string;
    seq: number;
    targetPlayerId: string | null;
};

type AbilityResolutionResult = {
    abilityId: string;
    applied: boolean;
    reason: 'cooldown' | 'invalid_ability' | 'invalid_player' | 'ok' | 'target_not_found';
    sourcePlayerId: string;
    /** Whether the caller should spawn a projectile (delivery: 'projectile'). */
    spawnProjectile: boolean;
    targetPlayerId: string | null;
};

const findNearestOpponent = (
    players: Map<string, SimPlayerState>,
    sourcePlayer: SimPlayerState,
): SimPlayerState | null => {
    let closest: SimPlayerState | null = null;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const candidate of players.values()) {
        if (candidate.id === sourcePlayer.id) {
            continue;
        }

        const dx = candidate.motion.positionX - sourcePlayer.motion.positionX;
        const dz = candidate.motion.positionZ - sourcePlayer.motion.positionZ;
        const distanceSquared = dx * dx + dz * dz;

        if (distanceSquared < closestDistanceSquared) {
            closest = candidate;
            closestDistanceSquared = distanceSquared;
        }
    }

    return closest;
};

const findNearestForwardOpponent = (
    players: Map<string, SimPlayerState>,
    sourcePlayer: SimPlayerState,
    maxDistanceAhead?: number,
): SimPlayerState | null => {
    const forwardX = Math.sin(sourcePlayer.motion.rotationY);
    const forwardZ = Math.cos(sourcePlayer.motion.rotationY);

    let closest: SimPlayerState | null = null;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const candidate of players.values()) {
        if (candidate.id === sourcePlayer.id) {
            continue;
        }

        const dx = candidate.motion.positionX - sourcePlayer.motion.positionX;
        const dz = candidate.motion.positionZ - sourcePlayer.motion.positionZ;
        const distanceSquared = dx * dx + dz * dz;
        const distance = Math.sqrt(distanceSquared);

        if (distance < 0.0001) {
            continue;
        }
        if (maxDistanceAhead !== undefined && distance > maxDistanceAhead) {
            continue;
        }

        const directionX = dx / distance;
        const directionZ = dz / distance;
        const alignment = directionX * forwardX + directionZ * forwardZ;

        if (alignment < 0.4) {
            continue;
        }

        if (distanceSquared < closestDistanceSquared) {
            closest = candidate;
            closestDistanceSquared = distanceSquared;
        }
    }

    return closest;
};

const resolveTarget = (
    players: Map<string, SimPlayerState>,
    sourcePlayer: SimPlayerState,
    requestedTargetPlayerId: string | null,
    targeting: AbilityTargeting,
    maxDistanceAhead?: number,
): SimPlayerState | null => {
    switch (targeting) {
        case 'self':
            return sourcePlayer;
        case 'nearby-enemy': {
            if (requestedTargetPlayerId) {
                const requestedTarget = players.get(requestedTargetPlayerId);
                if (requestedTarget && requestedTarget.id !== sourcePlayer.id) {
                    return requestedTarget;
                }
            }
            return findNearestOpponent(players, sourcePlayer);
        }
        case 'forward-cone':
            return findNearestForwardOpponent(players, sourcePlayer, maxDistanceAhead);
        default: {
            const exhaustiveTargeting: never = targeting;
            console.warn(`[AbilitySystem] Unknown targeting mode: ${String(exhaustiveTargeting)}`);
            return null;
        }
    }
};

export const applyAbilityActivation = (
    players: Map<string, SimPlayerState>,
    sourcePlayerId: string,
    activation: AbilityActivationRequest,
    nowMs: number,
    cooldownStore: Map<string, number>,
): AbilityResolutionResult => {
    const sourcePlayer = players.get(sourcePlayerId);
    if (!sourcePlayer) {
        return {
            abilityId: activation.abilityId,
            applied: false,
            reason: 'invalid_player',
            sourcePlayerId,
            spawnProjectile: false,
            targetPlayerId: null,
        };
    }

    const ability = getAbilityManifestById(activation.abilityId);
    if (!ability) {
        return {
            abilityId: activation.abilityId,
            applied: false,
            reason: 'invalid_ability',
            sourcePlayerId,
            spawnProjectile: false,
            targetPlayerId: null,
        };
    }

    const cooldownKey = `${sourcePlayer.id}:${ability.id}`;
    const nextReadyAt = cooldownStore.get(cooldownKey) ?? 0;
    if (nextReadyAt > nowMs) {
        return {
            abilityId: ability.id,
            applied: false,
            reason: 'cooldown',
            sourcePlayerId,
            spawnProjectile: false,
            targetPlayerId: null,
        };
    }

    const targetPlayer = resolveTarget(
        players,
        sourcePlayer,
        activation.targetPlayerId,
        ability.targeting,
        ability.maxDistanceAhead,
    );
    if (!targetPlayer) {
        return {
            abilityId: ability.id,
            applied: false,
            reason: 'target_not_found',
            sourcePlayerId,
            spawnProjectile: false,
            targetPlayerId: null,
        };
    }

    cooldownStore.set(cooldownKey, nowMs + ability.baseCooldownMs);

    const isProjectile = ability.delivery === 'projectile';

    // Projectile-delivery abilities defer their effect to the projectile hit.
    // Instant abilities apply the status effect immediately.
    if (!isProjectile) {
        applyStatusEffectToPlayer(targetPlayer, ability.effectId, nowMs, 1);
    }

    return {
        abilityId: ability.id,
        applied: true,
        reason: 'ok',
        sourcePlayerId,
        spawnProjectile: isProjectile,
        targetPlayerId: targetPlayer.id,
    };
};
