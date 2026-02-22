export const playerIdToHue = (id: string) => {
    let hash = 0;

    for (let i = 0; i < id.length; i += 1) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }

    return Math.abs(hash % 360) / 360;
};
