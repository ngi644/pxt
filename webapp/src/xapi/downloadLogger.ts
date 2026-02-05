/**
 * Download event capture for xAPI operation logging.
 * Captures program download to device events.
 */

import { Verbs } from "./verbs";
import { createDeviceActivity, createProjectActivity } from "./activities";
import { createStatement } from "./statement";
import { captureCodeSnapshot } from "./snapshot";
import { formatDuration } from "./utils";
import { EditorMode, Result, CodeSnapshot } from "./types";

/**
 * Download status types.
 */
export type DownloadStatus = "started" | "completed" | "error" | "cancelled";

/**
 * Download event details.
 */
export interface DownloadEvent {
    /** Target device type */
    deviceType: string;
    /** Human-readable device name */
    deviceName?: string;
    /** Download status */
    status: DownloadStatus;
    /** Duration in milliseconds (for completed/error) */
    durationMs?: number;
    /** Error message (for error status) */
    errorMessage?: string;
    /** File size in bytes */
    fileSize?: number;
}

/**
 * Configuration for download logging.
 */
export interface DownloadLoggerConfig {
    /** Whether to include snapshots with download events */
    includeSnapshots: boolean;
    /** Current project ID */
    projectId: string;
    /** Current editor mode */
    editorMode: EditorMode;
}

/**
 * Default configuration.
 */
const defaultConfig: DownloadLoggerConfig = {
    includeSnapshots: true,
    projectId: "default",
    editorMode: "blocks",
};

/**
 * Current configuration.
 */
let currentConfig: DownloadLoggerConfig = { ...defaultConfig };

/**
 * Tracks ongoing downloads for duration calculation.
 */
const downloadStarts: Map<string, number> = new Map();

/**
 * Gets a unique key for a download.
 * @param deviceType - Device type
 * @returns Unique key
 */
function getDownloadKey(deviceType: string): string {
    return `download_${deviceType}`;
}

/**
 * Logs a download start event.
 * @param deviceType - The target device type
 * @param deviceName - Human-readable device name (optional)
 * @param codeSource - The code source (optional)
 */
export async function logDownloadStart(
    deviceType: string,
    deviceName?: string,
    codeSource?: unknown
): Promise<void> {
    const key = getDownloadKey(deviceType);
    downloadStarts.set(key, Date.now());

    // Capture snapshot if configured
    let snapshot: CodeSnapshot | null = null;
    if (currentConfig.includeSnapshots && codeSource) {
        snapshot = await captureCodeSnapshot(currentConfig.editorMode, codeSource);
    }

    const activity = createDeviceActivity(deviceType, deviceName, {
        status: "started",
        projectId: currentConfig.projectId,
    });

    await createStatement({
        verb: Verbs.DOWNLOADED,
        object: activity,
        snapshot: snapshot || undefined,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs a download completion event.
 * @param deviceType - The target device type
 * @param deviceName - Human-readable device name (optional)
 * @param fileSize - Size of downloaded file in bytes (optional)
 */
export async function logDownloadComplete(
    deviceType: string,
    deviceName?: string,
    fileSize?: number
): Promise<void> {
    const key = getDownloadKey(deviceType);
    const startTime = downloadStarts.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    downloadStarts.delete(key);

    const result: Result = {
        success: true,
    };

    if (durationMs !== undefined) {
        result.duration = formatDuration(durationMs);
    }

    if (fileSize !== undefined) {
        result.extensions = { fileSize };
    }

    const activity = createDeviceActivity(deviceType, deviceName, {
        status: "completed",
        projectId: currentConfig.projectId,
    });

    await createStatement({
        verb: Verbs.DOWNLOADED,
        object: activity,
        result,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs a download error event.
 * @param deviceType - The target device type
 * @param errorMessage - Error description
 * @param deviceName - Human-readable device name (optional)
 */
export async function logDownloadError(
    deviceType: string,
    errorMessage: string,
    deviceName?: string
): Promise<void> {
    const key = getDownloadKey(deviceType);
    const startTime = downloadStarts.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    downloadStarts.delete(key);

    const result: Result = {
        success: false,
        extensions: { errorMessage },
    };

    if (durationMs !== undefined) {
        result.duration = formatDuration(durationMs);
    }

    const activity = createDeviceActivity(deviceType, deviceName, {
        status: "error",
        projectId: currentConfig.projectId,
    });

    await createStatement({
        verb: Verbs.DOWNLOADED,
        object: activity,
        result,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs a download cancelled event.
 * @param deviceType - The target device type
 * @param deviceName - Human-readable device name (optional)
 */
export async function logDownloadCancelled(
    deviceType: string,
    deviceName?: string
): Promise<void> {
    const key = getDownloadKey(deviceType);
    const startTime = downloadStarts.get(key);
    const durationMs = startTime ? Date.now() - startTime : undefined;
    downloadStarts.delete(key);

    const result: Result = {
        success: false,
        extensions: { cancelledByUser: true },
    };

    if (durationMs !== undefined) {
        result.duration = formatDuration(durationMs);
    }

    const activity = createDeviceActivity(deviceType, deviceName, {
        status: "cancelled",
        projectId: currentConfig.projectId,
    });

    await createStatement({
        verb: Verbs.DOWNLOADED,
        object: activity,
        result,
        editorMode: currentConfig.editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Logs a complete download event.
 * @param event - The download event details
 * @param codeSource - The code source (optional)
 */
export async function logDownload(
    event: DownloadEvent,
    codeSource?: unknown
): Promise<void> {
    // Capture snapshot if configured and starting
    let snapshot: CodeSnapshot | null = null;
    if (
        currentConfig.includeSnapshots &&
        codeSource &&
        event.status === "started"
    ) {
        snapshot = await captureCodeSnapshot(currentConfig.editorMode, codeSource);
    }

    const result: Result = {};

    if (event.status === "completed") {
        result.success = true;
        if (event.fileSize !== undefined) {
            result.extensions = { ...result.extensions, fileSize: event.fileSize };
        }
    } else if (event.status === "error") {
        result.success = false;
        if (event.errorMessage) {
            result.extensions = { ...result.extensions, errorMessage: event.errorMessage };
        }
    } else if (event.status === "cancelled") {
        result.success = false;
        result.extensions = { ...result.extensions, cancelledByUser: true };
    }

    if (event.durationMs !== undefined) {
        result.duration = formatDuration(event.durationMs);
    }

    const activity = createDeviceActivity(event.deviceType, event.deviceName, {
        status: event.status,
        projectId: currentConfig.projectId,
    });

    await createStatement({
        verb: Verbs.DOWNLOADED,
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
export function updateConfig(config: Partial<DownloadLoggerConfig>): void {
    currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current configuration.
 * @returns Current configuration
 */
export function getConfig(): DownloadLoggerConfig {
    return { ...currentConfig };
}

/**
 * Resets configuration to defaults.
 */
export function resetConfig(): void {
    currentConfig = { ...defaultConfig };
    downloadStarts.clear();
}
