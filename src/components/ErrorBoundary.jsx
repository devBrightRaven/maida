import React from 'react';
import { t } from '../i18n';

// Safe i18n lookup — a crash during rendering doesn't always crash the i18n
// layer, but wrap anyway so a broken translation key never stops the error
// screen from rendering.
function tr(key, fallback) {
    try {
        const out = t(key);
        return typeof out === 'string' && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

// CSS vars with fallbacks — theme may be unavailable in crash state.
const containerStyle = {
    background: 'var(--t-bg, #050505)',
    color: 'var(--t-text, #e0e0e0)',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
};

const buttonStyle = {
    padding: '8px 20px',
    cursor: 'pointer',
    background: 'var(--t-surface, #1a1a1a)',
    color: 'var(--t-text, #e0e0e0)',
    border: '1px solid var(--t-border-subtle, #333)',
    borderRadius: 4,
    fontSize: 14,
    fontFamily: 'inherit',
};

class ErrorBoundary extends React.Component {
    state = { hasError: false, confirmClear: false };
    confirmTimerRef = null;

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('[Maida ErrorBoundary]', error, info);
    }

    componentWillUnmount() {
        if (this.confirmTimerRef) clearTimeout(this.confirmTimerRef);
    }

    handleClearClick = () => {
        if (this.state.confirmClear) {
            localStorage.clear();
            window.location.reload();
        } else {
            this.setState({ confirmClear: true });
            this.confirmTimerRef = setTimeout(() => this.setState({ confirmClear: false }), 3000);
        }
    };

    render() {
        if (this.state.hasError) {
            const errorMsg = tr('ui.error.boundary', 'Maida encountered an error.');
            const reloadLabel = tr('ui.error.reload', 'Reload');
            const clearLabel = this.state.confirmClear
                ? tr('ui.error.clear_confirm', 'Press again to confirm')
                : tr('ui.error.clear_data', 'Clear Data & Reload');

            return (
                <div style={containerStyle} role="alert" aria-live="assertive">
                    <p style={{ marginBottom: 24 }}>{errorMsg}</p>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={buttonStyle}
                        >
                            {reloadLabel}
                        </button>
                        <button
                            onClick={this.handleClearClick}
                            style={{ ...buttonStyle, opacity: this.state.confirmClear ? 1 : 0.7 }}
                        >
                            {clearLabel}
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
