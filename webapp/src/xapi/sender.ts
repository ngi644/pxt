/**
 * xAPI Statement sender with retry logic and offline support.
 */

import { Statement, StatementBatch, XAPILoggerConfig, DEFAULT_CONFIG } from "./types";
import { StatementQueue, createQueue } from "./queue";
import {
    addToBuffer,
    loadBuffer,
    clearBuffer,
    takeFromBuffer,
    bufferSize,
} from "./buffer";

/**
 * Sender configuration.
 */
export interface SenderConfig {
    /** Telemetry endpoint URL */
    endpoint: string;
    /** Authentication token */
    token: string;
    /** Maximum retry attempts */
    maxRetries: number;
    /** Initial retry delay in ms */
    retryDelay: number;
    /** Retry backoff multiplier */
    retryBackoff: number;
    /** Request timeout in ms */
    timeout: number;
    /** Enable offline buffering */
    enableOfflineBuffer: boolean;
}

/**
 * Default sender configuration.
 */
const DEFAULT_SENDER_CONFIG: SenderConfig = {
    endpoint: "/api/xapi/statements",
    token: "",
    maxRetries: 3,
    retryDelay: 1000,
    retryBackoff: 2,
    timeout: 30000,
    enableOfflineBuffer: true,
};

/**
 * Send result type.
 */
export interface SendResult {
    success: boolean;
    sent: number;
    failed: number;
    buffered: number;
    error?: string;
}

/**
 * Network status type.
 */
type NetworkStatus = "online" | "offline" | "unknown";

/**
 * Statement sender class.
 */
export class StatementSender {
    private config: SenderConfig;
    private queue: StatementQueue;
    private networkStatus: NetworkStatus = "unknown";
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private sending: boolean = false;

    constructor(config?: Partial<SenderConfig>) {
        this.config = { ...DEFAULT_SENDER_CONFIG, ...config };
        this.queue = createQueue({
            maxBatchSize: 10,
            maxWaitTime: 5000,
            maxQueueSize: 1000,
        });

        // Set up queue callback
        this.queue.onBatchReady(async (batch) => {
            await this.sendBatch(batch);
        });

        // Set up network listeners
        this.setupNetworkListeners();

        // Initial network check
        this.checkNetwork();

        // Try to send buffered statements on startup
        this.retryBuffered();
    }

    /**
     * Sends a single statement.
     * @param statement - The statement to send
     */
    send(statement: Statement): void {
        this.queue.enqueue(statement);
    }

    /**
     * Sends multiple statements.
     * @param statements - Array of statements to send
     */
    sendAll(statements: Statement[]): void {
        this.queue.enqueueAll(statements);
    }

    /**
     * Flushes the queue immediately.
     */
    async flush(): Promise<void> {
        await this.queue.flush();
    }

    /**
     * Sends a batch of statements.
     * @param batch - The statement batch
     * @returns Send result
     */
    private async sendBatch(batch: StatementBatch): Promise<SendResult> {
        if (this.networkStatus === "offline") {
            // Buffer for later
            if (this.config.enableOfflineBuffer) {
                addToBuffer(batch.statements);
            }
            return {
                success: false,
                sent: 0,
                failed: 0,
                buffered: batch.statements.length,
                error: "Network offline",
            };
        }

        let lastError: string | undefined;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const result = await this.doSend(batch);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);

