import RAPIER, { EventQueue, World, type Vector } from '@dimforge/rapier3d-compat';

const RAPIER_INIT_DEPRECATION_WARNING =
    'using deprecated parameters for the initialization function; pass a single object instead';

const initializeRapier = async () => {
    const originalWarn = console.warn.bind(console);

    console.warn = (...args: unknown[]) => {
        if (args[0] === RAPIER_INIT_DEPRECATION_WARNING) {
            return;
        }
        originalWarn(...args);
    };

    try {
        await RAPIER.init();
    } catch (error) {
        console.error('RAPIER.init failed:', error);
        throw new Error(`Failed to initialize Rapier physics: ${String(error)}`);
    } finally {
        console.warn = originalWarn;
    }
};

await initializeRapier();

type RapierWorldContext = {
    eventQueue: EventQueue;
    rapier: typeof RAPIER;
    world: World;
};

const ZERO_GRAVITY: Vector = { x: 0, y: 0, z: 0 };

export const createRapierWorld = (timestepSeconds: number): RapierWorldContext => {
    const world = new RAPIER.World(ZERO_GRAVITY);
    world.timestep = timestepSeconds;

    return {
        eventQueue: new RAPIER.EventQueue(true),
        rapier: RAPIER,
        world,
    };
};
