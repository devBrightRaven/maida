import { t } from '../../i18n';
import LegalPage from '../LegalPage';

export default function TermsPage({ onClose }) {
    return (
        <LegalPage titleKey="ui.legal.terms_title" onClose={onClose}>
            <h2>{t('ui.legal.terms_your_choice_heading')}</h2>
            <p>{t('ui.legal.terms_your_choice')}</p>

            <h2>{t('ui.legal.terms_no_guarantees_heading')}</h2>
            <p>{t('ui.legal.terms_no_guarantees')}</p>

            <h2>{t('ui.legal.terms_free_heading')}</h2>
            <p>{t('ui.legal.terms_free')}</p>

            <h2>{t('ui.legal.terms_changes_heading')}</h2>
            <p>{t('ui.legal.terms_changes')}</p>
        </LegalPage>
    );
}
