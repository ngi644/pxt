/**
 * Code snapshot capture for xAPI operation logging.
 * Captures Blockly XML and TypeScript/Python source code.
 */

import { CodeSnapshot, SnapshotFormat } from "./types";
import { sha256, compressAndEncode } from "./utils";

/**
 * Gets the Blockly module from PXT.
 * @returns Blockly namespace or null if not available
 */
function getBlockly(): BlocklyNamespace | null {
    try {
        // PXT exposes Blockly via pxt.blocks.requireBlockly()
        const pxtBlocks = (window as unknown as { pxt?: { blocks?: { requireBlockly?: () => BlocklyNamespace } } }).pxt?.blocks;
        if (pxtBlocks?.requireBlockly) {
            return pxtBlocks.requireBlockly();
        }
        // Fallback to window.Blockly for non-PXT environments
        return (window as unknown as { Blockly?: BlocklyNamespace }).Blockly || null;
    } catch {
        return null;
    }
}

/**
 * Creates a code snapshot from raw content.
 * Compresses the content using gzip and encodes as Base64.
 * @param content - The raw code content
 * @param format - The format of the code
 * @returns The code snapshot object
 */
export async function createSnapshot(
    content: string,
    format: SnapshotFormat
): Promise<CodeSnapshot> {
    const size = new TextEncoder().encode(content).length;
    const hash = await sha256(content);
    const compressed = await compressAndEncode(content);

    return {
        format,
        content: compressed,
        hash,
        size,
    };
}

/**
 * Captures Blockly workspace as XML snapshot.
 * @param workspace - The Blockly workspace object
 * @returns The code snapshot or null if capture fails
 */
export async function captureBlocklySnapshot(
    workspace: unknown
): Promise<CodeSnapshot | null> {
    try {
        const Blockly = getBlockly();
        if (!Blockly || !workspace) {
            return null;
        }

        // Serialize workspace to XML
        const xml = Blockly.Xml.workspaceToDom(workspace as BlocklyWorkspace);
        const xmlText = Blockly.Xml.domToText(xml);

        return createSnapshot(xmlText, "blockly-xml");
    } catch {
        return null;
    }
}

/**
 * Captures TypeScript source code snapshot.
 * @param source - The TypeScript source code
 * @returns The code snapshot
 */
export async function captureTypeScriptSnapshot(
    source: string
): Promise<CodeSnapshot> {
    return createSnapshot(source, "typescript");
}

/**
 * Captures Python source code snapshot.
 * @param source - The Python source code
 * @returns The code snapshot
 */
export async function capturePythonSnapshot(source: string): Promise<CodeSnapshot> {
    return createSnapshot(source, "python");
}

/**
 * Captures code snapshot based on editor mode.
 * @param mode - The current editor mode
 * @param source - Source code for text modes, workspace for blocks mode
 * @returns The code snapshot or null if capture fails
 */
export async function captureCodeSnapshot(
    mode: "blocks" | "typescript" | "python",
    source: string | unknown
): Promise<CodeSnapshot | null> {
    try {
        switch (mode) {
            case "blocks":
                return captureBlocklySnapshot(source);
            case "typescript":
                if (typeof source === "string") {
                    return captureTypeScriptSnapshot(source);
                }
                return null;
            case "python":
                if (typeof source === "string") {
                    return capturePythonSnapshot(source);
                }
                return null;
            default:
                return null;
        }
    } catch {
        return null;
    }
}

/**
 * Compares two snapshots to check if content changed.
 * Uses hash comparison for efficiency.
 * @param snapshot1 - First snapshot
 * @param snapshot2 - Second snapshot
 * @returns True if snapshots have different content
 */
export function snapshotsChanged(
    snapshot1: CodeSnapshot | null,
    snapshot2: CodeSnapshot | null
): boolean {
    if (!snapshot1 || !snapshot2) {
        return snapshot1 !== snapshot2;
    }
    return snapshot1.hash !== snapshot2.hash;
}

/**
 * Gets the current code from Blockly workspace as text.
 * @param workspace - The Blockly workspace
 * @returns XML string or null
 */
export function getBlocklyXml(workspace: unknown): string | null {
    try {
        const Blockly = getBlockly();
        if (!Blockly || !workspace) {
            return null;
        }

        const xml = Blockly.Xml.workspaceToDom(workspace as BlocklyWorkspace);
        return Blockly.Xml.domToText(xml);
    } catch {
        return null;
    }
}

/**
 * Type definitions for Blockly integration.
 */
interface BlocklyWorkspace {
    id: string;
}

interface BlocklyNamespace {
    Xml: {
        workspaceToDom(workspace: BlocklyWorkspace): Element;
        domToText(dom: Element): string;
    };
}
