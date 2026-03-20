import { useState, useRef, useEffect } from 'react';
import { t } from '../../../i18n';
import bridge from '../../../services/bridge';

/**
 * KamaeSearch — search warehouse, add results to showcase.
 * Unlimited search (no daily cap). Results limited to 20 by IPC.
 */
export default function KamaeSearch({ activeKataGameIds, onAdd }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    const kataSet = activeKataGameIds ? new Set(activeKataGameIds) : null;

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            const res = await bridge.searchWarehouse(query);
            setResults(res || []);
            setSearching(false);
        }, 250);

        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleAdd = (gameId) => {
        onAdd(gameId);
        setQuery('');
        setResults([]);
        inputRef.current?.focus();
    };

    if (!kataSet) {
        return null;
    }

    return (
        <div className="kamae-search" role="search">
            <label htmlFor="kamae-search-input" className="sr-only">Search games</label>
            <input
                id="kamae-search-input"
                ref={inputRef}
                type="search"
                className="kamae-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('ui.kamae.search_placeholder')}
                autoComplete="off"
            />
            {results.length > 0 && (
                <div className="kamae-search-results" role="listbox" aria-label="Search results">
                    {results.map(game => {
                        const id = game.id || game.steamAppId;
                        const inKata = kataSet.has(id);
                        return (
                            <div
                                key={id}
                                className="kamae-search-result"
                                role="option"
                                aria-selected={inKata}
                            >
                                <span className="kamae-search-result-title">
                                    {game.title}
                                    {!game.installed && <span className="kamae-search-uninstalled"> {t('ui.kamae.not_installed')}</span>}
                                </span>
                                <button
                                    type="button"
                                    className="kamae-search-add-btn"
                                    onClick={() => handleAdd(id)}
                                    disabled={inKata}
                                    aria-label={inKata ? `${game.title} already added` : `Add ${game.title}`}
                                >
                                    {inKata ? t('ui.kamae.added') : t('ui.kamae.add')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            {searching && <span className="kamae-search-status" aria-live="polite">{t('ui.kamae.searching')}</span>}
        </div>
    );
}
