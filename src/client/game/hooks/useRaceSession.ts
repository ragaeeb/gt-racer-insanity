import { useRef } from 'react';
import type { InputManager } from '@/client/game/systems/InputManager';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { RaceSession } from '@/client/game/hooks/types';

export const useRaceSession = (inputManager: InputManager) => {
    const sessionRef = useRef<RaceSession | null>(null);
    if (!sessionRef.current) {
        sessionRef.current = {
            activeTrackId: getTrackManifestById('sunset-loop').id,
            connectionStatus: 'connecting',
            cruiseLatchActive: false,
            hasLocalAuthoritativeTarget: false,
            inputManager,
            isRunning: false,
            lastCorrection: null,
            lastReconciledSnapshotSeq: null,
            lastSnapshotReceivedAtMs: null,
            latestLocalSnapshot: null,
            latestLocalSnapshotSeq: null,
            localCar: null,
            localInputSequence: 0,
            networkManager: null,
            networkUpdateTimer: 0,
            opponentInterpolationBuffers: new Map(),
            opponents: new Map(),
            roomSeed: 0,
            sceneryManager: null,
            shakeSpikeGraceUntilMs: 0,
            trackManager: null,
        };
    }

    return sessionRef as React.RefObject<RaceSession>;
};
