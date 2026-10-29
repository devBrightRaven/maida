import React, { useState, useEffect, useRef } from 'react';
import { t, getLocale, setLocale, getSupportedLocales } from '../../../i18n';
import { loadPrescriptionTranslations } from '../../../i18n/prescriptions';
import { debugStore } from '../../../core/debugStore';
import bridge from '../../../services/bridge';
import { useGameInput } from '../../../hooks/useGameInput';
import './TracePanel.css';

const FONT_CONTROLS = [
    { label: 'Prescription', prop: '--prescription-size', min: 10, max: 32, def: 18 },
    { label: 'Game Title', prop: '--game-title-size', min: 10, max: 24, def: 16 },
    { label: 'Button', prop: '--button-size', min: 10, max: 32, def: 18 },
    { label: 'Button Hint', prop: '--button-hint-size', min: 8, max: 20, def: 12 },
    { label: 'Undo', prop: '--undo-size', min: 8, max: 20, def: 12 },
    { label: 'Label Reading', prop: '--label-reading-size', min: 8, max: 24, def: 14 },
    { label: 'Label Desc', prop: '--label-desc-size', min: 8, max: 20, def: 12 },
];

const FONT_STORAGE_KEY = 'maida-debug-font-sizes';

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function FontSizeTuner() {
    const [sizes, setSizes] = useState(() => {
        const defaults = Object.fromEntries(FONT_CONTROLS.map(c => [c.prop, c.def]));
        try {
            const saved = JSON.parse(localStorage.getItem(FONT_STORAGE_KEY));
            if (saved) return { ...defaults, ...saved };
        } catch {}
        return defaults;
    });

    // Apply saved values on mount
    useEffect(() => {
        Object.entries(sizes).forEach(([prop, val]) => {
            document.documentElement.style.setProperty(prop, val + 'px');
        });
    }, []);

    const handleChange = (prop, value) => {
        document.documentElement.style.setProperty(prop, value + 'px');
        const next = { ...sizes, [prop]: value };
        setSizes(next);
        try { localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(next)); } catch {}
    };

    return (
        <div className="debug-grid simulation-grid">
            {FONT_CONTROLS.map(({ label, prop, min, max }) => (
                <div className="sim-row" key={prop}>
                    <label>{label}: <span className="highlight">{sizes[prop]}px</span></label>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={1}
                        value={sizes[prop]}
                        onChange={(e) => handleChange(prop, parseInt(e.target.value, 10))}
                    />
                </div>
            ))}
        </div>
    );
}

