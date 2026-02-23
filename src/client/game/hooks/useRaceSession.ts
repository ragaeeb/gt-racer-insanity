import { useMemo, useRef } from 'react';
import type { InputManager } from '@/client/game/systems/InputManager';
import { createInterpolationBuffer } from '@/client/game/systems/interpolationSystem';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';
import type { InterpolationState, RaceSession } from '@/client/game/hooks/types';

export const useRaceSession = (inputManager: InputManager) => {
    const sessionRef = useRef<RaceSession | null>(null);

    useMemo(() => {
        if (sessionRef.current) {
            return;
        }

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
            localInterpolationBuffer: createInterpolationBuffer<InterpolationState>(),
            networkManager: null,
            networkUpdateTimer: 0,
            opponentInterpolationBuffers: new Map(),
            opponents: new Map(),
            shakeSpikeGraceUntilMs: 0,
            trackManager: null,
        };
    }, [inputManager]);

    return sessionRef as React.RefObject<RaceSession>;
};
