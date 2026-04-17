import { t } from '../i18n';

export default function VersionTag({ updateCheck, updateAlertShown, className = '', showBuildDate = false, announceUpdate = true }) {
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
                    {/* Duplicate role="alert" regions would make NVDA announce
                        the update twice when Settings is open (global tag +
                        settings tag both render). Only the announceUpdate=true
                        instance emits the alert; other instances stay quiet. */}
                    {announceUpdate && !updateAlertShown && (
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
