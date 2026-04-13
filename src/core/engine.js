/**
 * Maida MVP Engine
 * Handles the strict logic of selecting a game and finding a permission slip.
 * Now data-agnostic: expects gamesData and prescriptionsData to be passed in.
 */

import { debugStore } from './debugStore';

export function calculateTraceWeights(gamesData, options = {}) {
    const {
        sessionSkippedSet = [],
        returnPenaltySet = [],
        temperature = 1.5,
        candidatePool = null
    } = options;

    if (!gamesData || !gamesData.games) return null;

    const uniqueGamesMap = new Map();
    if (candidatePool) {
        // Showcase mode: only include installed games from the candidate pool
        // Uninstalled games stay in Kamae showcase but Rin won't dice them
        const poolSet = new Set(candidatePool);
        gamesData.games.forEach(g => {
            if (poolSet.has(g.id) && g.installed && !uniqueGamesMap.has(g.id)) {
                uniqueGamesMap.set(g.id, g);
            }
        });
    } else {
        // Legacy mode: all installed games
        gamesData.games.forEach(g => {
            if (g.installed && !uniqueGamesMap.has(g.id)) {
                uniqueGamesMap.set(g.id, g);
            }
        });
    }
    const allCandidates = Array.from(uniqueGamesMap.values());

    if (allCandidates.length === 0) return null;

    const traceCandidates = allCandidates.map(g => {
        const isSkipped = sessionSkippedSet.includes(g.id);
        const isPenalized = returnPenaltySet.includes(g.id);

        const score = g.score || 0;

        // 1. Session Exclusion Check
        if (isSkipped) {
            return {
                id: g.id,
                title: g.title,
                score,
                weight: 0,
                penalty: 'NOT NOW (Session)',
                isSkipped: true
            };
        }

        // 2. Penalty Factors
        const penaltyFactor = isPenalized ? 0.2 : 1.0;

        // 3. Final Calculation
        const weight = Math.exp(score / temperature) * penaltyFactor;

        let penaltyLabel = null;
        if (isPenalized) penaltyLabel = 'PENALTY (0.2)';

        return {
            id: g.id,
            title: g.title,
            score,
            weight,
            penalty: penaltyLabel,
            isSkipped: false
        };
    });

    const samplingPool = traceCandidates.filter(c => !c.isSkipped && c.weight > 0);

    // Pass BOTH the full trace (for UI) and the valid pool (for sampling)
    return {
        candidates: samplingPool, // For actual selection logic
        traceCandidates,          // For UI (includes skipped)
        temperature
    };
}

export function getActiveGame(gamesData, options = {}) {
    const calc = calculateTraceWeights(gamesData, options);
    if (!calc) return null;

    // candidates here refers to the valid sampling pool
    const { candidates, traceCandidates, temperature } = calc;

    if (candidates.length === 0) {
        // Edge case: All games skipped? Return nothing or handle gracefully.
        // We still capture trace to show why nothing was selected.
        updateDebugTrace(traceCandidates, null, temperature, traceCandidates.length);
        return null;
    }

    // 3. Weighted Sampling using the VALID pool
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedCandidate = null;

    for (const c of candidates) {
        random -= c.weight;
        if (random <= 0) {
            selectedCandidate = c;
            break;
        }
    }

    // Safety fallback
    if (!selectedCandidate) selectedCandidate = candidates[0];

    // Find the full game object from the ID
    const selectedGame = gamesData.games.find(g => g.id === selectedCandidate.id);

    // 4. Capture Trace (Using the FULL list including skipped)
    updateDebugTrace(traceCandidates, selectedGame, temperature, traceCandidates.length);

    return selectedGame;
}

export function updateDebugTrace(traceCandidates, selected, temperature, totalGames) {
    const totalWeight = traceCandidates.reduce((sum, c) => sum + c.weight, 0);

    const normalizedCandidates = traceCandidates.map(c => ({
        ...c,
        probability: (c.weight / totalWeight)
    }));

    debugStore.setTrace({
        temperature,
        totalGames: totalGames,
        selected: selected ? {
            id: selected.id,
            weight: ((traceCandidates.find(c => c.id === selected.id)?.weight ?? 0) / totalWeight).toFixed(4)
        } : null,
        candidates: normalizedCandidates
            .sort((a, b) => {
                const diff = b.probability - a.probability;
                // Use a small epsilon for float comparison safety
                if (Math.abs(diff) > 0.0000001) return diff;
                // Deterministic tie-breaker: Alphabetical by Title
                return (a.title || '').localeCompare(b.title || '');
            })
            .map(c => ({
                id: c.id,
                title: c.title,
                score: c.score.toFixed(2),
                weight: (c.probability * 100).toFixed(2) + '%',
                penalty: c.penalty
            }))
    });
}



