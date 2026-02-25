import { useRef } from 'react';
import type { RaceSession } from '@/client/game/hooks/types';
import {
    CONTACT_DISTANCE_THRESHOLD_METERS,
    type ContactEpisodeState,
    createContactEpisodeState,
    type NearestOpponent,
    PASS_THROUGH_DISTANCE_THRESHOLD_METERS,
} from './types';

type ContactEpisodeUpdate = {
    /** True the first frame a pass-through is detected (episode just closed). */
    newPassThroughDetected: boolean;
    detectedOpponentId: string | null;
    detectedMinDistanceMeters: number;
};

type ContactEpisodeTrackerResult = {
    episodeRef: React.RefObject<ContactEpisodeState>;
    /** Call once per frame inside useFrame to advance the state machine. */
    update: (nearest: NearestOpponent | null, session: RaceSession, nowMs: number) => ContactEpisodeUpdate;
    reset: () => void;
};

/**
 * Tracks whether the local player is in physical contact with an opponent and
 * detects potential pass-through events (cars occupying the same space without a
 * registered collision event).
 */
export const useContactEpisodeTracker = (): ContactEpisodeTrackerResult => {
    const episodeRef = useRef<ContactEpisodeState>(createContactEpisodeState());

    const reset = () => {
        episodeRef.current = createContactEpisodeState();
    };

    const update = (nearest: NearestOpponent | null, session: RaceSession, nowMs: number): ContactEpisodeUpdate => {
        const episode = episodeRef.current;
        const isContactActive = nearest !== null && nearest.distanceMeters <= CONTACT_DISTANCE_THRESHOLD_METERS;

        if (isContactActive && nearest) {
            if (!episode.active || episode.opponentId !== nearest.id) {
                // New contact episode started.
                episode.active = true;
                episode.startedAtMs = nowMs;
                episode.opponentId = nearest.id;
                episode.minDistanceMeters = nearest.distanceMeters;
                episode.initialRelativeZ = nearest.relativeZ;
                episode.passThroughSuspected = false;
                episode.hadCollisionEvent = false;
            } else {
                episode.minDistanceMeters = Math.min(episode.minDistanceMeters, nearest.distanceMeters);
            }

            if (session.lastCollisionEventAtMs !== null && session.lastCollisionEventAtMs >= episode.startedAtMs) {
                episode.hadCollisionEvent = true;
            }

            const crossedThroughOpponent =
                Math.abs(episode.initialRelativeZ) > 0.01 &&
                Math.abs(nearest.relativeZ) > 0.01 &&
                Math.sign(nearest.relativeZ) !== Math.sign(episode.initialRelativeZ);

            if (
                crossedThroughOpponent &&
                episode.minDistanceMeters <= PASS_THROUGH_DISTANCE_THRESHOLD_METERS &&
                !episode.hadCollisionEvent
            ) {
                episode.passThroughSuspected = true;
            }

            return { newPassThroughDetected: false, detectedOpponentId: null, detectedMinDistanceMeters: 0 };
        }

        // Contact just ended – close the episode.
        if (episode.active) {
            const wasPassThrough = episode.passThroughSuspected;
            const closedOpponentId = episode.opponentId;
            const closedMinDistance = episode.minDistanceMeters;

            Object.assign(episode, createContactEpisodeState());

            if (wasPassThrough) {
                return {
                    newPassThroughDetected: true,
                    detectedOpponentId: closedOpponentId,
                    detectedMinDistanceMeters: closedMinDistance,
                };
            }
        }

        return { newPassThroughDetected: false, detectedOpponentId: null, detectedMinDistanceMeters: 0 };
    };

    return { episodeRef, reset, update };
};
