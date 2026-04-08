import { useEffect, useRef } from 'react';
import { t } from '../../../i18n';
import { useGameInput } from '../../../hooks/useGameInput';
import './GuidedTour.css';

/**
 * GuidedTour — highlights UI elements with tooltip explanations.
 * App.jsx owns the global step counter. This component is a pure display.
 *
 * Props:
 * - steps: [{ targetRef, text, interactive? }] — steps for this view
 * - localIndex: which step within this view's steps array to show
 * - globalIndex: current step in the full tour (for counter display)
 * - totalSteps: total steps across all views
 * - onAdvance: called when user clicks Next (non-interactive steps)
 * - onClose: called when user clicks Skip or presses Escape
 */
// Wrap keyboard shortcuts (e.g. Ctrl+Tab, RB, LB, NOT NOW, TRY) in <kbd> tags
function formatHotkeys(text) {
    if (!text) return null;
    const parts = text.split(/(Ctrl\+Tab|LB|RB|NOT NOW|TRY|PLAY)/g);
    return parts.map((part, i) =>
        /^(Ctrl\+Tab|LB|RB|NOT NOW|TRY|PLAY)$/.test(part)
            ? <kbd key={i} className="guided-tour-kbd">{part}</kbd>
            : part
    );
}

export default function GuidedTour({ steps, localIndex, globalIndex, totalSteps, onAdvance, onPrev, onClose }) {
    const tooltipRef = useRef(null);
    const highlightRef = useRef(null);

    const step = steps[localIndex];
    const isLast = globalIndex === totalSteps - 1;

    // Measure target element position for clip-path hole
    useEffect(() => {
        if (!step?.targetRef?.current) {
            if (highlightRef.current) highlightRef.current.style.clipPath = 'none';
            return;
        }

        const measure = () => {
            const el = step.targetRef.current;
            const overlay = highlightRef.current;
            if (!el || !overlay) return;

            const rect = el.getBoundingClientRect();
            const padding = 8;
            const top = rect.top - padding;
            const left = rect.left - padding;
            const width = rect.width + padding * 2;
            const height = rect.height + padding * 2;

            overlay.style.clipPath = `polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                ${left}px ${top}px,
                ${left}px ${top + height}px,
                ${left + width}px ${top + height}px,
                ${left + width}px ${top}px,
                ${left}px ${top}px
            )`;

            // Position tooltip
            const tooltip = tooltipRef.current;
            if (!tooltip) return;
            const maxW = 360;
            const nearRight = rect.right + 16 > window.innerWidth - maxW;
            const tLeft = nearRight
                ? Math.max(16, window.innerWidth - maxW - 16)
                : Math.max(16, rect.left);
            const useAbove = rect.bottom + 200 > window.innerHeight;

            tooltip.style.left = `${tLeft}px`;
            tooltip.style.top = useAbove
                ? `${rect.top - 16}px`
                : `${rect.bottom + 16}px`;
            tooltip.style.transform = useAbove ? 'translateY(-100%)' : 'none';
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [localIndex, step]);

    // Interactive step: pulse the target element 3 times then hold glow
    const pulsedRef = useRef(false);
    useEffect(() => {
        pulsedRef.current = false;
    }, [localIndex]);
    useEffect(() => {
        const el = step?.targetRef?.current;
        if (!el || !step?.interactive || pulsedRef.current) return;
        pulsedRef.current = true;
        el.classList.remove('guided-tour-pulse');
        // Force reflow so re-adding the class restarts the animation
        void el.offsetWidth;
        el.classList.add('guided-tour-pulse');
        return () => el.classList.remove('guided-tour-pulse');
    }, [localIndex, step]);

    // Focus tooltip for SR on each step change
    useEffect(() => {
        const timer = setTimeout(() => tooltipRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, [localIndex]);

    // Gamepad/keyboard (non-interactive steps only)
    useGameInput({
        onMainAction: () => { if (!step?.interactive) onAdvance(); },
        onBack: onClose,
        disabled: false,
    });

    // Escape key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="guided-tour-overlay" ref={highlightRef}>
            <div
                ref={tooltipRef}
                className="guided-tour-tooltip"
                style={{ position: 'fixed', maxWidth: '360px' }}
                role="dialog"
                aria-label={t('ui.tour.aria_label')}
                aria-live="polite"
                tabIndex={-1}
            >
                <p className="guided-tour-text">{formatHotkeys(step?.text)}</p>
                <div className="guided-tour-actions">
                    <span className="guided-tour-counter">
                        {globalIndex + 1} / {totalSteps}
                    </span>
                    <div className="guided-tour-buttons">
                        <button className="guided-tour-skip" onClick={onClose}>
                            {t('ui.tour.skip')}
                        </button>
                        {localIndex > 0 && onPrev && (
                            <button className="guided-tour-prev" onClick={onPrev}>
                                {t('ui.tour.prev')}
                            </button>
                        )}
                        {!step?.interactive && (
                            <button className="guided-tour-next" onClick={onAdvance}>
                                {isLast ? t('ui.tour.done') : t('ui.tour.next')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
