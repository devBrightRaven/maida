/**
 * Maida Behavioral Debug Store (In-Memory)
 * Stores recent events and sampling traces for developer visibility.
 * Also persists entries to session log file via bridge (append-only JSONL).
 */

import bridge from '../services/bridge.js';

let logs = [];
let lastTrace = null;

export const debugStore = {
    log: (event, details) => {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString(),
            event,
            ...details
        };
        logs.unshift(entry);
        if (logs.length > 50) logs.pop();

        // Also log to console for dev convenience
        console.log(`[Maida DBG] ${event}`, details);

        // Persist to session log file (fire-and-forget)
        const { id, timestamp, ...persistEntry } = entry;
        bridge.appendSessionLog({ event, ...persistEntry });
    },

    setTrace: (trace) => {
        lastTrace = {
            ...trace,
            timestamp: new Date().toLocaleTimeString()
        };
        debugStore.notify();
    },

    getLogs: () => logs,
    getTrace: () => lastTrace,

    clear: () => {
        logs = [];
        lastTrace = null;
        debugStore.notify();
    },

    clearLogs: () => {
        logs = [];
        debugStore.notify();
    },

    // Simple Pub/Sub
    listeners: new Set(),
    subscribe: (callback) => {
        debugStore.listeners.add(callback);
        return () => debugStore.listeners.delete(callback);
    },
    notify: () => {
        debugStore.listeners.forEach(cb => cb());
    }
};
