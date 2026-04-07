import { useState, useEffect, useRef } from 'react';
import { t } from '../../../i18n';
import { useGameInput } from '../../../hooks/useGameInput';
import './GuidedTour.css';

/**
 * GuidedTour — opt-in walkthrough of Rin controls.
 * Highlights one element at a time with a tooltip explanation.
 * Fully keyboard/gamepad/SR accessible.
 */
export default function GuidedTour({ steps, onClose }) {
    const [currentStep, setCurrentStep] = useState(0);
    const tooltipRef = useRef(null);
    const [highlightRect, setHighlightRect] = useState(null);

    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    // Measure target element position for clip-path hole
    useEffect(() => {
        if (!step?.targetRef?.current) {
            setHighlightRect(null);
            return;
        }

        const measure = () => {
            const rect = step.targetRef.current.getBoundingClientRect();
            const padding = 8;
            setHighlightRect({
                top: rect.top - padding,
                left: rect.left - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2,
                // Tooltip position: prefer below, fallback above if near bottom
                tooltipTop: rect.bottom + 16,
                tooltipAbove: rect.top - 16,
                tooltipLeft: Math.max(16, rect.left),
                useAbove: rect.bottom + 200 > window.innerHeight,
            });
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [currentStep, step]);

    // Focus tooltip on each step for SR
    useEffect(() => {
        const timer = setTimeout(() => {
            tooltipRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, [currentStep]);

    // Gamepad/keyboard support
    useGameInput({
        onMainAction: () => {
            if (isLast) onClose();
            else setCurrentStep(s => s + 1);
        },
        onBack: onClose,
        disabled: false,
    });

    // Keyboard handler for Escape
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const clipPath = highlightRect
        ? `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${highlightRect.left}px ${highlightRect.top}px,
            ${highlightRect.left}px ${highlightRect.top + highlightRect.height}px,
            ${highlightRect.left + highlightRect.width}px ${highlightRect.top + highlightRect.height}px,
            ${highlightRect.left + highlightRect.width}px ${highlightRect.top}px,
            ${highlightRect.left}px ${highlightRect.top}px
          )`
        : 'none';

    const tooltipStyle = highlightRect ? {
        position: 'fixed',
        left: `${highlightRect.tooltipLeft}px`,
        top: highlightRect.useAbove
            ? `${highlightRect.tooltipAbove}px`
            : `${highlightRect.tooltipTop}px`,
        transform: highlightRect.useAbove ? 'translateY(-100%)' : 'none',
        maxWidth: '360px',
    } : {};

    return (
        <div className="guided-tour-overlay" style={{ clipPath }}>
            <div
                ref={tooltipRef}
                className="guided-tour-tooltip"
                style={tooltipStyle}
                role="dialog"
                aria-label={t('ui.tour.aria_label')}
                aria-live="polite"
                tabIndex={-1}
            >
                <p className="guided-tour-text">{step?.text}</p>
                <div className="guided-tour-actions">
                    <span className="guided-tour-counter">
                        {currentStep + 1} / {steps.length}
                    </span>
                    <div className="guided-tour-buttons">
                        <button
                            className="guided-tour-skip"
                            onClick={onClose}
                        >
                            {t('ui.tour.skip')}
                        </button>
                        <button
                            className="guided-tour-next"
                            onClick={() => {
                                if (isLast) onClose();
                                else setCurrentStep(s => s + 1);
                            }}
                        >
                            {isLast ? t('ui.tour.done') : t('ui.tour.next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
