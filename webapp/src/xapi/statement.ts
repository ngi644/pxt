/**
 * xAPI Statement builder for operation logging.
 */

import {
    Statement,
    Actor,
    Verb,
    Activity,
    Result,
    Context,
    ContextExtensions,
    EditorMode,
    CodeSnapshot,
    ContextExtensionUri,
} from "./types";
import { generateUUID, generateTimestamp } from "./utils";
import { getOrCreateSession, getCurrentSession, recordActivity } from "./session";
import { createActor } from "./fingerprint";

/**
 * Cached actor to avoid regenerating fingerprint.
 */
let cachedActor: Actor | null = null;

/**
 * Gets or creates the Actor for statements.
 * @returns The Actor object
 */
async function getActor(): Promise<Actor> {
    if (cachedActor) {
        return cachedActor;
    }
    cachedActor = await createActor();
    return cachedActor;
}

/**
 * Options for building a statement.
 */
export interface StatementOptions {
    /** The action performed */
    verb: Verb;
    /** The target of the action */
    object: Activity;
    /** Result of the action (optional) */
    result?: Result;
    /** Code snapshot to include (optional) */
    snapshot?: CodeSnapshot;
    /** Override editor mode (uses session default if not provided) */
    editorMode?: EditorMode;
    /** Override project ID (uses session default if not provided) */
    projectId?: string;
    /** Custom timestamp (uses current time if not provided) */
    timestamp?: string;
}

/**
 * Builds an xAPI Statement from the given options.
 * Automatically populates actor, context, and timestamp.
 * @param options - Statement options
 * @returns The complete xAPI Statement
 */
export async function buildStatement(options: StatementOptions): Promise<Statement> {
    const actor = await getActor();
    const session = await getOrCreateSession();

    // Record activity to keep session active
    recordActivity();

    const editorMode = options.editorMode || session.editorMode;
    const projectId = options.projectId || session.projectId;

    // Build context extensions
    const extensions: ContextExtensions = {
        [ContextExtensionUri.EDITOR_MODE]: editorMode,
    };

    if (options.snapshot) {
        extensions[ContextExtensionUri.CODE_SNAPSHOT] = options.snapshot;
    }

    if (projectId) {
        extensions[ContextExtensionUri.PROJECT_ID] = projectId;
    }

    const context: Context = {
        registration: session.id,
        extensions,
    };

    const statement: Statement = {
        id: generateUUID(),
        actor,
        verb: options.verb,
        object: options.object,
        context,
        timestamp: options.timestamp || generateTimestamp(),
    };

    if (options.result) {
        statement.result = options.result;
    }

    return statement;
}

/**
 * Validates a statement against basic xAPI requirements.
 * @param statement - The statement to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateStatement(statement: Statement): string[] {
    const errors: string[] = [];

    if (!statement.id) {
        errors.push("Statement must have an id");
    }

    if (!statement.actor?.account?.name) {
        errors.push("Statement must have an actor with account name");
    }

    if (!statement.verb?.id) {
        errors.push("Statement must have a verb with id");
    }

    if (!statement.object?.id) {
        errors.push("Statement must have an object with id");
    }

    if (!statement.context?.registration) {
        errors.push("Statement must have context with registration");
    }

    if (!statement.context?.extensions?.[ContextExtensionUri.EDITOR_MODE]) {
        errors.push("Statement must have editor-mode in context extensions");
    }

    if (!statement.timestamp) {
        errors.push("Statement must have a timestamp");
    }

    return errors;
}

/**
 * Statement listeners for local processing.
 */
type StatementListener = (statement: Statement) => void;
const statementListeners: Set<StatementListener> = new Set();

/**
 * Adds a listener for newly created statements.
 * @param listener - Function to call with each new statement
 * @returns Function to remove the listener
 */
export function addStatementListener(listener: StatementListener): () => void {
    statementListeners.add(listener);
    return () => statementListeners.delete(listener);
}

/**
 * Notifies all listeners of a new statement.
 * @param statement - The new statement
 */
function notifyStatementListeners(statement: Statement): void {
    for (const listener of statementListeners) {
        try {
            listener(statement);
        } catch {
            // Ignore listener errors
        }
    }
}

/**
 * Creates and dispatches an xAPI Statement.
 * This is the main entry point for logging operations.
 * @param options - Statement options
 * @returns The created statement
 */
export async function createStatement(options: StatementOptions): Promise<Statement> {
    const statement = await buildStatement(options);
    notifyStatementListeners(statement);
    return statement;
}

/**
 * Clears cached actor (useful for testing).
 */
export function clearActorCache(): void {
    cachedActor = null;
}
