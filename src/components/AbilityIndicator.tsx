import { useEffect, useState } from 'react';
import { getAbilityManifestById } from '@/shared/game/ability/abilityManifest';
import { getVehicleClassManifestById, getVehicleModifiers } from '@/shared/game/vehicle/vehicleClassManifest';
import { useHudStore } from '@/client/game/state/hudStore';
import { useRuntimeStore } from '@/client/game/state/runtimeStore';

type BuildAbilityIndicatorPresentationArgs = {
    abilityLabel: string;
    nowMs: number;
    readyAtMs: number;
    remainingUses: number | null;
};

type AbilityIndicatorPresentation = {
    isExhausted: boolean;
    isReady: boolean;
    label: string;
    suffix: string | null;
};

export const buildAbilityIndicatorPresentation = ({
    abilityLabel,
    nowMs,
    readyAtMs,
    remainingUses,
}: BuildAbilityIndicatorPresentationArgs): AbilityIndicatorPresentation => {
    const isExhausted = remainingUses !== null && remainingUses <= 0;
    if (isExhausted) {
        return {
            isExhausted: true,
            isReady: false,
            label: `${abilityLabel}: NO USES LEFT`,
            suffix: null,
        };
    }

    const remainingMs = Math.max(0, readyAtMs - nowMs);
    const isReady = remainingMs <= 0;
    const suffix = remainingUses === null ? null : `${remainingUses} LEFT`;
    const label = isReady ? `${abilityLabel}: READY` : `${abilityLabel}: ${(remainingMs / 1000).toFixed(1)}s`;
    return { isExhausted: false, isReady, label, suffix };
};

export const AbilityIndicator = () => {
    const abilityUsesByAbilityId = useHudStore((s) => s.abilityUsesByAbilityId);
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
    const abilityUses = ability ? (abilityUsesByAbilityId[ability.id] ?? 0) : 0;
    const useLimit = getVehicleModifiers(vehicleId).abilityUseLimitPerRace;
    const remainingUses = Number.isFinite(useLimit) ? Math.max(0, useLimit - abilityUses) : null;

    useEffect(() => {
        const computeRemaining = () => Math.max(0, readyAtMs - Date.now());
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
    }, [readyAtMs]);

    if (!ability) {
        return null;
    }

    const presentation = buildAbilityIndicatorPresentation({
        abilityLabel: ability.label,
        nowMs: Date.now(),
        readyAtMs,
        remainingUses,
    });
    const isCoolingDown = remainingMs > 0;
    const label = presentation.suffix ? `${presentation.label} (${presentation.suffix})` : presentation.label;

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
                color: presentation.isExhausted
                    ? 'var(--gt-red, #ff6f61)'
                    : presentation.isReady
                      ? 'var(--gt-cyan)'
                      : 'var(--gt-amber)',
                textShadow: presentation.isExhausted
                    ? '0 0 8px rgba(255, 111, 97, 0.6)'
                    : presentation.isReady
                      ? '0 0 8px rgba(0, 229, 255, 0.6)'
                      : '0 0 8px rgba(255, 193, 7, 0.5)',
                transition: 'color 0.3s, text-shadow 0.3s',
            }}
            title={
                presentation.isExhausted
                    ? 'No uses remaining this race'
                    : isCoolingDown
                      ? 'Ability is recharging'
                      : 'Press E to use'
            }
        >
            {presentation.isExhausted ? '✖' : presentation.isReady ? '◈' : '◇'} {label}
        </div>
    );
};
