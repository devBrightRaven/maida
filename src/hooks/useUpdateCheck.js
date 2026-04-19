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
            } catch (err) {
                // Keep silent in UI (dev mode or network failure is expected),
                // but preserve diagnostic trail on the console. Without this,
                // real bugs in the updater pipeline (e.g. missing Tauri plugin
                // registration) are invisible even with DevTools open.
                console.warn('[useUpdateCheck] background check failed:', err);
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
        } catch (err) {
            // Surface the underlying reason to the console so "Update failed"
            // in the UI is debuggable. The previous bare catch hid a missing
            // tauri-plugin-process registration for months — don't repeat that.
            console.error('[useUpdateCheck] installUpdate failed:', err);
            setUpdateState(prev => ({ ...prev, updating: false, error: 'Update failed' }));
        }
    };

    return { ...updateState, installUpdate };
}
