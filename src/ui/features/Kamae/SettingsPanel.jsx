import { useState, useEffect, useCallback } from 'react';
import { t } from '../../../i18n';
import { validateKeyFormat, formatLicenseKey } from '../../../core/license';
import bridge from '../../../services/bridge';

/**
 * SettingsPanel — inline panel for IGDB credential management.
 * Renders inside KamaeView when settings is toggled open.
 */
export default function SettingsPanel({ onClose }) {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [hasExisting, setHasExisting] = useState(false);
    const [showSecretInput, setShowSecretInput] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
    const [testing, setTesting] = useState(false);

    // Telemetry state
    const [telemetryEnabled, setTelemetryEnabled] = useState(true);

    // License state
    const [licenseKey, setLicenseKey] = useState('');
    const [licenseActive, setLicenseActive] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState(null);

    // Load existing credentials + license on mount
    useEffect(() => {
        (async () => {
            const creds = await bridge.loadIgdbCredentials();
            if (creds && creds.clientId) {
                setClientId(creds.clientId);
                setHasExisting(true);
            }
            const key = await bridge.loadLicenseKey();
            if (key) {
                setLicenseKey(key);
                setLicenseActive(true);
            }
            const telEnabled = await bridge.getTelemetryEnabled();
            setTelemetryEnabled(telEnabled);
        })();
    }, []);

    const handleTest = useCallback(async () => {
        setTesting(true);
        setStatus(null);
        try {
            const result = await bridge.testIgdbCredentials(clientId, clientSecret);
            if (result && result.success) {
                setStatus({ type: 'success', message: t('ui.settings.test_success') });
            } else {
                setStatus({ type: 'error', message: t('ui.settings.test_fail') });
            }
        } catch {
            setStatus({ type: 'error', message: t('ui.settings.test_fail') });
        }
        setTesting(false);
    }, [clientId, clientSecret]);

    const handleSave = useCallback(async () => {
        setStatus(null);
        const result = await bridge.saveIgdbCredentials(clientId, clientSecret);
        if (result && result.success) {
            setHasExisting(true);
            setShowSecretInput(false);
            setStatus({ type: 'success', message: t('ui.settings.credentials_saved') });
        } else {
            setStatus({ type: 'error', message: result?.error || 'Save failed' });
        }
    }, [clientId, clientSecret]);

    const handleClear = useCallback(async () => {
        setStatus(null);
        const result = await bridge.clearIgdbCredentials();
        if (result && result.success) {
            setClientId('');
            setClientSecret('');
            setHasExisting(false);
            setShowSecretInput(false);
            setStatus({ type: 'success', message: t('ui.settings.credentials_cleared') });
        }
    }, []);

    const handleLicenseActivate = useCallback(async () => {
        setLicenseStatus(null);
        if (!validateKeyFormat(licenseKey)) {
            setLicenseStatus({ type: 'error', message: t('ui.settings.license.error_format') });
            return;
        }
        const result = await bridge.saveLicenseKey(licenseKey);
        if (result && result.success) {
            setLicenseActive(true);
            setLicenseStatus({ type: 'success', message: t('ui.settings.license.success') });
        } else {
            setLicenseStatus({ type: 'error', message: result?.error || 'Activation failed' });
        }
    }, [licenseKey]);

    const secretDisplay = hasExisting && !showSecretInput;

    return (
        <section className="kamae-settings">
            <header className="kamae-settings-header">
                <h1 className="kamae-settings-title">{t('ui.settings.title')}</h1>
            </header>

            <section className="kamae-settings-section" aria-labelledby="settings-igdb-title">
                <h2 id="settings-igdb-title" className="kamae-settings-section-title">{t('ui.settings.igdb_title')}</h2>
                <p id="igdb-desc" className="kamae-settings-section-desc">{t('ui.settings.igdb_desc')}</p>

                <div className="kamae-settings-field">
                    <label htmlFor="igdb-client-id" className="kamae-settings-label">
                        {t('ui.settings.client_id')}
                    </label>
                    <input
                        id="igdb-client-id"
                        type="text"
                        className="kamae-settings-input"
                        value={clientId}
                        onChange={e => setClientId(e.target.value)}
                        autoComplete="off"
                        aria-describedby="igdb-desc"
                    />
                </div>

                <div className="kamae-settings-field">
                    <label htmlFor="igdb-client-secret" className="kamae-settings-label">
                        {t('ui.settings.client_secret')}
                    </label>
                    {secretDisplay ? (
                        <div className="kamae-settings-masked">
                            <span className="kamae-settings-masked-text">{'****'}</span>
                            <button
                                type="button"
                                className="kamae-settings-change-btn"
                                onClick={() => {
                                    setShowSecretInput(true);
                                    setClientSecret('');
                                }}
                            >
                                {t('ui.settings.change')}
                            </button>
                        </div>
                    ) : (
                        <input
                            id="igdb-client-secret"
                            type="password"
                            aria-describedby="igdb-desc"
                            className="kamae-settings-input"
                            value={clientSecret}
                            onChange={e => setClientSecret(e.target.value)}
                            autoComplete="off"
                        />
                    )}
                </div>

                <div className="kamae-settings-actions">
                    <button
                        type="button"
                        className="kamae-settings-btn"
                        onClick={handleTest}
                        disabled={testing || !clientId || (!clientSecret && !hasExisting)}
                    >
                        {t('ui.settings.test')}
                    </button>
                    <button
                        type="button"
                        className="kamae-settings-btn"
                        onClick={handleSave}
                        disabled={!clientId || !clientSecret}
                    >
                        {t('ui.settings.save')}
                    </button>
                    <button
                        type="button"
                        className="kamae-settings-btn kamae-settings-btn--danger"
                        onClick={handleClear}
                        disabled={!hasExisting}
                    >
                        {t('ui.settings.clear')}
                    </button>
                </div>

                {status && (
                    <p
                        className={`kamae-settings-status kamae-settings-status--${status.type}`}
                        role="status"
                        aria-live="polite"
                    >
                        {status.message}
                    </p>
                )}
            </section>

            {/* License section hidden for v0.1.0 — no paywall */}
            {false && <section className="kamae-settings-section">
                <h2 className="kamae-settings-section-title">{t('ui.settings.license.title')}</h2>
                <p className="kamae-settings-section-desc">
                    {licenseActive
                        ? t('ui.settings.license.desc_active')
                        : t('ui.settings.license.desc_inactive')}
                </p>

                <div className="kamae-settings-field">
                    <label htmlFor="license-key" className="kamae-settings-label">
                        {t('ui.settings.license.label')}
                    </label>
                    <input
                        id="license-key"
                        type="text"
                        className="kamae-settings-input"
                        value={licenseKey}
                        onChange={e => setLicenseKey(formatLicenseKey(e.target.value))}
                        placeholder="MAIDA-XXXXX-XXXXX-XXXXX"
                        disabled={licenseActive}
                        autoComplete="off"
                    />
                </div>

                {!licenseActive && (
                    <div className="kamae-settings-actions">
                        <button
                            type="button"
                            className="kamae-settings-btn"
                            onClick={handleLicenseActivate}
                            disabled={!licenseKey}
                        >
                            {t('ui.settings.license.activate')}
                        </button>
                    </div>
                )}

                {licenseStatus && (
                    <p
                        className={`kamae-settings-status kamae-settings-status--${licenseStatus.type}`}
                        role="status"
                        aria-live="polite"
                    >
                        {licenseStatus.message}
                    </p>
                )}
            </section>}

            <section className="kamae-settings-section" aria-labelledby="settings-telemetry-title">
                <h2 id="settings-telemetry-title" className="kamae-settings-section-title">{t('ui.telemetry.title')}</h2>
                <p className="kamae-settings-section-desc">{t('ui.telemetry.desc')}</p>

                <div className="kamae-settings-field">
                    <label className="kamae-settings-toggle">
                        <input
                            type="checkbox"
                            checked={telemetryEnabled}
                            onChange={async (e) => {
                                const val = e.target.checked;
                                setTelemetryEnabled(val);
                                await bridge.setTelemetryEnabled(val);
                            }}
                        />
                        <span>{t('ui.telemetry.enabled')}</span>
                    </label>
                </div>

                <p className="kamae-settings-section-desc kamae-settings-privacy">
                    {t('ui.telemetry.privacy')}
                </p>
            </section>

            <button
                type="button"
                className="kamae-settings-back-btn"
                onClick={onClose}
            >
                {t('ui.settings.back')}
            </button>
        </section>
    );
}
