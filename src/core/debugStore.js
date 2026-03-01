/**
 * Maida Behavioral Debug Store (In-Memory)
 * Stores recent events and sampling traces for developer visibility.
 */

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
