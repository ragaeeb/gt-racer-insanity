import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RaceSession } from '@/client/game/hooks/types';
import { useHudStore } from '@/client/game/state/hudStore';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById, getVehicleModifiers } from '@/shared/game/vehicle/vehicleClassManifest';

const ABILITY_KEY = 'KeyE';

type CanEmitAbilityActivationArgs = {
    abilityOffCooldown: boolean;
    abilityUseLimitPerRace: number;
    abilityUsesThisRace: number;
    justPressed: boolean;
};

export const canEmitAbilityActivation = ({
    abilityOffCooldown,
    abilityUseLimitPerRace,
    abilityUsesThisRace,
    justPressed,
}: CanEmitAbilityActivationArgs) => {
    const hasAbilityUsesRemaining =
        !Number.isFinite(abilityUseLimitPerRace) || abilityUsesThisRace < abilityUseLimitPerRace;
    return justPressed && abilityOffCooldown && hasAbilityUsesRemaining;
};

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

        const hudState = useHudStore.getState();
        const nowMs = Date.now();
        const readyAtMs = hudState.cooldownMsByAbilityId[abilityId] ?? 0;
        const abilityOffCooldown = nowMs >= readyAtMs;
        const abilityUsesThisRace = hudState.abilityUsesByAbilityId[abilityId] ?? 0;
        const abilityUseLimitPerRace = getVehicleModifiers(vehicleId).abilityUseLimitPerRace;

        const keyEDown = session.inputManager.isKeyPressed(ABILITY_KEY);
        const justPressed = keyEDown && !keyERef.current;
        keyERef.current = keyEDown;

        if (
            canEmitAbilityActivation({
                abilityOffCooldown,
                abilityUseLimitPerRace,
                abilityUsesThisRace,
                justPressed,
            })
        ) {
            abilitySeqRef.current += 1;
            session.networkManager.emitAbilityActivate({
                abilityId,
                seq: abilitySeqRef.current,
                targetPlayerId: null,
            });
            hudState.setAbilityReadyAtMs(abilityId, nowMs + ability.baseCooldownMs);
        }
    });
};
