export type CarModelDefinition = {
    author: string;
    id: string;
    license: string;
    modelPath: string;
    modelYawOffsetRadians?: number;
    sourceUrl: string;
    title: string;
};

export const CAR_MODEL_CATALOG: CarModelDefinition[] = [
    {
        id: 'compact',
        title: 'Car',
        author: 'Quaternius',
        license: 'CC0 1.0',
        modelPath: '/models/cars/car-compact.glb',
        modelYawOffsetRadians: Math.PI,
        sourceUrl: 'https://poly.pizza/m/Cz6yDaUcM9',
    },
    {
        id: 'sport',
        title: 'Sports Car',
        author: 'Quaternius',
        license: 'CC0 1.0',
        modelPath: '/models/cars/car-sport.glb',
        modelYawOffsetRadians: Math.PI,
        sourceUrl: 'https://poly.pizza/m/OyqKvX9xNh',
    },
    {
        id: 'pickup',
        title: 'Pickup Truck',
        author: 'Quaternius',
        license: 'CC0 1.0',
        modelPath: '/models/cars/car-pickup.glb',
        modelYawOffsetRadians: Math.PI,
        sourceUrl: 'https://poly.pizza/m/qn4grQgHm8',
    },
    {
        id: 'suv',
        title: 'SUV',
        author: 'Quaternius',
        license: 'CC0 1.0',
        modelPath: '/models/cars/car-suv.glb',
        modelYawOffsetRadians: Math.PI,
        sourceUrl: 'https://poly.pizza/m/xsMtZhBkxL',
    },
    {
        id: 'police',
        title: 'Police Car',
        author: 'Quaternius',
        license: 'CC0 1.0',
        modelPath: '/models/cars/car-police.glb',
        modelYawOffsetRadians: Math.PI,
        sourceUrl: 'https://poly.pizza/m/BwwnUrWGmV',
    },
];
