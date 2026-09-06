// Browser-only IPC fixture. Never connected to the user's Tauri data directory.
export function installHistoryFixture({ locale = 'zh-TW', layout = 'tabs' } = {}) {
    localStorage.setItem('maida_locale', locale);
    localStorage.setItem('maida-theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    localStorage.setItem('maida-navigation-layout', layout);
    localStorage.setItem('maida-hasSeenTour', 'true');
    localStorage.setItem('maida-hasHeardRinGuide', 'true');
    localStorage.setItem('maida-hasHeardMaida2Guide', 'true');
    const games = [
        { id: 'g1', steamAppId: 367520, title: 'Hollow Knight', installed: true, score: 0, steamUrl: 'steam://rungameid/367520', steamLastPlayed: Math.floor(Date.now() / 1000) },
        { id: 'g2', steamAppId: 413150, title: 'Stardew Valley', installed: true, score: 0, steamUrl: 'steam://rungameid/413150', steamLastPlayed: 0 },
    ];
    const hooks = { hooks: [{ id: 'hook1', gameId: 'g2', note: '下次想把農場的小路整理好。', createdAt: '2026-09-01T10:00:00Z', status: 'active', traceEventId: 'note1' }], gameStates: {} };
    const events = Array.from({ length: 44 }, (_, i) => ({ schemaVersion: 1, eventId: `fixture-${i}`, eventType: i % 2 ? 'maida.choice.recorded' : 'maida.hook.created', subject: { namespace: 'steam', id: '413150' }, entity: { displayTitle: 'Stardew Valley' }, recordedAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(), authorityKind: i % 2 ? 'observed_behavior' : 'human_intent', provenanceKind: i % 2 ? 'observed_interaction' : 'user_stated', payload: i % 2 ? { action: 'not_now' } : { note: '下次想把農場的小路整理好。' } }));
    const data = { games: { games, source: 'steam' }, hooks, anchor: null, returnPenalties: [], constraints: { installed_only: true, exclude_appids: [] } };
    window.__historyFixture = { data, events, failRead: false, failWrite: false, failHooks: false, calls: [] };
    window.__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        invoke: async (cmd, args = {}) => {
            const f = window.__historyFixture;
            f.calls.push({ cmd, args });
            if (cmd === 'get_data') return f.data[args.dataType] ?? null;
            if (cmd === 'save_data') { if (args.dataType === 'hooks' && f.failHooks) throw new Error('fixture save failed'); f.data[args.dataType] = args.data; return null; }
            if (cmd === 'get_showcase') return { games: [], box: [], katas: [], activeKataId: null, exploreHistory: { lastSessionDate: null, cardsShownToday: 0 } };
            if (cmd === 'get_art' || cmd === 'get_game_media' || cmd === 'get_localized_titles') return null;
            if (cmd === 'append_trace') { if (f.failWrite) throw new Error('fixture disk full'); f.events.push(args.entry); return null; }
            if (cmd === 'read_trace_page') {
                if (f.failRead) throw new Error('fixture read failed');
                const visible = f.events.filter(e => !['maida.decision.presented', 'maida.playtime.snapshot'].includes(e.eventType));
                const pageCursor = args.cursor ?? visible.length;
                const matching = visible.slice(0, pageCursor).map((e, index) => ({ e, index })).reverse().filter(({ e }) => !args.subject || (e.subject.namespace === args.subject.namespace && e.subject.id === args.subject.id));
                const slice = matching.slice(0, args.limit ?? 20);
                return { events: slice.map(({ e }) => e), pageCursor, nextCursor: matching.length > slice.length ? slice.at(-1).index : null, skippedLines: 0 };
            }
            if (cmd === 'get_frozen_guard_seconds') return 5;
            if (cmd === 'get_maida2_play_delay_seconds') return 3;
            if (cmd === 'get_maida2_preview_audio') return false;
            if (cmd === 'get_maida2_card_opacity') return 70;
            return null;
        },
    };
}
