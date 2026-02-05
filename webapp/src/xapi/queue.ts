/**
 * Batch queue for xAPI Statements.
 * Queues statements and triggers batch sends based on size or timeout.
 */

import { Statement, StatementBatch } from "./types";

/**
 * Queue configuration.
 */
export interface QueueConfig {
    /** Maximum statements per batch */
    maxBatchSize: number;
    /** Maximum time to wait before sending (ms) */
    maxWaitTime: number;
    /** Maximum queue size before dropping oldest statements */
    maxQueueSize: number;
}

/**
 * Default queue configuration.
 */
const DEFAULT_CONFIG: QueueConfig = {
    maxBatchSize: 10,
    maxWaitTime: 5000,
    maxQueueSize: 1000,
};

/**
 * Batch ready callback type.
 */
type BatchReadyCallback = (batch: StatementBatch) => void | Promise<void>;

/**
 * Statement queue for batching.
 */
export class StatementQueue {
    private queue: Statement[] = [];
    private config: QueueConfig;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private batchReadyCallback: BatchReadyCallback | null = null;
    private paused: boolean = false;

    constructor(config?: Partial<QueueConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Sets the callback for when a batch is ready.
     * @param callback - Function to call with the batch
     */
    onBatchReady(callback: BatchReadyCallback): void {
        this.batchReadyCallback = callback;
    }

    /**
     * Adds a statement to the queue.
     * @param statement - The statement to queue
     */
    enqueue(statement: Statement): void {
        // Drop oldest if queue is full
        if (this.queue.length >= this.config.maxQueueSize) {
            this.queue.shift();
        }

        this.queue.push(statement);

        // Check if batch is ready
        if (this.queue.length >= this.config.maxBatchSize) {
            this.flush();
        } else if (!this.timer && !this.paused) {
            this.startTimer();
        }
    }

    /**
     * Adds multiple statements to the queue.
     * @param statements - Array of statements to queue
     */
    enqueueAll(statements: Statement[]): void {
        for (const statement of statements) {
            this.enqueue(statement);
        }
    }

    /**
     * Flushes the queue, sending all queued statements.
     */
    async flush(): Promise<void> {
        this.stopTimer();

        if (this.queue.length === 0) {
            return;
        }

        // Take up to maxBatchSize statements
        const batch = this.queue.splice(0, this.config.maxBatchSize);

        if (this.batchReadyCallback) {
            try {
                await this.batchReadyCallback({ statements: batch });
            } catch {
                // Re-queue failed statements at the front
                this.queue.unshift(...batch);
            }
        }

        // If more statements remain, continue processing
        if (this.queue.length > 0 && !this.paused) {
            if (this.queue.length >= this.config.maxBatchSize) {
                // Immediate flush for full batch
                this.flush();
            } else {
                this.startTimer();
            }
        }
    }

    /**
     * Pauses queue processing.
     * Statements can still be added but won't be sent.
     */
    pause(): void {
        this.paused = true;
        this.stopTimer();
    }

    /**
     * Resumes queue processing.
     */
    resume(): void {
        this.paused = false;
        if (this.queue.length > 0) {
            if (this.queue.length >= this.config.maxBatchSize) {
                this.flush();
            } else {
                this.startTimer();
            }
        }
    }

    /**
     * Gets the current queue size.
     * @returns Number of statements in queue
     */
    size(): number {
        return this.queue.length;
    }

    /**
     * Checks if the queue is empty.
     * @returns True if queue is empty
     */
    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Checks if the queue is paused.
     * @returns True if paused
     */
    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Clears all statements from the queue.
     * @returns Array of cleared statements
     */
    clear(): Statement[] {
        this.stopTimer();
        const cleared = [...this.queue];
        this.queue = [];
        return cleared;
    }

    /**
     * Gets all queued statements without removing them.
     * @returns Array of queued statements
     */
    peek(): Statement[] {
        return [...this.queue];
    }

    /**
     * Updates queue configuration.
     * @param config - New configuration options
     */
    configure(config: Partial<QueueConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Gets current configuration.
     * @returns Current configuration
     */
    getConfig(): QueueConfig {
        return { ...this.config };
    }

    private startTimer(): void {
        if (this.timer) return;

        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, this.config.maxWaitTime);
    }

    private stopTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

/**
 * Creates a new statement queue.
 * @param config - Optional queue configuration
 * @returns New StatementQueue instance
 */
export function createQueue(config?: Partial<QueueConfig>): StatementQueue {
    return new StatementQueue(config);
}
