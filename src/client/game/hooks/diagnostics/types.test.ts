import { describe, expect, it } from 'bun:test';
import {
    ACTIVE_COLLISION_WINDOW_MS,
    CONTACT_DISTANCE_THRESHOLD_METERS,
    createContactEpisodeState,
    createDiagCaptureState,
    DIAG_MAX_FRAME_SAMPLES,
    DIAG_MAX_SPIKE_SAMPLES,
    LONG_FRAME_GAP_THRESHOLD_MS,
    LONG_FRAME_THRESHOLD_MS,
    PASS_THROUGH_DISTANCE_THRESHOLD_METERS,
} from './types';

describe('diagnostics types — constants', () => {
    it('should define CONTACT_DISTANCE_THRESHOLD_METERS as a positive number', () => {
        expect(CONTACT_DISTANCE_THRESHOLD_METERS).toBeGreaterThan(0);
    });

    it('should define PASS_THROUGH_DISTANCE_THRESHOLD_METERS as a positive number less than contact threshold', () => {
        expect(PASS_THROUGH_DISTANCE_THRESHOLD_METERS).toBeGreaterThan(0);
        expect(PASS_THROUGH_DISTANCE_THRESHOLD_METERS).toBeLessThan(CONTACT_DISTANCE_THRESHOLD_METERS);
    });

    it('should define LONG_FRAME_THRESHOLD_MS as 80', () => {
        expect(LONG_FRAME_THRESHOLD_MS).toBe(80);
    });

    it('should define LONG_FRAME_GAP_THRESHOLD_MS as 50', () => {
        expect(LONG_FRAME_GAP_THRESHOLD_MS).toBe(50);
    });

    it('should define ACTIVE_COLLISION_WINDOW_MS as 3500', () => {
        expect(ACTIVE_COLLISION_WINDOW_MS).toBe(3_500);
    });

    it('should define DIAG_MAX_FRAME_SAMPLES as 200', () => {
        expect(DIAG_MAX_FRAME_SAMPLES).toBe(200);
    });

    it('should define DIAG_MAX_SPIKE_SAMPLES as 40', () => {
        expect(DIAG_MAX_SPIKE_SAMPLES).toBe(40);
    });
});

describe('createDiagCaptureState', () => {
    it('should create a capture state with zeroed numeric accumulators', () => {
        const state = createDiagCaptureState();
        expect(state.correctionPositionErrorMaxMeters).toBe(0);
        expect(state.drawCallsMax).toBe(0);
        expect(state.drawCallsSampleCount).toBe(0);
        expect(state.drawCallsSum).toBe(0);
        expect(state.fpsMax).toBe(0);
        expect(state.fpsSum).toBe(0);
        expect(state.fpsSampleCount).toBe(0);
        expect(state.framesCaptured).toBe(0);
        expect(state.frameDtMaxMs).toBe(0);
        expect(state.frameGapMaxMs).toBe(0);
        expect(state.longFrameCount).toBe(0);
        expect(state.longFrameGapCount).toBe(0);
        expect(state.longTaskCount).toBe(0);
        expect(state.longTaskMaxMs).toBe(0);
        expect(state.passThroughSuspectedCount).toBe(0);
        expect(state.snapshotAgeCount).toBe(0);
        expect(state.snapshotAgeMaxMs).toBe(0);
        expect(state.snapshotAgeSumMs).toBe(0);
        expect(state.spikeCount).toBe(0);
        expect(state.speedKphMax).toBe(0);
        expect(state.wallClampCount).toBe(0);
    });

    it('should initialize fpsMin to positive infinity', () => {
        const state = createDiagCaptureState();
        expect(state.fpsMin).toBe(Number.POSITIVE_INFINITY);
    });

    it('should initialize frameSamples as an empty array', () => {
        const state = createDiagCaptureState();
        expect(state.frameSamples).toEqual([]);
    });

    it('should initialize spikeSamples as an empty array', () => {
        const state = createDiagCaptureState();
        expect(state.spikeSamples).toEqual([]);
    });

    it('should set sessionStartedAtMs to a recent timestamp', () => {
        const before = Date.now();
        const state = createDiagCaptureState();
        const after = Date.now();
        expect(state.sessionStartedAtMs).toBeGreaterThanOrEqual(before);
        expect(state.sessionStartedAtMs).toBeLessThanOrEqual(after);
    });

    it('should create a fresh object on each call', () => {
        const a = createDiagCaptureState();
        const b = createDiagCaptureState();
        expect(a).not.toBe(b);
        expect(a.frameSamples).not.toBe(b.frameSamples);
    });
});

describe('createContactEpisodeState', () => {
    it('should create an inactive episode with null opponentId', () => {
        const state = createContactEpisodeState();
        expect(state.active).toBeFalse();
        expect(state.opponentId).toBeNull();
    });

    it('should initialize hadCollisionEvent to false', () => {
        const state = createContactEpisodeState();
        expect(state.hadCollisionEvent).toBeFalse();
    });

    it('should initialize passThroughSuspected to false', () => {
        const state = createContactEpisodeState();
        expect(state.passThroughSuspected).toBeFalse();
    });

    it('should initialize minDistanceMeters to positive infinity', () => {
        const state = createContactEpisodeState();
        expect(state.minDistanceMeters).toBe(Number.POSITIVE_INFINITY);
    });

    it('should initialize startedAtMs to 0', () => {
        const state = createContactEpisodeState();
        expect(state.startedAtMs).toBe(0);
    });

    it('should initialize initialRelativeZ to 0', () => {
        const state = createContactEpisodeState();
        expect(state.initialRelativeZ).toBe(0);
    });

    it('should create a fresh object on each call', () => {
        const a = createContactEpisodeState();
        const b = createContactEpisodeState();
        expect(a).not.toBe(b);
    });
});
