import { useCallback, useEffect, useState } from 'react';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';

export const AbilityIndicator = () => {
    const cooldownMsByAbilityId = useHudStore((s) => s.cooldownMsByAbilityId);
    const latestSnapshot = useRuntimeStore((s) => s.latestSnapshot);
    const localPlayerId = useRuntimeStore((s) => s.localPlayerId);
    const [remainingMs, setRemainingMs] = useState(0);

    const localPlayer = latestSnapshot?.players.find((p) => p.id === localPlayerId);
    const vehicleId = localPlayer?.vehicleId ?? 'sport';
    const vehicleClass = getVehicleClassManifestById(vehicleId);
    const ability = getAbilityManifestById(vehicleClass.abilityId);
    const readyAtMs = ability ? (cooldownMsByAbilityId[ability.id] ?? 0) : 0;

    const computeRemaining = useCallback(() => Math.max(0, readyAtMs - Date.now()), [readyAtMs]);

    useEffect(() => {
        setRemainingMs(computeRemaining());
        if (readyAtMs <= Date.now()) {
            return;
        }

        const interval = setInterval(() => {
            const next = computeRemaining();
            setRemainingMs(next);
            if (next <= 0) {
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [readyAtMs, computeRemaining]);

    if (!ability) {
        return null;
    }

    const label =
        remainingMs <= 0
            ? `${ability.label}: READY`
            : `${ability.label}: ${(remainingMs / 1000).toFixed(1)}s`;

    return (
        <div
            id="ability-indicator"
            className="text-[#BCAE8A] text-sm font-bold uppercase mt-1"
            title="Press E to use"
        >
            🔷 {label}
        </div>
    );
};
