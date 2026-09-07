/**
 * User-facing errors are deliberately generic. SDK and node errors can carry
 * request details, endpoint information, or other data that must not be
 * copied to a console, bridge page, or UI notification.
 */
export const SAFE_OPERATION_ERROR = 'The operation could not be completed. Please try again.';
export const SAFE_UNLOCK_ERROR = 'Unable to unlock the wallet. Check the password and node.';
export const SAFE_NODE_ERROR = 'Unable to connect to the selected node.';
