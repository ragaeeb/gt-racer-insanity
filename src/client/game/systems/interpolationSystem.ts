export type InterpolationSample<TState> = {
    sequence: number;
    state: TState;
    timeMs: number;
};

export type InterpolationBuffer<TState> = {
    maxSamples: number;
    samples: InterpolationSample<TState>[];
};

export const createInterpolationBuffer = <TState>(maxSamples = 32): InterpolationBuffer<TState> => {
    return {
        maxSamples,
        samples: [],
    };
};

export const pushInterpolationSample = <TState>(
    buffer: InterpolationBuffer<TState>,
    sample: InterpolationSample<TState>
) => {
    buffer.samples.push(sample);
    buffer.samples.sort((a, b) => a.timeMs - b.timeMs);
    while (buffer.samples.length > buffer.maxSamples) {
        buffer.samples.shift();
    }
};

export const sampleInterpolationBuffer = <TState>(
    buffer: InterpolationBuffer<TState>,
    targetTimeMs: number,
    lerp: (from: TState, to: TState, alpha: number) => TState
): TState | null => {
    if (buffer.samples.length === 0) {
        return null;
    }

    if (buffer.samples.length === 1) {
        return buffer.samples[0].state;
    }

    let previous = buffer.samples[0];
    let next = buffer.samples[buffer.samples.length - 1];

    for (const sample of buffer.samples) {
        if (sample.timeMs <= targetTimeMs) {
            previous = sample;
            continue;
        }
        next = sample;
        break;
    }

    if (next.timeMs <= previous.timeMs) {
        return next.state;
    }

    const alpha = Math.max(0, Math.min(1, (targetTimeMs - previous.timeMs) / (next.timeMs - previous.timeMs)));
    return lerp(previous.state, next.state, alpha);
};
