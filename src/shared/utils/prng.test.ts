import { describe, expect, it } from 'bun:test';
import { seededRandom } from './prng';

describe('seededRandom', () => {
    it('should generate deterministic values for the same seed', () => {
        const randomA = seededRandom(1337);
        const randomB = seededRandom(1337);

        const sequenceA = [randomA(), randomA(), randomA()];
        const sequenceB = [randomB(), randomB(), randomB()];

        expect(sequenceA).toEqual(sequenceB);
    });

    it('should generate different values for different seeds', () => {
        const randomA = seededRandom(1);
        const randomB = seededRandom(2);

        expect(randomA()).not.toEqual(randomB());
    });

    it('should keep values inside the [0, 1) range', () => {
        const random = seededRandom(99);

        for (let i = 0; i < 200; i += 1) {
            const value = random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
