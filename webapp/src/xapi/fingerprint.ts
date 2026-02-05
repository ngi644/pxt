/**
 * Browser fingerprint generation for pseudo-anonymous Actor identification.
 * Uses built-in browser APIs (Canvas, WebGL) without external dependencies.
 *
 * User identification priority:
 * 1. URL parameter: ?user_id=student001
 * 2. localStorage: xapi_user_id
 * 3. Browser fingerprint (auto-generated hash)
 */

import { Actor } from "./types";
import { sha256 } from "./utils";
import { DEFAULT_ACTOR_HOME_PAGE } from "./config";

/**
 * Cached fingerprint to avoid recalculation.
 */
let cachedFingerprint: string | null = null;

/**
 * Cached explicit user ID (from URL or localStorage).
 */
let cachedUserId: string | null = null;

/**
 * Storage key for explicit user ID.
 */
const USER_ID_STORAGE_KEY = "xapi_user_id";

/**
 * Gets URL parameter value.
 */
function getUrlParam(name: string): string | null {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    } catch {
        return null;
    }
}

/**
 * Gets the explicit user ID from URL parameter or localStorage.
 * URL parameter takes precedence and is stored in localStorage for persistence.
 * @returns User ID or null if not explicitly set
 */
export function getExplicitUserId(): string | null {
    if (cachedUserId !== null) {
        return cachedUserId || null;
    }

    // Check URL parameter first
    const urlUserId = getUrlParam("user_id");
    if (urlUserId) {
        cachedUserId = urlUserId;
        // Store in localStorage for persistence across page loads
        try {
            localStorage.setItem(USER_ID_STORAGE_KEY, urlUserId);
        } catch {
            // localStorage not available
        }
        return cachedUserId;
    }

    // Check localStorage
    try {
        const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
        if (storedUserId) {
            cachedUserId = storedUserId;
            return cachedUserId;
        }
    } catch {
        // localStorage not available
    }

    // Mark as checked but not found
    cachedUserId = "";
    return null;
}

/**
 * Clears the explicit user ID from cache and localStorage.
 * After clearing, the system will fall back to browser fingerprint.
 */
export function clearExplicitUserId(): void {
    cachedUserId = null;
    try {
        localStorage.removeItem(USER_ID_STORAGE_KEY);
    } catch {
        // localStorage not available
    }
}

/**
 * Collects browser characteristics for fingerprinting.
 */
interface BrowserCharacteristics {
    userAgent: string;
    language: string;
    languages: string[];
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number | undefined;
    screenResolution: string;
    screenColorDepth: number;
    timezoneOffset: number;
    timezone: string;
    sessionStorage: boolean;
    localStorage: boolean;
    indexedDB: boolean;
    cookieEnabled: boolean;
    canvasFingerprint: string;
    webglFingerprint: string;
    webglVendor: string;
    webglRenderer: string;
    touchSupport: {
        maxTouchPoints: number;
        touchEvent: boolean;
    };
    fonts: string[];
}

/**
 * Collects all available browser characteristics.
 * @returns Browser characteristics object
 */
async function collectCharacteristics(): Promise<BrowserCharacteristics> {
    const nav = navigator as Navigator & {
        deviceMemory?: number;
    };

    return {
        userAgent: nav.userAgent,
        language: nav.language,
        languages: Array.from(nav.languages || []),
        platform: nav.platform,
        hardwareConcurrency: nav.hardwareConcurrency || 0,
        deviceMemory: nav.deviceMemory,
        screenResolution: `${screen.width}x${screen.height}`,
        screenColorDepth: screen.colorDepth,
        timezoneOffset: new Date().getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        sessionStorage: hasSessionStorage(),
        localStorage: hasLocalStorage(),
        indexedDB: hasIndexedDB(),
        cookieEnabled: nav.cookieEnabled,
        canvasFingerprint: getCanvasFingerprint(),
        webglFingerprint: getWebGLFingerprint(),
        webglVendor: getWebGLVendor(),
        webglRenderer: getWebGLRenderer(),
        touchSupport: getTouchSupport(),
        fonts: await detectFonts(),
    };
}

/**
 * Checks if sessionStorage is available.
 */
