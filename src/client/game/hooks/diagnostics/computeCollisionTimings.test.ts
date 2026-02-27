import { describe, expect, it } from 'bun:test';
import { computeCollisionTimings } from './computeCollisionTimings';
import type { ContactEpisodeState } from './types';

const NOW_MS = 10_000;

const makeSession = (overrides: Partial<Parameters<typeof computeCollisionTimings>[0]> = {}) => ({
    lastCollisionEventAtMs: null,
    lastCollisionEventServerTimeMs: null,
    lastCollisionFlipStartedAtMs: null,
    lastCollisionOpponentFlipStartedAtMs: null,
    lastCollisionSnapshotFlipSeenAtMs: null,
    localCollisionDriveLockUntilMs: null,
    localCollisionHardSnapUntilMs: null,
    ...overrides,
});

const makeEpisode = (overrides: Partial<ContactEpisodeState> = {}): ContactEpisodeState => ({
    active: false,
    hadCollisionEvent: false,
    initialRelativeZ: 0,
    minDistanceMeters: Infinity,
    opponentId: null,
    passThroughSuspected: false,
    startedAtMs: 0,
    ...overrides,
});

describe('computeCollisionTimings', () => {
    describe('collisionEventAgeMs', () => {
        it('should return null when no collision event has occurred', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionEventAgeMs).toBeNull();
        });

        it('should return elapsed ms since the collision event', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventAgeMs).toBe(500);
        });

        it('should return 0 when the collision event just happened', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventAgeMs).toBe(0);
        });
    });

    describe('collisionDriveLockRemainingMs', () => {
        it('should return null when no drive lock is active', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionDriveLockRemainingMs).toBeNull();
        });

        it('should return remaining ms when drive lock is active', () => {
            const session = makeSession({ localCollisionDriveLockUntilMs: NOW_MS + 300 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionDriveLockRemainingMs).toBe(300);
        });

        it('should return 0 when drive lock just expired', () => {
            const session = makeSession({ localCollisionDriveLockUntilMs: NOW_MS - 100 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionDriveLockRemainingMs).toBe(0);
        });
    });

    describe('collisionEventServerLagMs', () => {
        it('should return null when collision event is missing', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionEventServerLagMs).toBeNull();
        });

        it('should return null when server time is missing', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 100 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventServerLagMs).toBeNull();
        });

        it('should return client-server time difference', () => {
            const session = makeSession({
                lastCollisionEventAtMs: NOW_MS - 100,
                lastCollisionEventServerTimeMs: NOW_MS - 300,
            });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventServerLagMs).toBe(200);
        });

        it('should clamp server lag to 0 minimum', () => {
            const session = makeSession({
                lastCollisionEventAtMs: NOW_MS - 300,
                lastCollisionEventServerTimeMs: NOW_MS - 100,
            });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventServerLagMs).toBe(0);
        });
    });

    describe('collisionEventToFlipStartMs', () => {
        it('should return null when either event or flip is missing', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionEventToFlipStartMs).toBeNull();
        });

        it('should return time from event to flip start', () => {
            const session = makeSession({
                lastCollisionEventAtMs: NOW_MS - 500,
                lastCollisionFlipStartedAtMs: NOW_MS - 300,
            });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventToFlipStartMs).toBe(200);
        });
    });

    describe('collisionEventToOpponentFlipStartMs', () => {
        it('should return null when opponent flip is missing', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventToOpponentFlipStartMs).toBeNull();
        });

        it('should return time from event to opponent flip', () => {
            const session = makeSession({
                lastCollisionEventAtMs: NOW_MS - 500,
                lastCollisionOpponentFlipStartedAtMs: NOW_MS - 200,
            });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventToOpponentFlipStartMs).toBe(300);
        });
    });

    describe('collisionEventToSnapshotFlipMs', () => {
        it('should return null when snapshot flip is missing', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionEventToSnapshotFlipMs).toBeNull();
        });

        it('should return time from event to snapshot flip', () => {
            const session = makeSession({
                lastCollisionEventAtMs: NOW_MS - 400,
                lastCollisionSnapshotFlipSeenAtMs: NOW_MS - 100,
            });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionEventToSnapshotFlipMs).toBe(300);
        });
    });

    describe('collisionContactToEventMs', () => {
        it('should return null when episode is not active', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 200 });
            const episode = makeEpisode({ active: false, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            expect(result.collisionContactToEventMs).toBeNull();
        });

        it('should return null when episode startedAtMs is 0', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 200 });
            const episode = makeEpisode({ active: true, startedAtMs: 0 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            expect(result.collisionContactToEventMs).toBeNull();
        });

        it('should return null when event happened before episode start', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 600 });
            const episode = makeEpisode({ active: true, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            expect(result.collisionContactToEventMs).toBeNull();
        });

        it('should return time from contact to event when both are active and valid', () => {
            const session = makeSession({ lastCollisionEventAtMs: NOW_MS - 200 });
            const episode = makeEpisode({ active: true, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            expect(result.collisionContactToEventMs).toBe(300);
        });
    });

    describe('collisionContactToFlipStartMs', () => {
        it('should return null when episode is not active', () => {
            const session = makeSession({
                lastCollisionFlipStartedAtMs: NOW_MS - 100,
            });
            const episode = makeEpisode({ active: false, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            expect(result.collisionContactToFlipStartMs).toBeNull();
        });

        it('should return null when no flip has started', () => {
            const episode = makeEpisode({ active: true, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(makeSession(), episode, NOW_MS);
            expect(result.collisionContactToFlipStartMs).toBeNull();
        });

        it('should use the earliest flip (local or opponent)', () => {
            const session = makeSession({
                lastCollisionFlipStartedAtMs: NOW_MS - 200,
                lastCollisionOpponentFlipStartedAtMs: NOW_MS - 300,
            });
            const episode = makeEpisode({ active: true, startedAtMs: NOW_MS - 500 });
            const result = computeCollisionTimings(session, episode, NOW_MS);
            // Earliest is opponent flip at NOW_MS - 300, episode started at NOW_MS - 500
            // so delta = (NOW_MS - 300) - (NOW_MS - 500) = 200
            expect(result.collisionContactToFlipStartMs).toBe(200);
        });
    });

    describe('collisionHardSnapRemainingMs', () => {
        it('should return null when no hard snap is active', () => {
            const result = computeCollisionTimings(makeSession(), makeEpisode(), NOW_MS);
            expect(result.collisionHardSnapRemainingMs).toBeNull();
        });

        it('should return remaining ms when hard snap is active', () => {
            const session = makeSession({ localCollisionHardSnapUntilMs: NOW_MS + 150 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionHardSnapRemainingMs).toBe(150);
        });

        it('should return 0 when hard snap has expired', () => {
            const session = makeSession({ localCollisionHardSnapUntilMs: NOW_MS - 50 });
            const result = computeCollisionTimings(session, makeEpisode(), NOW_MS);
            expect(result.collisionHardSnapRemainingMs).toBe(0);
        });
    });
});
