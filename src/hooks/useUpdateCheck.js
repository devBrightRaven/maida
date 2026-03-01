import { useState, useEffect } from 'react';
import bridge from '../services/bridge';

/**
 * Silent update checker hook.
 * Checks GitHub Releases for new versions on mount (fire-and-forget).
 * Never disrupts — state is only consumed by the version tag area.
 */
export function useUpdateCheck() {
    const [updateState, setUpdateState] = useState({
        currentVersion: null,
        latestVersion: null,
        isUpdateAvailable: false,
        releaseUrl: null,
        checkedAt: null,
        error: null
    });

    const check = async (force = false) => {
        try {
            const version = await bridge.getAppVersion();
            const result = await bridge.checkForUpdates(force ? { force: true } : undefined);

            if (result) {
                // Update available
                setUpdateState({
                    currentVersion: result.currentVersion || version,
                    latestVersion: result.latestVersion,
                    isUpdateAvailable: true,
                    releaseUrl: result.releaseUrl,
                    checkedAt: new Date().toISOString(),
                    error: null
                });
            } else {
                // No update (or dev mode — returns null)
                setUpdateState({
                    currentVersion: version,
                    latestVersion: null,
                    isUpdateAvailable: false,
                    releaseUrl: null,
                    checkedAt: new Date().toISOString(),
                    error: null
                });
            }
        } catch {
            setUpdateState(prev => ({
                ...prev,
                error: 'Unable to check'
            }));
        }
    };

    useEffect(() => {
        check(false);
    }, []);

    return {
        ...updateState,
        recheckNow: () => check(true)
    };
}
