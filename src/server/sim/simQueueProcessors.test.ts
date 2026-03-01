import { describe, expect, it } from 'bun:test';
import {
    type AbilityActivationEnvelope,
    processAbilityQueue,
    processHazardQueue,
    processPowerupQueue,
} from '@/server/sim/simQueueProcessors';
import type { ActiveProjectile, SimPlayerState } from '@/server/sim/types';
import { DEFAULT_GAMEPLAY_TUNING } from '@/shared/game/tuning/gameplayTuning';
import { createInitialDriftContext } from '@/shared/game/vehicle/driftConfig';
import type { VehicleClassId } from '@/shared/game/vehicle/vehicleClassManifest';
import type { RaceEventPayload } from '@/shared/network/types';

const combatTuning = DEFAULT_GAMEPLAY_TUNING.combat;

const createPlayer = (id: string, vehicleId: VehicleClassId = 'sport', posZ = 0): SimPlayerState => ({
    abilityUsesThisRace: {},
    activeEffects: [],
    colorId: 'red',
    driftContext: createInitialDriftContext(),
    id,
    inputState: { boost: false, brake: false, handbrake: false, steering: 0, throttle: 0 },
    isGrounded: true,
    lastProcessedInputSeq: 0,
    motion: { positionX: 0, positionY: 0, positionZ: posZ, rotationY: 0, speed: 0 },
    name: id,
    progress: { checkpointIndex: 0, completedCheckpoints: [], distanceMeters: 0, finishedAtMs: null, lap: 0 },
    vehicleId,
});

describe('processAbilityQueue', () => {
    it('should apply instant ability and emit ability_activated event', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq: 1, targetPlayerId: null } },
        ];
        const events: RaceEventPayload[] = [];
        const cooldownStore = new Map<string, number>();

        processAbilityQueue(queue, players, [], cooldownStore, combatTuning, 'room1', (e) => events.push(e), 1000);

        expect(player.activeEffects.some((e) => e.effectType === 'boosted')).toBeTrue();
        expect(events).toHaveLength(1);
        expect(events[0]?.kind).toBe('ability_activated');
    });

    it('should emit ability_rejected with usage_limit for bike after 3 uses', () => {
        const player = createPlayer('p1', 'bike');
        const players = new Map([['p1', player]]);
        const cooldownStore = new Map<string, number>();
        const events: RaceEventPayload[] = [];

        // Use large time gaps to avoid cooldown being the rejection reason.
        for (let seq = 1; seq <= 4; seq += 1) {
            const queue: AbilityActivationEnvelope[] = [
                { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq, targetPlayerId: null } },
            ];
            processAbilityQueue(
                queue,
                players,
                [],
                cooldownStore,
                combatTuning,
                'room1',
                (e) => events.push(e),
                10_000 * seq,
            );
        }

        const lastEvent = events[events.length - 1];
        expect(lastEvent?.kind).toBe('ability_rejected');
        expect(lastEvent?.metadata?.reason).toBe('usage_limit');
        expect(lastEvent?.metadata?.vehicleId).toBe('bike');
    });

    it('should increment abilityUsesThisRace for instant abilities', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq: 1, targetPlayerId: null } },
        ];
        const events: RaceEventPayload[] = [];

        processAbilityQueue(queue, players, [], new Map(), combatTuning, 'room1', (e) => events.push(e), 1000);

        expect(player.abilityUsesThisRace['turbo-boost']).toBe(1);
    });

    it('should spawn projectile and increment abilityUsesThisRace for projectile abilities', () => {
        const source = createPlayer('p1', 'patrol', 0);
        const target = createPlayer('p2', 'sport', 20);
        const players = new Map([
            ['p1', source],
            ['p2', target],
        ]);
        const projectiles: ActiveProjectile[] = [];
        const queue: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'spike-shot', seq: 1, targetPlayerId: null } },
        ];
        const events: RaceEventPayload[] = [];

        // nowMs must exceed projectileHitImmunityMs (1500) so the target isn't
        // considered immune (lastHitByProjectileAtMs defaults to undefined → 0).
        processAbilityQueue(queue, players, projectiles, new Map(), combatTuning, 'room1', (e) => events.push(e), 5000);

        expect(projectiles).toHaveLength(1);
        expect(source.abilityUsesThisRace['spike-shot']).toBe(1);
        expect(events).toHaveLength(1);
        expect(events[0]?.kind).toBe('ability_activated');
    });

    it('should drain the queue after processing', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq: 1, targetPlayerId: null } },
        ];

        processAbilityQueue(queue, players, [], new Map(), combatTuning, 'room1', () => {}, 1000);

        expect(queue).toHaveLength(0);
    });

    it('should emit ability_rejected for rejected abilities (cooldown)', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const cooldownStore = new Map<string, number>();
        const events: RaceEventPayload[] = [];

        const queue1: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq: 1, targetPlayerId: null } },
        ];
        processAbilityQueue(queue1, players, [], cooldownStore, combatTuning, 'room1', (e) => events.push(e), 1000);

        const queue2: AbilityActivationEnvelope[] = [
            { playerId: 'p1', payload: { abilityId: 'turbo-boost', seq: 2, targetPlayerId: null } },
        ];
        processAbilityQueue(queue2, players, [], cooldownStore, combatTuning, 'room1', (e) => events.push(e), 1001);

        expect(events).toHaveLength(2);
        expect(events[1]?.kind).toBe('ability_rejected');
        expect(events[1]?.metadata?.abilityId).toBe('turbo-boost');
        expect(events[1]?.metadata?.reason).toBe('cooldown');
        expect(events[1]?.metadata?.vehicleId).toBe('sport');
    });

    it('should do nothing when queue is empty', () => {
        const players = new Map<string, SimPlayerState>();
        const events: RaceEventPayload[] = [];

        processAbilityQueue([], players, [], new Map(), combatTuning, 'room1', (e) => events.push(e), 1000);

        expect(events).toHaveLength(0);
    });
});

