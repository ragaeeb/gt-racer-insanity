import type { RigidBody } from '@dimforge/rapier3d-compat';
import { applyPlayerBumpResponse } from '@/server/sim/collisionSystem';
import { applyStatusEffectToPlayer } from '@/server/sim/effectSystem';
import type { HazardTrigger } from '@/server/sim/hazardSystem';
import type { SimPlayerState } from '@/server/sim/types';
import {
    BIG_IMPACT_SPEED_MPS,
    BUMP_DRIVE_RECOVERY_MS_BUMPED,
    BUMP_DRIVE_RECOVERY_MS_RAMMER,
    BUMP_FLIP_COOLDOWN_MS,
    BUMP_PAIR_COOLDOWN_MS,
    COLLISION_STUN_DURATION_MS,
    MIN_BUMP_IMPACT_SPEED_MPS,
} from '@/shared/game/collisionConfig';
import { getStatusEffectManifestById } from '@/shared/game/effects/statusEffectManifest';
import type { RaceEventPayload } from '@/shared/network/types';

export type BumpPair = {
    firstPlayerId: string;
    secondPlayerId: string;
};

export type ObstacleHit = {
    playerId: string;
};

export const toPairKey = (a: string, b: string): string => {
    const [first, second] = a < b ? [a, b] : [b, a];
    return `${first}:${second}`;
};

/**
 * Manages car-to-car bump resolution, per-pair cooldowns, drive recovery windows,
 * and obstacle stun cooldowns. Calls back into `emitEvent` for collision events so
 * it stays decoupled from the room state event queue.
 */
export class CollisionManager {
    private readonly bumpPairCooldown = new Map<string, number>();
    private readonly activeBumpPairKeys = new Set<string>();
    private readonly pendingBumpPairByKey = new Map<string, BumpPair>();
    private readonly bumpFlipCooldownByPlayerId = new Map<string, number>();
    private readonly bumpDriveRecoveryByPlayerId = new Map<string, number>();
    private readonly obstacleStunCooldownByPlayerId = new Map<string, number>();

    constructor(
        private readonly players: Map<string, SimPlayerState>,
        private readonly rigidBodyById: Map<string, RigidBody>,
        private readonly emitEvent: (event: RaceEventPayload) => void,
        private readonly roomId: string,
    ) {}

    /** Returns the timestamp until which the given player's drive input is suppressed. */
    getDriveRecoveryUntilMs(playerId: string): number {
        return this.bumpDriveRecoveryByPlayerId.get(playerId) ?? 0;
    }

    /**
     * Processes the started and ended player-pair collision sets produced by
     * `drainStartedCollisions`. Applies bump responses and manages pair cooldowns.
     */
    processBumpCollisions(
        startedPairs: BumpPair[],
        endedPairs: BumpPair[],
        nowMs: number,
        contactForces?: Map<string, number>,
    ): void {
        for (const pair of endedPairs) {
            const pairKey = toPairKey(pair.firstPlayerId, pair.secondPlayerId);
            this.activeBumpPairKeys.delete(pairKey);
            this.pendingBumpPairByKey.delete(pairKey);
        }

        for (const pair of startedPairs) {
            const pairKey = toPairKey(pair.firstPlayerId, pair.secondPlayerId);
            this.activeBumpPairKeys.add(pairKey);

            const cooldownUntil = this.bumpPairCooldown.get(pairKey) ?? 0;
            if (nowMs < cooldownUntil) {
                this.pendingBumpPairByKey.set(pairKey, pair);
                continue;
            }

            this.pendingBumpPairByKey.delete(pairKey);
            this.applyBumpForPair(pair, nowMs, contactForces);
        }

        // Flush any pending pairs whose cooldown has now expired.
        for (const [pairKey, pair] of this.pendingBumpPairByKey) {
            if (!this.activeBumpPairKeys.has(pairKey)) {
                this.pendingBumpPairByKey.delete(pairKey);
                continue;
            }

            const cooldownUntil = this.bumpPairCooldown.get(pairKey) ?? 0;
            if (nowMs < cooldownUntil) {
                continue;
            }

            this.pendingBumpPairByKey.delete(pairKey);
            this.applyBumpForPair(pair, nowMs, contactForces);
        }
    }

