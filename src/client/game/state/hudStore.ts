import { create } from 'zustand';
import { TRACK_DEFAULT_LABEL } from '@/shared/game/track/trackManifest';

export type HudStoreState = {
    activeEffectIds: string[];
    cooldownMsByAbilityId: Record<string, number>;
    lap: number;
    position: number;
    setActiveEffectIds: (effectIds: string[]) => void;
    setCooldownMsByAbilityId: (cooldownMsByAbilityId: Record<string, number>) => void;
    setLap: (lap: number) => void;
    setPosition: (position: number) => void;
    setSpeedKph: (speedKph: number) => void;
    setTrackLabel: (trackLabel: string) => void;
    speedKph: number;
    trackLabel: string;
};

export const useHudStore = create<HudStoreState>((set) => ({
    activeEffectIds: [],
    cooldownMsByAbilityId: {},
    lap: 1,
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
    setLap: (lap) => set((state) => (state.lap === lap ? state : { lap })),
    setPosition: (position) => set((state) => (state.position === position ? state : { position })),
    setSpeedKph: (speedKph) =>
        set((state) => {
            const nextSpeedKph = Math.max(0, Math.round(speedKph));
            return state.speedKph === nextSpeedKph ? state : { speedKph: nextSpeedKph };
        }),
    setTrackLabel: (trackLabel) => set((state) => (state.trackLabel === trackLabel ? state : { trackLabel })),
    speedKph: 0,
    trackLabel: TRACK_DEFAULT_LABEL,
}));
