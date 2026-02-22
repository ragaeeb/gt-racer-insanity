import type { SnapshotPlayerState } from '@/shared/network/types';

export type HazardFxEvent = {
    effectType: 'flat_tire' | 'slowed' | 'stunned';
    playerId: string;
    triggeredAtMs: number;
};

export const collectHazardFxEvents = (
    previousPlayers: SnapshotPlayerState[],
    nextPlayers: SnapshotPlayerState[],
    nowMs: number
): HazardFxEvent[] => {
    const previousById = new Map(previousPlayers.map((player) => [player.id, player]));
    const events: HazardFxEvent[] = [];

    for (const nextPlayer of nextPlayers) {
        const previous = previousById.get(nextPlayer.id);
        if (!previous) continue;

        for (const effectType of ['flat_tire', 'slowed', 'stunned'] as const) {
            const hadEffect = previous.activeEffects.some((effect) => effect.effectType === effectType);
            const hasEffect = nextPlayer.activeEffects.some((effect) => effect.effectType === effectType);
            if (!hadEffect && hasEffect) {
                events.push({
                    effectType,
                    playerId: nextPlayer.id,
                    triggeredAtMs: nowMs,
                });
            }
        }
    }

    return events;
};
