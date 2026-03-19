import { useState, useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Silent update checker hook.
 * Uses tauri-plugin-updater to check GitHub Releases.
 * Never disrupts — state is only consumed by the version tag area.
 */
export function useUpdateCheck() {
    const [updateState, setUpdateState] = useState({
        isUpdateAvailable: false,
        latestVersion: null,
        updating: false,
        error: null
    });

    useEffect(() => {
        (async () => {
            try {
                const update = await check();
                if (update) {
                    setUpdateState({
                        isUpdateAvailable: true,
                        latestVersion: update.version,
                        updating: false,
                        error: null
                    });
                }
            } catch {
                // Silent — dev mode or network failure
            }
        })();
    }, []);

    const installUpdate = async () => {
        try {
            setUpdateState(prev => ({ ...prev, updating: true }));
            const update = await check();
            if (update) {
                await update.downloadAndInstall();
                await relaunch();
            }
        } catch {
            setUpdateState(prev => ({ ...prev, updating: false, error: 'Update failed' }));
        }
    };

    return { ...updateState, installUpdate };
}
