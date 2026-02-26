import { describe, expect, it } from 'bun:test';
import { resolveParticlePoolCapacity } from './RaceWorld';

describe('resolveParticlePoolCapacity', () => {
    it('should return low-end capacity when hardware concurrency is below 4', () => {
        expect(resolveParticlePoolCapacity(2)).toBe(200);
        expect(resolveParticlePoolCapacity(3)).toBe(200);
    });

    it('should return default capacity for standard devices', () => {
        expect(resolveParticlePoolCapacity(4)).toBe(512);
        expect(resolveParticlePoolCapacity(8)).toBe(512);
    });

    it('should fall back to default capacity when hardware concurrency is missing', () => {
        expect(resolveParticlePoolCapacity(undefined)).toBe(512);
    });
});
