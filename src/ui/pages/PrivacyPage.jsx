import { t } from '../../i18n';
import LegalPage from '../LegalPage';

const EMAIL = 'bertram@brightraven.world';

export default function PrivacyPage({ onClose }) {
    return (
        <LegalPage titleKey="ui.legal.privacy_title" onClose={onClose}>
            <h2>{t('ui.legal.privacy_collection_heading')}</h2>
            <p>{t('ui.legal.privacy_collection')}</p>

            <h2>{t('ui.legal.privacy_storage_heading')}</h2>
            <p>{t('ui.legal.privacy_storage')}</p>

            <h2>{t('ui.legal.privacy_telemetry_heading')}</h2>
            <p>{t('ui.legal.privacy_telemetry')}</p>

            <h2>{t('ui.legal.privacy_contact_heading')}</h2>
            <p>{t('ui.legal.privacy_contact')} <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        </LegalPage>
    );
}
