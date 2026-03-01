import React, { useState, useEffect } from 'react';
import { t } from '../../../i18n';
import { debugStore } from '../../../core/debugStore';
import bridge from '../../../services/bridge';
import { useGameInput } from '../../../hooks/useGameInput';
import './TracePanel.css';

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

    const { trace, logs } = storeState;

    return (
        <div className="debug-overlay" onClick={onClose}>
            <div className="debug-panel" onClick={(e) => e.stopPropagation()}>
                <header className="debug-header">
                    <h3>Maida Behavioral Trace</h3>
                    <button className="debug-close" onClick={onClose}>×</button>
                </header>

                <div className="debug-section">
                    <div className="debug-stats">
                        Total Games: <span className="highlight">{trace?.totalGames || 0}</span>
                    </div>

                    <h4>A) Simulation & Physics</h4>
                    <div className="debug-grid simulation-grid">
                        <div className="sim-row">
                            <label>Temp: <span className="highlight">{temperature.toFixed(1)}</span>
                                <span style={{ fontSize: '0.7em', marginLeft: '8px', color: '#888' }}>
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
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#888' }}>
                                <input
                                    type="checkbox"
                                    checked={silentMode}
                                    onChange={(e) => setSilentMode(e.target.checked)}
                                    style={{ accentColor: '#ffaa00' }}
                                />
                                Silent Mode (No Launch)
                            </label>
                        </div>
                        <div className="sim-actions">
                            <button onClick={() => onSimulation('simPlay')}>+1 TRY</button>
                            <button onClick={() => onSimulation('simSkip')}>-2 NOT NOW</button>
                            <button onClick={() => onSimulation('simDecay')}>Day Pass (-{decayRate}%)</button>
                            <button onClick={() => onSimulation('simReset')} style={{ color: '#ff4444', borderColor: '#ff4444' }}>Reset</button>
                            <button onClick={async () => {
                                if (confirm('Clear all data and restart setup?')) {
                                    await bridge.resetGamesData();
                                    window.location.reload();
                                }
                            }} style={{ color: '#ff4444', borderColor: '#ff4444' }}>{t('ui.debug.clear_games_btn')}</button>
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

                    <h4>C) Current State</h4>
                    <div className="debug-grid">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>ID: {game?.id || 'none'}</span>
                            {game?.steamAppId && onHideGame && (
                                <button
                                    onClick={() => onHideGame(game.steamAppId)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #333',
                                        color: '#666',
                                        fontSize: '0.7rem',
                                        padding: '2px 8px',
                                        cursor: 'pointer',
                                        borderRadius: '4px'
                                    }}
                                >
                                    Hide
                                </button>
                            )}
                        </div>
                        <div>Score: <span className="highlight">{(game?.score || 0).toFixed(2)}</span></div>
                        <div>Prob: {trace?.selected ? (parseFloat(trace.selected.weight) * 100).toFixed(2) + '%' : '-'}</div>
                        <div>Anchor: <span className="highlight">{isAnchored ? `⚓ ${game?.title || 'unknown'}` : 'none'}</span></div>
                        <div>Penalties ({(returnPenaltySet || []).length}/5): <span style={{ color: '#ff8800' }}>{
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
                            onClick={() => debugStore.clearLogs()}
                            style={{
                                background: 'transparent',
                                border: '1px solid #333',
                                color: '#666',
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}
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
                                    <span style={{ opacity: 0.5 }}>{log.change || ''}</span>
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
