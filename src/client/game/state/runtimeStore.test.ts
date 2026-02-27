import { describe, expect, it } from 'bun:test';
import type { ServerSnapshotPayload } from '@/shared/network/types';
import { useRuntimeStore } from './runtimeStore';

const makeSnapshot = (seq: number): ServerSnapshotPayload => ({
    hazards: [],
    players: [],
    powerups: [],
    raceState: {
        endedAtMs: null,
        playerOrder: [],
        startedAtMs: 1000,
        status: 'running',
        totalLaps: 3,
        trackId: 'sunset-loop',
        winnerPlayerId: null,
    },
    roomId: 'ROOM1',
    seq,
    serverTimeMs: 5000,
});

const reset = () => {
    useRuntimeStore.setState({
        connectionStatus: 'connecting',
        lastAckedSnapshotSeq: -1,
        localPlayerId: null,
        latestSnapshot: null,
    });
};

describe('useRuntimeStore', () => {
    it('should start with connecting status and no player id', () => {
        reset();
        const state = useRuntimeStore.getState();
        expect(state.connectionStatus).toBe('connecting');
        expect(state.localPlayerId).toBeNull();
        expect(state.lastAckedSnapshotSeq).toBe(-1);
        expect(state.latestSnapshot).toBeNull();
    });

    it('should update connection status via setConnectionStatus', () => {
        reset();
        useRuntimeStore.getState().setConnectionStatus('connected');
        expect(useRuntimeStore.getState().connectionStatus).toBe('connected');
    });

    it('should set localPlayerId via setLocalPlayerId', () => {
        reset();
        useRuntimeStore.getState().setLocalPlayerId('player-42');
        expect(useRuntimeStore.getState().localPlayerId).toBe('player-42');
    });

    it('should clear localPlayerId when null is passed', () => {
        reset();
        useRuntimeStore.getState().setLocalPlayerId('player-42');
        useRuntimeStore.getState().setLocalPlayerId(null);
        expect(useRuntimeStore.getState().localPlayerId).toBeNull();
    });

    it('should apply snapshot and update seq and latestSnapshot atomically', () => {
        reset();
        const snap = makeSnapshot(15);
        useRuntimeStore.getState().applySnapshot(snap);
        const state = useRuntimeStore.getState();
        expect(state.lastAckedSnapshotSeq).toBe(15);
        expect(state.latestSnapshot).toBe(snap);
    });

    it('should apply successive snapshots and keep the latest one', () => {
        reset();
        useRuntimeStore.getState().applySnapshot(makeSnapshot(10));
        const snap2 = makeSnapshot(11);
        useRuntimeStore.getState().applySnapshot(snap2);
        const state = useRuntimeStore.getState();
        expect(state.lastAckedSnapshotSeq).toBe(11);
        expect(state.latestSnapshot).toBe(snap2);
    });
});
