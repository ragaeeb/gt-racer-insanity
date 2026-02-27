import { describe, expect, it } from 'bun:test';
import {
    CONTACT_DISTANCE_THRESHOLD_METERS,
    createContactEpisodeState,
    PASS_THROUGH_DISTANCE_THRESHOLD_METERS,
} from './types';

// We test the state machine logic by simulating what useContactEpisodeTracker does
// without relying on React's useRef.

type NearestOpponent = {
    distanceMeters: number;
    id: string;
    relativeZ: number;
};

type RaceSession = {
    lastCollisionEventAtMs: number | null;
    [key: string]: unknown;
};

// Extracted pure logic from useContactEpisodeTracker for unit testing
const runUpdate = (
    episode: ReturnType<typeof createContactEpisodeState>,
    nearest: NearestOpponent | null,
    session: RaceSession,
    nowMs: number,
) => {
    const isContactActive = nearest !== null && nearest.distanceMeters <= CONTACT_DISTANCE_THRESHOLD_METERS;

    if (isContactActive && nearest) {
        if (!episode.active || episode.opponentId !== nearest.id) {
            episode.active = true;
            episode.startedAtMs = nowMs;
            episode.opponentId = nearest.id;
            episode.minDistanceMeters = nearest.distanceMeters;
            episode.initialRelativeZ = nearest.relativeZ;
            episode.passThroughSuspected = false;
            episode.hadCollisionEvent = false;
        } else {
            episode.minDistanceMeters = Math.min(episode.minDistanceMeters, nearest.distanceMeters);
        }

        if (session.lastCollisionEventAtMs !== null && session.lastCollisionEventAtMs >= episode.startedAtMs) {
            episode.hadCollisionEvent = true;
        }

        const crossedThroughOpponent =
            Math.abs(episode.initialRelativeZ) > 0.01 &&
            Math.abs(nearest.relativeZ) > 0.01 &&
            Math.sign(nearest.relativeZ) !== Math.sign(episode.initialRelativeZ);

        if (
            crossedThroughOpponent &&
            episode.minDistanceMeters <= PASS_THROUGH_DISTANCE_THRESHOLD_METERS &&
            !episode.hadCollisionEvent
        ) {
            episode.passThroughSuspected = true;
        }

        return { newPassThroughDetected: false, detectedOpponentId: null, detectedMinDistanceMeters: 0 };
    }

    if (episode.active) {
        const wasPassThrough = episode.passThroughSuspected;
        const closedOpponentId = episode.opponentId;
        const closedMinDistance = episode.minDistanceMeters;

        Object.assign(episode, createContactEpisodeState());

        if (wasPassThrough) {
            return {
                newPassThroughDetected: true,
                detectedOpponentId: closedOpponentId,
                detectedMinDistanceMeters: closedMinDistance,
            };
        }
    }

    return { newPassThroughDetected: false, detectedOpponentId: null, detectedMinDistanceMeters: 0 };
};

const makeSession = (lastCollisionEventAtMs: number | null = null): RaceSession => ({
    lastCollisionEventAtMs,
});