export default function TracePanel({ game, temperature, decayRate, silentMode, setSilentMode, onSimulation, onClose, tapThreshold, anchorThreshold, resumeGuard, isAnchored, returnPenaltySet, onHideGame }) {
    // Local state to force re-render when store updates
    const [storeState, setStoreState] = useState({
        trace: debugStore.getTrace(),
        logs: debugStore.getLogs()
    });

    useEffect(() => {
        // Subscribe to store changes
        const unsubscribe = debugStore.subscribe(() => {
            setStoreState({
                trace: debugStore.getTrace(),
                logs: debugStore.getLogs()
            });
        });
        return unsubscribe;
    }, []);

    // Gamepad: B button closes panel
    useGameInput({
        onBack: onClose,
        onMainAction: () => {}, // Prevent A from triggering main view
        onNav: () => {}, // Absorb D-pad (panel uses mouse/touch for sliders)
        disabled: false
    });

    // BUG-015: move focus into the dialog on open. Restoring focus to the
    // TRACE button on close is RinView's job (it owns the opener).
    const panelRef = useRef(null);
    const closeBtnRef = useRef(null);
    useEffect(() => {
        closeBtnRef.current?.focus();
    }, []);

    // aria-modal="true" promises the rest of the page is out of reach, so
    // keep Tab / Shift+Tab inside the panel.
    const handleKeyDown = (e) => {
        if (e.key !== 'Tab' || !panelRef.current) return;
        const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
            .filter(el => !el.disabled && el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    const { trace, logs } = storeState;

    return (
        <div className="debug-overlay" onClick={onClose}>
            <div
                ref={panelRef}
                className="debug-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="debug-panel-title"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <header className="debug-header">
                    <h3 id="debug-panel-title">Maida Behavioral Trace</h3>
                    <button ref={closeBtnRef} className="debug-close" aria-label="Close debug trace panel" onClick={onClose}>
                        <span aria-hidden="true">×</span>
                    </button>
                </header>

                <div className="debug-section">
                    <div className="debug-stats">
                        Total Games: <span className="highlight">{trace?.totalGames || 0}</span>
                    </div>

                    <h4>A) Simulation & Physics</h4>
                    <div className="debug-grid simulation-grid">
                        <div className="sim-row">
                            <label>Temp: <span className="highlight">{temperature.toFixed(1)}</span>
                                <span className="debug-muted" style={{ fontSize: '0.7em', marginLeft: '8px' }}>
                                    {temperature < 0.8 ? '(Strict)' :
                                        temperature > 1.2 ? '(Chaotic)' :
                                            '(Balanced)'}
                                </span>
                            </label>
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => onSimulation('setTemp', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="sim-row">
                            <label>Decay: <span className="highlight">{decayRate}%</span></label>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="10"
                                value={decayRate}
                                onChange={(e) => onSimulation('setDecay', parseInt(e.target.value, 10))}
                            />
                        </div>
                        <div className="sim-row" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                            <label className="debug-muted" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={silentMode}
                                    onChange={(e) => setSilentMode(e.target.checked)}
                                />
                                Silent Mode (No Launch)
                            </label>
                        </div>
                        <div className="sim-row" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                            <label className="debug-muted" htmlFor="debug-locale-select">Locale: </label>
                            <select
                                id="debug-locale-select"
                                className="debug-select"
                                value={getLocale()}
                                onChange={async (e) => {
                                    setLocale(e.target.value);
                                    await loadPrescriptionTranslations();
                                    window.location.reload();
                                }}
                            >
                                {getSupportedLocales().map(l => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sim-actions">
                            <button onClick={() => onSimulation('simPlay')}>+1 TRY</button>
                            <button onClick={() => onSimulation('simSkip')}>-2 NOT NOW</button>
                            <button onClick={() => onSimulation('simDecay')}>Day Pass (-{decayRate}%)</button>
                            <button className="debug-danger" onClick={() => onSimulation('simReset')}>Reset</button>
                            <button onClick={async () => {
                                if (confirm('Clear all data and restart setup?')) {
                                    await bridge.resetGamesData();
                                    window.location.reload();
                                }
                            }} className="debug-danger">{t('ui.debug.clear_games_btn')}</button>
                            <button onClick={async () => {
                                await bridge.resetExploreLimit();
                                alert('Explore limit reset');
                            }} className="debug-warn">Reset Explore Limit</button>
                        </div>
                    </div>

                    <h4>B) Input Calibration (UX)</h4>
                    <div className="debug-grid simulation-grid">
                        <div className="sim-row">
                            <label>Tap Window: <span className="highlight">{tapThreshold}ms</span></label>
                            <input
                                type="range"
                                min="200"
                                max="1500"
                                step="50"
                                value={tapThreshold}
                                onChange={(e) => onSimulation('setTapThreshold', parseInt(e.target.value, 10))}
                            />
                        </div>
                        <div className="sim-row">
                            <label>Anchor Time: <span className="highlight">{(anchorThreshold / 1000).toFixed(1)}s</span></label>
                            <input
                                type="range"
                                min="2000"
                                max="10000"
                                step="500"
                                value={anchorThreshold}
                                onChange={(e) => onSimulation('setAnchorThreshold', parseInt(e.target.value, 10))}
                            />
                        </div>
                        <div className="sim-row">
                            <label>Resume Guard: <span className="highlight">{(resumeGuard / 1000).toFixed(1)}s</span></label>
                            <input
                                type="range"
                                min="500"
                                max="10000"
                                step="500"
                                value={resumeGuard}
                                onChange={(e) => onSimulation('setResumeGuard', parseInt(e.target.value, 10))}
                            />
                        </div>
                    </div>

                    <h4>B2) Font Size Tuning</h4>
                    <FontSizeTuner />

                    <h4>C) Current State</h4>
                    <div className="debug-grid">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>ID: {game?.id || 'none'}</span>
                            {game?.steamAppId && onHideGame && (
                                <button
                                    className="debug-mini-btn"
                                    onClick={() => onHideGame(game.steamAppId)}
                                >
                                    Hide
                                </button>
                            )}
                        </div>
                        <div>Score: <span className="highlight">{(game?.score || 0).toFixed(2)}</span></div>
                        <div>Prob: {trace?.selected ? (parseFloat(trace.selected.weight) * 100).toFixed(2) + '%' : '-'}</div>
                        <div>Anchor: <span className="highlight">{isAnchored ? `⚓ ${game?.title || 'unknown'}` : 'none'}</span></div>
                        <div>Penalties ({(returnPenaltySet || []).length}/5): <span className="debug-warn-text">{
                            (returnPenaltySet || []).length === 0 ? 'none' :
                            (returnPenaltySet || []).map(id => {
                                const c = trace?.candidates?.find(c => c.id === id);
                                return c?.title || id;
                            }).join(', ')
                        }</span></div>
                    </div>
                </div>

                <div className="debug-section">
                    <h4>D) Sampling Trace (Last Draw)</h4>
                    {trace ? (
                        <div className="trace-details">
                            <div className="trace-meta">T: {trace.temperature}</div>
                            <div className="trace-scroll-container">
                                <table className="trace-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Game</th>
                                            <th>Score</th>
                                            <th>Prob %</th>
                                            <th>Penalties</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trace.candidates.map((c, index) => (
                                            <tr key={c.id} className={c.id === game?.id ? 'active' : ''}>
                                                <td className="rank-col">{index + 1}</td>
                                                <td>{c.title || c.id}</td>
                                                <td>{c.score}</td>
                                                <td>{c.weight}</td>
                                                <td><small>{c.penalty || '-'}</small></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : <div>No trace captured.</div>}
                </div>

                <div className="debug-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ marginBottom: 0 }}>E) Event Log</h4>
                        <button
                            className="debug-mini-btn"
                            onClick={() => debugStore.clearLogs()}
                        >
                            Clear
                        </button>
                    </div>
                    <div className="debug-logs">
                        {logs.map(log => (
                            <div key={log.id} className="log-entry">
                                <span className="log-time">[{log.timestamp}]</span>
                                <span className="log-event" data-event={log.event}>{log.event}</span>
                                <span className="log-details">
                                    {log.title ? `${log.title} ` : (log.gameId || '')}
                                    <span className="log-change">{log.change || ''}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="debug-bottom-actions">
                    <button className="debug-copy" onClick={() => {
                        const fullTrace = JSON.stringify({ trace, logs }, null, 2);
                        navigator.clipboard.writeText(fullTrace);
                        alert('Trace copied to clipboard');
                    }}>
                        Copy Full Trace
                    </button>
                    <button className="debug-copy" onClick={async () => {
                        const result = await bridge.exportSessionLog();
                        if (result?.success) {
                            alert(`Session log exported to:\n${result.path}`);
                        } else if (!result?.canceled) {
                            alert('Export failed: ' + (result?.error || 'unknown error'));
                        }
                    }}>
                        Export Session Log
                    </button>
                </div>
            </div>
        </div>
    );
}
