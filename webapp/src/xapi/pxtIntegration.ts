/**
 * PXT Editor Integration for xAPI Logger
 *
 * This module integrates the xAPI logger with the PXT MakeCode editor.
 * It should be imported and initialized in app.tsx.
 */

import {
    initialize,
    shutdown,
    changeEditorMode,
    changeProject,
    registerBlocklyWorkspace,
    unregisterBlocklyWorkspace,
    registerMonacoEditor,
    unregisterMonacoEditor,
    logSimulatorStart,
    logSimulatorComplete,
    logSimulatorStop,
    logDeviceDownloadStart,
    logDeviceDownloadComplete,
    logDeviceDownloadError,
    logSave,
    isInitialized,
    ExtendedLoggerConfig,
} from "./index";
import { flushSender } from "./sender";

import type { EditorMode } from "./types";
import { DEFAULT_ENDPOINT, DEFAULT_TOKEN } from "./config";

/**
 * Configuration for PXT xAPI integration.
 */
export interface PxtXapiConfig {
    /** Telemetry server endpoint */
    endpoint?: string;
    /** Authentication token */
    token?: string;
    /** Enable sending (default: true) */
    enableSending?: boolean;
    /** Enable offline buffer (default: true) */
    enableOfflineBuffer?: boolean;
}

/**
 * Gets a value from URL query parameters.
 */
function getUrlParam(name: string): string | null {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    } catch {
        return null;
    }
}

/**
 * Default configuration from URL params, localStorage, or environment.
 * Priority: URL params > localStorage > window globals > config.ts defaults
 *
 * Usage:
 *   http://localhost:3232/?xapi_endpoint=http://myserver:3000/api/xapi/statements&xapi_token=secret
 */
function getDefaultConfig(): PxtXapiConfig {
    const win = window as any;
    return {
        endpoint:
            getUrlParam("xapi_endpoint") ||
            localStorage.getItem("xapi_endpoint") ||
            win.__XAPI_ENDPOINT__ ||
            DEFAULT_ENDPOINT,
        token:
            getUrlParam("xapi_token") ||
            localStorage.getItem("xapi_token") ||
            win.__XAPI_TOKEN__ ||
            DEFAULT_TOKEN,
        enableSending:
            getUrlParam("xapi_enabled") !== "false" &&
            localStorage.getItem("xapi_enabled") !== "false",
        enableOfflineBuffer: true,
    };
}

/**
 * State tracking for PXT integration.
 */
let currentWorkspace: unknown = null;
let currentMonacoEditor: unknown = null;
let currentProjectId: string | undefined = undefined;
let currentEditorMode: EditorMode = "blocks";
let lastSimulatorRunWasManual: boolean = false; // Track if current simulator run was manual

/**
 * Initializes xAPI logging for PXT editor.
 * Call this during app initialization.
 *
 * @param projectId - Optional initial project ID
 * @param editorMode - Initial editor mode (default: "blocks")
 * @param config - Optional configuration override
 */
export async function initXapi(
    projectId?: string,
    editorMode: EditorMode = "blocks",
    config?: PxtXapiConfig
): Promise<void> {
    if (isInitialized()) {
        return;
    }

    const cfg = { ...getDefaultConfig(), ...config };
    currentProjectId = projectId;
    currentEditorMode = editorMode;

    const loggerConfig: Partial<ExtendedLoggerConfig> = {
        telemetryEndpoint: cfg.endpoint,
        telemetryToken: cfg.token,
        enableSending: cfg.enableSending,
        enableOfflineBuffer: cfg.enableOfflineBuffer,
    };

    await initialize(loggerConfig, editorMode, projectId);

    console.log("[xAPI] Initialized, checking pending registrations...");

    // Register pending workspace/editor if they were set before initialization
    if (currentWorkspace) {
        console.log("[xAPI] Registering pending Blockly workspace");
        registerBlocklyWorkspace(currentWorkspace);
    }
    if (currentMonacoEditor) {
        console.log("[xAPI] Registering pending Monaco editor");
        registerMonacoEditor(currentMonacoEditor);
    }

    // Set up pagehide handler (modern replacement for deprecated beforeunload/unload)
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("visibilitychange", handleVisibilityChange);
}

/**
 * Shuts down xAPI logging.
 * Call this when the editor is closing.
 */
export async function shutdownXapi(): Promise<void> {
    if (!isInitialized()) {
        return;
    }

    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("visibilitychange", handleVisibilityChange);
    await shutdown();

    currentWorkspace = null;
    currentMonacoEditor = null;
}

/**
 * Handles pagehide event (page navigation/close).
 */
function handlePageHide(): void {
    // Synchronous shutdown attempt
    shutdown().catch(() => {});
}

/**
 * Handles visibility change (tab switching, minimizing).
 * Flush pending data when page becomes hidden.
 */
function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
        // Page is hidden, flush any pending data (but don't shutdown)
        flushSender().catch(() => {});
    }
}

/**
 * Sets the current Blockly workspace for logging.
 * Call this when the blocks editor becomes active.
 *
 * @param workspace - Blockly workspace instance
 */
