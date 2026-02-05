/**
 * xAPI Activity type definitions for operation logging.
 */

import { Activity, ActivityDefinition, ActivityType, LanguageMap } from "./types";

/**
 * Activity type URIs.
 */
export const ActivityTypes = {
    /** Blockly block */
    BLOCK: "urn:xapi:picapica-2d:activity-type:block" as ActivityType,
    /** Source code */
    CODE: "urn:xapi:picapica-2d:activity-type:code" as ActivityType,
    /** Project */
    PROJECT: "urn:xapi:picapica-2d:activity-type:project" as ActivityType,
    /** Target device (e.g., micro:bit) */
    DEVICE: "urn:xapi:picapica-2d:activity-type:device" as ActivityType,
} as const;

/**
 * Base URI for activity identifiers.
 */
const ACTIVITY_BASE_URI = "urn:xapi:picapica-2d:";

/**
 * Creates an Activity ID URI from a type and identifier.
 * @param type - The activity type (block, code, project, device)
 * @param identifier - The specific identifier within that type
 * @returns The complete activity ID URI
 */
export function createActivityId(
    type: "block" | "code" | "project" | "device",
    identifier: string
): string {
    return `${ACTIVITY_BASE_URI}${type}:${identifier}`;
}

/**
 * Creates a block Activity for Blockly block operations.
 * @param blockType - The Blockly block type (e.g., "basic_showString")
 * @param blockName - Human-readable block name (optional)
 * @param extensions - Additional block properties (optional)
 * @returns The complete Activity object
 */
export function createBlockActivity(
    blockType: string,
    blockName?: string,
    extensions?: Record<string, unknown>
): Activity {
    const definition: ActivityDefinition = {
        type: ActivityTypes.BLOCK,
    };

    if (blockName) {
        definition.name = { "en-US": blockName };
    }

    if (extensions) {
        definition.extensions = extensions;
    }

    return {
        id: createActivityId("block", blockType),
        definition,
    };
}

/**
 * Creates a code Activity for text editor operations.
 * @param projectId - The project identifier
 * @param filename - The file being edited (optional)
 * @param extensions - Additional properties (optional)
 * @returns The complete Activity object
 */
export function createCodeActivity(
    projectId: string,
    filename?: string,
    extensions?: Record<string, unknown>
): Activity {
    const definition: ActivityDefinition = {
        type: ActivityTypes.CODE,
    };

    if (filename) {
        definition.name = { "en-US": filename };
    }

    if (extensions) {
        definition.extensions = extensions;
    }

    return {
        id: createActivityId("code", projectId),
        definition,
    };
}

/**
 * Creates a project Activity for project-level operations.
 * @param projectId - The project identifier
 * @param projectName - Human-readable project name (optional)
 * @param extensions - Additional properties (optional)
 * @returns The complete Activity object
 */
export function createProjectActivity(
    projectId: string,
    projectName?: string,
    extensions?: Record<string, unknown>
): Activity {
    const definition: ActivityDefinition = {
        type: ActivityTypes.PROJECT,
    };

    if (projectName) {
        definition.name = { "en-US": projectName };
    }

    if (extensions) {
        definition.extensions = extensions;
    }

    return {
        id: createActivityId("project", projectId),
        definition,
    };
}

/**
 * Creates a device Activity for download operations.
 * @param deviceType - The device type (e.g., "microbit-v2")
 * @param deviceName - Human-readable device name (optional)
 * @param extensions - Additional properties (optional)
 * @returns The complete Activity object
 */
export function createDeviceActivity(
    deviceType: string,
    deviceName?: string,
    extensions?: Record<string, unknown>
): Activity {
    const definition: ActivityDefinition = {
        type: ActivityTypes.DEVICE,
    };

    if (deviceName) {
        definition.name = { "en-US": deviceName };
    }

    if (extensions) {
        definition.extensions = extensions;
    }

    return {
        id: createActivityId("device", deviceType),
        definition,
    };
}

/**
 * Checks if a string is a valid activity type URI.
 * @param type - The string to check
 * @returns True if the string is a valid ActivityType
 */
export function isValidActivityType(type: string): type is ActivityType {
    return Object.values(ActivityTypes).includes(type as ActivityType);
}

/**
 * Parses an activity ID to extract type and identifier.
 * @param activityId - The activity ID URI
 * @returns Object with type and identifier, or null if invalid
 */
export function parseActivityId(
    activityId: string
): { type: string; identifier: string } | null {
    if (!activityId.startsWith(ACTIVITY_BASE_URI)) {
        return null;
    }

    const remainder = activityId.slice(ACTIVITY_BASE_URI.length);
    const colonIndex = remainder.indexOf(":");

    if (colonIndex === -1) {
        return null;
    }

    return {
        type: remainder.slice(0, colonIndex),
        identifier: remainder.slice(colonIndex + 1),
    };
}
