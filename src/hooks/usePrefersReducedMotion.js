import { useState, useEffect } from 'react';

/**
 * Reflects the OS-level `prefers-reduced-motion` setting. Updates
 * live when the user toggles the setting while the app is open.
 */
export function usePrefersReducedMotion() {
    const [prefers, setPrefers] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e) => setPrefers(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return prefers;
}
