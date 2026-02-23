export type SteeringInputState = {
    isLeftPressed: boolean;
    isRightPressed: boolean;
};

export type ThrottleInputState = {
    cruiseControlEnabled: boolean;
    currentSpeed: number;
    isDownPressed: boolean;
    isPrecisionOverrideActive: boolean;
    isUpPressed: boolean;
    maxForwardSpeed: number;
    previousCruiseLatchActive: boolean;
};

export type ThrottleInputResult = {
    cruiseLatchActive: boolean;
    throttle: number;
};

export const resolveSteeringInput = ({ isLeftPressed, isRightPressed }: SteeringInputState) => {
    return (isLeftPressed ? 1 : 0) + (isRightPressed ? -1 : 0);
};

export const resolveThrottleInput = ({
    cruiseControlEnabled,
    currentSpeed,
    isDownPressed,
    isPrecisionOverrideActive,
    isUpPressed,
    maxForwardSpeed,
    previousCruiseLatchActive,
}: ThrottleInputState): ThrottleInputResult => {
    const topSpeedLatchThreshold = maxForwardSpeed * 0.98;
    let cruiseLatchActive = previousCruiseLatchActive;

    if (!cruiseControlEnabled || isPrecisionOverrideActive) {
        cruiseLatchActive = false;
    }

    if (isDownPressed) {
        cruiseLatchActive = false;
    }

    if (isUpPressed && currentSpeed >= topSpeedLatchThreshold) {
        cruiseLatchActive = true;
    }

    const shouldAutoCruise =
        cruiseControlEnabled &&
        !isPrecisionOverrideActive &&
        cruiseLatchActive &&
        !isDownPressed;

    return {
        cruiseLatchActive,
        throttle: (isUpPressed ? 1 : 0) + (shouldAutoCruise ? 1 : 0) + (isDownPressed ? -1 : 0),
    };
};
