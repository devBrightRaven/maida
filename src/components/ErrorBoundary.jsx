import React from 'react';

const containerStyle = {
    background: '#050505',
    color: '#e0e0e0',
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
    background: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #333',
    borderRadius: 4,
    fontSize: 14,
};

class ErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('[Maida ErrorBoundary]', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={containerStyle}>
                    <p style={{ marginBottom: 24 }}>Maida encountered an error.</p>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={buttonStyle}
                        >
                            Reload
                        </button>
                        <button
                            onClick={() => {
                                localStorage.clear();
                                window.location.reload();
                            }}
                            style={{ ...buttonStyle, opacity: 0.7 }}
                        >
                            Clear Data &amp; Reload
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
