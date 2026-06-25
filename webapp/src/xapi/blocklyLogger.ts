/**
 * Blockly event listener integration for xAPI operation logging.
 * Captures detailed block events: placement, removal, movement,
 * connection, disconnection, nesting, and selection.
 */

import { Verbs } from "./verbs";
import { createBlockActivity } from "./activities";
import { createStatement } from "./statement";
import { captureBlocklySnapshot } from "./snapshot";
import { throttle, formatDuration } from "./utils";
import { EditorMode, CodeSnapshot, Verb, Result } from "./types";

/**
 * Blockly event types we care about.
 */
const TRACKED_EVENTS = [
    "create", // Block created
    "delete", // Block deleted
    "move", // Block moved (includes connection changes)
    "change", // Block field changed
    "click", // Block clicked/selected
    "drag", // Block drag start/end (grabbed/dropped)
];

/**
 * Blockly event interface (subset of actual Blockly event).
 */
interface BlocklyEvent {
    type: string;
    blockId?: string;
    workspaceId?: string;
    recordUndo?: boolean;
    group?: string;
    // Move event properties
    oldParentId?: string;
    newParentId?: string;
    oldInputName?: string;
    newInputName?: string;
    oldCoordinate?: { x: number; y: number };
    newCoordinate?: { x: number; y: number };
    // Click event properties
    targetType?: string;
    // Change event properties
    element?: string; // "field", "comment", "collapsed", etc.
    name?: string; // Field name that changed
    oldValue?: unknown; // Previous value
    newValue?: unknown; // New value
    // Drag event properties
    isStart?: boolean; // True if drag start (grabbed), false if drag end (dropped)
}

/**
 * Blockly block interface (subset).
 */
interface BlocklyBlock {
    id: string;
    type: string;
    getFieldValue?(name: string): string | null;
    getParent?(): BlocklyBlock | null;
    getChildren?(ordered: boolean): BlocklyBlock[];
}

/**
 * Block information for logging.
 */
interface BlockInfo {
    /** Block ID */
    id: string;
    /** Block type (e.g., "controls_if", "math_number") */
    type: string;
    /** Role in the action (e.g., "primary", "parent", "child") */
    role: "primary" | "parent" | "child" | "container";
}

/**
 * Blockly workspace interface (subset).
 */
interface BlocklyWorkspace {
    id: string;
    getBlockById(id: string): BlocklyBlock | null;
    addChangeListener(listener: (event: BlocklyEvent) => void): void;
    removeChangeListener(listener: (event: BlocklyEvent) => void): void;
}

/**
 * Listener registration record.
 */
interface ListenerRecord {
    workspace: BlocklyWorkspace;
    listener: (event: BlocklyEvent) => void;
}

/**
 * Registered event listeners.
 */
const registeredListeners: Map<string, ListenerRecord> = new Map();

/**
 * Last snapshot hash to detect changes.
 */
let lastSnapshotHash: string | null = null;

/**
 * Track parent state for each block to detect connection changes.
 * Key: blockId, Value: { parentId, inputName } or null if top-level
 */
interface ParentState {
    parentId: string;
    parentType?: string;
    inputName?: string;
}
const blockParentStates: Map<string, ParentState | null> = new Map();

/**
 * Track drag start time (ms) for each block to compute drag duration.
 * Key: blockId, Value: Date.now() at drag start.
 */
const dragStartTimes: Map<string, number> = new Map();

/**
 * Gets the current parent info for a block.
 */
function getBlockParentInfo(block: BlocklyBlock): ParentState | null {
    if (!block.getParent) return null;
    const parent = block.getParent();
    if (!parent) return null;
    return {
        parentId: parent.id,
        parentType: parent.type,
    };
}

/**
 * Configuration for Blockly logging.
 */
export interface BlocklyLoggerConfig {
    /** Throttle interval for change events in milliseconds */
    throttleMs: number;
    /** Whether to include snapshots with every event */
    includeSnapshots: boolean;
    /** Editor mode to use in statements */
    editorMode: EditorMode;
    /** Whether to log selection events */
    logSelections: boolean;
}

/**
 * Default configuration.
 */
const defaultConfig: BlocklyLoggerConfig = {
    throttleMs: 500,
    includeSnapshots: true,
    editorMode: "blocks",
    logSelections: true,
};

/**
 * Current configuration.
 */
let currentConfig: BlocklyLoggerConfig = { ...defaultConfig };

/**
 * Analyzes a move event to determine the specific action type.
 * @param event - The move event
 * @returns Object with verb and additional context
 */
