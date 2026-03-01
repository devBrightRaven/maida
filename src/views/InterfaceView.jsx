import React from 'react';
import GamePresence from '../components/GamePresence';
import { currentGame } from '../data';
import './InterfaceView.css';

export default function InterfaceView() {
    return (
        <div className="interface-container">
            <div className="breathing-circle"></div>

            <div className="interface-content">
                <div className="warm-greeting">
                    It is safe to stop here.
                </div>

                <div className="organic-space">
                    <GamePresence game={currentGame} />
                </div>

                <div className="interface-actions">
                    <button className="soft-btn primary">Visit</button>
                    <button className="soft-btn secondary">Not Today</button>
                </div>
            </div>
        </div>
    );
}
