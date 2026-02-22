import { describe, expect, it } from 'bun:test';
import { playerIdToHue } from '../../src/shared/game/playerColor';

describe('playerIdToHue', () => {
    it('should return deterministic hue values for the same id', () => {
        expect(playerIdToHue('PLAYER_1')).toEqual(playerIdToHue('PLAYER_1'));
    });

    it('should always return a hue in the [0, 1] interval', () => {
        const ids = ['A', 'B', 'PLAYER_99', 'LONG_PLAYER_IDENTIFIER'];

        ids.forEach((id) => {
            const hue = playerIdToHue(id);
            expect(hue).toBeGreaterThanOrEqual(0);
            expect(hue).toBeLessThanOrEqual(1);
        });
    });

    it('should usually return different hues for different ids', () => {
        expect(playerIdToHue('ALPHA')).not.toEqual(playerIdToHue('BRAVO'));
    });
});
