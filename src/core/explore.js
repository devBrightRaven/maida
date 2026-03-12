export const DAILY_EXPLORE_LIMIT = 10;

export function createExploreState(todayDate) {
    return { lastSessionDate: todayDate, cardsShownToday: 0 };
}

export function canExploreMore(state) {
    return state.cardsShownToday < DAILY_EXPLORE_LIMIT;
}

export function recordCardShown(state) {
    return { ...state, cardsShownToday: state.cardsShownToday + 1 };
}

export function resetDailyExplore(state, todayDate) {
    if (state.lastSessionDate === todayDate) return state;
    return { lastSessionDate: todayDate, cardsShownToday: 0 };
}
