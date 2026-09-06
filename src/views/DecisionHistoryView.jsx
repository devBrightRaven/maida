import { useCallback, useEffect, useRef, useState } from 'react';
import { t, getLocale } from '../i18n';
import bridge from '../services/bridge';
import { historySubject } from '../services/decisionHistory';
import { useGameInput } from '../hooks/useGameInput';
import './DecisionHistoryView.css';

const eventLabels = {
    'maida.hook.created': 'created', 'maida.hook.superseded': 'edited',
    'maida.hook.retracted': 'retracted', 'maida.game.state_set': 'state',
    'maida.launch.initiated': 'launch',
};
const choices = new Set(['try', 'not_now', 'play', 'undo', 'anchor', 'unanchor']);

export function historyLabel(event) {
    const key = event.eventType === 'maida.choice.recorded' && choices.has(event.payload?.action)
        ? event.payload.action : eventLabels[event.eventType] || 'unknown';
    return t(`ui.history.${key}`);
}

export default function DecisionHistoryView({ game, games, onClose, warning }) {
    const [page, setPage] = useState(null);
    const [cursor, setCursor] = useState(null);
    const [previous, setPrevious] = useState([]);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const root = useRef(null);
    const title = useRef(null);
    const subject = historySubject(game);
    useEffect(() => { title.current?.focus(); }, []);
    useEffect(() => {
        let current = true;
        setLoading(true); setError(false);
        bridge.readTracePage({ cursor, limit: 20, subject }).then(result => {
            if (current) { setPage(result); setLoading(false); }
        }).catch(() => { if (current) { setError(true); setLoading(false); } });
        return () => { current = false; };
    }, [cursor, revision, subject?.namespace, subject?.id]);
    const navigate = useCallback(dir => {
        const elements = [...root.current.querySelectorAll('button:not(:disabled), a[href]')];
        if (!elements.length) return;
        const index = elements.indexOf(document.activeElement);
        elements[(index + (dir === 'up' || dir === 'left' ? -1 : 1) + elements.length) % elements.length]?.focus();
    }, []);
    useGameInput({ onNav: navigate, onBack: onClose, onMainAction: () => document.activeElement?.closest('button')?.click() });
    const changePage = next => { setCursor(next); title.current?.focus(); };
    const refresh = () => { setPrevious([]); setCursor(null); setRevision(v => v + 1); };
    return <main className="decision-history" ref={root}>
        <header className="history-header">
            <h1 tabIndex={-1} ref={title}>{t('ui.history.title')}{game ? ` · ${game.title}` : ''}</h1>
            <div className="history-actions">
                <button type="button" onClick={refresh} disabled={loading}>{t('ui.history.refresh')}</button>
                <button type="button" onClick={onClose}>{t('ui.history.back')}</button>
            </div>
        </header>
        {warning}
        <p className="history-intro">{t('ui.history.description')}</p>
        <p role="status">{loading ? t('ui.history.loading') : ''}</p>
        {error ? <div role="alert"><p>{t('ui.history.error')}</p><button type="button" onClick={() => setRevision(v => v + 1)}>{t('ui.history.retry')}</button></div> : !loading && <>
            {page?.skippedLines > 0 && <p role="status">{t('ui.history.skipped')}</p>}
            {!page?.events.length && <p>{t(page?.nextCursor != null ? 'ui.history.scan_more' : 'ui.history.empty')}</p>}
            <ol className="history-events">
                {page?.events.map((event, index) => {
                    const matched = games.find(g => { const id = historySubject(g); return id.namespace === event.subject?.namespace && id.id === event.subject?.id; });
                    const name = typeof event.entity?.displayTitle === 'string' && event.entity.displayTitle.trim() ? event.entity.displayTitle : matched?.title || (typeof event.subject?.id === 'string' ? event.subject.id : t('ui.history.unknown'));
                    const date = new Date(typeof event.recordedAt === 'string' && event.recordedAt.trim() ? event.recordedAt : NaN);
                    const state = event.payload?.state;
                    const known = event.schemaVersion === 1;
                    return <li key={`${event.eventId}-${index}`}>
                        <div className="history-event-heading"><h2>{name}</h2><span>{known ? historyLabel(event) : t('ui.history.unknown')}</span></div>
                        <p className="history-meta">{Number.isNaN(date.valueOf()) ? t('ui.history.unknown_time') : <time dateTime={date.toISOString()}>{date.toLocaleString(getLocale())}</time>} · {t(event.authorityKind === 'human_intent' || event.authorityKind === 'human_state' ? 'ui.history.player' : event.authorityKind === 'observed_behavior' ? 'ui.history.observed' : 'ui.history.unknown_source')}</p>
                        {known && typeof event.payload?.note === 'string' && <blockquote>{event.payload.note}</blockquote>}
                        {known && ['keep', 'rest', 'released'].includes(state) && <p>{t(`ui.maida2.state_${state}`)}</p>}
                        {known && event.payload?.silent && <p>{t('ui.history.silent')}</p>}
                        {event.supersedesEventId && <p className="history-meta">{t('ui.history.replaces')}</p>}
                        {event.retractsEventId && <p className="history-meta">{t('ui.history.withdraws')}</p>}
                    </li>;
                })}
            </ol>
        </>}
        <nav className="history-actions" aria-label={t('ui.history.pages')}>
            <button type="button" disabled={loading || !previous.length} onClick={() => { const list = [...previous]; changePage(list.pop()); setPrevious(list); }}>{t('ui.history.newer')}</button>
            <button type="button" disabled={loading || error || page?.nextCursor == null} onClick={() => { setPrevious(list => [...list, page.pageCursor]); changePage(page.nextCursor); }}>{t('ui.history.older')}</button>
        </nav>
    </main>;
}
