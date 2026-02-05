/**
 * xAPI Operation Logging Module
 *
 * This module provides xAPI-compliant operation logging for MakeCode editors.
 * It captures user actions (block placement, code editing, execution, download)
 * and generates xAPI Statements with code snapshots.
 *
 * Usage:
 * ```typescript
 * import { initialize, shutdown, registerBlocklyWorkspace } from "./xapi";
 *
 * // Initialize on editor startup with configuration
 * await initialize({
 *     telemetryEndpoint: "/api/xapi/statements",
 *     telemetryToken: "your-token-here",
 *     enableSending: true,
 * }, "blocks", "my-project-id");
 *
 * // Register Blockly workspace for automatic logging
 * registerBlocklyWorkspace(workspace);
 *
 * // Shutdown on editor close
 * await shutdown();
 * ```
 *
 * Or using namespace import:
 * ```typescript
 * import { xapi } from "./xapi";
 *
 * await xapi.initialize({
 *     telemetryEndpoint: "/api/xapi/statements",
 *     telemetryToken: "your-token-here",
 * }, "blocks", "my-project-id");
 *
 * xapi.registerBlocklyWorkspace(workspace);
 * await xapi.shutdown();
 * ```
 *
 * See integration-example.ts for complete integration guide.
 */

// Re-export main logger facade
export {
    initialize,
    shutdown,
    isInitialized,
    getState,
    changeEditorMode,
    changeProject,
    registerBlocklyWorkspace,
    unregisterBlocklyWorkspace,
    registerMonacoEditor,
    unregisterMonacoEditor,
    logSave,
    logSimulatorStart,
    logSimulatorComplete,
    logSimulatorStop,
    logDeviceDownloadStart,
    logDeviceDownloadComplete,
    logDeviceDownloadError,
} from "./logger";

export type { ExtendedLoggerConfig } from "./logger";

// Re-export types for external use
export type {
    Statement,
    Actor,
    Verb,
    Activity,
    Result,
    Context,
    CodeSnapshot,
    EditorMode,
    Session,
    XAPILoggerConfig,
} from "./types";

// Re-export statement utilities for advanced use
export { createStatement, addStatementListener } from "./statement";

// Re-export verbs for custom statements
export { Verbs, createVerb } from "./verbs";

// Re-export activity creators for custom statements
export {
    ActivityTypes,
    createBlockActivity,
    createCodeActivity,
    createProjectActivity,
    createDeviceActivity,
} from "./activities";

// Re-export session utilities
export {
    getCurrentSession,
    getRegistrationId,
    recordActivity,
} from "./session";

// Re-export snapshot utilities
export {
    createSnapshot,
    captureBlocklySnapshot,
    captureTypeScriptSnapshot,
    capturePythonSnapshot,
} from "./snapshot";

// Re-export sender utilities for advanced use
export {
    getSender,
    sendStatement,
    sendStatements,
    flushSender,
    shutdownSender,
} from "./sender";

export type { SenderConfig, SendResult } from "./sender";

// Re-export buffer utilities for offline support
export {
    loadBuffer,
    clearBuffer,
    bufferSize,
    isBufferEmpty,
    getBufferStats,
} from "./buffer";

// Re-export PXT integration utilities
export {
    initXapi,
    shutdownXapi,
    setBlocklyWorkspace,
    clearBlocklyWorkspace,
    setMonacoEditor,
    clearMonacoEditor,
    onEditorModeChange,
    onProjectChange,
    onSimulatorStart,
    onSimulatorComplete,
    onSimulatorStop,
    onDownloadStart,
    onDownloadComplete,
    onDownloadError,
    onProjectSave,
    isXapiEnabled,
    getCurrentEditorMode,
    getCurrentProjectId,
} from "./pxtIntegration";

export type { PxtXapiConfig } from "./pxtIntegration";

// Convenience namespace export
import * as logger from "./logger";
export { logger as xapi };

// PXT integration namespace export
import * as pxtIntegration from "./pxtIntegration";
export { pxtIntegration as pxtXapi };
