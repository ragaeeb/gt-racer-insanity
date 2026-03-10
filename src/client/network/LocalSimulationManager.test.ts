import { afterEach, describe, expect, it } from 'bun:test';
import { LocalSimulationManager } from '@/client/network/LocalSimulationManager';
import { isServerSnapshotPayload } from '@/shared/network/snapshot';
import type { RaceEventPayload, ServerSnapshotPayload } from '@/shared/network/types';
import { getNextTrackId } from '@/shared/game/track/trackManifest';

const waitFor = async <T>(predicate: () => T | null, timeoutMs = 3_000, intervalMs = 20): Promise<T> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        const value = predicate();
        if (value !== null) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
};

describe('LocalSimulationManager', () => {
    const managers: LocalSimulationManager[] = [];

    afterEach(() => {
        for (const manager of managers) {
            manager.disconnect();
        }
        managers.length = 0;
    });

    it('should emit connected status and room_joined with a valid snapshot', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO1');
        managers.push(manager);

        const statuses: string[] = [];
        let joinedPayload: {
            payload: Parameters<Parameters<LocalSimulationManager['onRoomJoined']>[0]>[2];
            players: Parameters<Parameters<LocalSimulationManager['onRoomJoined']>[0]>[1];
            seed: number;
        } | null = null;

        manager.onConnectionStatus((status) => statuses.push(status));
        manager.onRoomJoined((seed, players, payload) => {
            joinedPayload = { payload, players, seed };
        });

        const resolved = await waitFor(() => joinedPayload);
        expect(statuses.includes('connecting')).toBeTrue();
        expect(statuses.includes('connected')).toBeTrue();
        expect(resolved.players.length).toEqual(1);
        expect(resolved.payload.localPlayerId).toEqual('local-player');
        expect(resolved.payload.snapshot).not.toBeUndefined();
        expect(isServerSnapshotPayload(resolved.payload.snapshot)).toBeTrue();
    });

    it('should advance snapshots after input is queued', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO2');
        managers.push(manager);

        let latestSnapshot: ServerSnapshotPayload | null = null;
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
        });

        await waitFor(() => latestSnapshot);

        manager.emitInputFrame({
            ackSnapshotSeq: null,
            controls: {
                boost: false,
                brake: false,
                handbrake: false,
                steering: 0,
                throttle: 1,
            },
            cruiseControlEnabled: true,
            precisionOverrideActive: false,
            seq: 1,
            timestampMs: Date.now(),
        });

        const movingSnapshot = await waitFor(() => {
            const player = latestSnapshot?.players.find((candidate) => candidate.id === 'local-player');
            if (!player) {
                return null;
            }
            if (player.speed <= 0 || player.progress.distanceMeters <= 0) {
                return null;
            }
            return latestSnapshot;
        });

        const movingPlayer = movingSnapshot.players.find((candidate) => candidate.id === 'local-player');
        expect(movingPlayer?.speed ?? 0).toBeGreaterThan(0);
        expect(movingPlayer?.progress.distanceMeters ?? 0).toBeGreaterThan(0);
    });

    it('should reject target-required abilities with no_target in solo mode', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO3');
        managers.push(manager);

        let joined = false;
        manager.onRoomJoined(() => {
            joined = true;
        });
        await waitFor(() => (joined ? true : null));

        const raceEvents: RaceEventPayload[] = [];
        manager.onRaceEvent((event) => {
            raceEvents.push(event);
        });

        manager.emitAbilityActivate({
            abilityId: 'spike-shot',
            seq: 1,
            targetPlayerId: null,
        });

        const rejected = await waitFor(() => {
            const event = raceEvents.find((candidate) => candidate.kind === 'ability_rejected');
            return event ?? null;
        });

        expect(rejected.metadata?.reason).toEqual('no_target');
        expect(rejected.metadata?.abilityId).toEqual('spike-shot');
        expect(raceEvents.some((event) => event.kind === 'ability_activated')).toBeFalse();
    });

    it('should not consume ability activation path when no_target rejection occurs', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO3B');
        managers.push(manager);

        let joined = false;
        manager.onRoomJoined(() => {
            joined = true;
        });
        await waitFor(() => (joined ? true : null));

        const raceEvents: RaceEventPayload[] = [];
        manager.onRaceEvent((event) => {
            raceEvents.push(event);
        });

        manager.emitAbilityActivate({
            abilityId: 'spike-shot',
            seq: 1,
            targetPlayerId: null,
        });

        await waitFor(() => {
            const rejected = raceEvents.find(
                (candidate) => candidate.kind === 'ability_rejected' && candidate.metadata?.abilityId === 'spike-shot',
            );
            return rejected ?? null;
        });

        manager.emitAbilityActivate({
            abilityId: 'turbo-boost',
            seq: 2,
            targetPlayerId: null,
        });

        const activated = await waitFor(() => {
            const event = raceEvents.find(
                (candidate) =>
                    candidate.kind === 'ability_activated' && candidate.metadata?.abilityId === 'turbo-boost',
            );
            return event ?? null;
        });
        expect(activated.metadata?.abilityId).toEqual('turbo-boost');
    });

    it('should advance to the next track when emitRestartRace(true) is called after finish', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO4');
        managers.push(manager);

        let latestSnapshot: ServerSnapshotPayload | null = null;
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
        });

        const initialSnapshot = await waitFor(() => latestSnapshot);
        const initialTrackId = initialSnapshot.raceState.trackId;
        const expectedTrackId = getNextTrackId(initialTrackId);

        const simulation = (manager as unknown as { simulation: { forceFinishRaceForTesting: (nowMs: number, winnerPlayerId?: string) => boolean } | null })
            .simulation;
        expect(simulation).not.toBeNull();
        expect(simulation?.forceFinishRaceForTesting(Date.now(), 'local-player')).toBeTrue();

        manager.emitRestartRace(true);

        const advancedSnapshot = await waitFor(() => {
            if (!latestSnapshot) {
                return null;
            }
            if (latestSnapshot.raceState.trackId !== expectedTrackId) {
                return null;
            }
            return latestSnapshot;
        });

        expect(advancedSnapshot.raceState.trackId).toEqual(expectedTrackId);
    });

    it('should emit the current snapshot instead of advancing when emitRestartRace(true) is called before finish', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO4A');
        managers.push(manager);

        let latestSnapshot: ServerSnapshotPayload | null = null;
        let snapshotCount = 0;
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
            snapshotCount += 1;
        });

        const initialSnapshot = await waitFor(() => latestSnapshot);
        const initialTrackId = initialSnapshot.raceState.trackId;

        manager.emitRestartRace(true);

        const emittedSnapshot = await waitFor(() => {
            if (!latestSnapshot) {
                return null;
            }
            return snapshotCount >= 2 ? latestSnapshot : null;
        });

        expect(emittedSnapshot.raceState.trackId).toEqual(initialTrackId);
        expect(emittedSnapshot.raceState.status).toEqual('running');
    });

    it('should restart on the same track when emitRestartRace(false) is called', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO4B');
        managers.push(manager);

        let latestSnapshot: ServerSnapshotPayload | null = null;
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
        });

        const initialSnapshot = await waitFor(() => latestSnapshot);
        const initialTrackId = initialSnapshot.raceState.trackId;
        const initialSeq = initialSnapshot.seq;

        manager.emitRestartRace(false);

        const restartedSnapshot = await waitFor(() => {
            if (!latestSnapshot) {
                return null;
            }
            if (latestSnapshot.seq <= initialSeq) {
                return null;
            }
            return latestSnapshot;
        });

        expect(restartedSnapshot.raceState.trackId).toEqual(initialTrackId);
    });

    it('should expose forceFinishRaceForTesting and emit race_finished', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO4C');
        managers.push(manager);

        const raceEvents: RaceEventPayload[] = [];
        let latestSnapshot: ServerSnapshotPayload | null = null;
        manager.onRaceEvent((event) => {
            raceEvents.push(event);
        });
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
        });

        await waitFor(() => latestSnapshot);
        const forced = manager.forceFinishRaceForTesting();
        expect(forced).toBeTrue();

        const finishedSnapshot = await waitFor(() => {
            if (!latestSnapshot) {
                return null;
            }
            return latestSnapshot.raceState.status === 'finished' ? latestSnapshot : null;
        });
        expect(finishedSnapshot.raceState.status).toEqual('finished');
        expect(raceEvents.some((event) => event.kind === 'race_finished')).toBeTrue();
    });

    it('should repeatedly advance levels and return to running state', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO4D');
        managers.push(manager);

        let latestSnapshot: ServerSnapshotPayload | null = null;
        manager.onServerSnapshot((snapshot) => {
            latestSnapshot = snapshot;
        });
        const initialSnapshot = await waitFor(() => latestSnapshot);
        let expectedTrackId = initialSnapshot.raceState.trackId;

        for (let index = 0; index < 3; index += 1) {
            expectedTrackId = getNextTrackId(expectedTrackId);
            expect(manager.forceFinishRaceForTesting()).toBeTrue();
            manager.emitRestartRace(true);

            const nextSnapshot = await waitFor(() => {
                if (!latestSnapshot) {
                    return null;
                }
                if (latestSnapshot.raceState.trackId !== expectedTrackId) {
                    return null;
                }
                if (latestSnapshot.raceState.status !== 'running') {
                    return null;
                }
                return latestSnapshot;
            });

            expect(nextSnapshot.raceState.trackId).toEqual(expectedTrackId);
            expect(nextSnapshot.raceState.status).toEqual('running');
        }
    });

    it('should stop emitting snapshots after disconnect', async () => {
        const manager = new LocalSimulationManager('Solo Driver', 'SOLO5');
        managers.push(manager);

        let snapshotCount = 0;
        manager.onServerSnapshot(() => {
            snapshotCount += 1;
        });

        await waitFor(() => (snapshotCount > 0 ? snapshotCount : null));
        manager.disconnect();
        const countAtDisconnect = snapshotCount;
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(snapshotCount).toEqual(countAtDisconnect);
    });
});
