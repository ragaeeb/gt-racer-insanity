import { describe, expect, it } from 'bun:test';
import {
    createInterpolationBuffer,
    pushInterpolationSample,
    sampleInterpolationBuffer,
} from './interpolationSystem';

type TestState = { x: number; y: number };

const lerpState = (from: TestState, to: TestState, alpha: number): TestState => ({
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
});

describe('interpolationSystem', () => {
    describe('createInterpolationBuffer', () => {
        it('should create an empty buffer with a default max', () => {
            const buf = createInterpolationBuffer<TestState>();
            expect(buf.samples).toHaveLength(0);
            expect(buf.maxSamples).toBe(32);
        });

        it('should accept a custom max sample count', () => {
            const buf = createInterpolationBuffer<TestState>(8);
            expect(buf.maxSamples).toBe(8);
        });
    });

    describe('pushInterpolationSample', () => {
        it('should add samples in time order', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 100 });
            pushInterpolationSample(buf, { sequence: 2, state: { x: 1, y: 1 }, timeMs: 200 });
            expect(buf.samples).toHaveLength(2);
            expect(buf.samples[0].timeMs).toBe(100);
            expect(buf.samples[1].timeMs).toBe(200);
        });

        it('should sort out-of-order samples by time', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 2, state: { x: 1, y: 1 }, timeMs: 200 });
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 100 });
            expect(buf.samples[0].timeMs).toBe(100);
            expect(buf.samples[1].timeMs).toBe(200);
        });

        it('should evict oldest samples when buffer exceeds max size', () => {
            const buf = createInterpolationBuffer<TestState>(3);
            for (let i = 0; i < 5; i++) {
                pushInterpolationSample(buf, { sequence: i, state: { x: i, y: i }, timeMs: i * 100 });
            }
            expect(buf.samples).toHaveLength(3);
            expect(buf.samples[0].timeMs).toBe(200);
        });
    });

    describe('sampleInterpolationBuffer', () => {
        it('should return null for an empty buffer', () => {
            const buf = createInterpolationBuffer<TestState>();
            expect(sampleInterpolationBuffer(buf, 100, lerpState)).toBeNull();
        });

        it('should return the only sample when buffer has one entry', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 5, y: 10 }, timeMs: 100 });
            const result = sampleInterpolationBuffer(buf, 150, lerpState);
            expect(result).toEqual({ x: 5, y: 10 });
        });

        it('should interpolate between two bracketing samples', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 100 });
            pushInterpolationSample(buf, { sequence: 2, state: { x: 10, y: 20 }, timeMs: 200 });
            const result = sampleInterpolationBuffer(buf, 150, lerpState)!;
            expect(result.x).toBeCloseTo(5, 5);
            expect(result.y).toBeCloseTo(10, 5);
        });

        it('should clamp to earliest sample when target is before buffer', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 100 });
            pushInterpolationSample(buf, { sequence: 2, state: { x: 10, y: 20 }, timeMs: 200 });
            const result = sampleInterpolationBuffer(buf, 50, lerpState)!;
            expect(result.x).toBeCloseTo(0, 5);
            expect(result.y).toBeCloseTo(0, 5);
        });

        it('should extrapolate to latest sample when target is after buffer', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 100 });
            pushInterpolationSample(buf, { sequence: 2, state: { x: 10, y: 20 }, timeMs: 200 });
            const result = sampleInterpolationBuffer(buf, 300, lerpState)!;
            expect(result.x).toBeCloseTo(10, 5);
        });

        it('should pick correct bracket with multiple samples', () => {
            const buf = createInterpolationBuffer<TestState>();
            pushInterpolationSample(buf, { sequence: 1, state: { x: 0, y: 0 }, timeMs: 0 });
            pushInterpolationSample(buf, { sequence: 2, state: { x: 10, y: 0 }, timeMs: 100 });
            pushInterpolationSample(buf, { sequence: 3, state: { x: 20, y: 0 }, timeMs: 200 });
            pushInterpolationSample(buf, { sequence: 4, state: { x: 30, y: 0 }, timeMs: 300 });

            const result = sampleInterpolationBuffer(buf, 250, lerpState)!;
            expect(result.x).toBeCloseTo(25, 5);
        });
    });

    describe('buffer growth bounds', () => {
        it('should never exceed max samples regardless of push volume', () => {
            const maxSamples = 16;
            const buf = createInterpolationBuffer<TestState>(maxSamples);
            for (let i = 0; i < 1000; i++) {
                pushInterpolationSample(buf, { sequence: i, state: { x: i, y: i }, timeMs: i * 50 });
                expect(buf.samples.length).toBeLessThanOrEqual(maxSamples);
            }
        });
    });
});
