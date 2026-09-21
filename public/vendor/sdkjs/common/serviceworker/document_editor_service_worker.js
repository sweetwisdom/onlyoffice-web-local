/*
 * Copyright (C) Ascensio System SIA, 2009-2026
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation, together with the
 * additional terms provided in the LICENSE file.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. For
 * details, see the GNU AGPL at: https://www.gnu.org/licenses/agpl-3.0.html
 *
 * You can contact Ascensio System SIA by email at info@onlyoffice.com
 * or by postal mail at 20A-6 Ernesta Birznieka-Upisha Street, Riga,
 * LV-1050, Latvia, European Union.
 *
 * The interactive user interfaces in modified versions of the Program
 * are required to display Appropriate Legal Notices in accordance with
 * Section 5 of the GNU AGPL version 3.
 *
 * No trademark rights are granted under this License.
 *
 * All non-code elements of the Product, including illustrations,
 * icon sets, and technical writing content, are licensed under the
 * Creative Commons Attribution-ShareAlike 4.0 International License:
 * https://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 * This license applies only to such non-code elements and does not
 * modify or replace the licensing terms applicable to the Program's
 * source code, which remains licensed under the GNU Affero General
 * Public License v3.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

"use strict";

let g_version = "0.0.0-0";//"localhost:8000" for develop version
const pathnameParts = self.location.pathname.split('/');
if (pathnameParts.length > 1 && pathnameParts[pathnameParts.length - 2]) {
	g_version = pathnameParts[pathnameParts.length - 2];
}
const g_cacheNamePrefix = 'document_editor_static_';
const g_cacheName = g_cacheNamePrefix + g_version;
const g_cacheablePrefixes = [
	"web-apps/",
	"sdkjs/",
	"fonts/",
	"sdkjs-plugins/",
	"dictionaries/"
];
const isDesktopEditor = navigator.userAgent.indexOf("AscDesktopEditor") !== -1;
let g_storageInfoCache = null;
let g_storageInfoCacheTime = 0;
const STORAGE_INFO_CACHE_DURATION = 30000; // 30 seconds

// === FIFO Cache for Dynamic Document Files ===
// Used for cache/files/data/ URLs (including WOPI integration where WOPISrc may be reused).
// TTL-based invalidation: all files for a docid are evicted after docIdTTL from first cache.
// Timestamp stored in X-Cache-Time response header (no separate metadata cache needed).
const g_fifoCachePrefix = 'document_editor_dynamic_';
const g_fifoCacheName = g_fifoCachePrefix + g_version;
const g_fifoPrefix = 'cache/files/data/';
const g_fifoDocIdParams = ['shardkey', 'WOPISrc'];
const g_fifoCacheTimeHeader = 'X-Cache-Time';
const g_fifoConfig = {
	maxDocIds: 3,                         // max unique docids to keep
	maxEntrySize: 500 * 1024 * 1024,      // 500 MB per file
	docIdTTL: 10 * 60 * 1000              // 10 minutes TTL for docid (in ms)
};

/**
 * Extract docid from URL query parameters (shardkey or WOPISrc)
 * @param {string} url
 * @returns {string|null} docid or null if not a FIFO-cacheable URL
 */
function fifoExtractDocId(url) {
	// Must contain cache/files/data/ path
	if (url.indexOf('/' + g_fifoPrefix) === -1) return null;
	
	const queryIdx = url.indexOf('?');
	if (queryIdx === -1) return null;
	
	const queryString = url.substring(queryIdx + 1);
	const params = queryString.split('&');
	
	for (let i = 0; i < params.length; i++) {
		const pair = params[i].split('=');
		if (pair[1] && g_fifoDocIdParams.indexOf(pair[0]) !== -1) {
			return decodeURIComponent(pair[1]);
		}
	}
	
	return null;
}