describe('processHazardQueue', () => {
    it('should apply hazard effect and emit hazard_triggered event', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue = [{ effectType: 'stunned' as const, playerId: 'p1' }];
        const events: RaceEventPayload[] = [];

        processHazardQueue(queue, players, 'room1', (e) => events.push(e), 1000);

        expect(player.activeEffects.some((e) => e.effectType === 'stunned')).toBeTrue();
        expect(events).toHaveLength(1);
        expect(events[0]?.kind).toBe('hazard_triggered');
    });

    it('should drain the queue after processing', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue = [{ effectType: 'stunned' as const, playerId: 'p1' }];

        processHazardQueue(queue, players, 'room1', () => {}, 1000);

        expect(queue).toHaveLength(0);
    });

    it('should include flip metadata when applyFlipOnHit is set', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue = [{ applyFlipOnHit: true, effectType: 'stunned' as const, playerId: 'p1' }];
        const events: RaceEventPayload[] = [];

        processHazardQueue(queue, players, 'room1', (e) => events.push(e), 1000);

        expect(events[0]?.metadata?.flippedPlayerId).toBe('p1');
    });

    it('should do nothing when queue is empty', () => {
        const events: RaceEventPayload[] = [];
        processHazardQueue([], new Map(), 'room1', (e) => events.push(e), 1000);
        expect(events).toHaveLength(0);
    });
});

describe('processPowerupQueue', () => {
    it('should apply speed_burst and emit powerup_collected event', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue = [{ playerId: 'p1', powerupType: 'speed-boost' as const }];
        const events: RaceEventPayload[] = [];

        processPowerupQueue(queue, players, 'room1', (e) => events.push(e), 1000);

        expect(player.activeEffects.some((e) => e.effectType === 'speed_burst')).toBeTrue();
        expect(events).toHaveLength(1);
        expect(events[0]?.kind).toBe('powerup_collected');
        expect(events[0]?.metadata?.powerupType).toBe('speed-boost');
    });

    it('should drain the queue after processing', () => {
        const player = createPlayer('p1');
        const players = new Map([['p1', player]]);
        const queue = [{ playerId: 'p1', powerupType: 'speed-boost' as const }];

        processPowerupQueue(queue, players, 'room1', () => {}, 1000);

        expect(queue).toHaveLength(0);
    });

    it('should do nothing when queue is empty', () => {
        const events: RaceEventPayload[] = [];
        processPowerupQueue([], new Map(), 'room1', (e) => events.push(e), 1000);
        expect(events).toHaveLength(0);
    });

    it('should apply speed_burst with intensity from vehicle modifier for truck', () => {
        const player = createPlayer('p1', 'truck');
        const players = new Map([['p1', player]]);
        const queue = [{ playerId: 'p1', powerupType: 'speed-boost' as const }];
        const events: RaceEventPayload[] = [];

        processPowerupQueue(queue, players, 'room1', (e) => events.push(e), 1000);

        const effect = player.activeEffects.find((e) => e.effectType === 'speed_burst');
        expect(effect).toBeDefined();
        expect(effect?.intensity).toBe(2); // truck's powerupSpeedMultiplier
    });
});
