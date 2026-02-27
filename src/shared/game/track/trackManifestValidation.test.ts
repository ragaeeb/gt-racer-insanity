import { describe, expect, it } from 'bun:test';
import type { TrackManifest, TrackSegmentManifest } from '@/shared/game/track/trackManifest';
import { validateTrackManifests } from './trackManifestValidation';

const makeSeg = (id: string, length: number, overrides: Partial<TrackSegmentManifest> = {}): TrackSegmentManifest =>
    ({
        id,
        lengthMeters: length,
        frictionMultiplier: 1.0,
        ...overrides,
    }) as TrackSegmentManifest;

const makeTrack = (overrides: Partial<TrackManifest> = {}): TrackManifest =>
    ({
        id: 'test-track',
        label: 'Test Track',
        lengthMeters: 100,
        totalLaps: 3,
        checkpoints: [{ position: 0 }, { position: 50 }] as any,
        segments: [makeSeg('seg-a', 100)],
        ...overrides,
    }) as unknown as TrackManifest;

describe('validateTrackManifests', () => {
    it('should return isValid=true for a minimal valid track', () => {
        const result = validateTrackManifests([makeTrack()]);
        expect(result.isValid).toBeTrue();
        expect(result.issues).toHaveLength(0);
    });

    it('should return isValid=true for an empty array', () => {
        const result = validateTrackManifests([]);
        expect(result.isValid).toBeTrue();
    });

    it('should detect duplicate track ids', () => {
        const track = makeTrack({ id: 'sunset-loop' });
        const result = validateTrackManifests([track, makeTrack({ id: 'sunset-loop' })]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('Duplicate track id'))).toBeTrue();
    });

    it('should reject invalid lengthMeters', () => {
        const result = validateTrackManifests([makeTrack({ lengthMeters: 0 })]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('invalid length'))).toBeTrue();
    });

    it('should reject negative lengthMeters', () => {
        const result = validateTrackManifests([makeTrack({ lengthMeters: -10 })]);
        expect(result.isValid).toBeFalse();
    });

    it('should reject invalid totalLaps (zero)', () => {
        const result = validateTrackManifests([makeTrack({ totalLaps: 0 })]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('invalid lap count'))).toBeTrue();
    });

    it('should reject a track with fewer than 2 checkpoints', () => {
        const result = validateTrackManifests([makeTrack({ checkpoints: [{ position: 0 }] as any })]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('at least 2 checkpoints'))).toBeTrue();
    });

    it('should reject when segment lengths do not sum to track length', () => {
        const result = validateTrackManifests([
            makeTrack({
                lengthMeters: 100,
                segments: [makeSeg('seg-a', 60)],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('segment lengths must sum'))).toBeTrue();
    });

    it('should reject a segment with invalid lengthMeters', () => {
        const result = validateTrackManifests([
            makeTrack({
                lengthMeters: 100,
                segments: [makeSeg('seg-a', 0)],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('invalid lengthMeters'))).toBeTrue();
    });

    it('should reject a segment with negative elevationStartM', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { elevationStartM: -1, elevationEndM: 0 })],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('negative elevationStartM'))).toBeTrue();
    });

    it('should reject a segment with negative elevationEndM', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { elevationStartM: 0, elevationEndM: -0.5 })],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('negative elevationEndM'))).toBeTrue();
    });

    it('should reject a segment with bankAngleDeg exceeding 45°', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { bankAngleDeg: 46 })],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('bankAngleDeg exceeds'))).toBeTrue();
    });

    it('should accept a segment with bankAngleDeg exactly at 45°', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { bankAngleDeg: 45 })],
            }),
        ]);
        expect(result.isValid).toBeTrue();
    });

    it('should detect elevation gap between consecutive segments', () => {
        const result = validateTrackManifests([
            makeTrack({
                lengthMeters: 100,
                segments: [
                    makeSeg('seg-a', 50, { elevationStartM: 0, elevationEndM: 5 }),
                    makeSeg('seg-b', 50, { elevationStartM: 0, elevationEndM: 0 }),
                ],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('elevation gap between segments'))).toBeTrue();
    });

    it('should detect elevation gap at lap wrap-around boundary', () => {
        const result = validateTrackManifests([
            makeTrack({
                lengthMeters: 100,
                segments: [
                    makeSeg('seg-a', 50, { elevationStartM: 0, elevationEndM: 0 }),
                    makeSeg('seg-b', 50, { elevationStartM: 0, elevationEndM: 5 }),
                ],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('elevation gap at lap boundary'))).toBeTrue();
    });

    it('should validate a track with two segments that have matching elevations', () => {
        const result = validateTrackManifests([
            makeTrack({
                lengthMeters: 100,
                segments: [
                    makeSeg('seg-a', 50, { elevationStartM: 0, elevationEndM: 3 }),
                    makeSeg('seg-b', 50, { elevationStartM: 3, elevationEndM: 0 }),
                ],
            }),
        ]);
        expect(result.isValid).toBeTrue();
    });

    it('should validate multiple valid tracks in one call', () => {
        const tracks = [
            makeTrack({ id: 'sunset-loop' }),
            makeTrack({ id: 'canyon-sprint', lengthMeters: 200, segments: [makeSeg('seg-a', 200)] }),
        ];
        const result = validateTrackManifests(tracks);
        expect(result.isValid).toBeTrue();
    });

    it('should reject an invalid bankAngleDeg value (NaN)', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { bankAngleDeg: NaN })],
            }),
        ]);
        expect(result.isValid).toBeFalse();
        expect(result.issues.some((i) => i.includes('invalid bankAngleDeg'))).toBeTrue();
    });

    it('should reject an invalid elevationStartM (non-finite)', () => {
        const result = validateTrackManifests([
            makeTrack({
                segments: [makeSeg('seg-a', 100, { elevationStartM: Infinity })],
            }),
        ]);
        expect(result.isValid).toBeFalse();
    });
});
