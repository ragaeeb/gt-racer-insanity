import { create } from 'zustand';
import type { ConnectionStatus, ServerSnapshotPayload } from '@/shared/network/types';

export type RuntimeStoreState = {
    applySnapshot: (snapshot: ServerSnapshotPayload) => void;
    connectionStatus: ConnectionStatus;
    lastAckedSnapshotSeq: number;
    localPlayerId: string | null;
    latestSnapshot: ServerSnapshotPayload | null;
    setConnectionStatus: (status: ConnectionStatus) => void;
    setLocalPlayerId: (playerId: string | null) => void;
};

export const useRuntimeStore = create<RuntimeStoreState>((set) => ({
    applySnapshot: (snapshot) =>
        set(() => ({
            lastAckedSnapshotSeq: snapshot.seq,
            latestSnapshot: snapshot,
        })),
    connectionStatus: 'connecting',
    lastAckedSnapshotSeq: -1,
    localPlayerId: null,
    latestSnapshot: null,
    setConnectionStatus: (connectionStatus) => set(() => ({ connectionStatus })),
    setLocalPlayerId: (localPlayerId) => set(() => ({ localPlayerId })),
}));
