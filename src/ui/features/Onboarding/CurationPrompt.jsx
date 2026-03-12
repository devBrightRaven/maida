import { useState, useRef, useEffect } from 'react';
import bridge from '../../../services/bridge';
import { addToShowcase, createEmptyShowcase } from '../../../core/showcase';

/**
 * CurationPrompt — post-Steam-sync step.
 * "Is there a game you've been wanting to play?"
 * Skippable at any point (Behavioral Constraints Rule V).
 */
export default function CurationPrompt({ onDone }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [showcase, setShowcase] = useState(createEmptyShowcase());
    const [addedNames, setAddedNames] = useState([]);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const res = await bridge.searchWarehouse(query);
            setResults(res || []);
        }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleAdd = async (game) => {
        const gameId = game.id || game.steamAppId;
        const next = addToShowcase(showcase, gameId);
        if (next !== showcase) {
            setShowcase(next);
            setAddedNames(prev => [...prev, game.title]);
            await bridge.saveShowcase(next);
        }
        setQuery('');
        setResults([]);
        inputRef.current?.focus();
    };

    const handleDone = () => {
        onDone();
    };

    const prompt = addedNames.length === 0
        ? 'Is there a game you\'ve been wanting to play?'
        : 'Any others?';

    return (
        <div className="curation-prompt">
            <p className="curation-prompt-question">{prompt}</p>

            <div className="curation-prompt-search">
                <label htmlFor="curation-search" className="sr-only">Search games</label>
                <input
                    id="curation-search"
                    ref={inputRef}
                    type="search"
                    className="curation-prompt-input"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Type a game name..."
                    autoComplete="off"
                />
                {results.length > 0 && (
                    <div className="curation-prompt-results">
                        {results.slice(0, 8).map(game => {
                            const id = game.id || game.steamAppId;
                            const alreadyAdded = showcase.games.includes(id);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    className="curation-prompt-result"
                                    onClick={() => handleAdd(game)}
                                    disabled={alreadyAdded}
                                >
                                    {game.title}
                                    {alreadyAdded && <span className="curation-added-mark"> (added)</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {addedNames.length > 0 && (
                <div className="curation-prompt-added">
                    {addedNames.map((name, i) => (
                        <span key={i} className="curation-prompt-tag">{name}</span>
                    ))}
                </div>
            )}

            <button
                type="button"
                className="curation-prompt-skip"
                onClick={handleDone}
            >
                {addedNames.length > 0 ? 'done' : 'skip'}
            </button>
        </div>
    );
}
