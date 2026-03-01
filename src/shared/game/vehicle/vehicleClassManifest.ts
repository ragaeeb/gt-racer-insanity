import type { CarPhysicsConfig } from '@/shared/game/carPhysics';

export type VehicleClassId = 'sport' | 'muscle' | 'patrol' | 'truck' | 'bike';

export type VehiclePhysicsManifest = {
    acceleration: number;
    collisionMass: number;
    friction: number;
    maxForwardSpeed: number;
    maxReverseSpeed: number;
    minTurnSpeed: number;
    turnSpeed: number;
};

export type VehicleModifiers = {
    /** Max ability activations per race. `Infinity` = unlimited. */
    abilityUseLimitPerRace: number;
    /** Scales the bonus portion of speed-boost powerup effects. 1 = normal. */
    powerupSpeedMultiplier: number;
    /** Scales stun duration from all sources. 1 = normal, 0.5 = half. */
    stunDurationMultiplier: number;
};

export const DEFAULT_VEHICLE_MODIFIERS: VehicleModifiers = {
    abilityUseLimitPerRace: Infinity,
    powerupSpeedMultiplier: 1,
    stunDurationMultiplier: 1,
};

export type VehicleClassManifest = {
    abilityId: string;
    colorPaletteIds: string[];
    id: VehicleClassId;
    label: string;
    modifiers?: Partial<VehicleModifiers>;
    physics: VehiclePhysicsManifest;
};

export const VEHICLE_CLASS_MANIFESTS: VehicleClassManifest[] = [
    {
        abilityId: 'turbo-boost',
        colorPaletteIds: ['red', 'white', 'gold'],
        id: 'sport',
        label: 'Sport',
        physics: {
            acceleration: 24,
            collisionMass: 1050,
            friction: 7,
            maxForwardSpeed: 44,
            maxReverseSpeed: 20,
            minTurnSpeed: 0.1,
            turnSpeed: 2.7,
        },
    },
    {
        abilityId: 'ram-wave',
        colorPaletteIds: ['blue', 'silver', 'orange'],
        id: 'muscle',
        label: 'Muscle',
        physics: {
            acceleration: 21,
            collisionMass: 1300,
            friction: 8,
            maxForwardSpeed: 40,
            maxReverseSpeed: 18,
            minTurnSpeed: 0.1,
            turnSpeed: 2.4,
        },
    },
    {
        abilityId: 'spike-shot',
        colorPaletteIds: ['white', 'black', 'blue', 'silver'],
        id: 'patrol',
        label: 'Patrol',
        modifiers: { stunDurationMultiplier: 0.5 },
        physics: {
            acceleration: 22,
            collisionMass: 1150,
            friction: 7.5,
            maxForwardSpeed: 42,
            maxReverseSpeed: 18,
            minTurnSpeed: 0.1,
            turnSpeed: 2.5,
        },
    },
    {
        abilityId: 'spike-burst',
        colorPaletteIds: ['green', 'yellow', 'gray', 'white'],
        id: 'truck',
        label: 'Truck',
        modifiers: { powerupSpeedMultiplier: 2 },
        physics: {
            acceleration: 18,
            collisionMass: 1800,
            friction: 8.5,
            maxForwardSpeed: 36,
            maxReverseSpeed: 16,
            minTurnSpeed: 0.1,
            turnSpeed: 2.1,
        },
    },
    {
        abilityId: 'turbo-boost',
        colorPaletteIds: ['red', 'silver', 'blue'],
        id: 'bike',
        label: 'Motorcycle',
        modifiers: { abilityUseLimitPerRace: 3 },
        physics: {
            acceleration: 28, // fastest accel
            collisionMass: 700, // lightest = most vulnerable to bumps
            friction: 1, // lowest = slidiest in turns
            maxForwardSpeed: 48, // fastest top speed
            maxReverseSpeed: 18,
            minTurnSpeed: 0.1,
            turnSpeed: 2.1, // lower = less agile (trade-off for speed)
        },
    },
];

export const getVehicleClassManifestById = (vehicleClassId: string): VehicleClassManifest => {
    return VEHICLE_CLASS_MANIFESTS.find((manifest) => manifest.id === vehicleClassId) ?? VEHICLE_CLASS_MANIFESTS[0];
};

export const getVehicleModifiers = (vehicleClassId: string): VehicleModifiers => {
    const manifest = getVehicleClassManifestById(vehicleClassId);
    return { ...DEFAULT_VEHICLE_MODIFIERS, ...manifest.modifiers };
};

/**
 * Convert a VehiclePhysicsManifest to a CarPhysicsConfig suitable for stepCarMotion.
 * The manifest lacks `deceleration`; we derive it from the provided default.
 */
export const vehicleManifestToPhysicsConfig = (
    physics: VehiclePhysicsManifest,
    defaultDeceleration: number,
): CarPhysicsConfig => ({
    acceleration: physics.acceleration,
    deceleration: defaultDeceleration,
    friction: physics.friction,
    maxForwardSpeed: physics.maxForwardSpeed,
    maxReverseSpeed: physics.maxReverseSpeed,
    minTurnSpeed: physics.minTurnSpeed,
    turnSpeed: physics.turnSpeed,
});
