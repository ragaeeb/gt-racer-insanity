export const playerIdToVehicleIndex = (id: string, totalVehicles: number) => {
    if (totalVehicles <= 0) {
        return 0;
    }

    let hash = 0;

    for (let i = 0; i < id.length; i += 1) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }

    return Math.abs(hash) % totalVehicles;
};
