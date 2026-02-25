import { describe, expect, it } from 'bun:test';
import { DEFAULT_GAMEPLAY_TUNING } from './gameplayTuning';

describe('GameplayTuningConfig', () => {
    it('should have all tuning sections defined', () => {
        expect(DEFAULT_GAMEPLAY_TUNING.drift).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.collision).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.audio).toBeDefined();
        expect(DEFAULT_GAMEPLAY_TUNING.combat).toBeDefined();
    });

    it('should be serializable to JSON', () => {
        const json = JSON.stringify(DEFAULT_GAMEPLAY_TUNING);
        expect(json).toBe('{"drift":{},"collision":{},"audio":{},"combat":{}}');
        const parsed = JSON.parse(json);
        expect(parsed).toEqual(DEFAULT_GAMEPLAY_TUNING);
    });
});
