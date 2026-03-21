import React from 'react';
import { t } from '../../../i18n';
import { localizePrescription } from '../../../i18n/prescriptions';
import './GameDisplay.css';

export default function GameDisplay({ game, prescription: rawPrescription, debugMode, isExpanded, onSecretTap }) {
    if (!rawPrescription) return null;
    const prescription = localizePrescription(rawPrescription);

    return (
        <section className="mvp-content" aria-label={t('ui.rin.prescription_heading')}>
            <h2 className="sr-only">{t('ui.rin.prescription_heading')}</h2>
            <div className={`permission-wrapper ${debugMode ? 'debug-ready' : ''}`}>
                <p className={`permission-text ${debugMode ? 'debug-text' : ''}`} role="status">
                    {prescription.interface}
                </p>

                {debugMode && prescription.audit && (
                    <div className="debug-inspector">
                        <span className={`risk-dot ${prescription.audit.risk}`}></span>
                        <div className="inspector-panel">
                            <div className="inspector-header">
                                <span className="inspector-title">{t('ui.debug.inspector_title')}</span>
                                <span className="inspector-separator">&nbsp;</span>
                                <span className="inspector-id">{prescription.id}</span>
                            </div>
                            {game && (
                                <div className="inspector-row">
                                    <label>Game ID</label>
                                    <span className="value">{game.id}</span>
                                </div>
                            )}

                            <div className="inspector-row">
                                <label>Momentum</label>
                                <span className="value">{prescription.momentum}</span>
                            </div>
                            <div className="inspector-row">
                                <label>Effect</label>
                                <span className="value highlight-effect">{prescription.audit.permission_effect}</span>
                            </div>
                            <div className="inspector-row">
                                <label>Risk</label>
                                <span className={`value risk-text ${prescription.audit.risk}`}>{prescription.audit.risk}</span>
                            </div>
                            <div className="inspector-notes">{prescription.audit.notes}</div>
                        </div>
                    </div>
                )}
            </div>

            {debugMode && isExpanded && (
                <section className="debug-expanded-details">
                    <div className="expanded-header">
                        <span className="expanded-title">Diagnostic Deep-Dive</span>
                        <span className="expanded-id">{prescription.id}</span>
                    </div>
                    <div className="detail-group">
                        <label>Kernel Source</label>
                        <code className="kernel-code">{prescription.kernel}</code>
                    </div>
                    <div className="detail-group">
                        <label>Interface Output</label>
                        <p className="interface-preview">{prescription.interface}</p>
                    </div>
                </section>
            )}
        </section>
    );
}
