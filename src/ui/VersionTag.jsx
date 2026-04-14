import { t } from '../i18n';

export default function VersionTag({ updateCheck, updateAlertShown, className = '', showBuildDate = false }) {
    if (!updateCheck) return null;

    return (
        <div className={className}>
            <span className="version-name">Maida マイダ</span>
            <span className="version-number">
                v{__APP_VERSION__}
                {updateCheck.isUpdateAvailable && ` → ${updateCheck.latestVersion}`}
            </span>
            {showBuildDate && <span className="version-date">{__BUILD_DATE__}</span>}
            {updateCheck.isUpdateAvailable && (
                <>
                    {!updateAlertShown && (
                        <p className="sr-only" role="alert">
                            {t('ui.update.available_alert', { version: updateCheck.latestVersion })}
                        </p>
                    )}
                    <button
                        className="version-link"
                        onClick={updateCheck.installUpdate}
                        disabled={updateCheck.updating}
                        aria-label={t('ui.update.button_aria', { from: __APP_VERSION__, to: updateCheck.latestVersion })}
                    >
                        {updateCheck.updating ? t('ui.update.updating') : t('ui.update.button')}
                    </button>
                </>
            )}
        </div>
    );
}
