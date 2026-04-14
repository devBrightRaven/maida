import { useState, useEffect, useCallback, useRef } from 'react';
import { t, getLocale, setLocale } from '../../../i18n';
import { getIntensity, setIntensity, vibrate } from '../../../services/haptics';
import { validateKeyFormat, formatLicenseKey } from '../../../core/license';
import bridge from '../../../services/bridge';
import VersionTag from '../../VersionTag';

/**
 * SettingsPanel — inline panel for IGDB credential management.
 * Renders inside KamaeView when settings is toggled open.
 */
export default function SettingsPanel({ onClose, theme, toggleTheme, onLocaleChange, onTourStart, onNavigateLegal, replayTourBtnRef, updateCheck, updateAlertShown }) {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [hasExisting, setHasExisting] = useState(false);
    const [showSecretInput, setShowSecretInput] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
    const [testing, setTesting] = useState(false);

    // Language state
    const [currentLang, setCurrentLang] = useState(getLocale());
    const [pendingLang, setPendingLang] = useState(getLocale());
    const [langExpanded, setLangExpanded] = useState(false);
    const [hapticExpanded, setHapticExpanded] = useState(false);
    const [controlsExpanded, setControlsExpanded] = useState(false);

    // Haptic state
    const [hapticLevel, setHapticLevel] = useState(getIntensity());

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

    const titleRef = useRef(null);
    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    // Set aria-setsize/aria-posinset on each rendered section after mount,
    // so SR users hear "section N of M" as they navigate. CSS counter handles
    // the visual prefix; here we mirror the count to the accessibility tree.
    const settingsRootRef = useRef(null);
    useEffect(() => {
        const sections = settingsRootRef.current?.querySelectorAll(':scope > .kamae-settings-section');
        if (!sections) return;
        sections.forEach((s, i) => {
            s.setAttribute('aria-setsize', String(sections.length));
            s.setAttribute('aria-posinset', String(i + 1));
        });
    });

    return (
        <section className="kamae-settings" ref={settingsRootRef}>
            <header className="kamae-settings-header">
                <h1 className="kamae-settings-title" ref={titleRef} tabIndex={-1}>{t('ui.settings.title')}</h1>
                <button
                    type="button"
                    className="kamae-settings-back-btn"
                    onClick={onClose}
                >
                    {t('ui.settings.back')}
                </button>
            </header>

            {onTourStart && (
                <section className="kamae-settings-section" aria-labelledby="settings-tour-title">
                    <h2 id="settings-tour-title" className="kamae-settings-section-title">{t('ui.settings.tour_title')}</h2>
                    <button
                        ref={replayTourBtnRef}
                        type="button"
                        className="kamae-settings-btn"
                        onClick={() => { onClose(); onTourStart(); }}
                    >
                        {t('ui.settings.tour_replay')}
                    </button>
                </section>
            )}

            <section className="kamae-settings-section">
                <button
                    type="button"
                    className="kamae-settings-disclosure"
                    aria-expanded={langExpanded}
                    aria-controls="language-options"
                    onClick={() => {
                        setLangExpanded(prev => {
                            if (prev) setPendingLang(currentLang);
                            return !prev;
                        });
                    }}
                >
                    <h2 className="kamae-settings-section-title">
                        {t('ui.settings.language_title', { current: { en: 'English', ja: '日本語', 'zh-CN': '简体中文', 'zh-TW': '繁體中文' }[currentLang] || currentLang })}
                        <span className="kamae-settings-chevron" aria-hidden="true">{langExpanded ? '▾' : '▸'}</span>
                    </h2>
                </button>
                {langExpanded && (
                    <div id="language-options" className="kamae-settings-lang-list">
                        {[
                            { value: 'en', label: 'English' },
                            { value: 'ja', label: '日本語' },
                            { value: 'zh-CN', label: '简体中文' },
                            { value: 'zh-TW', label: '繁體中文' },
                        ].map(({ value, label }) => {
                            const isCurrent = currentLang === value;
                            const isPending = pendingLang === value && pendingLang !== currentLang;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    className={`kamae-settings-lang-btn ${isCurrent ? 'kamae-settings-lang-btn--current' : ''} ${isPending ? 'kamae-settings-lang-btn--pending' : ''}`}
                                    aria-pressed={isCurrent}
                                    aria-label={isPending ? `${label}, ${t('ui.settings.language_confirm')}` : label}
                                    onClick={() => {
                                        if (isPending) {
                                            setCurrentLang(value);
                                            setLocale(value);
                                            if (onLocaleChange) onLocaleChange();
                                        } else {
                                            setPendingLang(value);
                                        }
                                    }}
                                >
                                    <span>{label}</span>
                                    {isPending && <span className="kamae-settings-lang-confirm" aria-hidden="true">{t('ui.settings.language_confirm')}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="kamae-settings-section">
                <button
                    type="button"
                    className="kamae-settings-disclosure"
                    aria-expanded={hapticExpanded}
                    aria-controls="haptic-options"
                    onClick={() => setHapticExpanded(prev => !prev)}
                >
                    <h2 className="kamae-settings-section-title">
                        {t('ui.settings.haptic_title', { current: [
                            { value: 0, label: t('ui.settings.haptic_off') },
                            { value: 30, label: t('ui.settings.haptic_low') },
                            { value: 60, label: t('ui.settings.haptic_medium') },
                            { value: 100, label: t('ui.settings.haptic_high') },
                        ].find(h => h.value === hapticLevel)?.label || '' })}
                        <span className="kamae-settings-chevron" aria-hidden="true">{hapticExpanded ? '▾' : '▸'}</span>
                    </h2>
                </button>
                {hapticExpanded && (
                    <div id="haptic-options" className="kamae-settings-haptic-bar" role="radiogroup" aria-label={t('ui.settings.haptic_title')}>
                        {[
                            { value: 0, label: t('ui.settings.haptic_off') },
                            { value: 30, label: t('ui.settings.haptic_low') },
                            { value: 60, label: t('ui.settings.haptic_medium') },
                            { value: 100, label: t('ui.settings.haptic_high') },
                        ].map(({ value, label }, i) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={hapticLevel === value}
                                className={`kamae-haptic-seg ${value === hapticLevel ? 'kamae-haptic-seg--filled' : ''}`}
                                onClick={() => {
                                    setHapticLevel(value);
                                    setIntensity(value);
                                    if (value > 0) vibrate('confirm');
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section className="kamae-settings-section">
                <button
                    type="button"
                    className="kamae-settings-disclosure"
                    aria-expanded={controlsExpanded}
                    aria-controls="controls-content"
                    onClick={() => setControlsExpanded(prev => !prev)}
                >
                    <h2 className="kamae-settings-section-title">
                        {t('ui.settings.controls_title')}
                        <span className="kamae-settings-chevron" aria-hidden="true">{controlsExpanded ? '▾' : '▸'}</span>
                    </h2>
                </button>
                {controlsExpanded && (
                    <div id="controls-content" className="kamae-settings-controls">
                        <h3 id="controls-rin-heading">{t('ui.settings.controls_rin')}</h3>
                        <table className="kamae-controls-table" aria-labelledby="controls-rin-heading">
                            <caption className="sr-only">{t('ui.settings.controls_rin')}</caption>
                            <thead><tr><th>{t('ui.settings.controls_action')}</th><th>{t('ui.settings.controls_keyboard')}</th><th>{t('ui.settings.controls_gamepad')}</th></tr></thead>
                            <tbody>
                                <tr><td>{t('ui.button.try')}</td><td>Enter</td><td>A</td></tr>
                                <tr><td>{t('ui.button.not_now')}</td><td>Enter</td><td>A</td></tr>
                                <tr><td>{t('ui.button.try_hint')}</td><td>Enter (3s)</td><td>A (3s)</td></tr>
                                <tr><td>{t('ui.button.back')}</td><td>Enter</td><td>A</td></tr>
                            </tbody>
                        </table>
                        <h3 id="controls-kamae-heading">{t('ui.settings.controls_kamae')}</h3>
                        <table className="kamae-controls-table" aria-labelledby="controls-kamae-heading">
                            <caption className="sr-only">{t('ui.settings.controls_kamae')}</caption>
                            <thead><tr><th>{t('ui.settings.controls_action')}</th><th>{t('ui.settings.controls_keyboard')}</th><th>{t('ui.settings.controls_gamepad')}</th></tr></thead>
                            <tbody>
                                <tr><td>{t('ui.katas.title')}</td><td>Enter</td><td>A</td></tr>
                                <tr><td>{t('ui.katas.controls_hint')}</td><td>F2</td><td>Y</td></tr>
                                <tr><td>{t('ui.kamae.remove_from_kata')}</td><td>Enter (2.5s) / 2x Enter</td><td>A (2.5s) / 2x A</td></tr>
                            </tbody>
                        </table>
                        <h3 id="controls-general-heading">{t('ui.settings.controls_general')}</h3>
                        <table className="kamae-controls-table" aria-labelledby="controls-general-heading">
                            <caption className="sr-only">{t('ui.settings.controls_general')}</caption>
                            <thead><tr><th>{t('ui.settings.controls_action')}</th><th>{t('ui.settings.controls_keyboard')}</th><th>{t('ui.settings.controls_gamepad')}</th></tr></thead>
                            <tbody>
                                <tr><td>{t('ui.button.switch_to_kamae')}/{t('ui.button.switch_to_rin')}</td><td>Ctrl+Tab</td><td>RB / LB</td></tr>
                                <tr><td>{t('ui.settings.title')}</td><td>F10</td><td>Menu</td></tr>
                                <tr><td>{t('ui.settings.tour_title')}</td><td>F1</td><td>Menu → {t('ui.settings.tour_replay')}</td></tr>
                                <tr><td>{t('ui.settings.back')}</td><td>Escape</td><td>B</td></tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="kamae-settings-section" aria-labelledby="settings-theme-title">
                <h2 id="settings-theme-title" className="kamae-settings-section-title">{t('ui.settings.theme_title')}</h2>
                <button
                    type="button"
                    className="kamae-settings-btn"
                    onClick={toggleTheme}
                >
                    {theme === 'dark' ? t('ui.settings.theme_light') : t('ui.settings.theme_dark')}
                </button>
            </section>

            <section className="kamae-settings-section" aria-labelledby="settings-igdb-title">
                <h2 id="settings-igdb-title" className="kamae-settings-section-title">{t('ui.settings.igdb_title')}</h2>
                <p id="igdb-desc" className="kamae-settings-section-desc">{t('ui.settings.igdb_desc')}</p>
                <p id="igdb-howto" className="kamae-settings-section-desc">{t('ui.settings.igdb_howto')}</p>
                <p className="kamae-settings-section-desc">{t('ui.settings.igdb_note')}</p>

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
                        placeholder={t('ui.settings.client_id_placeholder')}
                        aria-describedby="igdb-desc igdb-howto"
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
                            aria-describedby="igdb-desc igdb-howto"
                            className="kamae-settings-input"
                            value={clientSecret}
                            placeholder={t('ui.settings.client_secret_placeholder')}
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
                        aria-label={t('ui.settings.test_aria')}
                    >
                        {t('ui.settings.test')}
                    </button>
                    <button
                        type="button"
                        className="kamae-settings-btn"
                        onClick={handleSave}
                        disabled={!clientId || !clientSecret}
                        aria-label={t('ui.settings.save_aria')}
                    >
                        {t('ui.settings.save')}
                    </button>
                    <button
                        type="button"
                        className="kamae-settings-btn kamae-settings-btn--danger"
                        onClick={handleClear}
                        disabled={!hasExisting}
                        aria-label={t('ui.settings.clear_aria')}
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

            {onNavigateLegal && (
                <section className="kamae-settings-section" aria-labelledby="settings-a11y-title">
                    <h2 id="settings-a11y-title" className="kamae-settings-section-title">{t('ui.legal.accessibility')}</h2>
                    <button
                        type="button"
                        className="kamae-settings-btn"
                        onClick={() => { onClose(); onNavigateLegal('accessibility'); }}
                    >
                        {t('ui.legal.accessibility')}
                    </button>
                </section>
            )}

            <section className="kamae-settings-section" aria-labelledby="settings-telemetry-title">
                <h2 id="settings-telemetry-title" className="kamae-settings-section-title">{t('ui.telemetry.title')}</h2>
                <p className="kamae-settings-section-desc">{t('ui.telemetry.desc')}</p>

                <div className="kamae-settings-field">
                    <label className="kamae-settings-toggle">
                        <input
                            type="checkbox"
                            role="switch"
                            checked={telemetryEnabled}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.click(); } }}
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

            <section className="kamae-settings-section" aria-labelledby="settings-about-title">
                <h2 id="settings-about-title" className="kamae-settings-section-title">{t('ui.settings.about_title')}</h2>
                <VersionTag className="settings-version" updateCheck={updateCheck} updateAlertShown={updateAlertShown} showBuildDate />
            </section>

        </section>
    );
}
