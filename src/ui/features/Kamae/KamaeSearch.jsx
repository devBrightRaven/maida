import { useState, useRef, useEffect, useCallback } from 'react';
import { t } from '../../../i18n';
import bridge from '../../../services/bridge';

/**
 * KamaeSearch — search warehouse, add results to kata.
 * Arrow keys navigate results, Enter adds to kata, Escape returns to input.
 */
export default function KamaeSearch({ activeKataGameIds, activeKataName, onAdd }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const kataSet = activeKataGameIds ? new Set(activeKataGameIds) : null;

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setActiveIndex(-1);
            return;
        }

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            const res = await bridge.searchWarehouse(query);
            setResults(res || []);
            setActiveIndex(-1);
            setSearching(false);
        }, 250);

        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleAdd = useCallback((gameId) => {
        onAdd(gameId);
        setQuery('');
        setResults([]);
        setActiveIndex(-1);
        inputRef.current?.focus();
    }, [onAdd]);

    const handleKeyDown = useCallback((e) => {
        // When no results, navigate to next/prev focusable element outside search
        if (results.length === 0) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                const container = inputRef.current?.closest('.kamae-content');
                if (!container) return;
                const focusable = Array.from(container.querySelectorAll(
                    'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), label.kata-game-toggle'
                ));
                const idx = focusable.indexOf(inputRef.current);
                if (idx === -1) return;
                const next = e.key === 'ArrowDown'
                    ? focusable[idx + 1] || focusable[0]
                    : focusable[idx - 1] || focusable[focusable.length - 1];
                next?.focus();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => prev < results.length - 1 ? prev + 1 : 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => prev > 0 ? prev - 1 : results.length - 1);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            const game = results[activeIndex];
            const id = game.id || game.steamAppId;
            if (!kataSet?.has(id)) {
                handleAdd(id);
            }
        } else if (e.key === 'Escape') {
            setResults([]);
            setActiveIndex(-1);
            inputRef.current?.focus();
        }
    }, [results, activeIndex, kataSet, handleAdd]);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[role="option"]');
            items[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex]);

    if (!kataSet) {
        return null;
    }

    const activeId = activeIndex >= 0 && results[activeIndex]
        ? (results[activeIndex].id || results[activeIndex].steamAppId)
        : undefined;

    return (
        <div className="kamae-search" role="search">
            <label htmlFor="kamae-search-input" className="sr-only">{t('ui.kamae.search_aria', { kata: activeKataName })}</label>
            <input
                id="kamae-search-input"
                ref={inputRef}
                type="search"
                className="kamae-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => bridge.showTouchKeyboard()}
                onBlur={() => bridge.hideTouchKeyboard()}
                placeholder={t('ui.kamae.search_placeholder', { kata: activeKataName })}
                autoComplete="off"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="kamae-search-listbox"
                aria-activedescendant={activeId ? `search-option-${activeId}` : undefined}
            />
            {results.length > 0 && (
                <ul id="kamae-search-listbox" ref={listRef} className="kamae-search-results" role="listbox">
                    {results.map((game, index) => {
                        const id = game.id || game.steamAppId;
                        const inKata = kataSet.has(id);
                        const isActive = index === activeIndex;
                        return (
                            <li
                                key={id}
                                id={`search-option-${id}`}
                                className={`kamae-search-result ${isActive ? 'kamae-search-result--active' : ''}`}
                                role="option"
                                aria-selected={isActive}
                                aria-disabled={inKata || undefined}
                                onClick={() => !inKata && handleAdd(id)}
                            >
                                <span className="kamae-search-result-title">
                                    {game.title}
                                    {!game.installed && <span className="kamae-search-uninstalled"> {t('ui.kamae.not_installed')}</span>}
                                    {inKata && <span className="kamae-search-added"> {t('ui.kamae.added')}</span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            {searching && <span className="kamae-search-status" aria-live="polite">{t('ui.kamae.searching')}</span>}
        </div>
    );
}