/**
 * Get oldest cache timestamp for a docid from cached response headers
 * @param {Array} keys - array of Request objects for this docid
 * @param {Cache} cache - opened cache instance
 * @returns {Promise<number>} oldest timestamp or 0 if not found
 */
function fifoGetOldestTimestamp(keys, cache) {
	if (!keys || keys.length === 0) {
		return Promise.resolve(0);
	}
	
	// Check first cached entry for this docid (oldest by insertion order)
	return cache.match(keys[0]).then(function(response) {
		if (!response) return 0;
		const timeStr = response.headers.get(g_fifoCacheTimeHeader);
		return timeStr ? parseInt(timeStr, 10) : 0;
	}).catch(function() {
		return 0;
	});
}

/**
 * Create a response with cache timestamp header
 * @param {Response} response - original response to clone with timestamp
 * @returns {Response} new response with X-Cache-Time header
 */
function fifoAddTimestamp(response) {
	const headers = new Headers(response.headers);
	headers.set(g_fifoCacheTimeHeader, Date.now().toString());
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: headers
	});
}

/**
 * Cache a large file with FIFO eviction by docid
 * @param {Request} request
 * @param {string} docid - pre-extracted docid
 * @param {Response} response
 * @returns {Promise}
 */
function fifoCacheFile(request, docid, response) {
	return caches.open(g_fifoCacheName).then(function(cache) {
		return cache.keys().then(function(keys) {
			// Group keys by docid, preserving insertion order
			const docidOrder = [];  // ordered list of unique docids
			const docidKeys = {};   // docid -> [keys]
			
			for (let i = 0; i < keys.length; i++) {
				const keyDocid = fifoExtractDocId(keys[i].url);
				if (keyDocid) {
					if (!docidKeys[keyDocid]) {
						docidKeys[keyDocid] = [];
						docidOrder.push(keyDocid);
					}
					docidKeys[keyDocid].push(keys[i]);
				}
			}
			
			// Check if current docid's cache has expired
			return fifoGetOldestTimestamp(docidKeys[docid], cache).then(function(oldestTime) {
				const isExpired = oldestTime > 0 && (Date.now() - oldestTime) > g_fifoConfig.docIdTTL;
				const evictions = [];
				
				// If docid exists but TTL expired, delete all its files
				if (docidKeys[docid] && isExpired) {
					const expiredKeys = docidKeys[docid];
					for (let j = 0; j < expiredKeys.length; j++) {
						evictions.push(cache.delete(expiredKeys[j]));
					}
					// Remove from docidOrder to fix count
					const idx = docidOrder.indexOf(docid);
					if (idx !== -1) {
						docidOrder.splice(idx, 1);
					}
					delete docidKeys[docid];
				}
				
				// If this docid is not in cache and we're at limit, evict oldest docid
				if (!docidKeys[docid] && docidOrder.length >= g_fifoConfig.maxDocIds) {
					const oldestDocid = docidOrder[0];
					const oldestKeys = docidKeys[oldestDocid];
					for (let k = 0; k < oldestKeys.length; k++) {
						evictions.push(cache.delete(oldestKeys[k]));
					}
				}
				
				return Promise.all(evictions).then(function() {
					// Add timestamp header and cache the file
					const timestampedResponse = fifoAddTimestamp(response);
					return cache.put(request, timestampedResponse);
				});
			});
		});
	}).catch(function(err) {
		console.error('fifoCacheFile failed:', err);
	});
}

/**
 * Get file from FIFO cache
 * @param {Request} request
 * @returns {Promise<Response|undefined>}
 */
function fifoGetFromCache(request) {
	return caches.open(g_fifoCacheName).then(function(cache) {
		return cache.match(request);
	}).catch(function() {
		return undefined; // Cache miss on error
	});
}

/**
 * Quick check if URL might use FIFO cache (cache/files/data URLs)
 * @param {string} url
 * @returns {boolean}
 */
function shouldUseFifoCache(url) {
	return url.indexOf('/' + g_fifoPrefix) !== -1;
}

