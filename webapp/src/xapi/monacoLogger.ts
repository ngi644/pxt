/**
 * Monaco editor change listener for xAPI operation logging.
 * Captures code editing events in TypeScript and Python modes.
 */

import { Verbs } from "./verbs";
import { createCodeActivity } from "./activities";
import { createStatement } from "./statement";
import { captureTypeScriptSnapshot, capturePythonSnapshot } from "./snapshot";
import { debounce } from "./utils";
import { EditorMode, CodeSnapshot } from "./types";

/**
 * Monaco editor interface (subset).
 */
interface MonacoEditor {
    getValue(): string;
    getModel(): MonacoModel | null;
    onDidChangeModelContent(listener: (event: unknown) => void): MonacoDisposable;
}

/**
 * Monaco model interface (subset).
 */
interface MonacoModel {
    uri: { path: string };
    getLanguageId(): string;
}

/**
 * Monaco disposable interface.
 */
interface MonacoDisposable {
    dispose(): void;
}

/**
 * Editor registration record.
 */
interface EditorRecord {
    editor: MonacoEditor;
    disposable: MonacoDisposable;
    lastHash: string | null;
}

/**
 * Registered editors.
 */
const registeredEditors: Map<MonacoEditor, EditorRecord> = new Map();

/**
 * Configuration for Monaco logging.
 */
export interface MonacoLoggerConfig {
    /** Debounce interval for change events in milliseconds */
    debounceMs: number;
    /** Whether to include snapshots with every event */
    includeSnapshots: boolean;
    /** Current project ID */
    projectId: string;
}

/**
 * Default configuration.
 */
const defaultConfig: MonacoLoggerConfig = {
    debounceMs: 1000,
    includeSnapshots: true,
    projectId: "default",
};

/**
 * Current configuration.
 */
let currentConfig: MonacoLoggerConfig = { ...defaultConfig };

/**
 * Maps Monaco language ID to editor mode.
 * @param languageId - Monaco language identifier
 * @returns Editor mode
 */
function languageToEditorMode(languageId: string): EditorMode {
    switch (languageId) {
        case "typescript":
        case "javascript":
            return "typescript";
        case "python":
            return "python";
        default:
            return "typescript";
    }
}

/**
 * Captures snapshot based on language.
 * @param content - The code content
 * @param languageId - Monaco language identifier
 * @returns Code snapshot
 */
async function captureSnapshot(
    content: string,
    languageId: string
): Promise<CodeSnapshot> {
    if (languageId === "python") {
        return capturePythonSnapshot(content);
    }
    return captureTypeScriptSnapshot(content);
}

/**
 * Handles editor content change.
 * @param editor - The Monaco editor
 * @param record - The editor record
 */
async function handleContentChange(
    editor: MonacoEditor,
    record: EditorRecord
): Promise<void> {
    const model = editor.getModel();
    if (!model) return;

    const content = editor.getValue();
    const languageId = model.getLanguageId();
    const editorMode = languageToEditorMode(languageId);

    // Capture snapshot if configured
    let snapshot: CodeSnapshot | null = null;
    if (currentConfig.includeSnapshots) {
        snapshot = await captureSnapshot(content, languageId);

        // Skip if content hasn't changed
        if (snapshot.hash === record.lastHash) {
            return;
        }

        record.lastHash = snapshot.hash;
    }

    // Create activity for the code file
    const filename = model.uri.path.split("/").pop() || "main.ts";
    const activity = createCodeActivity(currentConfig.projectId, filename, {
        languageId,
        lineCount: content.split("\n").length,
    });

    // Create and dispatch statement
    await createStatement({
        verb: Verbs.EDITED,
        object: activity,
        snapshot: snapshot || undefined,
        editorMode,
        projectId: currentConfig.projectId,
    });
}

/**
 * Creates a debounced change handler for an editor.
 * @param editor - The Monaco editor
 * @param record - The editor record
 * @returns Debounced handler function
 */
function createChangeHandler(
    editor: MonacoEditor,
    record: EditorRecord
): () => void {
    return debounce(() => {
        handleContentChange(editor, record).catch(() => {
            // Ignore logging errors
        });
    }, currentConfig.debounceMs);
}

/**
 * Registers a Monaco editor for change logging.
 * @param editor - The Monaco editor to monitor
 * @param config - Optional configuration override
 */
export function registerEditor(
    editor: MonacoEditor,
    config?: Partial<MonacoLoggerConfig>
): void {
    // Update config if provided
    if (config) {
        currentConfig = { ...currentConfig, ...config };
    }

    // Check if already registered
    if (registeredEditors.has(editor)) {
        return;
    }

    // Create record
    const record: EditorRecord = {
        editor,
        disposable: null as unknown as MonacoDisposable,
        lastHash: null,
    };

    // Create and register listener
    const handler = createChangeHandler(editor, record);
    record.disposable = editor.onDidChangeModelContent(handler);

    registeredEditors.set(editor, record);
}

/**
 * Unregisters a Monaco editor from change logging.
 * @param editor - The Monaco editor to stop monitoring
 */
export function unregisterEditor(editor: MonacoEditor): void {
    const record = registeredEditors.get(editor);
    if (record) {
        record.disposable.dispose();
        registeredEditors.delete(editor);
    }
}

/**
 * Unregisters all editors.
 */
export function unregisterAllEditors(): void {
    for (const [editor, record] of registeredEditors) {
        record.disposable.dispose();
        registeredEditors.delete(editor);
    }
}

/**
 * Updates the logger configuration.
 * @param config - Configuration options to update
 */
export function updateConfig(config: Partial<MonacoLoggerConfig>): void {
    currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current configuration.
 * @returns Current configuration
 */
export function getConfig(): MonacoLoggerConfig {
    return { ...currentConfig };
}

/**
 * Resets configuration to defaults.
 */
export function resetConfig(): void {
    currentConfig = { ...defaultConfig };
}
