'use strict';

/**
 * Browser-based content extraction via Chrome DevTools Protocol.
 *
 * This module provides graceful degradation when a local Chrome/Chromium
 * instance is not available. The extractor's fallback chain will skip
 * browser extraction and move to the next strategy.
 *
 * To enable browser extraction, replace this stub with a full CDP
 * implementation that connects to a Chrome debug port (default 9222).
 */

/**
 * Check whether a local Chrome/Chromium debug instance is reachable.
 * Returns false by default — browser extraction is opt-in.
 * @returns {boolean}
 */
function isBrowserAvailable() {
  return false;
}

/**
 * Extract page content via browser automation.
 * @param {string} url - The URL to extract content from.
 * @throws {Error} Always throws in the stub — browser extraction is not configured.
 * @returns {Promise<{content: string, title: string}>}
 */
async function extractViaBrowser(url) {
  throw new Error(
    'Browser extraction is not available. Install Chrome/Chromium and replace ' +
    'this stub with a CDP implementation to enable browser-based fallback extraction. ' +
    `Attempted URL: ${url}`
  );
}

module.exports = { isBrowserAvailable, extractViaBrowser };

