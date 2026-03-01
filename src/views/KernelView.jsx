import React from 'react';
import GamePresence from '../components/GamePresence';
import { currentGame } from '../data';
import './KernelView.css';

export default function KernelView() {
    return (
        <div className="kernel-container">
            <div className="kernel-grid">
                <div className="grid-line horizontal"></div>
                <div className="grid-line vertical"></div>
            </div>

            <div className="kernel-content">
                <div className="system-status">
                    <span className="status-dot"></span>
                    STATE: MA (STRUCTURAL)
                </div>

                <div className="void-space">
                    <GamePresence game={currentGame} />
                </div>

                <div className="kernel-controls">
                    <p className="axiom">
                        This is a space that preserves subject continuity.<br />
                        Immediate decision is not required.
                    </p>
                    <button className="kernel-btn">RESIDE</button>
                </div>
            </div>
        </div>
    );
}
