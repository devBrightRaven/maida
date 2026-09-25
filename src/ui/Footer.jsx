import { t } from '../i18n';
import { useLayoutEffect, useRef } from 'react';

export default function Footer({ onNavigate, version }) {
    const footerRef = useRef(null);
    useLayoutEffect(() => {
        const footer = footerRef.current;
        const root = footer.closest('.app-root');
        if (!root) return;
        // Reserve the actual wrapped height, including locale and zoom changes.
        const measure = () => root.style.setProperty('--footer-height', `${footer.getBoundingClientRect().height}px`);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(footer);
        return () => { observer.disconnect(); root.style.removeProperty('--footer-height'); };
    }, []);
    return (
        <footer ref={footerRef} className="app-footer" role="contentinfo">
            <div className="app-footer-links">
                <button type="button" data-legal-page="accessibility" onClick={() => onNavigate('accessibility')}>{t('ui.legal.accessibility')}</button>
                <span aria-hidden="true">|</span>
                <button type="button" data-legal-page="privacy" onClick={() => onNavigate('privacy')}>{t('ui.legal.privacy')}</button>
                <span aria-hidden="true">|</span>
                <button type="button" data-legal-page="terms" onClick={() => onNavigate('terms')}>{t('ui.legal.terms')}</button>
            </div>
            <p className="app-footer-copyright">{t('ui.legal.copyright_text')}</p>
            {version}
        </footer>
    );
}
