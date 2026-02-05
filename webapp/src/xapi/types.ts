/**
 * xAPI TypeScript type definitions for operation logging.
 * Conforms to xAPI 1.0.3 specification.
 */

import {
    DEFAULT_ENDPOINT,
    DEFAULT_ACTOR_HOME_PAGE,
    DEFAULT_BATCH_SIZE,
    DEFAULT_BATCH_TIMEOUT,
    DEFAULT_OFFLINE_BUFFER_ENABLED,
    DEFAULT_MAX_OFFLINE_STATEMENTS,
} from "./config";

/**
 * Language map for internationalized strings.
 * Key is language code (e.g., "en-US"), value is localized string.
 */
export interface LanguageMap {
    "en-US": string;
    [key: string]: string;
}

/**
 * Account identifier for pseudo-anonymous learner identification.
 */
export interface Account {
    /** Service home page URL */
    homePage: string;
    /** Browser fingerprint hash (32-64 alphanumeric characters) */
    name: string;
}

/**
 * Actor represents the learner performing actions.
 * Uses account-based identification with browser fingerprint.
 */
export interface Actor {
    account: Account;
}

/**
 * Verb IDs for operation logging.
 */
export type VerbId =
    | "urn:xapi:picapica-2d:verb:placed"
    | "urn:xapi:picapica-2d:verb:removed"
    | "urn:xapi:picapica-2d:verb:edited"
    | "urn:xapi:picapica-2d:verb:executed"
    | "urn:xapi:picapica-2d:verb:downloaded"
    | "urn:xapi:picapica-2d:verb:saved"
    | "urn:xapi:picapica-2d:verb:opened"
    | "urn:xapi:picapica-2d:verb:closed"
    | "urn:xapi:picapica-2d:verb:moved"
    | "urn:xapi:picapica-2d:verb:connected"
    | "urn:xapi:picapica-2d:verb:disconnected"
    | "urn:xapi:picapica-2d:verb:nested"
    | "urn:xapi:picapica-2d:verb:selected";

/**
 * Verb display names.
 */
export type VerbDisplay =
    | "placed"
    | "removed"
    | "edited"
    | "executed"
    | "downloaded"
    | "saved"
    | "opened"
    | "closed"
    | "moved"
    | "connected"
    | "disconnected"
    | "nested"
    | "selected";

/**
 * Verb represents the action performed by the learner.
 */
export interface Verb {
    /** Verb identifier URI */
    id: VerbId;
    /** Human-readable display name in multiple languages */
    display: LanguageMap;
}

/**
 * Activity type URIs.
 */
export type ActivityType =
    | "urn:xapi:picapica-2d:activity-type:block"
    | "urn:xapi:picapica-2d:activity-type:code"
    | "urn:xapi:picapica-2d:activity-type:project"
    | "urn:xapi:picapica-2d:activity-type:device";

/**
 * Activity definition with type and optional extensions.
 */
export interface ActivityDefinition {
    /** Human-readable activity name */
    name?: LanguageMap;
    /** Activity type URI */
    type: ActivityType;
    /** Additional activity-specific properties */
    extensions?: Record<string, unknown>;
}

/**
 * Activity (Object) represents the target of the action.
 */
export interface Activity {
    /** Activity identifier URI */
    id: string;
    /** Activity definition */
    definition: ActivityDefinition;
}

/**
 * Result of an action (optional).
 */
export interface Result {
    /** Whether the action was successful */
    success?: boolean;
    /** Duration in ISO 8601 format (e.g., "PT1.5S") */
    duration?: string;
    /** Additional result properties */
    extensions?: Record<string, unknown>;
}

/**
 * Editor mode types.
 */
export type EditorMode = "blocks" | "typescript" | "python";

/**
 * Code snapshot format types.
 */
export type SnapshotFormat = "blockly-xml" | "typescript" | "python";

/**
 * Code snapshot containing compressed code state.
 */
export interface CodeSnapshot {
    /** Format of the code content */
    format: SnapshotFormat;
    /** gzip compressed and Base64 encoded code content */
    content: string;
    /** SHA-256 hash of uncompressed content (64 hex characters) */
    hash: string;
    /** Uncompressed size in bytes */
    size: number;
}

/**
 * Context extension URIs.
 */
export const ContextExtensionUri = {
    CODE_SNAPSHOT: "urn:xapi:picapica-2d:ext:code-snapshot",
    EDITOR_MODE: "urn:xapi:picapica-2d:ext:editor-mode",
    PROJECT_ID: "urn:xapi:picapica-2d:ext:project-id",
} as const;

/**
 * Context extensions interface.
 */
export interface ContextExtensions {
    [ContextExtensionUri.EDITOR_MODE]: EditorMode;
    [ContextExtensionUri.CODE_SNAPSHOT]?: CodeSnapshot;
    [ContextExtensionUri.PROJECT_ID]?: string;
}

/**
 * Context provides additional information about the statement.
 */
export interface Context {
    /** Session identifier (UUID) */
    registration: string;
    /** Additional context properties */
    extensions: ContextExtensions;
}

/**
 * xAPI Statement represents a single learning record.
 */
export interface Statement {
    /** Unique statement identifier (UUID) */
    id: string;
    /** The learner who performed the action */
    actor: Actor;
    /** The action performed */
    verb: Verb;
    /** The target of the action */
    object: Activity;
    /** The result of the action (optional) */
    result?: Result;
    /** Additional context information */
    context: Context;
    /** When the action occurred (ISO 8601) */
    timestamp: string;
}

/**
 * Batch of statements for bulk transmission.
 */
export interface StatementBatch {
    statements: Statement[];
}

/**
 * Session state for client-side management.
 */
export type SessionState = "idle" | "active" | "closed";

/**
 * Session information managed on the client.
 */
export interface Session {
    /** Session identifier (UUID, used as xAPI registration) */
    id: string;
    /** Session start time (ISO 8601) */
    startedAt: string;
    /** Actor identifier (fingerprint hash) */
    actorId: string;
    /** Current project identifier (optional) */
    projectId?: string;
    /** Current editor mode */
    editorMode: EditorMode;
    /** Session state */
    state: SessionState;
}

/**
 * Configuration for the xAPI logger.
 */
export interface XAPILoggerConfig {
    /** Telemetry service endpoint URL */
    telemetryEndpoint: string;
    /** Service home page for Actor identification */
    actorHomePage: string;
    /** Maximum statements to batch before sending */
    batchSize: number;
    /** Maximum time to wait before sending batch (ms) */
    batchTimeout: number;
    /** Enable offline buffering */
    enableOfflineBuffer: boolean;
    /** Maximum statements to store offline */
    maxOfflineStatements: number;
}

/**
 * Default configuration values.
 * Edit config.ts to change these defaults.
 */
export const DEFAULT_CONFIG: XAPILoggerConfig = {
    telemetryEndpoint: DEFAULT_ENDPOINT,
    actorHomePage: DEFAULT_ACTOR_HOME_PAGE,
    batchSize: DEFAULT_BATCH_SIZE,
    batchTimeout: DEFAULT_BATCH_TIMEOUT,
    enableOfflineBuffer: DEFAULT_OFFLINE_BUFFER_ENABLED,
    maxOfflineStatements: DEFAULT_MAX_OFFLINE_STATEMENTS,
};
