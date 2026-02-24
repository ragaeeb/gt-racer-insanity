import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RaceSession } from '@/client/game/hooks/types';
import { useHudStore } from '@/client/game/state/hudStore';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';

const ABILITY_KEY = 'KeyE';

export const useAbilityEmitter = (sessionRef: React.RefObject<RaceSession>) => {
    const keyERef = useRef(false);
    const abilitySeqRef = useRef(0);

    useFrame(() => {
        const session = sessionRef.current;
        if (!session?.isRunning || !session.networkManager) {
            keyERef.current = false;
            return;
        }

        const vehicleId = session.latestLocalSnapshot?.vehicleId ?? 'sport';
        const vehicleClass = getVehicleClassManifestById(vehicleId);
        const abilityId = vehicleClass.abilityId;
        const ability = getAbilityManifestById(abilityId);
        if (!ability) {
            return;
        }

        const nowMs = Date.now();
        const readyAtMs = useHudStore.getState().cooldownMsByAbilityId[abilityId] ?? 0;
        const abilityOffCooldown = nowMs >= readyAtMs;

        const keyEDown = session.inputManager.isKeyPressed(ABILITY_KEY);
        const justPressed = keyEDown && !keyERef.current;
        keyERef.current = keyEDown;

        if (justPressed && abilityOffCooldown) {
            abilitySeqRef.current += 1;
            session.networkManager.emitAbilityActivate({
                abilityId,
                seq: abilitySeqRef.current,
                targetPlayerId: null,
            });
            useHudStore.getState().setAbilityReadyAtMs(abilityId, nowMs + ability.baseCooldownMs);
        }
    });
};
