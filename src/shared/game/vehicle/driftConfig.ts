export const DriftState = {
    GRIPPING: 0,
    INITIATING: 1,
    DRIFTING: 2,
    RECOVERING: 3,
} as const;

export type DriftStateValue = (typeof DriftState)[keyof typeof DriftState];

export type DriftConfig = {
    /** m/s — minimum speed to start drift */
    initiationSpeedThreshold: number;
    /** 0–1 — minimum steering angle to enter drift */
    initiationSteerThreshold: number;
    /** ms — max time in INITIATING before falling back to GRIPPING. */
    initiatingToGrippingTimeMs: number;
    /** ms — time in INITIATING before transitioning to DRIFTING */
    initiatingToDriftingTimeMs: number;
    /** 0–1 — lateral friction multiplier while DRIFTING (very slidey) */
    driftingLateralFriction: number;
    /** 0–1 — lateral friction during INITIATING */
    initiatingLateralFriction: number;
    /** 0–1 — lateral friction during RECOVERING */
    recoveringLateralFriction: number;
    /** 0–1 — lateral friction during GRIPPING (existing 0.65 default) */
    grippingLateralFriction: number;
    /** ms — minimum drift time for tier 1 (mini-boost) */
    boostTier1TimeMs: number;
    /** ms — minimum drift time for tier 2 (super-boost) */
    boostTier2TimeMs: number;
    /** ms — minimum drift time for tier 3 (ultra-boost) */
    boostTier3TimeMs: number;
    /** m/s — impulse magnitude for tier 1 */
    boostTier1Magnitude: number;
    /** m/s — impulse magnitude for tier 2 */
    boostTier2Magnitude: number;
    /** m/s — impulse magnitude for tier 3 */
    boostTier3Magnitude: number;
    /** ms — how long boost lasts after exit */
    boostDurationMs: number;
    /** ms — time in RECOVERING before returning to GRIPPING */
    recoveringDurationMs: number;
};

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
    initiationSpeedThreshold: 10,
    initiationSteerThreshold: 0.7,
    initiatingToGrippingTimeMs: 200,
    initiatingToDriftingTimeMs: 150,
    driftingLateralFriction: 0.15,
    initiatingLateralFriction: 0.35,
    recoveringLateralFriction: 0.5,
    grippingLateralFriction: 0.65,
    boostTier1TimeMs: 1000,
    boostTier2TimeMs: 2000,
    boostTier3TimeMs: 3000,
    boostTier1Magnitude: 5,
    boostTier2Magnitude: 9,
    boostTier3Magnitude: 14,
    boostDurationMs: 500,
    recoveringDurationMs: 300,
};

export type DriftContext = {
    /** Current drift FSM state */
    state: DriftStateValue;
    /** Timestamp (ms) when the current state was entered — never mutated mid-state */
    stateEnteredAtMs: number;
    /** Timestamp (ms) when drifting first began (for accumulated time) */
    driftStartedAtMs: number;
    /**
     * Timestamp (ms) of the previous DRIFTING tick — used to compute per-tick dtMs
     * without repurposing stateEnteredAtMs (which must remain the true entry time).
     */
    lastDriftTickMs: number;
    /** Current drift angle in radians */
    driftAngle: number;
    /** Total accumulated time in DRIFTING state (ms) */
    accumulatedDriftTimeMs: number;
    /** Charged boost tier: 0 = none, 1–3 = tier */
    boostTier: number;
};

export const createInitialDriftContext = (): DriftContext => ({
    state: DriftState.GRIPPING,
    stateEnteredAtMs: 0,
    driftStartedAtMs: 0,
    lastDriftTickMs: 0,
    driftAngle: 0,
    accumulatedDriftTimeMs: 0,
    boostTier: 0,
});