    /**
     * Applies stun cooldowns to obstacle hits and returns the resulting hazard
     * triggers so the caller can enqueue them.
     */
    processObstacleHits(hits: ObstacleHit[], nowMs: number): HazardTrigger[] {
        const triggers: HazardTrigger[] = [];
        for (const hit of hits) {
            const cooldownUntil = this.obstacleStunCooldownByPlayerId.get(hit.playerId) ?? 0;
            if (nowMs < cooldownUntil) {
                continue;
            }

            triggers.push({ effectType: 'stunned', playerId: hit.playerId });
            const stunManifest = getStatusEffectManifestById('stunned');
            const stunDurationMs = stunManifest?.defaultDurationMs ?? 1_600;
            // 500 ms grace after stun expires before another obstacle can re-stun.
            this.obstacleStunCooldownByPlayerId.set(hit.playerId, nowMs + stunDurationMs + 500);
        }
        return triggers;
    }

    /** Removes all bump state associated with a leaving player. */
    clearForPlayer(playerId: string): void {
        const matches = (key: string) => key.startsWith(`${playerId}:`) || key.endsWith(`:${playerId}`);

        for (const key of this.activeBumpPairKeys) {
            if (matches(key)) {
                this.activeBumpPairKeys.delete(key);
            }
        }
        for (const [key] of this.pendingBumpPairByKey) {
            if (matches(key)) {
                this.pendingBumpPairByKey.delete(key);
            }
        }
        for (const [key] of this.bumpPairCooldown) {
            if (matches(key)) {
                this.bumpPairCooldown.delete(key);
            }
        }

        this.bumpFlipCooldownByPlayerId.delete(playerId);
        this.bumpDriveRecoveryByPlayerId.delete(playerId);
        this.obstacleStunCooldownByPlayerId.delete(playerId);
    }

    /** Clears all collision state in preparation for a race restart. */
    resetForRestart(): void {
        this.bumpPairCooldown.clear();
        this.activeBumpPairKeys.clear();
        this.pendingBumpPairByKey.clear();
        this.bumpFlipCooldownByPlayerId.clear();
        this.bumpDriveRecoveryByPlayerId.clear();
        this.obstacleStunCooldownByPlayerId.clear();
    }

    private applyBumpForPair(pair: BumpPair, nowMs: number, contactForces?: Map<string, number>): void {
        const pairKey = toPairKey(pair.firstPlayerId, pair.secondPlayerId);
        const playerA = this.players.get(pair.firstPlayerId);
        const playerB = this.players.get(pair.secondPlayerId);
        if (!playerA || !playerB) {
            return;
        }

        const impactSpeed = Math.max(Math.abs(playerA.motion.speed), Math.abs(playerB.motion.speed));
        if (impactSpeed < MIN_BUMP_IMPACT_SPEED_MPS) {
            return;
        }

        const slowerPlayer = Math.abs(playerA.motion.speed) <= Math.abs(playerB.motion.speed) ? playerA : playerB;
        const fasterPlayer = slowerPlayer === playerA ? playerB : playerA;

        const forceMagnitude = contactForces?.get(pairKey);
        applyPlayerBumpResponse(playerA, playerB, this.rigidBodyById, forceMagnitude);

        this.bumpPairCooldown.set(pairKey, nowMs + BUMP_PAIR_COOLDOWN_MS);
        this.bumpDriveRecoveryByPlayerId.set(fasterPlayer.id, nowMs + BUMP_DRIVE_RECOVERY_MS_RAMMER);
        this.bumpDriveRecoveryByPlayerId.set(slowerPlayer.id, nowMs + BUMP_DRIVE_RECOVERY_MS_BUMPED);

        const flipCooldownUntil = this.bumpFlipCooldownByPlayerId.get(slowerPlayer.id) ?? 0;
        const didFlip = nowMs >= flipCooldownUntil;
        if (didFlip) {
            applyStatusEffectToPlayer(slowerPlayer, 'flipped', nowMs);
            this.bumpFlipCooldownByPlayerId.set(slowerPlayer.id, nowMs + BUMP_FLIP_COOLDOWN_MS);
        }

        const isBigImpact = impactSpeed >= BIG_IMPACT_SPEED_MPS;
        const stunnedPlayerId = isBigImpact ? slowerPlayer.id : null;
        if (isBigImpact) {
            applyStatusEffectToPlayer(slowerPlayer, 'stunned', nowMs, 1, COLLISION_STUN_DURATION_MS);
        }

        this.emitEvent({
            kind: 'collision_bump',
            metadata: {
                againstPlayerId: pair.secondPlayerId,
                flippedPlayerId: didFlip ? slowerPlayer.id : null,
                rammerDriveLockMs: BUMP_DRIVE_RECOVERY_MS_RAMMER,
                rammerPlayerId: fasterPlayer.id,
                stunnedPlayerId,
            },
            playerId: pair.firstPlayerId,
            roomId: this.roomId,
            serverTimeMs: nowMs,
        });
    }
}
