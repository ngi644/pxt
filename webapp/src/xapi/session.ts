/**
 * Session manager for xAPI operation logging.
 * Manages session lifecycle and provides registration IDs for statements.
 */

import { Session, SessionState, EditorMode } from "./types";
import { generateUUID, generateTimestamp } from "./utils";
import { generateFingerprint } from "./fingerprint";

/**
 * Session idle timeout in milliseconds.
 * Session transitions to idle after this period of inactivity.
 */
const IDLE_TIMEOUT_MS = 30000;

/**
 * Storage key for persisting session across page reloads.
 */
const SESSION_STORAGE_KEY = "xapi_session";

/**
 * Current active session.
 */
let currentSession: Session | null = null;

/**
 * Timer for idle detection.
 */
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Session change listeners.
 */
type SessionListener = (session: Session | null) => void;
const listeners: Set<SessionListener> = new Set();

/**
 * Creates a new session.
 * @param editorMode - Initial editor mode
 * @param projectId - Optional project identifier
 * @returns The new session
 */
export async function createSession(
    editorMode: EditorMode = "blocks",
    projectId?: string
): Promise<Session> {
    const actorId = await generateFingerprint();

    const session: Session = {
        id: generateUUID(),
        startedAt: generateTimestamp(),
        actorId,
        editorMode,
        state: "active",
    };

    if (projectId) {
        session.projectId = projectId;
    }

    currentSession = session;
    persistSession();
    notifyListeners();
    resetIdleTimer();

    return session;
}

/**
 * Gets the current session, creating one if none exists.
 * @param editorMode - Editor mode for new session (default: "blocks")
 * @returns The current or newly created session
 */
export async function getOrCreateSession(
    editorMode: EditorMode = "blocks"
): Promise<Session> {
    if (currentSession && currentSession.state !== "closed") {
        return currentSession;
    }

    // Try to restore from storage
    const restored = restoreSession();
    if (restored && restored.state !== "closed") {
        currentSession = restored;
        currentSession.state = "active";
        persistSession();
        notifyListeners();
        resetIdleTimer();
        return currentSession;
    }

    return createSession(editorMode);
}

/**
 * Gets the current session without creating one.
 * @returns The current session or null
 */
export function getCurrentSession(): Session | null {
    return currentSession;
}

/**
 * Gets the current session's registration ID.
 * @returns The registration UUID or null if no session
 */
export function getRegistrationId(): string | null {
    return currentSession?.id || null;
}

/**
 * Updates the session's editor mode.
 * @param mode - The new editor mode
 */
export function setEditorMode(mode: EditorMode): void {
    if (currentSession) {
        currentSession.editorMode = mode;
        persistSession();
        notifyListeners();
    }
}

/**
 * Updates the session's project ID.
 * @param projectId - The new project ID
 */
export function setProjectId(projectId: string | undefined): void {
    if (currentSession) {
        currentSession.projectId = projectId;
        persistSession();
        notifyListeners();
    }
}

/**
 * Records activity, resetting the idle timer and activating idle sessions.
 */
export function recordActivity(): void {
    if (currentSession) {
        if (currentSession.state === "idle") {
            currentSession.state = "active";
            persistSession();
            notifyListeners();
        }
        resetIdleTimer();
    }
}

/**
 * Closes the current session.
 */
export function closeSession(): void {
    if (currentSession) {
        currentSession.state = "closed";
        persistSession();
        notifyListeners();
        clearIdleTimer();
    }
}

/**
 * Ends the current session and clears storage.
 * Use this when the user explicitly ends their session.
 */
export function endSession(): void {
    closeSession();
    currentSession = null;
    clearPersistedSession();
    notifyListeners();
}

/**
 * Resets the idle timer.
 */
function resetIdleTimer(): void {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
        if (currentSession && currentSession.state === "active") {
            currentSession.state = "idle";
            persistSession();
            notifyListeners();
        }
    }, IDLE_TIMEOUT_MS);
}

/**
 * Clears the idle timer.
 */
function clearIdleTimer(): void {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}

/**
 * Persists the session to storage.
 */
function persistSession(): void {
    if (!currentSession) return;

    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentSession));
    } catch {
        // Storage not available
    }
}

/**
 * Restores session from storage.
 * @returns The restored session or null
 */
function restoreSession(): Session | null {
    try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored) as Session;
        }
    } catch {
        // Storage not available or invalid data
    }
    return null;
}

/**
 * Clears persisted session from storage.
 */
function clearPersistedSession(): void {
    try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
        // Storage not available
    }
}

/**
 * Adds a session change listener.
 * @param listener - Function to call when session changes
 * @returns Function to remove the listener
 */
export function addSessionListener(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Notifies all listeners of session change.
 */
function notifyListeners(): void {
    for (const listener of listeners) {
        try {
            listener(currentSession);
        } catch {
            // Ignore listener errors
        }
    }
}

/**
 * Initializes the session manager.
 * Should be called when the editor loads.
 * @param editorMode - Initial editor mode
 * @param projectId - Optional project identifier
 */
export async function initializeSession(
    editorMode: EditorMode = "blocks",
    projectId?: string
): Promise<Session> {
    // Set up pagehide handler to close session (modern replacement for beforeunload)
    if (typeof window !== "undefined") {
        window.addEventListener("pagehide", () => {
            closeSession();
        });

        // Set up visibility change handler
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                // Mark as idle when tab is hidden
                if (currentSession && currentSession.state === "active") {
                    currentSession.state = "idle";
                    persistSession();
                }
            } else if (document.visibilityState === "visible") {
                // Reactivate when tab becomes visible
                recordActivity();
            }
        });
    }

    const session = await getOrCreateSession(editorMode);
    if (projectId) {
        setProjectId(projectId);
    }
    return session;
}
