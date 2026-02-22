import type { ClientInputFrame } from '@/shared/network/inputFrame';

type InputQueueOptions = {
    maxFramesPerPlayer: number;
};

const DEFAULT_OPTIONS: InputQueueOptions = {
    maxFramesPerPlayer: 120,
};

export class InputQueue {
    private readonly queueByPlayer = new Map<string, ClientInputFrame[]>();
    private readonly options: InputQueueOptions;

    constructor(options: Partial<InputQueueOptions> = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };
    }

    public enqueue = (playerId: string, frame: ClientInputFrame) => {
        const queue = this.queueByPlayer.get(playerId) ?? [];
        const existingIndex = queue.findIndex((queuedFrame) => queuedFrame.seq === frame.seq);
        if (existingIndex >= 0) {
            queue[existingIndex] = frame;
        } else {
            queue.push(frame);
        }
        queue.sort((a, b) => a.seq - b.seq);

        while (queue.length > this.options.maxFramesPerPlayer) {
            queue.shift();
        }

        this.queueByPlayer.set(playerId, queue);
    };

    public consumeLatestAfter = (playerId: string, lastProcessedSeq: number): ClientInputFrame | null => {
        const queue = this.queueByPlayer.get(playerId);
        if (!queue || queue.length === 0) return null;

        while (queue.length > 0 && queue[0].seq <= lastProcessedSeq) {
            queue.shift();
        }

        if (queue.length === 0) {
            return null;
        }

        const latest = queue[queue.length - 1];
        queue.length = 0;
        return latest;
    };

    public clearPlayer = (playerId: string) => {
        this.queueByPlayer.delete(playerId);
    };

    public getDepth = (playerId: string) => {
        return this.queueByPlayer.get(playerId)?.length ?? 0;
    };
}
