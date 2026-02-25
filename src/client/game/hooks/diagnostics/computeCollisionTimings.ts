import type { RaceSession } from '@/client/game/hooks/types';
import type { ContactEpisodeState } from './types';

export type CollisionTimings = {
    collisionContactToEventMs: number | null;
    collisionContactToFlipStartMs: number | null;
    collisionDriveLockRemainingMs: number | null;
    collisionEventAgeMs: number | null;
    collisionEventServerLagMs: number | null;
    collisionEventToFlipStartMs: number | null;
    collisionEventToOpponentFlipStartMs: number | null;
    collisionEventToSnapshotFlipMs: number | null;
    collisionHardSnapRemainingMs: number | null;
};

/**
 * Derives all collision latency and state timing fields from the current session
 * state and the active contact episode. Pure – no side effects.
 */
export const computeCollisionTimings = (
    session: RaceSession,
    episode: ContactEpisodeState,
    nowMs: number,
): CollisionTimings => {
    const collisionEventAgeMs = session.lastCollisionEventAtMs === null ? null : nowMs - session.lastCollisionEventAtMs;

    const collisionDriveLockRemainingMs =
        session.localCollisionDriveLockUntilMs === null
            ? null
            : Math.max(0, session.localCollisionDriveLockUntilMs - nowMs);

    const collisionEventServerLagMs =
        session.lastCollisionEventAtMs !== null && session.lastCollisionEventServerTimeMs !== null
            ? Math.max(0, session.lastCollisionEventAtMs - session.lastCollisionEventServerTimeMs)
            : null;

    const collisionEventToFlipStartMs =
        session.lastCollisionEventAtMs !== null && session.lastCollisionFlipStartedAtMs !== null
            ? Math.max(0, session.lastCollisionFlipStartedAtMs - session.lastCollisionEventAtMs)
            : null;

    const collisionEventToOpponentFlipStartMs =
        session.lastCollisionEventAtMs !== null && session.lastCollisionOpponentFlipStartedAtMs !== null
            ? Math.max(0, session.lastCollisionOpponentFlipStartedAtMs - session.lastCollisionEventAtMs)
            : null;

    const collisionEventToSnapshotFlipMs =
        session.lastCollisionEventAtMs !== null && session.lastCollisionSnapshotFlipSeenAtMs !== null
            ? Math.max(0, session.lastCollisionSnapshotFlipSeenAtMs - session.lastCollisionEventAtMs)
            : null;

    const collisionContactToEventMs =
        episode.active &&
        episode.startedAtMs > 0 &&
        session.lastCollisionEventAtMs !== null &&
        session.lastCollisionEventAtMs >= episode.startedAtMs
            ? Math.max(0, session.lastCollisionEventAtMs - episode.startedAtMs)
            : null;

    const earliestFlipStartAtMs = [session.lastCollisionFlipStartedAtMs, session.lastCollisionOpponentFlipStartedAtMs]
        .filter((v): v is number => v !== null)
        .reduce<number | null>((min, v) => (min === null || v < min ? v : min), null);

    const collisionContactToFlipStartMs =
        episode.active &&
        episode.startedAtMs > 0 &&
        earliestFlipStartAtMs !== null &&
        earliestFlipStartAtMs >= episode.startedAtMs
            ? Math.max(0, earliestFlipStartAtMs - episode.startedAtMs)
            : null;

    const collisionHardSnapRemainingMs =
        session.localCollisionHardSnapUntilMs === null
            ? null
            : Math.max(0, session.localCollisionHardSnapUntilMs - nowMs);

    return {
        collisionContactToEventMs,
        collisionContactToFlipStartMs,
        collisionDriveLockRemainingMs,
        collisionEventAgeMs,
        collisionEventServerLagMs,
        collisionEventToFlipStartMs,
        collisionEventToOpponentFlipStartMs,
        collisionEventToSnapshotFlipMs,
        collisionHardSnapRemainingMs,
    };
};
