/**
 * xAPI Verb definitions for operation logging.
 */

import { Verb, VerbId, VerbDisplay } from "./types";

/**
 * Verb definition with ID and display name mapping.
 */
interface VerbDefinition {
    id: VerbId;
    display: VerbDisplay;
}

/**
 * All defined verbs for operation logging.
 */
const VERB_DEFINITIONS: Record<VerbDisplay, VerbDefinition> = {
    placed: {
        id: "urn:xapi:picapica-2d:verb:placed",
        display: "placed",
    },
    removed: {
        id: "urn:xapi:picapica-2d:verb:removed",
        display: "removed",
    },
    edited: {
        id: "urn:xapi:picapica-2d:verb:edited",
        display: "edited",
    },
    executed: {
        id: "urn:xapi:picapica-2d:verb:executed",
        display: "executed",
    },
    downloaded: {
        id: "urn:xapi:picapica-2d:verb:downloaded",
        display: "downloaded",
    },
    saved: {
        id: "urn:xapi:picapica-2d:verb:saved",
        display: "saved",
    },
    opened: {
        id: "urn:xapi:picapica-2d:verb:opened",
        display: "opened",
    },
    closed: {
        id: "urn:xapi:picapica-2d:verb:closed",
        display: "closed",
    },
    moved: {
        id: "urn:xapi:picapica-2d:verb:moved",
        display: "moved",
    },
    connected: {
        id: "urn:xapi:picapica-2d:verb:connected",
        display: "connected",
    },
    disconnected: {
        id: "urn:xapi:picapica-2d:verb:disconnected",
        display: "disconnected",
    },
    nested: {
        id: "urn:xapi:picapica-2d:verb:nested",
        display: "nested",
    },
    selected: {
        id: "urn:xapi:picapica-2d:verb:selected",
        display: "selected",
    },
};

/**
 * Creates a Verb object from a display name.
 * @param name - The verb display name
 * @returns The complete Verb object
 */
export function createVerb(name: VerbDisplay): Verb {
    const definition = VERB_DEFINITIONS[name];
    return {
        id: definition.id,
        display: {
            "en-US": definition.display,
        },
    };
}

/**
 * Pre-constructed Verb objects for common operations.
 */
export const Verbs = {
    /** Block placed in workspace (created) */
    PLACED: createVerb("placed"),
    /** Block removed from workspace (deleted) */
    REMOVED: createVerb("removed"),
    /** Code or field edited */
    EDITED: createVerb("edited"),
    /** Program executed */
    EXECUTED: createVerb("executed"),
    /** Program downloaded to device */
    DOWNLOADED: createVerb("downloaded"),
    /** Project saved */
    SAVED: createVerb("saved"),
    /** Project or editor opened */
    OPENED: createVerb("opened"),
    /** Editor closed */
    CLOSED: createVerb("closed"),
    /** Block moved (position changed) */
    MOVED: createVerb("moved"),
    /** Block connected to another block (接合) */
    CONNECTED: createVerb("connected"),
    /** Block disconnected from another block (切り離し) */
    DISCONNECTED: createVerb("disconnected"),
    /** Block nested into input of another block (内包) */
    NESTED: createVerb("nested"),
    /** Block selected */
    SELECTED: createVerb("selected"),
} as const;

/**
 * Gets a Verb by its ID.
 * @param id - The verb ID URI
 * @returns The complete Verb object or undefined if not found
 */
export function getVerbById(id: VerbId): Verb | undefined {
    for (const name of Object.keys(VERB_DEFINITIONS) as VerbDisplay[]) {
        if (VERB_DEFINITIONS[name].id === id) {
            return createVerb(name);
        }
    }
    return undefined;
}

/**
 * Checks if a string is a valid verb ID.
 * @param id - The string to check
 * @returns True if the string is a valid VerbId
 */
export function isValidVerbId(id: string): id is VerbId {
    return Object.values(VERB_DEFINITIONS).some((def) => def.id === id);
}