function analyzeMoveEvent(event: BlocklyEvent): {
    verb: Verb;
    action: string;
    parentBlockId?: string;
    inputName?: string;
} {
    const hadParent = !!event.oldParentId;
    const hasParent = !!event.newParentId;
    const hasInput = !!event.newInputName;

    // Case 1: Connected to a new parent (接合)
    if (!hadParent && hasParent) {
        if (hasInput) {
            // Nested into an input (内包)
            return {
                verb: Verbs.NESTED,
                action: "nested",
                parentBlockId: event.newParentId,
                inputName: event.newInputName,
            };
        }
        // Connected to next/previous connection (接合)
        return {
            verb: Verbs.CONNECTED,
            action: "connected",
            parentBlockId: event.newParentId,
        };
    }

    // Case 2: Disconnected from parent (切り離し/取り出し)
    if (hadParent && !hasParent) {
        return {
            verb: Verbs.DISCONNECTED,
            action: "disconnected",
            parentBlockId: event.oldParentId,
        };
    }

    // Case 3: Changed parent or input (reconnected to different place)
    if (hadParent && hasParent) {
        if (event.oldParentId !== event.newParentId || event.oldInputName !== event.newInputName) {
            if (hasInput) {
                return {
                    verb: Verbs.NESTED,
                    action: "nested",
                    parentBlockId: event.newParentId,
                    inputName: event.newInputName,
                };
            }
            return {
                verb: Verbs.CONNECTED,
                action: "connected",
                parentBlockId: event.newParentId,
            };
        }
    }

    // Case 4: Just moved position (standalone block)
    return {
        verb: Verbs.MOVED,
        action: "moved",
    };
}

/**
 * Handles a Blockly event and creates an xAPI statement.
 * @param event - The Blockly event
 * @param workspace - The workspace where the event occurred
 */
