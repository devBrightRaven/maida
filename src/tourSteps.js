/**
 * Guided tour step index map. Centralises the magic numbers so that
 * adding, removing, or reordering a step only edits this file — every
 * other reference is symbolic (STEP.RIN_UNDO etc) and stays correct.
 *
 * The tour is linear: Rin steps 0-5, Kamae steps 6-10.
 */
export const STEP = {
    RIN_TITLE: 0,
    RIN_PRESCRIPTION: 1,
    RIN_TRY: 2,
    RIN_NOT_NOW: 3,
    RIN_UNDO: 4,
    RIN_SWITCH_KAMAE: 5,
    KAMAE_KATA: 6,
    KAMAE_SEARCH: 7,
    KAMAE_LIST: 8,
    KAMAE_SETTINGS_REPLAY: 9,
    KAMAE_SWITCH_RIN: 10,
};

export const TOUR_TOTAL = 11;
