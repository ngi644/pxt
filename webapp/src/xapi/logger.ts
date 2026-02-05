/**
 * Unified xAPI logger facade for operation logging.
 * Provides a single entry point for all logging operations.
 */

import {
    Statement,
    EditorMode,
    XAPILoggerConfig,
    DEFAULT_CONFIG,
    CodeSnapshot,
} from "./types";
import { Verbs } from "./verbs";
import {
    createProjectActivity,
    createBlockActivity,
    createCodeActivity,
} from "./activities";
import { createStatement, addStatementListener } from "./statement";
import { captureCodeSnapshot } from "./snapshot";
import {
    initializeSession,
    setEditorMode,
    setProjectId,
    closeSession,
    getCurrentSession,
} from "./session";
import {
    registerWorkspace,
    unregisterWorkspace,
    unregisterAllWorkspaces,
    updateConfig as updateBlocklyConfig,
} from "./blocklyLogger";
import {
    registerEditor,
    unregisterEditor,
    unregisterAllEditors,
    updateConfig as updateMonacoConfig,
} from "./monacoLogger";
import {
    logExecutionStart,
    logExecutionComplete,
    logExecutionStop,
    updateConfig as updateExecutionConfig,
} from "./executionLogger";
import {
    logDownloadStart,
    logDownloadComplete,
    logDownloadError,
    updateConfig as updateDownloadConfig,
} from "./downloadLogger";
import {
    getSender,
    sendStatement,
    flushSender,
    shutdownSender,
    SenderConfig,
} from "./sender";

/**
 * Logger state.
 */
interface LoggerState {
    initialized: boolean;
    config: XAPILoggerConfig;
    editorMode: EditorMode;
    projectId: string | undefined;
}

/**
 * Current logger state.
 */
const state: LoggerState = {
    initialized: false,
    config: { ...DEFAULT_CONFIG },
    editorMode: "blocks",
    projectId: undefined,
};

/**
 * Extended configuration including sender options.
 */
export interface ExtendedLoggerConfig extends XAPILoggerConfig {
    /** Authentication token for telemetry server */
    telemetryToken?: string;
    /** Enable sending to server (default: true) */
    enableSending?: boolean;
}

/**
 * Initializes the xAPI logger.
 * Must be called before any logging operations.
 * @param config - Optional configuration override
 * @param editorMode - Initial editor mode (default: "blocks")
 * @param projectId - Initial project ID (optional)
 */
export async function initialize(
    config?: Partial<ExtendedLoggerConfig>,
    editorMode: EditorMode = "blocks",
    projectId?: string
): Promise<void> {
    if (state.initialized) {
        return;
    }

    // Merge config
    if (config) {
        state.config = { ...state.config, ...config };
    }

    state.editorMode = editorMode;
    state.projectId = projectId;

    // Initialize session
    await initializeSession(editorMode, projectId);

    // Initialize sender if sending is enabled
    const enableSending = config?.enableSending !== false;
    if (enableSending) {
        const senderConfig: Partial<SenderConfig> = {
            endpoint: state.config.telemetryEndpoint,
            enableOfflineBuffer: state.config.enableOfflineBuffer,
        };

        if (config?.telemetryToken) {
            senderConfig.token = config.telemetryToken;
        }

        getSender(senderConfig);
    }

    // Update sub-logger configs
    syncSubLoggerConfigs();

    // Set up statement listener for sending
    addStatementListener((statement) => {
        if (enableSending) {
            sendStatement(statement);
        } else {
            // Debug mode: log to console
            if (typeof console !== "undefined") {
                console.log("[xAPI]", statement.verb.display["en-US"], statement.object.id);
            }
        }
    });

    // Log editor opened event
    await logEditorOpened();

    state.initialized = true;
}

/**
 * Syncs configuration to all sub-loggers.
 */
function syncSubLoggerConfigs(): void {
    updateBlocklyConfig({
        editorMode: state.editorMode,
        includeSnapshots: true,
    });

    updateMonacoConfig({
        projectId: state.projectId || "default",
        includeSnapshots: true,
    });

    updateExecutionConfig({
        editorMode: state.editorMode,
        projectId: state.projectId || "default",
        includeSnapshots: true,
    });

    updateDownloadConfig({
        editorMode: state.editorMode,
        projectId: state.projectId || "default",
        includeSnapshots: true,
    });
}

/**
 * Logs editor opened event.
 */
async function logEditorOpened(): Promise<void> {
    const activity = createProjectActivity(
        state.projectId || "default",
        undefined,
        { action: "opened" }
    );

    await createStatement({
        verb: Verbs.OPENED,
        object: activity,
        editorMode: state.editorMode,
        projectId: state.projectId,
    });
}

/**
 * Logs editor closed event.
 */
