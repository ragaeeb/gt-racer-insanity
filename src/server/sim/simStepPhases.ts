import type { RaceEventPayload } from '@/shared/network/types';
import type { CollisionManager } from './collisionManager';
import { applyDriveStep, drainStartedCollisions, syncPlayerMotionFromRigidBody } from './collisionSystem';
import { tickStatusEffects } from './effectSystem';
import { snapPlayerToGround } from './groundSnapSystem';
import type { HazardTrigger } from './hazardSystem';
import type { InputQueue } from './inputQueue';
import type { PlayerManager } from './playerManager';
import type { RaceProgressTracker } from './raceProgressTracker';
import type { createRapierWorld } from './rapierWorld';
import type { SimRoomState } from './types';

export type SimTickContext = {
    collisionManager: CollisionManager;
    contactForcesByPair: Map<string, number>;
    dtSeconds: number;
    hazardTriggerQueue: HazardTrigger[];
    inputQueue: InputQueue;
    isTrackFlat: boolean;
    obstacleColliderHandles: Set<number>;
    playerManager: PlayerManager;
    progressTracker: RaceProgressTracker;
    pushRaceEvent: (event: RaceEventPayload) => void;
    rapierContext: ReturnType<typeof createRapierWorld>;
    state: SimRoomState;
    trackBoundaryX: number;
};

/** Consume input frames, tick status effects, apply drive forces for all players. */
export const stepPlayerDrive = (ctx: SimTickContext, nowMs: number): void => {
    for (const player of ctx.state.players.values()) {
        const frame = ctx.inputQueue.consumeLatestAfter(player.id, player.lastProcessedInputSeq);
        if (frame) {
            player.inputState = frame.controls;
            player.lastProcessedInputSeq = frame.seq;
        }

        tickStatusEffects(player, nowMs);

        const rigidBody = ctx.playerManager.rigidBodyById.get(player.id);
        if (!rigidBody) {
            continue;
        }
        if (nowMs < ctx.collisionManager.getDriveRecoveryUntilMs(player.id)) {
            continue;
        }

        applyDriveStep({ dtSeconds: ctx.dtSeconds, nowMs, player, rigidBody });
    }
};

/** Advance the Rapier world, sync positions back to player state, snap to ground, update race progress. */
export const stepPhysicsAndProgress = (ctx: SimTickContext, nowMs: number): void => {
    ctx.rapierContext.world.step(ctx.rapierContext.eventQueue);

    for (const player of ctx.state.players.values()) {
        const rigidBody = ctx.playerManager.rigidBodyById.get(player.id);
        if (!rigidBody) {
            continue;
        }

        // Sync first, then ground-snap — ordering is intentional, do not swap.
        syncPlayerMotionFromRigidBody(player, rigidBody, ctx.trackBoundaryX);
        snapPlayerToGround(
            ctx.rapierContext.rapier,
            player,
            rigidBody,
            ctx.rapierContext.world,
            ctx.dtSeconds,
            ctx.isTrackFlat,
        );
        ctx.progressTracker.updateProgress(player, ctx.state.raceState, nowMs, ctx.pushRaceEvent);
    }
};

/** Drain Rapier collision and contact-force events; apply bump and obstacle responses. */
export const stepCollisionResponse = (ctx: SimTickContext, nowMs: number): void => {
    const collisionResult = drainStartedCollisions(
        ctx.rapierContext.eventQueue,
        ctx.playerManager.colliderHandleToPlayerId,
        ctx.obstacleColliderHandles,
    );

    const { contactForcesByPair } = ctx;
    contactForcesByPair.clear();
    ctx.rapierContext.eventQueue.drainContactForceEvents((event) => {
        const id1 = ctx.playerManager.colliderHandleToPlayerId.get(event.collider1());
        const id2 = ctx.playerManager.colliderHandleToPlayerId.get(event.collider2());
        if (id1 && id2) {
            const key = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
            const magnitude = event.totalForceMagnitude();
            contactForcesByPair.set(key, Math.max(contactForcesByPair.get(key) ?? 0, magnitude));
        }
    });

    ctx.collisionManager.processBumpCollisions(
        collisionResult.startedPlayerPairs,
        collisionResult.endedPlayerPairs,
        nowMs,
        contactForcesByPair,
    );

    const obstacleTriggers = ctx.collisionManager.processObstacleHits(collisionResult.obstacleHits, nowMs);
    for (const trigger of obstacleTriggers) {
        ctx.hazardTriggerQueue.push(trigger);
    }
};
