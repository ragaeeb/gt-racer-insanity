import { create } from 'zustand';

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
    speedKph: number;
};

export const useHudStore = create<HudStoreState>((set) => ({
    activeEffectIds: [],
    cooldownMsByAbilityId: {},
    lap: 1,
    position: 1,
    setActiveEffectIds: (activeEffectIds) => set(() => ({ activeEffectIds })),
    setCooldownMsByAbilityId: (cooldownMsByAbilityId) => set(() => ({ cooldownMsByAbilityId })),
    setLap: (lap) => set(() => ({ lap })),
    setPosition: (position) => set(() => ({ position })),
    setSpeedKph: (speedKph) => set(() => ({ speedKph })),
    speedKph: 0,
}));
