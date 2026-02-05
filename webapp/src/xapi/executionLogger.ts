/**
 * Execution event capture for xAPI operation logging.
 * Captures simulator run and program execution events.
 */

import { Verbs } from "./verbs";
import { createProjectActivity } from "./activities";
import { createStatement } from "./statement";
import { captureCodeSnapshot } from "./snapshot";
import { formatDuration } from "./utils";
import { EditorMode, Result, CodeSnapshot } from "./types";

/**
 * Execution mode types.
 */
export type ExecutionMode = "simulator" | "device";

/**
 * Execution result status.
 */
export type ExecutionStatus = "started" | "completed" | "error" | "stopped";

/**
 * Execution event details.
 */
export interface ExecutionEvent {
    /** Execution mode */
    mode: ExecutionMode;
    /** Execution status */
    status: ExecutionStatus;
    /** Duration in milliseconds (for completed/error/stopped) */
    durationMs?: number;
    /** Error message (for error status) */
    errorMessage?: string;
}

/**
 * Configuration for execution logging.
 */
export interface ExecutionLoggerConfig {
    /** Whether to include snapshots with execution events */
    includeSnapshots: boolean;
    /** Current project ID */
    projectId: string;
    /** Current editor mode */
    editorMode: EditorMode;
}

/**
 * Default configuration.
 */
const defaultConfig: ExecutionLoggerConfig = {
    includeSnapshots: true,
    projectId: "default",
    editorMode: "blocks",
};

/**
 * Current configuration.
 */
let currentConfig: ExecutionLoggerConfig = { ...defaultConfig };

/**
 * Tracks ongoing executions for duration calculation.
 */
const executionStarts: Map<string, number> = new Map();

/**
 * Gets a unique key for an execution.
 * @param mode - Execution mode
 * @returns Unique key
 */
function getExecutionKey(mode: ExecutionMode): string {
    return `execution_${mode}`;
}

/**
 * Logs an execution start event.
 * @param mode - The execution mode
 * @param codeSource - The code source (workspace for blocks, string for text)
 */
export async function logExecutionStart(
    mode: ExecutionMode,
    codeSource?: unknown
): Promise<void> {
    const key = getExecutionKey(mode);
    executionStarts.set(key, Date.now());

    // Capture snapshot if configured
    let snapshot: CodeSnapshot | null = null;
    if (currentConfig.includeSnapshots && codeSource) {
        snapshot = await captureCodeSnapshot(currentConfig.editorMode, codeSource);
    }

    const activity = createProjectActivity(
        currentConfig.projectId,
        undefined,
        {
            executionMode: mode,
            status: "started",
        }
    );

    await createStatement({
        verb: Verbs.EXECUTED,
        object: activity,
        snapshot: snapshot || undefined,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs an execution completion event.
 * @param mode - The execution mode
 * @param success - Whether execution succeeded
 * @param errorMessage - Error message if failed
 */
export async function logExecutionComplete(
    mode: ExecutionMode,
    success: boolean = true,
    errorMessage?: string
): Promise<void> {
    const key = getExecutionKey(mode);
    const startTime = executionStarts.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    executionStarts.delete(key);

    const result: Result = {
        success,
    };

    if (durationMs !== undefined) {
        result.duration = formatDuration(durationMs);
    }

    if (errorMessage) {
        result.extensions = { errorMessage };
    }

    const activity = createProjectActivity(
        currentConfig.projectId,
        undefined,
        {
            executionMode: mode,
            status: success ? "completed" : "error",
        }
    );

    await createStatement({
        verb: Verbs.EXECUTED,
        object: activity,
        result,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs an execution stop event (user stopped execution).
 * @param mode - The execution mode
 */
export async function logExecutionStop(mode: ExecutionMode): Promise<void> {
    const key = getExecutionKey(mode);
    const startTime = executionStarts.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    executionStarts.delete(key);

    const result: Result = {
        success: false,
    };

    if (durationMs !== undefined) {
        result.duration = formatDuration(durationMs);
    }

    result.extensions = { stoppedByUser: true };

    const activity = createProjectActivity(
        currentConfig.projectId,
        undefined,
        {
            executionMode: mode,
            status: "stopped",
        }
    );

    await createStatement({
        verb: Verbs.EXECUTED,
        object: activity,
        result,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs a complete execution event (start and complete in one call).
 * @param event - The execution event details
 * @param codeSource - The code source (optional)
 */
export async function logExecution(
    event: ExecutionEvent,
    codeSource?: unknown
): Promise<void> {
    // Capture snapshot if configured
    let snapshot: CodeSnapshot | null = null;
    if (currentConfig.includeSnapshots && codeSource) {
        snapshot = await captureCodeSnapshot(currentConfig.editorMode, codeSource);
    }

    const result: Result = {};

    if (event.status === "completed") {
        result.success = true;
    } else if (event.status === "error") {
        result.success = false;
        if (event.errorMessage) {
            result.extensions = { errorMessage: event.errorMessage };
        }
    } else if (event.status === "stopped") {
        result.success = false;
        result.extensions = { stoppedByUser: true };
    }

    if (event.durationMs !== undefined) {
        result.duration = formatDuration(event.durationMs);
    }

    const activity = createProjectActivity(
        currentConfig.projectId,
        undefined,
        {
            executionMode: event.mode,
            status: event.status,
        }
    );

    await createStatement({
        verb: Verbs.EXECUTED,
        object: activity,
        result: Object.keys(result).length > 0 ? result : undefined,
        snapshot: snapshot || undefined,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Updates the logger configuration.
 * @param config - Configuration options to update
 */
export function updateConfig(config: Partial<ExecutionLoggerConfig>): void {
    currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current configuration.
 * @returns Current configuration
 */
export function getConfig(): ExecutionLoggerConfig {
    return { ...currentConfig };
}

/**
 * Resets configuration to defaults.
 */
export function resetConfig(): void {
    currentConfig = { ...defaultConfig };
    executionStarts.clear();
}