                // Check if should retry
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelay * Math.pow(this.config.retryBackoff, attempt);
                    await this.sleep(delay);
                }
            }
        }

        // All retries failed - buffer if enabled
        if (this.config.enableOfflineBuffer) {
            addToBuffer(batch.statements);
        }

        return {
            success: false,
            sent: 0,
            failed: batch.statements.length,
            buffered: this.config.enableOfflineBuffer ? batch.statements.length : 0,
            error: lastError,
        };
    }

    /**
     * Performs the actual HTTP send.
     * @param batch - The statement batch
     * @returns Send result
     */
    private async doSend(batch: StatementBatch): Promise<SendResult> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(this.config.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Telemetry-Token": this.config.token,
                },
                body: JSON.stringify(batch),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.status === 204) {
                return {
                    success: true,
                    sent: batch.statements.length,
                    failed: 0,
                    buffered: 0,
                };
            }

            if (response.status === 207) {
                // Partial success
                const result = await response.json();
                return {
                    success: false,
                    sent: result.success || 0,
                    failed: result.failed || 0,
                    buffered: 0,
                    error: "Partial success",
                };
            }

            // Error response
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorBody = await response.json();
                errorMessage = errorBody.error || errorMessage;
            } catch {
                // Ignore JSON parse errors
            }

            throw new Error(errorMessage);
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === "AbortError") {
                throw new Error("Request timeout");
            }

            throw error;
        }
    }

    /**
     * Retries sending buffered statements.
     */
    async retryBuffered(): Promise<void> {
        if (this.sending || this.networkStatus === "offline") {
            return;
        }

        const bufferedCount = bufferSize();
        if (bufferedCount === 0) {
            return;
        }

        this.sending = true;

        try {
            // Take statements in batches
            while (bufferSize() > 0 && this.isOnline()) {
                const statements = takeFromBuffer(10);
                if (statements.length === 0) break;

                const result = await this.sendBatch({ statements });

                if (!result.success && result.buffered === 0) {
                    // Failed and not buffered - add back to buffer
                    addToBuffer(statements);
                    break;
                }

                // Small delay between batches
                await this.sleep(100);
            }
        } finally {
            this.sending = false;
        }
    }

    /**
     * Sets up network status listeners.
     */
    private setupNetworkListeners(): void {
        if (typeof window === "undefined") {
            return;
        }

        window.addEventListener("online", () => {
            this.networkStatus = "online";
            this.retryBuffered();
        });

        window.addEventListener("offline", () => {
            this.networkStatus = "offline";
            this.queue.pause();
        });

        // Also monitor for visibility changes
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.checkNetwork();
                this.retryBuffered();
            } else if (document.visibilityState === "hidden") {
                // Flush pending statements when tab becomes hidden
                // Browser throttles timers in background tabs, so flush now
                this.queue.flush();
            }
        });

        // Flush on page unload using keepalive fetch
        window.addEventListener("pagehide", () => {
            this.flushWithKeepalive();
        });
    }

    /**
     * Flushes the queue using fetch with keepalive option.
     * Used during page unload to ensure requests complete.
     */
    private flushWithKeepalive(): void {
        const statements = this.queue.clear();
        if (statements.length === 0) {
            return;
        }

        // Use fetch with keepalive to ensure request survives page unload
        try {
            fetch(this.config.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Telemetry-Token": this.config.token,
                },
                body: JSON.stringify({ statements }),
                keepalive: true,
            });
        } catch {
            // Best effort - nothing we can do if this fails during page unload
        }
    }

    /**
     * Checks current network status.
     */
    private checkNetwork(): void {
        if (typeof navigator !== "undefined" && "onLine" in navigator) {
            this.networkStatus = navigator.onLine ? "online" : "offline";

            if (this.networkStatus === "online") {
                this.queue.resume();
            } else {
                this.queue.pause();
            }
        } else {
            this.networkStatus = "unknown";
        }
    }

    /**
     * Checks if network is online.
     * @returns True if not offline
     */
    private isOnline(): boolean {
        return this.networkStatus !== "offline";
    }

    /**
     * Gets current network status.
     * @returns Network status
     */
    getNetworkStatus(): NetworkStatus {
        return this.networkStatus;
    }

    /**
     * Gets sender statistics.
     * @returns Sender stats
     */
    getStats(): {
        queueSize: number;
        bufferSize: number;
        networkStatus: NetworkStatus;
        isPaused: boolean;
    } {
        return {
            queueSize: this.queue.size(),
            bufferSize: bufferSize(),
            networkStatus: this.networkStatus,
            isPaused: this.queue.isPaused(),
        };
    }

    /**
     * Updates sender configuration.
     * @param config - New configuration options
     */
    configure(config: Partial<SenderConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Gets current configuration.
     * @returns Current configuration
     */
    getConfig(): SenderConfig {
        return { ...this.config };
    }

    /**
     * Shuts down the sender.
     * Flushes queue and attempts to send remaining statements.
     */
    async shutdown(): Promise<void> {
        // Flush queue
        await this.queue.flush();

        // Clear retry timer
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/**
 * Singleton sender instance.
 */
let senderInstance: StatementSender | null = null;

/**
 * Gets or creates the sender instance.
 * @param config - Optional configuration
 * @returns Sender instance
 */
export function getSender(config?: Partial<SenderConfig>): StatementSender {
    if (!senderInstance) {
        senderInstance = new StatementSender(config);
    } else if (config) {
        senderInstance.configure(config);
    }
    return senderInstance;
}

/**
 * Sends a statement using the singleton sender.
 * @param statement - The statement to send
 */
export function sendStatement(statement: Statement): void {
    getSender().send(statement);
}

/**
 * Sends multiple statements using the singleton sender.
 * @param statements - Array of statements to send
 */
export function sendStatements(statements: Statement[]): void {
    getSender().sendAll(statements);
}

/**
 * Flushes the sender queue.
 */
export async function flushSender(): Promise<void> {
    await getSender().flush();
}

/**
 * Shuts down the sender.
 */
export async function shutdownSender(): Promise<void> {
    if (senderInstance) {
        await senderInstance.shutdown();
        senderInstance = null;
    }
}