function hasSessionStorage(): boolean {
    try {
        const key = "__fp_test__";
        sessionStorage.setItem(key, key);
        sessionStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if localStorage is available.
 */
function hasLocalStorage(): boolean {
    try {
        const key = "__fp_test__";
        localStorage.setItem(key, key);
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if indexedDB is available.
 */
function hasIndexedDB(): boolean {
    try {
        return !!indexedDB;
    } catch {
        return false;
    }
}

/**
 * Generates a canvas fingerprint.
 */
function getCanvasFingerprint(): string {
    try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";

        canvas.width = 200;
        canvas.height = 50;

        // Draw various elements to create unique fingerprint
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(10, 1, 62, 20);

        ctx.fillStyle = "#069";
        ctx.fillText("MakeCode FP", 2, 15);

        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("MakeCode FP", 4, 17);

        // Add gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, "red");
        gradient.addColorStop(0.5, "green");
        gradient.addColorStop(1, "blue");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 30, 200, 10);

        return canvas.toDataURL();
    } catch {
        return "";
    }
}

/**
 * Generates a WebGL fingerprint.
 */
function getWebGLFingerprint(): string {
    try {
        const canvas = document.createElement("canvas");
        const gl =
            canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return "";

        const glContext = gl as WebGLRenderingContext;

        // Collect WebGL parameters
        const params = [
            glContext.getParameter(glContext.VERSION),
            glContext.getParameter(glContext.SHADING_LANGUAGE_VERSION),
            glContext.getParameter(glContext.MAX_VERTEX_ATTRIBS),
            glContext.getParameter(glContext.MAX_VERTEX_UNIFORM_VECTORS),
            glContext.getParameter(glContext.MAX_FRAGMENT_UNIFORM_VECTORS),
            glContext.getParameter(glContext.MAX_TEXTURE_SIZE),
            glContext.getParameter(glContext.MAX_CUBE_MAP_TEXTURE_SIZE),
            glContext.getParameter(glContext.MAX_RENDERBUFFER_SIZE),
        ];

        return params.join("~");
    } catch {
        return "";
    }
}

/**
 * Gets WebGL vendor string.
 */
function getWebGLVendor(): string {
    try {
        const canvas = document.createElement("canvas");
        const gl =
            canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return "";

        const glContext = gl as WebGLRenderingContext;
        const debugInfo = glContext.getExtension("WEBGL_debug_renderer_info");
        if (!debugInfo) return "";

        return glContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
    } catch {
        return "";
    }
}

/**
 * Gets WebGL renderer string.
 */
function getWebGLRenderer(): string {
    try {
        const canvas = document.createElement("canvas");
        const gl =
            canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return "";

        const glContext = gl as WebGLRenderingContext;
        const debugInfo = glContext.getExtension("WEBGL_debug_renderer_info");
        if (!debugInfo) return "";

        return glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
    } catch {
        return "";
    }
}

/**
 * Gets touch support information.
 */
function getTouchSupport(): { maxTouchPoints: number; touchEvent: boolean } {
    return {
        maxTouchPoints: navigator.maxTouchPoints || 0,
        touchEvent: "ontouchstart" in window,
    };
}

/**
 * Detects available fonts using canvas measurement.
 */
async function detectFonts(): Promise<string[]> {
    const baseFonts = ["monospace", "sans-serif", "serif"];
    const testFonts = [
        "Arial",
        "Courier New",
        "Georgia",
        "Helvetica",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
        "Comic Sans MS",
        "Impact",
        "Lucida Console",
    ];

    const detectedFonts: string[] = [];

    try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return [];

        const testString = "mmmmmmmmmmlli";
        const testSize = "72px";

        // Get base font widths
        const baseWidths: Record<string, number> = {};
        for (const baseFont of baseFonts) {
            ctx.font = `${testSize} ${baseFont}`;
            baseWidths[baseFont] = ctx.measureText(testString).width;
        }

        // Test each font
        for (const font of testFonts) {
            let detected = false;
            for (const baseFont of baseFonts) {
                ctx.font = `${testSize} '${font}', ${baseFont}`;
                const width = ctx.measureText(testString).width;
                if (width !== baseWidths[baseFont]) {
                    detected = true;
                    break;
                }
            }
            if (detected) {
                detectedFonts.push(font);
            }
        }
    } catch {
        // Ignore font detection errors
    }

    return detectedFonts;
}

/**
 * Generates a browser fingerprint hash.
 * The hash is consistent for the same browser/device combination.
 * @returns 64-character hex string (SHA-256 hash)
 */
export async function generateFingerprint(): Promise<string> {
    if (cachedFingerprint) {
        return cachedFingerprint;
    }

    try {
        const characteristics = await collectCharacteristics();
        const fingerprintString = JSON.stringify(characteristics);
        cachedFingerprint = await sha256(fingerprintString);
        return cachedFingerprint;
    } catch {
        // Fallback: generate a random identifier and store it
        cachedFingerprint = await generateFallbackFingerprint();
        return cachedFingerprint;
    }
}

/**
 * Generates a fallback fingerprint using random values.
 * Stores in localStorage for consistency across sessions.
 */
async function generateFallbackFingerprint(): Promise<string> {
    const storageKey = "xapi_actor_fingerprint";

    try {
        const stored = localStorage.getItem(storageKey);
        if (stored && stored.length === 64) {
            return stored;
        }
    } catch {
        // localStorage not available
    }

    // Generate new fingerprint
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const fingerprint = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    try {
        localStorage.setItem(storageKey, fingerprint);
    } catch {
        // Could not store fingerprint
    }

    return fingerprint;
}

/**
 * Creates an Actor object using explicit user ID or browser fingerprint.
 *
 * Priority:
 * 1. URL parameter: ?user_id=student001
 * 2. localStorage: xapi_user_id
 * 3. Browser fingerprint (auto-generated hash)
 *
 * @param homePage - Optional custom home page URL
 * @returns Actor object with identification
 */
export async function createActor(homePage?: string): Promise<Actor> {
    // Check for explicit user ID first
    const explicitUserId = getExplicitUserId();
    const actorName = explicitUserId || await generateFingerprint();

    return {
        account: {
            homePage: homePage || DEFAULT_ACTOR_HOME_PAGE,
            name: actorName,
        },
    };
}

/**
 * Clears the cached fingerprint.
 * Useful for testing or when fingerprint needs to be regenerated.
 */
export function clearFingerprintCache(): void {
    cachedFingerprint = null;
}
