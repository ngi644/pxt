/**
 * Utility functions for xAPI operation logging.
 */

// Type declarations for Compression Streams API (not in all TypeScript libs)
declare const CompressionStream: {
    prototype: GenericTransformStream;
    new (format: "gzip" | "deflate" | "deflate-raw"): GenericTransformStream;
} | undefined;

declare const DecompressionStream: {
    prototype: GenericTransformStream;
    new (format: "gzip" | "deflate" | "deflate-raw"): GenericTransformStream;
} | undefined;

interface GenericTransformStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
}

/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID if available, otherwise falls back to manual generation.
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback for environments without crypto.randomUUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Generates a current ISO 8601 timestamp.
 * @returns ISO 8601 formatted timestamp string
 */
export function generateTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Converts a duration in milliseconds to ISO 8601 duration format.
 * @param ms - Duration in milliseconds
 * @returns ISO 8601 duration string (e.g., "PT1.5S")
 */
export function formatDuration(ms: number): string {
    const seconds = ms / 1000;
    return `PT${seconds}S`;
}

/**
 * Validates a UUID format.
 * @param uuid - The string to validate
 * @returns True if the string is a valid UUID
 */
export function isValidUUID(uuid: string): boolean {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validates an ISO 8601 timestamp format.
 * @param timestamp - The string to validate
 * @returns True if the string is a valid ISO 8601 timestamp
 */
export function isValidTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && timestamp === date.toISOString();
}

/**
 * Calculates SHA-256 hash of a string.
 * @param content - The string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compresses a string using gzip and returns Base64 encoded result.
 * Uses CompressionStream API with fallback.
 * @param content - The string to compress
 * @returns Base64 encoded gzip compressed data
 */
export async function compressAndEncode(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    if (typeof CompressionStream !== "undefined") {
        const cs = new CompressionStream("gzip");
        const writer = cs.writable.getWriter();
        writer.write(data);
        writer.close();

        const reader = cs.readable.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return arrayBufferToBase64(result);
    }

    // Fallback: store uncompressed but Base64 encoded
    // This maintains compatibility but loses compression benefit
    return btoa(content);
}

/**
 * Decompresses Base64 encoded gzip data to string.
 * @param encoded - Base64 encoded gzip compressed data
 * @returns Decompressed string
 */
export async function decodeAndDecompress(encoded: string): Promise<string> {
    if (typeof DecompressionStream !== "undefined") {
        const data = base64ToArrayBuffer(encoded);

        const ds = new DecompressionStream("gzip");
        const writer = ds.writable.getWriter();
        writer.write(data);
        writer.close();

        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        const decoder = new TextDecoder();
        return decoder.decode(result);
    }

    // Fallback: assume uncompressed Base64
    return atob(encoded);
}

/**
 * Converts ArrayBuffer to Base64 string.
 * @param buffer - The ArrayBuffer or Uint8Array to convert
 * @returns Base64 encoded string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Converts Base64 string to Uint8Array.
 * @param base64 - The Base64 encoded string
 * @returns Uint8Array
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Debounces a function call.
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Throttles a function call.
 * @param fn - The function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => void>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const remaining = limit - (now - lastCall);

        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            fn(...args);
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                fn(...args);
            }, remaining);
        }
    };
}
