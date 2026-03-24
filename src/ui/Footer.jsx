import { t } from '../i18n';

export default function Footer({ onNavigate }) {
    return (
        <footer className="app-footer" role="contentinfo">
            <div className="app-footer-links">
                <button type="button" onClick={() => onNavigate('accessibility')}>{t('ui.legal.accessibility')}</button>
                <span aria-hidden="true">|</span>
                <button type="button" onClick={() => onNavigate('privacy')}>{t('ui.legal.privacy')}</button>
                <span aria-hidden="true">|</span>
                <button type="button" onClick={() => onNavigate('terms')}>{t('ui.legal.terms')}</button>
            </div>
            <p className="app-footer-copyright">{t('ui.legal.copyright_text')}</p>
        </footer>
    );
}
