import { t } from '../../i18n';
import LegalPage from '../LegalPage';

const EMAIL = 'bertram@brightraven.world';

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
                <li>{t('ui.legal.a11y_feature_cooldown')}</li>
                <li>{t('ui.legal.a11y_feature_sr')}</li>
                <li>{t('ui.legal.a11y_feature_focus')}</li>
                <li>{t('ui.legal.a11y_feature_motion')}</li>
                <li>{t('ui.legal.a11y_feature_languages')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_testing_heading')}</h2>
            <p>{t('ui.legal.a11y_testing')}</p>

            <h2>{t('ui.legal.a11y_limitations_heading')}</h2>
            <ul>
                <li>{t('ui.legal.a11y_sr_focus_note')}</li>
                <li>{t('ui.legal.a11y_limitation_longpress')}</li>
                <li>{t('ui.legal.a11y_limitation_space_key')}</li>
                <li>{t('ui.legal.a11y_limitation_settings_in_kamae')}</li>
                <li>{t('ui.legal.a11y_limitation_screen_reader_browse')}</li>
                <li>{t('ui.legal.a11y_limitation_screen_reader_buffer_stuck')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_planned_heading')}</h2>
            <ul>
                <li>{t('ui.legal.a11y_planned_one_hand')}</li>
            </ul>

            <h2>{t('ui.legal.a11y_contact_heading')}</h2>
            <p>{t('ui.legal.a11y_contact')} <a href={`mailto:${EMAIL}`}>{t('ui.legal.email_me_link')}</a> ({EMAIL})</p>
        </LegalPage>
    );
}