describe('contact episode tracker state machine', () => {
    it('should start a new episode when an opponent enters contact range', () => {
        const episode = createContactEpisodeState();
        const nearest = { id: 'opp-1', distanceMeters: CONTACT_DISTANCE_THRESHOLD_METERS - 0.1, relativeZ: 2 };

        runUpdate(episode, nearest, makeSession(), 1000);

        expect(episode.active).toBeTrue();
        expect(episode.opponentId).toBe('opp-1');
        expect(episode.startedAtMs).toBe(1000);
        expect(episode.initialRelativeZ).toBe(2);
    });

    it('should update minDistanceMeters as opponent gets closer', () => {
        const episode = createContactEpisodeState();
        const opponent = { id: 'opp-1', distanceMeters: CONTACT_DISTANCE_THRESHOLD_METERS - 0.1, relativeZ: 1 };

        runUpdate(episode, opponent, makeSession(), 1000);
        runUpdate(episode, { ...opponent, distanceMeters: 0.5 }, makeSession(), 1016);

        expect(episode.minDistanceMeters).toBe(0.5);
    });

    it('should end episode and return clean state when opponent leaves range', () => {
        const episode = createContactEpisodeState();
        const nearOpponent = { id: 'opp-1', distanceMeters: CONTACT_DISTANCE_THRESHOLD_METERS - 0.1, relativeZ: 1 };

        runUpdate(episode, nearOpponent, makeSession(), 1000);
        expect(episode.active).toBeTrue();

        const result = runUpdate(episode, null, makeSession(), 1100);

        expect(episode.active).toBeFalse();
        expect(result.newPassThroughDetected).toBeFalse();
    });

    it('should mark hadCollisionEvent when a collision event occurs during contact', () => {
        const episode = createContactEpisodeState();
        const opponent = { id: 'opp-1', distanceMeters: 0.5, relativeZ: 2 };

        runUpdate(episode, opponent, makeSession(), 1000);
        // Simulate collision event happening at t=1100
        runUpdate(episode, opponent, makeSession(1100), 1100);

        expect(episode.hadCollisionEvent).toBeTrue();
    });

    it('should NOT flag passthrough when a collision event was registered', () => {
        const episode = createContactEpisodeState();
        const closeDist = PASS_THROUGH_DISTANCE_THRESHOLD_METERS - 0.1;

        // Initial contact — opponent starts ahead (+relativeZ)
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: 1 }, makeSession(), 1000);
        // Collision event at 1050
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: 0.5 }, makeSession(1050), 1050);
        // Opponent has passed through (sign flip on relativeZ), but had collision event
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: -0.5 }, makeSession(1050), 1100);

        expect(episode.passThroughSuspected).toBeFalse();
    });

    it('should detect pass-through when relativeZ sign flips without collision event', () => {
        const episode = createContactEpisodeState();
        const closeDist = PASS_THROUGH_DISTANCE_THRESHOLD_METERS - 0.1;

        // Start contact with positive relativeZ
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: 1 }, makeSession(), 1000);
        // relativeZ sign flips → car passed through without collision
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: -1 }, makeSession(), 1100);

        expect(episode.passThroughSuspected).toBeTrue();
    });

    it('should report pass-through when episode ends with passThroughSuspected', () => {
        const episode = createContactEpisodeState();
        const closeDist = PASS_THROUGH_DISTANCE_THRESHOLD_METERS - 0.1;

        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: 1 }, makeSession(), 1000);
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: -1 }, makeSession(), 1100);
        // Episode ends (opponent out of range)
        const result = runUpdate(episode, null, makeSession(), 1200);

        expect(result.newPassThroughDetected).toBeTrue();
        expect(result.detectedOpponentId).toBe('opp-1');
    });

    it('should restart episode when a different opponent enters contact', () => {
        const episode = createContactEpisodeState();
        const dist = CONTACT_DISTANCE_THRESHOLD_METERS - 0.1;

        runUpdate(episode, { id: 'opp-1', distanceMeters: dist, relativeZ: 1 }, makeSession(), 1000);
        expect(episode.opponentId).toBe('opp-1');

        // A different opponent comes close (overrides the episode)
        runUpdate(episode, { id: 'opp-2', distanceMeters: dist, relativeZ: 2 }, makeSession(), 1100);

        expect(episode.opponentId).toBe('opp-2');
        expect(episode.startedAtMs).toBe(1100);
    });

    it('should not trigger pass-through when relativeZ starts near zero', () => {
        const episode = createContactEpisodeState();
        const closeDist = PASS_THROUGH_DISTANCE_THRESHOLD_METERS - 0.1;

        // initialRelativeZ is 0.005 which is <= 0.01 threshold
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: 0.005 }, makeSession(), 1000);
        runUpdate(episode, { id: 'opp-1', distanceMeters: closeDist, relativeZ: -1 }, makeSession(), 1100);

        expect(episode.passThroughSuspected).toBeFalse();
    });

    it('should not trigger pass-through when distance stays above threshold', () => {
        const episode = createContactEpisodeState();

        // Distance is small enough for contact but above PASS_THROUGH_DISTANCE_THRESHOLD
        const dist = PASS_THROUGH_DISTANCE_THRESHOLD_METERS + 0.5;

        runUpdate(episode, { id: 'opp-1', distanceMeters: dist, relativeZ: 1 }, makeSession(), 1000);
        runUpdate(episode, { id: 'opp-1', distanceMeters: dist, relativeZ: -1 }, makeSession(), 1100);

        expect(episode.passThroughSuspected).toBeFalse();
    });

    it('should return no pass-through when episode ends without passThroughSuspected', () => {
        const episode = createContactEpisodeState();
        const dist = CONTACT_DISTANCE_THRESHOLD_METERS - 0.5;

        runUpdate(episode, { id: 'opp-1', distanceMeters: dist, relativeZ: 1 }, makeSession(1050), 1000);
        // Contact ends without pass-through
        const result = runUpdate(episode, null, makeSession(), 1200);

        expect(result.newPassThroughDetected).toBeFalse();
    });

    it('should return default result when no contact and no active episode', () => {
        const episode = createContactEpisodeState();
        const result = runUpdate(episode, null, makeSession(), 1000);

        expect(result.newPassThroughDetected).toBeFalse();
        expect(result.detectedOpponentId).toBeNull();
        expect(result.detectedMinDistanceMeters).toBe(0);
    });
});
