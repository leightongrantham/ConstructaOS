/**
 * Demo entry: mount SiteLookup into a container. Built by Vite; expects React and ReactDOM on window.
 * Uses legacy ReactDOM.render so the standard React 18 UMD script works (createRoot is not in main UMD).
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { SiteLookup } from '@constructaos/site-lookup';

/**
 * Mount the SiteLookup React component into the given container.
 * @param {HTMLElement} container - Element to mount into (e.g. document.getElementById('site-lookup-react-root'))
 * @param {object} options
 * @param {string} options.apiBaseUrl - Base URL for the ai-render-service API (use '' for same-origin)
 * @param {(result: import('@constructaos/site-lookup').SiteLookupResult) => void} options.onLookupComplete - Called when user confirms footprint / uses site
 * @returns {function(): void} Unmount function
 */
export function mountSiteLookup(container, options) {
  if (!container) return function noop() {};
  ReactDOM.render(
    React.createElement(SiteLookup, {
      apiBaseUrl: options.apiBaseUrl,
      onLookupComplete: options.onLookupComplete,
      placeholder: options.placeholder || 'Enter address or postcode',
      lookupButtonLabel: options.lookupButtonLabel || 'Lookup',
    }),
    container
  );
  return function unmount() {
    ReactDOM.unmountComponentAtNode(container);
  };
}

// Expose on window for the harness (script tag load)
if (typeof window !== 'undefined') {
  window.ConstructaOS = window.ConstructaOS || {};
  window.ConstructaOS.mountSiteLookup = mountSiteLookup;
}
