import type { SnapshotPlayerState } from '@/shared/network/types';

export type AbilityFxEvent = {
    abilityId: string;
    playerId: string;
    triggeredAtMs: number;
};

export const collectAbilityFxEvents = (
    previousPlayers: SnapshotPlayerState[],
    nextPlayers: SnapshotPlayerState[],
    nowMs: number
): AbilityFxEvent[] => {
    const previousById = new Map(previousPlayers.map((player) => [player.id, player]));
    const events: AbilityFxEvent[] = [];

    for (const nextPlayer of nextPlayers) {
        const previous = previousById.get(nextPlayer.id);
        if (!previous) continue;
        const hadBoost = previous.activeEffects.some((effect) => effect.effectType === 'boosted');
        const hasBoost = nextPlayer.activeEffects.some((effect) => effect.effectType === 'boosted');

        if (!hadBoost && hasBoost) {
            events.push({
                abilityId: 'turbo-boost',
                playerId: nextPlayer.id,
                triggeredAtMs: nowMs,
            });
        }
    }

    return events;
};