/**
 * Check if a response is safe to cache
 * @param {Request} request
 * @param {Response} response
 * @returns {boolean} true if response can be safely cached
 */
function safeToCache(request, response) {
	return request.method === 'GET'                                 // only GET requests
		&& response
		&& response.ok                                              // status 200-299. todo 0 or 1223?
		&& (response.type === 'basic' || response.type === 'cors')  // same-origin or CORS
		&& !response.redirected;                  	                // no 30x redirect chain
}

/**
 * Get storage information (size limits and health) with single API call
 * @returns {Promise<{maxEntrySize: number, isHealthy: boolean}>} Storage info
 */
function getStorageInfo() {
	const now = Date.now();
	if (g_storageInfoCache !== null && (now - g_storageInfoCacheTime) < STORAGE_INFO_CACHE_DURATION) {
		return Promise.resolve(g_storageInfoCache);
	}
	
	if (!navigator.storage || !navigator.storage.estimate) {
		// Fallback values if API not available
		g_storageInfoCache = {
			maxEntrySize: 50 * 1024 * 1024,
			isHealthy: true
		};
		g_storageInfoCacheTime = now;
		return Promise.resolve(g_storageInfoCache);
	}
	
	return navigator.storage.estimate()
		.then(function(estimate) {
			// Validate estimate fields; fall back if missing or invalid
			if (!estimate || typeof estimate.quota !== 'number' || !isFinite(estimate.quota) || estimate.quota <= 0 ||
				typeof estimate.usage !== 'number' || !isFinite(estimate.usage)) {
				g_storageInfoCache = {
					maxEntrySize: 50 * 1024 * 1024,
					isHealthy: true
				};
				g_storageInfoCacheTime = Date.now();
				return g_storageInfoCache;
			}
			// Calculate max entry size: cache ≈ 10% of quota, cap entry at 1/8th
			const cacheSize = Math.min(estimate.quota * 0.10, 1024 * 1024 * 1024); // 1 GiB max
			const maxEntrySize = cacheSize / 8; // Per-entry cap is 1/8th of cache size
			
			// Calculate storage health: back off when disk is 80% full
			const usageRatio = estimate.usage / estimate.quota;
			const isHealthy = usageRatio < 0.8;
			
			g_storageInfoCache = { maxEntrySize: maxEntrySize, isHealthy: isHealthy };
			g_storageInfoCacheTime = Date.now();
			return g_storageInfoCache;
		})
		.catch(function(error) {
			// Fallback values on error
			g_storageInfoCache = {
				maxEntrySize: 50 * 1024 * 1024,
				isHealthy: true
			};
			g_storageInfoCacheTime = Date.now();
			return g_storageInfoCache;
		});
}

/**
 * Put response in cache with retry logic for transient errors
 * @param {Request} request
 * @param {Response} response - Response to cache; this function clones per attempt to preserve the original for retries
 * @param {number} attempt - Current attempt number (for retry logic)
 * @returns {Promise} Promise that resolves when caching completes or fails
 */
function putInCache(request, response, attempt) {
	if (typeof attempt === 'undefined') attempt = 0;
	return caches.open(g_cacheName)
		.then(function(cache) {
			// Clone at the moment of caching so the provided response remains pristine for retries
			return cache.put(request, response.clone());
		})
		.catch(function(err) {
			// Transient quota/disk hiccup? Retry up to 2x with exponential back-off
			if (attempt < 2) {
				return new Promise(function(resolve) {
					setTimeout(resolve, 250 * Math.pow(2, attempt)); // 250ms, 500ms
				})
				.then(function() {
					// Reuse the original unconsumed response; a fresh clone will be created inside cache.put
					return putInCache(request, response, attempt + 1);
				});
			} else {
				const size = response.headers ? response.headers.get('content-length') : 'unknown';
				console.error('putInCache failed after max retries:', {
					url: request.url,
					method: request.method,
					responseSize: size,
					responseType: response.type,
					cacheName: g_cacheName,
					error: err && (err.message || err)
				});
			}
		});
}

