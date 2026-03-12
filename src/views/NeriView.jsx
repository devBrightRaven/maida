import { useState, useEffect, useCallback } from 'react';
import FaceSwitchButton from '../ui/FaceSwitchButton';
import { useGameInput } from '../hooks/useGameInput';
import './NeriView.css';

/**
 * Neri (練) — slow curation face.
 * Placeholder: will be expanded with ShowcaseList, Search, Explore in later tasks.
 */
export default function NeriView({ onSwitchToAida }) {
    useGameInput({
        onBack: onSwitchToAida,
    });

    return (
        <div className="neri-view">
            <div className="neri-content">
                <p className="neri-placeholder">Neri — curation view (coming soon)</p>
            </div>
            <FaceSwitchButton direction="to-aida" onClick={onSwitchToAida} />
        </div>
    );
}
