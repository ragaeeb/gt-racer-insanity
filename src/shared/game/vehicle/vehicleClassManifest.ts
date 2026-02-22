export type VehicleClassId = 'sport' | 'muscle' | 'truck';

export type VehiclePhysicsManifest = {
    acceleration: number;
    collisionMass: number;
    friction: number;
    maxForwardSpeed: number;
    maxReverseSpeed: number;
    minTurnSpeed: number;
    turnSpeed: number;
};

export type VehicleClassManifest = {
    abilityId: string;
    colorPaletteIds: string[];
    id: VehicleClassId;
    label: string;
    physics: VehiclePhysicsManifest;
};

export const VEHICLE_CLASS_MANIFESTS: VehicleClassManifest[] = [
    {
        abilityId: 'turbo-boost',
        colorPaletteIds: ['red', 'white', 'black', 'gold'],
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
        colorPaletteIds: ['blue', 'silver', 'orange', 'black'],
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
        abilityId: 'spike-burst',
        colorPaletteIds: ['green', 'yellow', 'gray', 'white'],
        id: 'truck',
        label: 'Truck',
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
];

export const getVehicleClassManifestById = (vehicleClassId: string): VehicleClassManifest => {
    return VEHICLE_CLASS_MANIFESTS.find((manifest) => manifest.id === vehicleClassId) ?? VEHICLE_CLASS_MANIFESTS[0];
};
