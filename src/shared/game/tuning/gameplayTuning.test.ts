import { describe, expect, it } from 'bun:test';
import { DEFAULT_GAMEPLAY_TUNING } from './gameplayTuning';
import { DEFAULT_DRIFT_CONFIG } from '@/shared/game/vehicle/driftConfig';

describe('GameplayTuningConfig', () => {
    it('should have all tuning sections defined', () => {
        expect(DEFAULT_GAMEPLAY_TUNING.drift).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.collision).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.audio).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.combat).toBeDefined();
    });

    it('should have drift section with all 16 tunable parameters', () => {
        const driftKeys = Object.keys(DEFAULT_GAMEPLAY_TUNING.drift);
        expect(driftKeys).toHaveLength(16);
        expect(DEFAULT_GAMEPLAY_TUNING.drift).toEqual(DEFAULT_DRIFT_CONFIG);
    });

    it('should be serializable to JSON and round-trip correctly', () => {
        const json = JSON.stringify(DEFAULT_GAMEPLAY_TUNING);
        const parsed = JSON.parse(json);
        expect(parsed).toEqual(DEFAULT_GAMEPLAY_TUNING);
    });
});
