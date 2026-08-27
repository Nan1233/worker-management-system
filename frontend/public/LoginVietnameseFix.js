/*
 * Deprecated compatibility shim.
 *
 * This file is intentionally inert. The previous implementation used a
 * MutationObserver + textContent changes to translate React-rendered nodes.
 * That mutates the DOM outside React and can cause React 19 to throw:
 * "Failed to execute 'removeChild' on 'Node'".
 *
 * Login labels and mobile input behavior must be implemented in Login.tsx,
 * so React remains the single owner of the login DOM tree.
 */
(function () {
  "use strict";
})();