async function logEditorClosed(): Promise<void> {
    const activity = createProjectActivity(
        state.projectId || "default",
        undefined,
        { action: "closed" }
    );

    await createStatement({
        verb: Verbs.CLOSED,
        object: activity,
        editorMode: state.editorMode,
        projectId: state.projectId,
    });
}

/**
 * Logs project saved event.
 * @param codeSource - The code source for snapshot (optional)
 */
export async function logSave(codeSource?: unknown): Promise<void> {
    let snapshot: CodeSnapshot | null = null;
    if (codeSource) {
        snapshot = await captureCodeSnapshot(state.editorMode, codeSource);
    }

    const activity = createProjectActivity(
        state.projectId || "default",
        undefined,
        { action: "saved" }
    );

    await createStatement({
        verb: Verbs.SAVED,
        object: activity,
        snapshot: snapshot || undefined,
        editorMode: state.editorMode,
        projectId: state.projectId,
    });
}

/**
 * Changes the current editor mode.
 * @param mode - The new editor mode
 */
export function changeEditorMode(mode: EditorMode): void {
    state.editorMode = mode;
    setEditorMode(mode);
    syncSubLoggerConfigs();
}

/**
 * Changes the current project.
 * @param projectId - The new project ID
 */
export function changeProject(projectId: string | undefined): void {
    state.projectId = projectId;
    setProjectId(projectId);
    syncSubLoggerConfigs();
}

/**
 * Registers a Blockly workspace for logging.
 * @param workspace - The Blockly workspace
 */
export function registerBlocklyWorkspace(workspace: unknown): void {
    registerWorkspace(workspace as Parameters<typeof registerWorkspace>[0]);
}

/**
 * Unregisters a Blockly workspace.
 * @param workspace - The Blockly workspace
 */
export function unregisterBlocklyWorkspace(workspace: unknown): void {
    unregisterWorkspace(workspace as Parameters<typeof unregisterWorkspace>[0]);
}

/**
 * Registers a Monaco editor for logging.
 * @param editor - The Monaco editor
 */
export function registerMonacoEditor(editor: unknown): void {
    registerEditor(editor as Parameters<typeof registerEditor>[0]);
}

/**
 * Unregisters a Monaco editor.
 * @param editor - The Monaco editor
 */
export function unregisterMonacoEditor(editor: unknown): void {
    unregisterEditor(editor as Parameters<typeof unregisterEditor>[0]);
}

/**
 * Logs simulator execution start.
 * @param codeSource - The code source for snapshot (optional)
 */
export async function logSimulatorStart(codeSource?: unknown): Promise<void> {
    await logExecutionStart("simulator", codeSource);
}

/**
 * Logs simulator execution complete.
 * @param success - Whether execution succeeded
 * @param errorMessage - Error message if failed
 */
export async function logSimulatorComplete(
    success: boolean = true,
    errorMessage?: string
): Promise<void> {
    await logExecutionComplete("simulator", success, errorMessage);
}

/**
 * Logs simulator execution stopped.
 */
export async function logSimulatorStop(): Promise<void> {
    await logExecutionStop("simulator");
}

/**
 * Logs download to device start.
 * @param deviceType - The device type
 * @param deviceName - Human-readable device name (optional)
 * @param codeSource - The code source for snapshot (optional)
 */
export async function logDeviceDownloadStart(
    deviceType: string,
    deviceName?: string,
    codeSource?: unknown
): Promise<void> {
    await logDownloadStart(deviceType, deviceName, codeSource);
}

/**
 * Logs download to device complete.
 * @param deviceType - The device type
 * @param deviceName - Human-readable device name (optional)
 * @param fileSize - Downloaded file size in bytes (optional)
 */
export async function logDeviceDownloadComplete(
    deviceType: string,
    deviceName?: string,
    fileSize?: number
): Promise<void> {
    await logDownloadComplete(deviceType, deviceName, fileSize);
}

/**
 * Logs download to device error.
 * @param deviceType - The device type
 * @param errorMessage - Error description
 * @param deviceName - Human-readable device name (optional)
 */
export async function logDeviceDownloadError(
    deviceType: string,
    errorMessage: string,
    deviceName?: string
): Promise<void> {
    await logDownloadError(deviceType, errorMessage, deviceName);
}

/**
 * Shuts down the logger.
 * Flushes pending statements and closes the session.
 */
export async function shutdown(): Promise<void> {
    if (!state.initialized) {
        return;
    }

    // Log editor closed
    await logEditorClosed();

    // Flush and shutdown sender
    await flushSender();
    await shutdownSender();

    // Unregister all listeners
    unregisterAllWorkspaces();
    unregisterAllEditors();

    // Close session
    closeSession();

    state.initialized = false;
}

/**
 * Gets current logger state (for debugging).
 * @returns Current state
 */
export function getState(): Readonly<LoggerState> {
    return { ...state };
}

/**
 * Checks if logger is initialized.
 * @returns True if initialized
 */
export function isInitialized(): boolean {
    return state.initialized;
}
