import { describe, expect, it } from 'bun:test';
import { playerIdToVehicleIndex } from '@/shared/game/playerVehicle';

describe('playerIdToVehicleIndex', () => {
    it('should return deterministic vehicle indexes for the same player id', () => {
        expect(playerIdToVehicleIndex('PLAYER_1', 5)).toEqual(playerIdToVehicleIndex('PLAYER_1', 5));
    });

    it('should always return a valid index in range', () => {
        const totalVehicles = 5;
        const ids = ['A', 'B', 'PLAYER_99', 'LONG_PLAYER_IDENTIFIER'];

        ids.forEach((id) => {
            const index = playerIdToVehicleIndex(id, totalVehicles);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(totalVehicles);
        });
    });

    it('should return zero when no vehicles are available', () => {
        expect(playerIdToVehicleIndex('PLAYER_1', 0)).toEqual(0);
    });
});
