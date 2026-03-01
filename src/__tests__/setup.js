import { debugStore } from '../core/debugStore';

// Clear debugStore state between tests to prevent cross-contamination
afterEach(() => {
    debugStore.clear();
});
