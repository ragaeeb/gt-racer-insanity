import { useEffect, useRef } from 'react';

type LongTaskObserverResult = {
    longTaskCountRef: React.RefObject<number>;
    longTaskMaxMsRef: React.RefObject<number>;
    reset: () => void;
};

/**
 * Sets up a PerformanceObserver for the `longtask` entry type and tracks
 * cumulative count and worst-case duration. Falls back silently in environments
 * where the API is unavailable.
 */
export const useLongTaskObserver = (verboseRef: React.RefObject<boolean>): LongTaskObserverResult => {
    const longTaskCountRef = useRef(0);
    const longTaskMaxMsRef = useRef(0);

    const reset = () => {
        longTaskCountRef.current = 0;
        longTaskMaxMsRef.current = 0;
    };

    useEffect(() => {
        let observer: PerformanceObserver | null = null;
        try {
            if (typeof PerformanceObserver !== 'undefined') {
                const supported = PerformanceObserver.supportedEntryTypes ?? [];
                if (supported.includes('longtask')) {
                    observer = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            const durationMs = entry.duration;
                            longTaskCountRef.current += 1;
                            longTaskMaxMsRef.current = Math.max(longTaskMaxMsRef.current, durationMs);
                            if (verboseRef.current) {
                                console.warn('[diag][longtask]', {
                                    durationMs: Number(durationMs.toFixed(2)),
                                    startTimeMs: Number(entry.startTime.toFixed(2)),
                                });
                            }
                        }
                    });
                    observer.observe({ entryTypes: ['longtask'] });
                }
            }
        } catch {
            // Ignore unsupported performance observer environments.
        }

        return () => {
            observer?.disconnect();
        };
    }, [verboseRef]);

    return { longTaskCountRef, longTaskMaxMsRef, reset };
};
