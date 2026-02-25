import { useEffect, useState } from 'react';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById } from '@/shared/game/vehicle/vehicleClassManifest';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';

export const AbilityIndicator = () => {
    const cooldownMsByAbilityId = useHudStore((s) => s.cooldownMsByAbilityId);
    const vehicleId = useRuntimeStore((state) => {
        const snapshot = state.latestSnapshot;
        const localPlayer = snapshot?.players.find((player) => player.id === state.localPlayerId);
        return localPlayer?.vehicleId ?? 'sport';
    });
    const [remainingMs, setRemainingMs] = useState(0);

    const vehicleClass = getVehicleClassManifestById(vehicleId);
    const ability = getAbilityManifestById(vehicleClass.abilityId);
    const readyAtMs = ability ? (cooldownMsByAbilityId[ability.id] ?? 0) : 0;

    useEffect(() => {
        const computeRemaining = () => Math.max(0, readyAtMs - Date.now());
        setRemainingMs(computeRemaining());
        if (readyAtMs <= Date.now()) { return; }

        const interval = setInterval(() => {
            const next = computeRemaining();
            setRemainingMs(next);
            if (next <= 0) { clearInterval(interval); }
        }, 100);
        return () => clearInterval(interval);
    }, [readyAtMs]);

    if (!ability) { return null; }

    const isReady = remainingMs <= 0;
    const label = isReady
        ? `${ability.label}: READY`
        : `${ability.label}: ${(remainingMs / 1000).toFixed(1)}s`;

    return (
        <div
            id="ability-indicator"
            style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '0.7rem',
                fontWeight: 'bold',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: '4px',
                color: isReady ? 'var(--gt-cyan)' : 'var(--gt-amber)',
                textShadow: isReady
                    ? '0 0 8px rgba(0, 229, 255, 0.6)'
                    : '0 0 8px rgba(255, 193, 7, 0.5)',
                transition: 'color 0.3s, text-shadow 0.3s',
            }}
            title="Press E to use"
        >
            {isReady ? '◈' : '◇'} {label}
        </div>
    );
};
