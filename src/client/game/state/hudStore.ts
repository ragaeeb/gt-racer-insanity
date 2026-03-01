import { create } from 'zustand';
import { TRACK_DEFAULT_LABEL } from '@/shared/game/track/trackManifest';

export type ToastVariant = 'success' | 'warning' | 'error';

export type Toast = { message: string; variant: ToastVariant };

export type HudStoreState = {
    abilityUsesByAbilityId: Record<string, number>;
    activeEffectIds: string[];
    incrementAbilityUse: (abilityId: string) => void;
    cooldownMsByAbilityId: Record<string, number>;
    /** Current drift boost tier: 0 = none, 1 = blue (mini), 2 = orange (super), 3 = purple (ultra) */
    driftBoostTier: number;
    lap: number;
    pendingToasts: Toast[];
    position: number;
    setActiveEffectIds: (effectIds: string[]) => void;
    setAbilityUseCount: (abilityId: string, useCount: number) => void;
    setCooldownMsByAbilityId: (cooldownMsByAbilityId: Record<string, number>) => void;
    /** Set when an ability is ready again (timestamp in ms). Used for cooldown display and input throttle. */
    setAbilityReadyAtMs: (abilityId: string, readyAtMs: number) => void;
    setDriftBoostTier: (tier: number) => void;
    setLap: (lap: number) => void;
    setPosition: (position: number) => void;
    resetAbilityUsage: () => void;
    setSpeedKph: (speedKph: number) => void;
    setTrackLabel: (trackLabel: string) => void;
    showToast: (message: string, variant: ToastVariant) => void;
    clearPendingToast: () => void;
    speedKph: number;
    trackLabel: string;
};

export const useHudStore = create<HudStoreState>((set) => ({
    abilityUsesByAbilityId: {},
    activeEffectIds: [],
    incrementAbilityUse: (abilityId) =>
        set((state) => ({
            abilityUsesByAbilityId: {
                ...state.abilityUsesByAbilityId,
                [abilityId]: (state.abilityUsesByAbilityId[abilityId] ?? 0) + 1,
            },
        })),
    cooldownMsByAbilityId: {},
    driftBoostTier: 0,
    lap: 1,
    pendingToasts: [],
    position: 1,
    setActiveEffectIds: (activeEffectIds) =>
        set((state) => {
            if (
                state.activeEffectIds.length === activeEffectIds.length &&
                state.activeEffectIds.every((effectId, index) => effectId === activeEffectIds[index])
            ) {
                return state;
            }

            return { activeEffectIds };
        }),
    setAbilityUseCount: (abilityId, useCount) =>
        set((state) => {
            const nextUseCount = Math.max(0, Math.trunc(useCount));
            const existingUseCount = state.abilityUsesByAbilityId[abilityId];
            if (existingUseCount !== undefined && existingUseCount === nextUseCount) {
                return state;
            }
            return {
                abilityUsesByAbilityId: {
                    ...state.abilityUsesByAbilityId,
                    [abilityId]: nextUseCount,
                },
            };
        }),
    setCooldownMsByAbilityId: (cooldownMsByAbilityId) => set(() => ({ cooldownMsByAbilityId })),
    setAbilityReadyAtMs: (abilityId, readyAtMs) =>
        set((state) => ({
            cooldownMsByAbilityId: { ...state.cooldownMsByAbilityId, [abilityId]: readyAtMs },
        })),
    setDriftBoostTier: (driftBoostTier) =>
        set((state) => {
            const normalizedTier = Math.min(3, Math.max(0, Math.trunc(driftBoostTier)));
            return state.driftBoostTier === normalizedTier ? state : { driftBoostTier: normalizedTier };
        }),
    setLap: (lap) => set((state) => (state.lap === lap ? state : { lap })),
    setPosition: (position) => set((state) => (state.position === position ? state : { position })),
    resetAbilityUsage: () =>
        set((state) =>
            Object.keys(state.abilityUsesByAbilityId).length === 0 ? state : { abilityUsesByAbilityId: {} },
        ),
    setSpeedKph: (speedKph) =>
        set((state) => {
            const nextSpeedKph = Math.max(0, Math.round(speedKph));
            return state.speedKph === nextSpeedKph ? state : { speedKph: nextSpeedKph };
        }),
    setTrackLabel: (trackLabel) => set((state) => (state.trackLabel === trackLabel ? state : { trackLabel })),
    showToast: (message, variant) =>
        set((state) => ({ pendingToasts: [...state.pendingToasts, { message, variant }] })),
    clearPendingToast: () => set((state) => ({ pendingToasts: state.pendingToasts.slice(1) })),
    speedKph: 0,
    trackLabel: TRACK_DEFAULT_LABEL,
}));
