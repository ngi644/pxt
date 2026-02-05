/**
 * xAPI Logger Integration Example
 *
 * This file demonstrates how to integrate the xAPI logger with MakeCode editor.
 * Copy the relevant parts to your editor initialization code.
 */

import {
    initialize,
    shutdown,
    registerBlocklyWorkspace,
    unregisterBlocklyWorkspace,
    registerMonacoEditor,
    unregisterMonacoEditor,
    changeEditorMode,
    changeProject,
    logSimulatorStart,
    logSimulatorComplete,
    logSimulatorStop,
    logDeviceDownloadStart,
    logDeviceDownloadComplete,
    logDeviceDownloadError,
    logSave,
} from "./index";

/**
 * Example: Initialize xAPI logger on editor startup
 */
export async function initializeXAPILogger(
    projectId?: string,
    editorMode: "blocks" | "typescript" | "python" = "blocks"
): Promise<void> {
    await initialize(
        {
            // Server endpoint
            telemetryEndpoint: "/api/xapi/statements",
            // Authentication token (should match server's TOKEN env var)
            telemetryToken: "please_change_me",
            // Enable sending to server (set to false for local debugging)
            enableSending: true,
            // Batch settings
            batchSize: 10,
            batchTimeout: 5000,
            // Offline support
            enableOfflineBuffer: true,
            maxOfflineStatements: 1000,
        },
        editorMode,
        projectId
    );
}

/**
 * Example: Register Blockly workspace for automatic event logging
 */
export function setupBlocklyLogging(workspace: unknown): void {
    registerBlocklyWorkspace(workspace);
}

/**
 * Example: Register Monaco editor for text mode logging
 */
export function setupMonacoLogging(editor: unknown): void {
    registerMonacoEditor(editor);
}

/**
 * Example: Handle editor mode switch
 */
export function onEditorModeChange(
    newMode: "blocks" | "typescript" | "python",
    workspace?: unknown,
    editor?: unknown
): void {
    changeEditorMode(newMode);

    // Re-register appropriate listener
    if (newMode === "blocks" && workspace) {
        registerBlocklyWorkspace(workspace);
    } else if (editor) {
        registerMonacoEditor(editor);
    }
}

/**
 * Example: Handle project change
 */
export function onProjectChange(projectId: string): void {
    changeProject(projectId);
}

/**
 * Example: Log simulator events
 */
export async function onSimulatorRun(workspace: unknown): Promise<void> {
    await logSimulatorStart(workspace);
}

export async function onSimulatorStop(success: boolean, error?: string): Promise<void> {
    if (success) {
        await logSimulatorComplete(true);
    } else if (error) {
        await logSimulatorComplete(false, error);
    } else {
        await logSimulatorStop();
    }
}

/**
 * Example: Log download events
 */
export async function onDownloadStart(
    deviceType: string,
    workspace: unknown
): Promise<void> {
    await logDeviceDownloadStart(deviceType, "micro:bit", workspace);
}

export async function onDownloadComplete(deviceType: string): Promise<void> {
    await logDeviceDownloadComplete(deviceType, "micro:bit");
}

export async function onDownloadError(
    deviceType: string,
    error: string
): Promise<void> {
    await logDeviceDownloadError(deviceType, error, "micro:bit");
}

/**
 * Example: Log save event
 */
export async function onProjectSave(workspace: unknown): Promise<void> {
    await logSave(workspace);
}

/**
 * Example: Cleanup on editor close
 */
export async function cleanupXAPILogger(): Promise<void> {
    await shutdown();
}

/**
 * Full integration example for MakeCode editor
 */
export async function fullIntegrationExample(): Promise<void> {
    // 1. Initialize on app startup
    await initializeXAPILogger("my-project", "blocks");

    // 2. Get Blockly workspace reference (example)
    // const workspace = Blockly.getMainWorkspace();
    // setupBlocklyLogging(workspace);

    // 3. Set up event handlers
    // - On simulator run: onSimulatorRun(workspace)
    // - On simulator stop: onSimulatorStop(true)
    // - On download: onDownloadStart("microbit-v2", workspace)
    // - On save: onProjectSave(workspace)
    // - On mode switch: onEditorModeChange("typescript", null, monacoEditor)

    // 4. Cleanup on window unload
    // window.addEventListener("beforeunload", cleanupXAPILogger);
}