function cacheFirst(event) {
	const request = event.request;
	const url = request.url;
	const fifoDocId = fifoExtractDocId(url);
	
	// Try FIFO cache first for large file prefixes
	const cachePromise = fifoDocId
		? fifoGetFromCache(request)
		: caches.match(request, { cacheName: g_cacheName });
	
	return cachePromise
		.then(function(cached) {
			return cached || fetch(request).then(function(networkResp) {
				// Clone immediately to avoid "body already used" errors
				const responseForCache = networkResp.clone();
				
				// Fire-and-forget caching **after** responding to the page
				if (safeToCache(request, networkResp)) {
					event.waitUntil(
						getStorageInfo()
						.then(function(info) {
							if (!info.isHealthy) return;
							
							const size = Number(networkResp.headers.get('content-length')) || 0;
							
							if (fifoDocId) {
								// Use FIFO cache
								if (size === 0 || size <= g_fifoConfig.maxEntrySize) {
									return fifoCacheFile(request, fifoDocId, responseForCache);
								}
							} else {
								// Use regular cache
								if (size === 0 || size < info.maxEntrySize) {
									return putInCache(request, responseForCache);
								}
							}
						})
					);
				}
				return networkResp;
			}).catch(function(err) {
				console.error('cacheFirst network fetch failed:', {
					url: request.url,
					method: request.method,
					cacheName: g_cacheName,
					error: err && (err.message || err)
				});
				return new Response('', {
					status: 504,
					statusText: 'Gateway Timeout'
				});
			});
		});
}
function activateWorker(event) {
	return self.clients.claim()
		.then(function(){
			//remove stale caches
			return caches.keys();
		})
		.then(function (keys) {
			const deletePromises = keys
				.filter(function(cache) {
					// Remove old static caches
					const isOldStatic = cache.startsWith(g_cacheNamePrefix) && cache !== g_cacheName;
					// Remove old dynamic caches
					const isOldDynamic = cache.startsWith(g_fifoCachePrefix) && cache !== g_fifoCacheName;
					return isOldStatic || isOldDynamic;
				})
				.map(function(cache) {
					return caches.delete(cache);
				});
			return Promise.all(deletePromises);
		}).catch(function (err) {
			console.error('activateWorker failed with ' + err);
		});
}
/**
 * Filter function for cacheable paths
 * @param {string} url
 * @returns {boolean}
 */
function matchesCacheablePath(url) {
	const g_versionNeedle = "/" + g_version + "/";
	const versionIndex = url.indexOf(g_versionNeedle);
	if (versionIndex === -1) return false;

	// Position just after "/<version>/"
	const i = versionIndex + g_versionNeedle.length;

	for (let k = 0; k < g_cacheablePrefixes.length; k++) {
		//startsWith not supported in ie11 but at first service worker not supported
		if (url.startsWith(g_cacheablePrefixes[k], i)) {
			return true;
		}
	}
	return false;
}

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(activateWorker());
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = request.url;
	
	// Only handle GET requests
	if (request.method !== "GET") {
		return;
	}

	// Do not intercept editor entry pages. The reference package does not
	// install a root-scoped worker, so these navigations are served directly.
	if (request.mode === "navigate" || request.headers.get("accept") && request.headers.get("accept").indexOf("text/html") !== -1) {
		return;
	}
	
	// Check if URL is cacheable (versioned static files OR FIFO cache files)
	const isCacheablePath = matchesCacheablePath(url);
	const isFifoPath = shouldUseFifoCache(url);
	
	if (!isCacheablePath && !isFifoPath) {
		return;
	}

	// Desktop editor exclusion
	if (isDesktopEditor && url.indexOf("/sdkjs/common/AllFonts.js") !== -1) {
		return;
	}

	event.respondWith(cacheFirst(event));
});