export function setBlocklyWorkspace(workspace: unknown): void {
    console.log("[xAPI] setBlocklyWorkspace called, isInitialized:", isInitialized());

    if (currentWorkspace === workspace) {
        console.log("[xAPI] Same workspace, skipping");
        return;
    }

    // Unregister previous workspace
    if (currentWorkspace) {
        unregisterBlocklyWorkspace(currentWorkspace);
    }

    currentWorkspace = workspace;

    if (workspace && isInitialized()) {
        console.log("[xAPI] Registering workspace immediately");
        registerBlocklyWorkspace(workspace);
    } else if (workspace) {
        console.log("[xAPI] Workspace stored, will register after init");
    }
}

/**
 * Clears the current Blockly workspace.
 */
export function clearBlocklyWorkspace(): void {
    if (currentWorkspace) {
        unregisterBlocklyWorkspace(currentWorkspace);
        currentWorkspace = null;
    }
}

/**
 * Sets the current Monaco editor for logging.
 * Call this when the text editor becomes active.
 *
 * @param editor - Monaco editor instance
 */
export function setMonacoEditor(editor: unknown): void {
    if (currentMonacoEditor === editor) {
        return;
    }

    // Unregister previous editor
    if (currentMonacoEditor) {
        unregisterMonacoEditor(currentMonacoEditor);
    }

    currentMonacoEditor = editor;

    if (editor && isInitialized()) {
        registerMonacoEditor(editor);
    }
}

/**
 * Clears the current Monaco editor.
 */
export function clearMonacoEditor(): void {
    if (currentMonacoEditor) {
        unregisterMonacoEditor(currentMonacoEditor);
        currentMonacoEditor = null;
    }
}

/**
 * Notifies xAPI of editor mode change.
 *
 * @param mode - New editor mode
 */
export function onEditorModeChange(mode: EditorMode): void {
    if (currentEditorMode === mode) {
        return;
    }

    currentEditorMode = mode;

    if (isInitialized()) {
        changeEditorMode(mode);
    }
}

/**
 * Notifies xAPI of project change.
 *
 * @param projectId - New project ID
 */
export function onProjectChange(projectId: string | undefined): void {
    if (currentProjectId === projectId) {
        return;
    }

    currentProjectId = projectId;

    if (isInitialized()) {
        changeProject(projectId);
    }
}

/**
 * Logs simulator start event.
 *
 * @param codeSource - Code source for snapshot (Blockly workspace or code string)
 * @param manual - Whether this is a manual action (default: true). Set to false for auto-run.
 */
export async function onSimulatorStart(codeSource?: unknown, manual: boolean = true): Promise<void> {
    // Track if this run was manual for complete/stop events
    lastSimulatorRunWasManual = manual;

    if (!isInitialized()) return;
    // Only log manual actions (user-initiated runs)
    if (!manual) return;
    await logSimulatorStart(codeSource || currentWorkspace);
}

/**
 * Logs simulator complete event.
 *
 * @param success - Whether execution succeeded
 * @param errorMessage - Error message if failed
 */
export async function onSimulatorComplete(
    success: boolean = true,
    errorMessage?: string
): Promise<void> {
    if (!isInitialized()) return;
    // Only log if the corresponding start was manual
    if (!lastSimulatorRunWasManual) return;
    await logSimulatorComplete(success, errorMessage);
}

/**
 * Logs simulator stop event.
 */
export async function onSimulatorStop(): Promise<void> {
    if (!isInitialized()) return;
    // Only log if the corresponding start was manual
    if (!lastSimulatorRunWasManual) return;
    await logSimulatorStop();
}

/**
 * Logs download start event.
 *
 * @param deviceType - Device type identifier
 * @param deviceName - Human-readable device name
 * @param codeSource - Code source for snapshot
 */
export async function onDownloadStart(
    deviceType: string = "microbit",
    deviceName: string = "micro:bit",
    codeSource?: unknown
): Promise<void> {
    if (!isInitialized()) return;
    await logDeviceDownloadStart(deviceType, deviceName, codeSource || currentWorkspace);
}

/**
 * Logs download complete event.
 *
 * @param deviceType - Device type identifier
 * @param deviceName - Human-readable device name
 * @param fileSize - Downloaded file size in bytes
 */
export async function onDownloadComplete(
    deviceType: string = "microbit",
    deviceName: string = "micro:bit",
    fileSize?: number
): Promise<void> {
    if (!isInitialized()) return;
    await logDeviceDownloadComplete(deviceType, deviceName, fileSize);
}

/**
 * Logs download error event.
 *
 * @param deviceType - Device type identifier
 * @param errorMessage - Error description
 * @param deviceName - Human-readable device name
 */
export async function onDownloadError(
    deviceType: string = "microbit",
    errorMessage: string,
    deviceName: string = "micro:bit"
): Promise<void> {
    if (!isInitialized()) return;
    await logDeviceDownloadError(deviceType, errorMessage, deviceName);
}

/**
 * Logs project save event.
 *
 * @param codeSource - Code source for snapshot
 * @param manual - Whether this is a manual action (default: false). Set to true for explicit user save.
 */
export async function onProjectSave(codeSource?: unknown, manual: boolean = false): Promise<void> {
    if (!isInitialized()) return;
    // Only log manual actions (user-initiated saves)
    if (!manual) return;
    await logSave(codeSource || currentWorkspace);
}

/**
 * Checks if xAPI is enabled.
 */
export function isXapiEnabled(): boolean {
    return isInitialized();
}

/**
 * Gets current editor mode.
 */
export function getCurrentEditorMode(): EditorMode {
    return currentEditorMode;
}

/**
 * Gets current project ID.
 */
export function getCurrentProjectId(): string | undefined {
    return currentProjectId;
}