async function handleBlocklyEvent(
    event: BlocklyEvent,
    workspace: BlocklyWorkspace
): Promise<void> {
    // Debug: log all events for troubleshooting
    if (typeof console !== "undefined" && (console as any).__xapi_debug) {
        // Log all event properties to discover what's available
        console.log("[xAPI Blockly]", event.type, event.blockId, "full event:", event);
        if (event.type === "move") {
            const e = event as any;
            console.log("[xAPI Blockly] move details:", {
                // Standard properties
                oldParentId: event.oldParentId,
                newParentId: event.newParentId,
                oldInputName: event.oldInputName,
                newInputName: event.newInputName,
                // Underscore-prefixed (private) properties
                oldParentId_: e.oldParentId_,
                newParentId_: e.newParentId_,
                oldInputName_: e.oldInputName_,
                newInputName_: e.newInputName_,
                // Other alternatives
                reason: e.reason,
            });
            // Log all keys to find parent info
            console.log("[xAPI Blockly] all event keys:", Object.keys(e));
        }
    }

    // Skip events we don't track
    if (!TRACKED_EVENTS.includes(event.type)) {
        return;
    }

    // Skip events that shouldn't be recorded (except UI events, click, move, and drag)
    // Note: We always allow move events because PXT's Blockly doesn't populate
    // oldParentId/newParentId in events, so we use our own parent tracking instead.
    // Drag events are UI events (recordUndo=false) but we track them for grabbed/dropped.
    if (!event.recordUndo && event.type !== "click" && event.type !== "move" && event.type !== "drag") {
        return;
    }

    // Skip click events if not configured
    if (event.type === "click" && !currentConfig.logSelections) {
        return;
    }

    // Get block information
    const block = event.blockId
        ? workspace.getBlockById(event.blockId)
        : null;

    const blockType = block?.type || "unknown";
    const blockName = block?.type.replace(/_/g, " ") || "Unknown Block";

    // Determine verb and context based on event type
    let verb: Verb = Verbs.EDITED;
    let action: string = event.type;
    let parentBlockId: string | undefined;
    let inputName: string | undefined;
    let result: Result | undefined;

    switch (event.type) {
        case "create":
            verb = Verbs.PLACED;
            action = "created";
            // Initialize parent tracking for new block
            if (block) {
                const parentInfo = getBlockParentInfo(block);
                blockParentStates.set(block.id, parentInfo);
            }
            break;

        case "delete":
            verb = Verbs.REMOVED;
            action = "deleted";
            // Clean up tracking for deleted block
            if (event.blockId) {
                blockParentStates.delete(event.blockId);
                dragStartTimes.delete(event.blockId);
            }
            break;

        case "drag":
            // Drag start = grabbed (つかんだ), drag end = dropped (離した)
            if (event.blockId && event.isStart) {
                verb = Verbs.GRABBED;
                action = "grabbed";
                dragStartTimes.set(event.blockId, Date.now());
            } else if (event.blockId) {
                verb = Verbs.DROPPED;
                action = "dropped";
                const startTime = dragStartTimes.get(event.blockId);
                if (startTime !== undefined) {
                    const durationMs = Date.now() - startTime;
                    result = { duration: formatDuration(durationMs) };
                    dragStartTimes.delete(event.blockId);
                }
            } else {
                // Drag event without a block id (e.g. workspace drag) — ignore
                return;
            }
            break;

        case "move": {
            const analysis = analyzeMoveEvent(event);
            verb = analysis.verb;
            action = analysis.action;
            parentBlockId = analysis.parentBlockId;
            inputName = analysis.inputName;
            break;
        }

        case "change":
            verb = Verbs.EDITED;
            action = "edited";
            break;

        case "click":
            // Only log block clicks, not workspace clicks
            if (event.targetType !== "block" || !event.blockId) {
                return;
            }
            verb = Verbs.SELECTED;
            action = "selected";
            break;
    }

    // Build list of blocks involved in this action
    const blocks: BlockInfo[] = [];

    // Add primary block
    if (block) {
        blocks.push({
            id: block.id,
            type: block.type,
            role: "primary",
        });

        // For move events, also include connected child blocks
        if (event.type === "move" && action === "moved" && block.getChildren) {
            try {
                const children = block.getChildren(true);
                for (const child of children) {
                    blocks.push({
                        id: child.id,
                        type: child.type,
                        role: "child",
                    });
                }
            } catch {
                // Ignore errors if getChildren is not available
            }
        }
    }

    // Add related blocks based on action type
    if (parentBlockId) {
        const parentBlock = workspace.getBlockById(parentBlockId);
        if (parentBlock) {
            blocks.push({
                id: parentBlock.id,
                type: parentBlock.type,
                role: action === "nested" ? "container" : "parent",
            });
        }
    }

    // Build extensions for the activity
    const extensions: Record<string, unknown> = {
        blockId: event.blockId,
        eventType: event.type,
        action: action,
        // List of all blocks involved with their types and roles
        blocks: blocks,
        // Convenience: list of just block types
        blockTypes: blocks.map(b => b.type),
    };

    if (event.group) {
        extensions.groupId = event.group;
    }

    // Include change event details (field edits)
    if (event.type === "change") {
        if (event.element) {
            extensions.element = event.element;
        }
        if (event.name) {
            extensions.fieldName = event.name;
        }
        if (event.oldValue !== undefined) {
            extensions.oldValue = event.oldValue;
        }
        if (event.newValue !== undefined) {
            extensions.newValue = event.newValue;
        }
    }

    // Include connection change details for move events using src/dst format
    if (event.type === "move" && block) {
        // Get current parent (after the move)
        const currentParent = getBlockParentInfo(block);
        // Get previously tracked parent (before the move)
        const previousParent = blockParentStates.get(block.id);

        // Update tracking state
        blockParentStates.set(block.id, currentParent);

        // Determine if connection changed
        const wasConnected = previousParent !== undefined && previousParent !== null;
        const isConnected = currentParent !== null;
        const parentChanged = wasConnected !== isConnected ||
            (wasConnected && isConnected && previousParent?.parentId !== currentParent?.parentId);

        // Override action based on actual parent change
        if (parentChanged) {
            if (!wasConnected && isConnected) {
                // Connected to a new parent
                action = "connected";
                verb = Verbs.CONNECTED;
            } else if (wasConnected && !isConnected) {
                // Disconnected from parent
                action = "disconnected";
                verb = Verbs.DISCONNECTED;
            } else if (wasConnected && isConnected) {
                // Moved from one parent to another
                action = "connected";
                verb = Verbs.CONNECTED;
            }
        }

        // Source (where the block was)
        const src: Record<string, unknown> = {};
        if (previousParent) {
            src.parentId = previousParent.parentId;
            src.parentType = previousParent.parentType;
            if (previousParent.inputName) {
                src.inputName = previousParent.inputName;
            }
        }
        if (event.oldCoordinate) {
            src.coordinate = {
                x: Math.round(event.oldCoordinate.x),
                y: Math.round(event.oldCoordinate.y),
            };
        }
        if (Object.keys(src).length > 0) {
            extensions.src = src;
        }

        // Destination (where the block is now)
        const dst: Record<string, unknown> = {};
        if (currentParent) {
            dst.parentId = currentParent.parentId;
            dst.parentType = currentParent.parentType;
            if (currentParent.inputName) {
                dst.inputName = currentParent.inputName;
            }
        }
        if (event.newCoordinate) {
            dst.coordinate = {
                x: Math.round(event.newCoordinate.x),
                y: Math.round(event.newCoordinate.y),
            };
        }
        if (Object.keys(dst).length > 0) {
            extensions.dst = dst;
        }

        // Debug log for parent tracking
        if (typeof console !== "undefined" && (console as any).__xapi_debug) {
            console.log("[xAPI Blockly] parent tracking:", {
                previousParent,
                currentParent,
                parentChanged,
                action,
            });
        }

        // Update action in extensions after parent tracking override
        extensions.action = action;
    }

    // Legacy fields for backwards compatibility
    if (parentBlockId) {
        const parentBlock = workspace.getBlockById(parentBlockId);
        extensions.parentBlockId = parentBlockId;
        extensions.parentBlockType = parentBlock?.type;
    }

    if (inputName) {
        extensions.inputName = inputName;
    }

    // Create activity for the block
    const activity = createBlockActivity(blockType, blockName, extensions);

    // Capture snapshot if configured.
    // Skip for click and drag events: timing is the goal for drag, and the
    // resulting placement snapshot is captured by the subsequent move/placed event.
    let snapshot: CodeSnapshot | null = null;
    if (currentConfig.includeSnapshots && event.type !== "click" && event.type !== "drag") {
        snapshot = await captureBlocklySnapshot(workspace);

        // Skip if snapshot hasn't changed (for throttled events)
        // But never skip connected/disconnected events - we need to track all parent changes
        const isParentChangeEvent = action === "connected" || action === "disconnected";
        if (!isParentChangeEvent && snapshot && snapshot.hash === lastSnapshotHash) {
            return;
        }

        if (snapshot) {
            lastSnapshotHash = snapshot.hash;
        }
    }

    // Create and dispatch statement
    await createStatement({
        verb,
        object: activity,
        snapshot: snapshot || undefined,
        result,
        editorMode: currentConfig.editorMode,
    });
}

