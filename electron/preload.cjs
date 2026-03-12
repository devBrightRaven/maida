const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maidaAPI', {
    getData: (type) => ipcRenderer.invoke('get-data', type),
    saveData: (type, data) => ipcRenderer.invoke('save-data', type, data),
    syncLibrary: () => ipcRenderer.invoke('sync-library'),
    requestOnboardingSync: () => ipcRenderer.invoke('request-onboarding-sync'),
    performBackgroundSnapshot: () => ipcRenderer.invoke('perform-background-snapshot'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    checkSteamAvailable: () => ipcRenderer.invoke('check-steam-available'),
    resetGamesData: () => ipcRenderer.invoke('reset-games-data'),
    // Showcase & Warehouse
    getShowcase: () => ipcRenderer.invoke('get-showcase'),
    saveShowcase: (data) => ipcRenderer.invoke('save-showcase', data),
    searchWarehouse: (query) => ipcRenderer.invoke('search-warehouse', query),
    sampleWarehouse: (excludeIds) => ipcRenderer.invoke('sample-warehouse', excludeIds),
    // Session Log
    appendSessionLog: (entry) => ipcRenderer.invoke('append-session-log', entry),
    exportSessionLog: () => ipcRenderer.invoke('export-session-log'),
    // Update API
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openReleasePage: (url) => ipcRenderer.invoke('open-release-page', url),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isElectron: true
});


