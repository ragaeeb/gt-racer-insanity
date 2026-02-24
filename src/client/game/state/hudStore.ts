import { create } from 'zustand';
import { TRACK_DEFAULT_LABEL } from '@/shared/game/track/trackManifest';

export type ToastVariant = 'success' | 'warning' | 'error';

export type Toast = { message: string; variant: ToastVariant };

export type HudStoreState = {
    activeEffectIds: string[];
    cooldownMsByAbilityId: Record<string, number>;
    lap: number;
    pendingToasts: Toast[];
    position: number;
    setActiveEffectIds: (effectIds: string[]) => void;
    setCooldownMsByAbilityId: (cooldownMsByAbilityId: Record<string, number>) => void;
    /** Set when an ability is ready again (timestamp in ms). Used for cooldown display and input throttle. */
    setAbilityReadyAtMs: (abilityId: string, readyAtMs: number) => void;
    setLap: (lap: number) => void;
    setPosition: (position: number) => void;
    setSpeedKph: (speedKph: number) => void;
    setTrackLabel: (trackLabel: string) => void;
    showToast: (message: string, variant: ToastVariant) => void;
    clearPendingToast: () => void;
    speedKph: number;
    trackLabel: string;
};

export const useHudStore = create<HudStoreState>((set) => ({
    activeEffectIds: [],
    cooldownMsByAbilityId: {},
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
    setCooldownMsByAbilityId: (cooldownMsByAbilityId) => set(() => ({ cooldownMsByAbilityId })),
    setAbilityReadyAtMs: (abilityId, readyAtMs) =>
        set((state) => ({
            cooldownMsByAbilityId: { ...state.cooldownMsByAbilityId, [abilityId]: readyAtMs },
        })),
    setLap: (lap) => set((state) => (state.lap === lap ? state : { lap })),
    setPosition: (position) => set((state) => (state.position === position ? state : { position })),
    setSpeedKph: (speedKph) =>
        set((state) => {
            const nextSpeedKph = Math.max(0, Math.round(speedKph));
            return state.speedKph === nextSpeedKph ? state : { speedKph: nextSpeedKph };
        }),
    setTrackLabel: (trackLabel) => set((state) => (state.trackLabel === trackLabel ? state : { trackLabel })),
    showToast: (message, variant) => set((state) => ({ pendingToasts: [...state.pendingToasts, { message, variant }] })),
    clearPendingToast: () => set((state) => ({ pendingToasts: state.pendingToasts.slice(1) })),
    speedKph: 0,
    trackLabel: TRACK_DEFAULT_LABEL,
}));