/**
 * Creates an event handler for a workspace.
 * Move events are not throttled to ensure accurate parent tracking.
 * Other events (like change) are throttled to reduce noise.
 * @param workspace - The Blockly workspace
 * @returns Event handler function
 */
function createEventHandler(
    workspace: BlocklyWorkspace
): (event: BlocklyEvent) => void {
    // Throttled handler for non-move events
    const throttledHandler = throttle((event: BlocklyEvent) => {
        handleBlocklyEvent(event, workspace).catch(() => {
            // Ignore logging errors
        });
    }, currentConfig.throttleMs);

    // Main handler that routes events appropriately
    return (event: BlocklyEvent) => {
        // Move and drag events are not throttled to ensure accurate tracking
        // (connection/disconnection detection and grab/drop timing depend on
        // seeing every event)
        if (event.type === "move" || event.type === "drag") {
            handleBlocklyEvent(event, workspace).catch(() => {
                // Ignore logging errors
            });
        } else {
            throttledHandler(event);
        }
    };
}

/**
 * Registers a Blockly workspace for event logging.
 * @param workspace - The Blockly workspace to monitor
 * @param config - Optional configuration override
 */
export function registerWorkspace(
    workspace: BlocklyWorkspace,
    config?: Partial<BlocklyLoggerConfig>
): void {
    // Update config if provided
    if (config) {
        currentConfig = { ...currentConfig, ...config };
    }

    // Check if already registered
    if (registeredListeners.has(workspace.id)) {
        console.log("[xAPI] Workspace already registered:", workspace.id);
        return;
    }

    // Create and register listener
    const listener = createEventHandler(workspace);
    workspace.addChangeListener(listener);

    registeredListeners.set(workspace.id, {
        workspace,
        listener,
    });

    console.log("[xAPI] Blockly workspace registered:", workspace.id);
}

/**
 * Unregisters a Blockly workspace from event logging.
 * @param workspace - The Blockly workspace to stop monitoring
 */
export function unregisterWorkspace(workspace: BlocklyWorkspace): void {
    const record = registeredListeners.get(workspace.id);
    if (record) {
        record.workspace.removeChangeListener(record.listener);
        registeredListeners.delete(workspace.id);
    }
}

/**
 * Unregisters all workspaces.
 */
export function unregisterAllWorkspaces(): void {
    for (const [id, record] of registeredListeners) {
        record.workspace.removeChangeListener(record.listener);
        registeredListeners.delete(id);
    }
}

/**
 * Updates the logger configuration.
 * @param config - Configuration options to update
 */
export function updateConfig(config: Partial<BlocklyLoggerConfig>): void {
    currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current configuration.
 * @returns Current configuration
 */
export function getConfig(): BlocklyLoggerConfig {
    return { ...currentConfig };
}

/**
 * Resets configuration to defaults.
 */
export function resetConfig(): void {
    currentConfig = { ...defaultConfig };
}
