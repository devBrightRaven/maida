import { useState, useRef, useEffect } from 'react';
import bridge from '../../../services/bridge';

/**
 * NeriSearch — search warehouse, add results to showcase.
 * Unlimited search (no daily cap). Results limited to 20 by IPC.
 */
export default function NeriSearch({ showcaseIds, onAdd }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    const showcaseSet = new Set(showcaseIds);

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

    return (
        <div className="neri-search" role="search">
            <label htmlFor="neri-search-input" className="sr-only">Search games</label>
            <input
                id="neri-search-input"
                ref={inputRef}
                type="search"
                className="neri-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search your library..."
                autoComplete="off"
            />
            {results.length > 0 && (
                <div className="neri-search-results" role="listbox" aria-label="Search results">
                    {results.map(game => {
                        const id = game.id || game.steamAppId;
                        const inShowcase = showcaseSet.has(id);
                        return (
                            <div
                                key={id}
                                className="neri-search-result"
                                role="option"
                                aria-selected={inShowcase}
                            >
                                <span className="neri-search-result-title">{game.title}</span>
                                <button
                                    type="button"
                                    className="neri-search-add-btn"
                                    onClick={() => handleAdd(id)}
                                    disabled={inShowcase}
                                    aria-label={inShowcase ? `${game.title} already in showcase` : `Add ${game.title} to showcase`}
                                >
                                    {inShowcase ? 'added' : 'add'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            {searching && <span className="neri-search-status" aria-live="polite">Searching...</span>}
        </div>
    );
}
