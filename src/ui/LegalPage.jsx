import { useRef, useEffect } from 'react';
import { t } from '../i18n';

export default function LegalPage({ titleKey, onClose, children }) {
    const backRef = useRef(null);

    useEffect(() => {
        backRef.current?.focus();
    }, []);

    return (
        <main className="legal-page">
            <header className="legal-page-header">
                <h1 className="legal-page-title">{t(titleKey)}</h1>
                <button ref={backRef} type="button" className="legal-page-back" onClick={onClose}>
                    {t('ui.legal.back')}
                </button>
            </header>
            <div className="legal-page-content">
                {children}
            </div>
        </main>
    );
}
