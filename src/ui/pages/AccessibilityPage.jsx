import { t } from '../../i18n';
import LegalPage from '../LegalPage';

const EMAIL = 'devbrightraven@gmail.com';

export default function AccessibilityPage({ onClose }) {
    return (
        <LegalPage titleKey="ui.legal.a11y_title" onClose={onClose}>
            <p>{t('ui.legal.a11y_commitment')}</p>

            <h2>{t('ui.legal.a11y_standards_heading')}</h2>
            <p>{t('ui.legal.a11y_standards')}</p>

            <h2>{t('ui.legal.a11y_features_heading')}</h2>
            <ul>
                <li>{t('ui.legal.a11y_feature_keyboard')}</li>
                <li>{t('ui.legal.a11y_feature_gamepad')}</li>
                <li>{t('ui.legal.a11y_feature_sr')}</li>
                <li>{t('ui.legal.a11y_feature_focus')}</li>
                <li>{t('ui.legal.a11y_feature_motion')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_testing_heading')}</h2>
            <p>{t('ui.legal.a11y_testing')}</p>

            <h2>{t('ui.legal.a11y_limitations_heading')}</h2>
            <ul>
                <li>{t('ui.legal.a11y_limitation_gamepad')}</li>
                <li>{t('ui.legal.a11y_limitation_longpress')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_planned_heading')}</h2>
            <ul>
                <li>{t('ui.legal.a11y_planned_threshold')}</li>
                <li>{t('ui.legal.a11y_planned_fontsize')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_contact_heading')}</h2>
            <p>{t('ui.legal.a11y_contact')} <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        </LegalPage>
    );
}
