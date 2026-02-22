// A simple seeded random number generator (Mulberry32)
export const seededRandom = (seed: number) => {
    return () => {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
