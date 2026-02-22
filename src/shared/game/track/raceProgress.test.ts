import { describe, expect, it } from 'bun:test';
import { createInitialRaceProgress, advanceRaceProgress } from '@/shared/game/track/raceProgress';
import { getTrackManifestById } from '@/shared/game/track/trackManifest';

describe('race progress', () => {
    it('should progress checkpoints in order', () => {
        const track = getTrackManifestById('sunset-loop');
        const start = createInitialRaceProgress();

        const cp1 = advanceRaceProgress(start, 0, 260, track, 1_000);
        expect(cp1.progress.checkpointIndex).toEqual(0);

        const cp2 = advanceRaceProgress(cp1.progress, 260, 530, track, 2_000);
        expect(cp2.progress.checkpointIndex).toEqual(1);
    });

    it('should prevent lap increment when checkpoint order is skipped', () => {
        const track = getTrackManifestById('sunset-loop');
        const start = createInitialRaceProgress();

        const skipped = advanceRaceProgress(start, 0, 910, track, 1_000);
        expect(skipped.progress.lap).toEqual(0);
        expect(skipped.progress.checkpointIndex).toEqual(-1);
    });

    it('should mark race as finished after configured lap count', () => {
        const track = getTrackManifestById('sunset-loop');
        let progress = createInitialRaceProgress();
        let previousDistance = 0;
        let nextDistance = 0;
        let update = { progress, shouldFinish: false };

        for (let lap = 0; lap < track.totalLaps; lap += 1) {
            nextDistance += 260;
            update = advanceRaceProgress(progress, previousDistance, nextDistance, track, 1_000 + lap);
            progress = update.progress;
            previousDistance = nextDistance;

            nextDistance += 280;
            update = advanceRaceProgress(progress, previousDistance, nextDistance, track, 1_001 + lap);
            progress = update.progress;
            previousDistance = nextDistance;

            nextDistance += 250;
            update = advanceRaceProgress(progress, previousDistance, nextDistance, track, 1_002 + lap);
            progress = update.progress;
            previousDistance = nextDistance;

            nextDistance = (lap + 1) * track.lengthMeters + 10;
            update = advanceRaceProgress(progress, previousDistance, nextDistance, track, 1_003 + lap);
            progress = update.progress;
            previousDistance = nextDistance;
        }

        expect(update.shouldFinish).toEqual(true);
        expect(update.progress.lap).toBeGreaterThanOrEqual(track.totalLaps);
    });
});
