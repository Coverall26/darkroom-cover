/**
 * Provides a wrapper around localStorage and sessionStorage to avoid errors
 * in case of restricted storage access (e.g. third-party context in Chrome
 * Incognito, or when storage limits are reached).
 *
 * For embedded (third-party) contexts where localStorage is unavailable,
 * the wrapper gracefully returns null / no-ops rather than throwing.
 */
export const localStorage = {
    getItem(key: string) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            // In case storage is restricted. Possible reasons
            // 1. Third Party Context in Chrome Incognito mode.
            return null;
        }
    },
    setItem(key: string, value: string) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            // In case storage is restricted. Possible reasons
            // 1. Third Party Context in Chrome Incognito mode.
            // 2. Storage limit reached
            return;
        }
    },
    removeItem: (key: string) => {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            return;
        }
    },
};
