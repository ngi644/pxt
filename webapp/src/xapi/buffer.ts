/**
 * Offline buffer for xAPI Statements using localStorage.
 * Stores statements when network is unavailable for later retry.
 */

import { Statement } from "./types";

/**
 * Storage key for offline buffer.
 */
const STORAGE_KEY = "xapi_offline_buffer";

/**
 * Buffer configuration.
 */
export interface BufferConfig {
    /** Maximum statements to store offline */
    maxStatements: number;
    /** Storage key prefix */
    storageKey: string;
}

/**
 * Default buffer configuration.
 */
const DEFAULT_CONFIG: BufferConfig = {
    maxStatements: 1000,
    storageKey: STORAGE_KEY,
};

/**
 * Current configuration.
 */
let config: BufferConfig = { ...DEFAULT_CONFIG };

/**
 * Configures the buffer.
 * @param newConfig - Configuration options
 */
export function configure(newConfig: Partial<BufferConfig>): void {
    config = { ...config, ...newConfig };
}

/**
 * Checks if localStorage is available.
 * @returns True if localStorage can be used
 */
function isStorageAvailable(): boolean {
    try {
        const testKey = "__xapi_test__";
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

/**
 * Loads statements from the buffer.
 * @returns Array of buffered statements
 */
export function loadBuffer(): Statement[] {
    if (!isStorageAvailable()) {
        return [];
    }

    try {
        const data = localStorage.getItem(config.storageKey);
        if (!data) {
            return [];
        }

        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed;
    } catch {
        return [];
    }
}

/**
 * Saves statements to the buffer.
 * @param statements - Statements to save
 */
export function saveBuffer(statements: Statement[]): void {
    if (!isStorageAvailable()) {
        return;
    }

    try {
        // Limit to max statements (keep newest)
        const toSave = statements.slice(-config.maxStatements);
        localStorage.setItem(config.storageKey, JSON.stringify(toSave));
    } catch {
        // Storage full or unavailable - try to clear some space
        try {
            localStorage.removeItem(config.storageKey);
            const toSave = statements.slice(-Math.floor(config.maxStatements / 2));
            localStorage.setItem(config.storageKey, JSON.stringify(toSave));
        } catch {
            // Give up if still failing
        }
    }
}

/**
 * Adds statements to the buffer.
 * @param statements - Statements to add
 */
export function addToBuffer(statements: Statement[]): void {
    const existing = loadBuffer();
    const combined = [...existing, ...statements];

    // Limit to max statements (keep newest)
    const limited = combined.slice(-config.maxStatements);
    saveBuffer(limited);
}

/**
 * Removes statements from the buffer.
 * @param ids - Statement IDs to remove
 */
export function removeFromBuffer(ids: string[]): void {
    const existing = loadBuffer();
    const idSet = new Set(ids);
    const filtered = existing.filter((s) => !idSet.has(s.id));
    saveBuffer(filtered);
}

/**
 * Clears all statements from the buffer.
 * @returns Array of cleared statements
 */
export function clearBuffer(): Statement[] {
    const existing = loadBuffer();

    if (isStorageAvailable()) {
        try {
            localStorage.removeItem(config.storageKey);
        } catch {
            // Ignore removal errors
        }
    }

    return existing;
}

/**
 * Gets the number of buffered statements.
 * @returns Buffer size
 */
export function bufferSize(): number {
    return loadBuffer().length;
}

/**
 * Checks if the buffer is empty.
 * @returns True if empty
 */
export function isBufferEmpty(): boolean {
    return bufferSize() === 0;
}

/**
 * Gets buffer statistics.
 * @returns Buffer stats
 */
export function getBufferStats(): {
    count: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
} {
    const statements = loadBuffer();

    if (statements.length === 0) {
        return {
            count: 0,
            oldestTimestamp: null,
            newestTimestamp: null,
        };
    }

    // Sort by timestamp
    const sorted = [...statements].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
        count: statements.length,
        oldestTimestamp: sorted[0].timestamp,
        newestTimestamp: sorted[sorted.length - 1].timestamp,
    };
}

/**
 * Takes statements from the buffer (removes and returns them).
 * @param count - Maximum number to take
 * @returns Array of statements taken
 */
export function takeFromBuffer(count: number): Statement[] {
    const existing = loadBuffer();

    if (existing.length === 0) {
        return [];
    }

    const taken = existing.slice(0, count);
    const remaining = existing.slice(count);

    saveBuffer(remaining);
    return taken;
}
