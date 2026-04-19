import { useRef, useEffect } from 'react';
import { t } from '../i18n';

export default function LegalPage({ titleKey, onClose, children }) {
    const titleRef = useRef(null);

    useEffect(() => {
        // preventScroll avoids the browser's auto "scroll focused element into
        // view" behavior. Without it, any later event that re-asserts focus on
        // the title would yank the scroll position back to the top of the
        // page, interrupting gamepad scroll attempts.
        titleRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <main className="legal-page">
            <header className="legal-page-header">
                <h1 ref={titleRef} tabIndex={-1} className="legal-page-title">{t(titleKey)}</h1>
            </header>
            <div className="legal-page-content">{children}</div>
            <footer className="legal-page-footer">
                <button type="button" className="legal-page-back" onClick={onClose}>
                    {t('ui.legal.close')}
                </button>
            </footer>
        </main>
    );
}
