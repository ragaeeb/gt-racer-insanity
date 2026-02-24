import { create } from 'zustand';

export type PendingSpikeShot = {
    sourceX: number;
    sourceZ: number;
    targetX: number;
    targetZ: number;
    triggeredAtMs: number;
};

type AbilityFxState = {
    pendingSpikeShots: PendingSpikeShot[];
    addPendingSpikeShot: (payload: PendingSpikeShot) => void;
    removeExpiredSpikeShots: (nowMs: number, maxAgeMs?: number) => void;
};

const SPIKE_SHOT_MAX_AGE_MS = 700;

export const useAbilityFxStore = create<AbilityFxState>((set, get) => ({
    pendingSpikeShots: [],
    addPendingSpikeShot: (payload) =>
        set((state) => ({
            pendingSpikeShots: [...state.pendingSpikeShots, payload],
        })),
    removeExpiredSpikeShots: (nowMs, maxAgeMs = SPIKE_SHOT_MAX_AGE_MS) => {
        const current = get().pendingSpikeShots;
        if (current.length === 0) {
            return;
        }

        const filtered = current.filter((p) => nowMs - p.triggeredAtMs <= maxAgeMs);
        if (filtered.length !== current.length) {
            set({ pendingSpikeShots: filtered });
        }
    },
}));
