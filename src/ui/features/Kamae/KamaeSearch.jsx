import { useState, useRef, useEffect, useCallback, useId } from 'react';
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
    const helpId = useId();

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
        // Escape handled upfront across every state (layered retreat):
        //   1st  clear the dropdown
        //   2nd  clear the query text
        //   3rd  focus the active kata button — matches the Kamae
        //        mode's global Escape behavior so the user can retreat
        //        from search to their last kata in situ
        if (e.key === 'Escape') {
            if (results.length > 0) {
                setResults([]);
                setActiveIndex(-1);
            } else if (query) {
                setQuery('');
            } else {
                document.querySelector('.kata-group--active .kata-select-btn')?.focus();
            }
            return;
        }

        // When no results, ArrowDown/Up navigates to next/prev focusable
        // element outside search so the search bar doesn't swallow nav
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

        // With results showing: ArrowDown moves focus into the listbox
        // so keyboard/SR users can navigate options with native DOM focus.
        // Options own their arrow/Enter/Escape via handleOptionKeyDown.
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const firstOption = listRef.current?.querySelector('li[role="option"]');
            firstOption?.focus();
        }
    }, [results.length, query]);

    const handleOptionKeyDown = useCallback((e, game) => {
        const id = game.id || game.steamAppId;
        const inKata = kataSet?.has(id);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.currentTarget.nextElementSibling?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = e.currentTarget.previousElementSibling;
            if (prev) prev.focus();
            else inputRef.current?.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!inKata) handleAdd(id);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setResults([]);
            setActiveIndex(-1);
            inputRef.current?.focus();
        }
    }, [kataSet, handleAdd]);

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
        <div
            className="kamae-search"
            role="search"
            onBlur={(e) => {
                // Auto-close dropdown when focus leaves the entire widget
                // (Tab out to another landmark). Query text is preserved
                // so returning to the input still shows the prior search.
                if (!e.currentTarget.contains(e.relatedTarget)) {
                    setResults([]);
                    setActiveIndex(-1);
                }
            }}
        >
            <label htmlFor="kamae-search-input" className="sr-only">{t('ui.kamae.search_aria', { kata: activeKataName })}</label>
            <span id={helpId} className="sr-only">{t('ui.kamae.search_hint')}</span>
            <input
                id="kamae-search-input"
                ref={inputRef}
                type="search"
                className="kamae-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('ui.kamae.search_placeholder', { kata: activeKataName })}
                autoComplete="off"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="kamae-search-listbox"
                aria-activedescendant={activeId ? `search-option-${activeId}` : undefined}
                aria-describedby={helpId}
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
                                tabIndex={-1}
                                aria-selected={isActive}
                                aria-disabled={inKata || undefined}
                                onClick={() => !inKata && handleAdd(id)}
                                onFocus={() => setActiveIndex(index)}
                                onKeyDown={(e) => handleOptionKeyDown(e, game)}
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
