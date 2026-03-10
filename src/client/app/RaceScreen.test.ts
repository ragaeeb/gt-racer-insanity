import { describe, expect, it } from 'bun:test';
import type { RaceState } from '@/shared/network/snapshot';
import { canAdvanceRaceLevel, getNextTrackLabelForRaceState } from './RaceScreen';

const createRaceState = (overrides: Partial<RaceState> = {}): RaceState => ({
    endedAtMs: null,
    playerOrder: [],
    startedAtMs: 1_000,
    status: 'running',
    totalLaps: 3,
    trackId: 'sunset-loop',
    winnerPlayerId: null,
    ...overrides,
});

describe('RaceScreen helpers', () => {
    it('should only allow level advancement for finished races with a winner', () => {
        expect(canAdvanceRaceLevel(createRaceState({ status: 'finished', winnerPlayerId: 'player-1' }))).toBeTrue();
        expect(canAdvanceRaceLevel(createRaceState({ status: 'finished', winnerPlayerId: null }))).toBeFalse();
        expect(canAdvanceRaceLevel(createRaceState({ status: 'running', winnerPlayerId: 'player-1' }))).toBeFalse();
    });

    it('should only resolve the next track label when level advancement is allowed', () => {
        expect(getNextTrackLabelForRaceState(createRaceState({ status: 'finished', winnerPlayerId: 'player-1' }))).toEqual(
            'Canyon Sprint',
        );
        expect(getNextTrackLabelForRaceState(createRaceState({ status: 'finished', winnerPlayerId: null }))).toBeNull();
        expect(getNextTrackLabelForRaceState(null)).toBeNull();
    });
});
