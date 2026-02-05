/**
 * xAPI Logger Configuration Defaults
 *
 * This file contains default configuration values for the xAPI logger.
 * Edit these values to change the default behavior without modifying code.
 *
 * Configuration priority (highest to lowest):
 * 1. localStorage (xapi_endpoint, xapi_token, xapi_enabled)
 * 2. Window globals (window.__XAPI_ENDPOINT__, window.__XAPI_TOKEN__)
 * 3. These defaults
 */

/**
 * Default telemetry server endpoint.
 * Uses relative path for production (Firebase Hosting proxies to Cloud Run).
 * For local development, override via URL param: ?xapi_endpoint=http://localhost:3000/api/xapi/statements
 */
export const DEFAULT_ENDPOINT = "/api/xapi/statements";

/**
 * Default authentication token.
 * IMPORTANT: Change this in production!
 */
export const DEFAULT_TOKEN = "please_change_me";

/**
 * Actor home page URL (used in xAPI statements).
 */
export const DEFAULT_ACTOR_HOME_PAGE = "https://picapica-2d.web.app";

/**
 * Default batch size for sending statements.
 */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * Default batch timeout in milliseconds.
 */
export const DEFAULT_BATCH_TIMEOUT = 5000;

/**
 * Default offline buffer enabled state.
 */
export const DEFAULT_OFFLINE_BUFFER_ENABLED = true;

/**
 * Default maximum offline statements to buffer.
 */
export const DEFAULT_MAX_OFFLINE_STATEMENTS = 1000;