// Helper — convert lastPlayed string to days-since-played number (or null if never).
function daysSinceLastPlayed(lastPlayedStr) {
    if (!lastPlayedStr || lastPlayedStr === "Never") return null;
    if (lastPlayedStr === "Today") return 0;
    if (lastPlayedStr === "Yesterday") return 1;
    const d = new Date(lastPlayedStr);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

// Helper — match emotional-states proxy against runtime context.
// See docs/a11y-audit-v0.2.0-translation-critique.md and
// autoresearch Phase 2 design rationales for each proxy's meaning.
function matchEmotionalProxy(proxy, game, context) {
    switch (proxy) {
        case "skip-streak-3":
            return (context.sessionSkippedSet?.size ?? 0) >= 3;
        case "late-night-with-skip": {
            const h = new Date().getHours();
            const isLate = h >= 22 || h <= 4;
            return isLate && (context.sessionSkippedSet?.size ?? 0) >= 1;
        }
        case "long-absence-return": {
            const gap = daysSinceLastPlayed(game?.lastPlayed);
            return gap !== null && gap > 90 && !!context.inActiveKata;
        }
        case "just-anchored":
            return !!context.isAnchored;
        case "return-penalty-accumulated":
            return (context.returnPenaltySet?.size ?? 0) >= 2;
        case "post-freeze-resume":
            return !!context.postFreezeResume;
        case "selection-churn-5":
            return (context.sessionSkippedSet?.size ?? 0) >= 5;
        default:
            return false;
    }
}

// Compute the pool of prescriptions whose trigger matches the current context.
// Returns empty array if no new categories present or no matches.
function computeContextualMatches(game, context, prescriptions) {
    const matches = [];

    // Time-of-day (always computable)
    if (prescriptions["time-of-day"]) {
        const hour = new Date().getHours();
        for (const p of prescriptions["time-of-day"]) {
            if (p.trigger?.hours?.includes(hour)) matches.push(p);
        }
    }

    // Return-after-absence (needs game.lastPlayed)
    if (prescriptions["return-after-absence"] && game) {
        const gap = daysSinceLastPlayed(game.lastPlayed);
        for (const p of prescriptions["return-after-absence"]) {
            const t = p.trigger;
            if (!t) continue;
            if (t.criterion === "no-last-played") {
                if (gap === null) matches.push(p);
            } else if (t.criterion === "post-anchor-gap") {
                if (context.previouslyAnchored && gap !== null && gap > 30) matches.push(p);
            } else if (gap !== null) {
                if (t.min_days !== undefined && gap < t.min_days) continue;
                if (t.max_days !== undefined && gap > t.max_days) continue;
                if (t.min_days !== undefined) matches.push(p);
            }
        }
    }

    // Emotional-states (needs behavioral proxies)
    if (prescriptions["emotional-states"]) {
        for (const p of prescriptions["emotional-states"]) {
            const proxy = p.trigger?.proxy;
            if (proxy && matchEmotionalProxy(proxy, game, context)) matches.push(p);
        }
    }

    return matches;
}

// Injection rate for contextual triggers — keeps existing catalog/default
// behavior dominant while surfacing new categories occasionally.
const CONTEXTUAL_INJECTION_RATE = 0.3;

export function getPrescription(game, prescriptionsData, context = {}) {
    if (!prescriptionsData || !prescriptionsData.prescriptions) return null;
    const prescriptions = prescriptionsData.prescriptions;

    // IDLE STATE (Section 7 of PRD)
    if (!game) {
        const idleList = prescriptions.idle_state || prescriptions.default;
        return idleList[Math.floor(Math.random() * idleList.length)];
    }

    // CONTEXTUAL TRIGGER LAYER (new in v0.3.0)
    // Before falling into catalog/default, check if any time-of-day /
    // emotional-states / return-after-absence prescription matches current
    // context. If so, 30% chance to inject one; otherwise fall through.
    const contextualPool = computeContextualMatches(game, context, prescriptions);
    if (contextualPool.length > 0 && Math.random() < CONTEXTUAL_INJECTION_RATE) {
        return contextualPool[Math.floor(Math.random() * contextualPool.length)];
    }

    // BEHAVIORAL LOGIC (Section 5 of PRD)
    const lastPlayedStr = game.lastPlayed;
    let isRepeat = false;

    if (lastPlayedStr === "Today" || lastPlayedStr === "Yesterday") {
        isRepeat = true;
    } else if (lastPlayedStr && lastPlayedStr !== "Never") {
        const lastPlayedDate = new Date(lastPlayedStr);
        const now = new Date();
        const diffMs = now - lastPlayedDate;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        // Repeat = played within the last 48 hours (~2 days)
        if (diffDays <= 2) {
            isRepeat = true;
        }
    }

    const targetMomentum = isRepeat ? "stabilize" : "unlock";


    // 1. Try Catalog
    const catalog = prescriptions.catalog || {};
    if (catalog[game.id]) {
        const options = catalog[game.id];
        const filtered = options.filter(p => p.momentum === targetMomentum);

        if (filtered.length > 0) {
            return filtered[Math.floor(Math.random() * filtered.length)];
        }
        return options[Math.floor(Math.random() * options.length)];
    }

    // 2. Fallback to Defaults
    const defaults = prescriptions.default;
    const filteredDefaults = defaults.filter(p => p.momentum === targetMomentum);
    if (filteredDefaults.length > 0) {
        return filteredDefaults[Math.floor(Math.random() * filteredDefaults.length)];
    }

    const finalResult = defaults[Math.floor(Math.random() * defaults.length)];
    return finalResult;
}

// Exported for tests
export const __internal = { computeContextualMatches, matchEmotionalProxy, daysSinceLastPlayed };


