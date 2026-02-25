import { describe, expect, it } from 'bun:test';
import { calculateLayerGains } from '../engineLayerManager';

describe('Engine Layer Crossfade', () => {
    it('should use only idle layer at 0 m/s', () => {
        const gains = calculateLayerGains(0, 40);
        expect(gains.idle).toBeGreaterThan(0.8);
        expect(gains.mid).toBeLessThan(0.2);
        expect(gains.high).toBe(0);
    });

    it('should crossfade to mid layer at 50% max speed', () => {
        const gains = calculateLayerGains(20, 40);
        expect(gains.mid).toBeGreaterThan(0.5);
    });

    it('should use only high layer at max speed', () => {
        const gains = calculateLayerGains(40, 40);
        expect(gains.high).toBeGreaterThan(0.8);
        expect(gains.idle).toBe(0);
    });

    it('should sum to approximately 1.0', () => {
        const gains = calculateLayerGains(25, 40);
        const sum = gains.idle + gains.mid + gains.high;
        expect(sum).toBeCloseTo(1.0, 1);
    });
});
