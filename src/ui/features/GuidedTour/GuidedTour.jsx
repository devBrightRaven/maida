import { useState, useEffect, useRef, useCallback } from 'react';
import { t } from '../../../i18n';
import { useGameInput } from '../../../hooks/useGameInput';
import './GuidedTour.css';

/**
 * GuidedTour — highlights UI elements with tooltip explanations.
 * App.jsx owns the global step counter. This component is a pure display.
 *
 * Gamepad support:
 * - A button: advance (Next/Done) on non-interactive steps
 * - B button: close tour (Skip)
 * - D-pad left/right: navigate between Skip / Prev / Next buttons
 * - D-pad focuses buttons so A confirms the focused action
 */

// Wrap keyboard shortcuts and quoted button names in <kbd> tags.
// Quote patterns cover: zh-TW/ja corner brackets 「」, EN double quotes "…",
// EN single quotes '…'. Keyboard shortcuts are the same across locales.
function formatHotkeys(text) {
    if (!text) return null;
    const pattern = /(Ctrl\+Tab|F10|F1|F2|LB|RB|「[^」]+」|"[^"]+"|'[^']+')/g;
    const parts = text.split(pattern);
    const singleMatch = /^(Ctrl\+Tab|F10|F1|F2|LB|RB|「[^」]+」|"[^"]+"|'[^']+')$/;
    return parts.map((part, i) =>
        singleMatch.test(part)
            ? <kbd key={i} className="guided-tour-kbd">{part}</kbd>
            : part
    );
}

export default function GuidedTour({ steps, localIndex, globalIndex, totalSteps, onAdvance, onPrev, onClose }) {
    const highlightRef = useRef(null);
    const skipRef = useRef(null);
    const prevRef = useRef(null);
    const nextRef = useRef(null);
    const [focusedBtn, setFocusedBtn] = useState('next'); // 'skip' | 'prev' | 'next'
    const focusedBtnRef = useRef('next');
    const updateFocusedBtn = useCallback((name) => {
        setFocusedBtn(name);
        focusedBtnRef.current = name;
    }, []);

    const step = steps[localIndex];
    const isLast = globalIndex === totalSteps - 1;
    const hasPrev = localIndex > 0 && onPrev;

    // Get the list of available buttons for d-pad navigation
    const getButtonOrder = useCallback(() => {
        const order = ['skip'];
        if (hasPrev) order.push('prev');
        if (!step?.interactive) order.push('next');
        return order;
    }, [hasPrev, step]);

    // Focus the appropriate button
    const focusButton = useCallback((name) => {
        const refs = { skip: skipRef, prev: prevRef, next: nextRef };
        const ref = refs[name];
        if (ref?.current) {
            ref.current.focus();
            updateFocusedBtn(name);
        }
    }, [updateFocusedBtn]);

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
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [localIndex, step]);

    // Position tooltip relative to target
    useEffect(() => {
        if (!step?.targetRef?.current) return;

        const position = () => {
            const el = step.targetRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const tooltip = skipRef.current?.closest('.guided-tour-tooltip');
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

        position();
        window.addEventListener('resize', position);
        return () => window.removeEventListener('resize', position);
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
        void el.offsetWidth;
        el.classList.add('guided-tour-pulse');
        return () => {
            el.classList.remove('guided-tour-pulse');
            el.classList.remove('guided-tour-target-focus');
        };
    }, [localIndex, step]);

    // Focus management on each step change
    useEffect(() => {
        const timer = setTimeout(() => {
            if (step?.interactive && step?.targetRef?.current) {
                // Interactive step: focus the target element and add visible focus indicator
                const el = step.targetRef.current;
                el.classList.add('guided-tour-target-focus');
                el.focus();
            } else {
                // Normal step: focus Next button
                const order = getButtonOrder();
                const target = order.includes('next') ? 'next' : 'skip';
                focusButton(target);
            }
        }, 150);
        return () => {
            clearTimeout(timer);
            // Clean up focus indicator from previous interactive step
            if (step?.interactive && step?.targetRef?.current) {
                step.targetRef.current.classList.remove('guided-tour-target-focus');
            }
        };
    }, [localIndex, step, getButtonOrder, focusButton]);

    // Gamepad: A = activate focused button, B = close, D-pad = navigate buttons
    useGameInput({
        onMainAction: () => {
            const btn = focusedBtnRef.current;
            if (btn === 'next' && !step?.interactive) onAdvance();
            else if (btn === 'prev' && hasPrev) onPrev();
            else if (btn === 'skip') onClose();
        },
        onBack: onClose,
        onNav: (dir) => {
            const order = getButtonOrder();
            const idx = order.indexOf(focusedBtnRef.current);
            if (dir === 'right' || dir === 'down') {
                const next = order[(idx + 1) % order.length];
                focusButton(next);
            } else if (dir === 'left' || dir === 'up') {
                const prev = order[(idx - 1 + order.length) % order.length];
                focusButton(prev);
            }
        },
        disabled: false,
    });

    // Escape key + interactive-step Tab trap. For non-interactive steps, Tab
    // is trapped inside the dialog via handleTabTrap below. For interactive
    // steps, the target element is focused OUTSIDE the dialog DOM, so we need
    // a window-level Tab interceptor to keep focus on the target (otherwise
    // Tab escapes to underlying UI that's visually hidden by the spotlight).
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'Tab' && step?.interactive && step?.targetRef?.current) {
                // Only trap if focus is currently on the target; otherwise let
                // dialog's own handleTabTrap deal with it.
                if (document.activeElement === step.targetRef.current) {
                    e.preventDefault();
                    step.targetRef.current.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, step]);

    // Tab trap — keeps focus inside the dialog per ARIA dialog pattern.
    // For interactive steps the target element owns focus (user is about to
    // operate it), so Tab stays pinned there until they advance.
    const handleTabTrap = useCallback((e) => {
        if (e.key !== 'Tab') return;
        if (step?.interactive && step?.targetRef?.current) {
            e.preventDefault();
            step.targetRef.current.focus();
            return;
        }
        const order = getButtonOrder();
        if (order.length === 0) return;
        const idx = order.indexOf(focusedBtnRef.current);
        if (idx === -1) {
            e.preventDefault();
            focusButton(order[0]);
            return;
        }
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        const next = order[(idx + delta + order.length) % order.length];
        focusButton(next);
    }, [step, getButtonOrder, focusButton]);

    return (
        <div className="guided-tour-overlay" ref={highlightRef}>
            <div
                className="guided-tour-tooltip"
                style={{ position: 'fixed', maxWidth: '360px' }}
                role="dialog"
                aria-modal="true"
                aria-label={t('ui.tour.aria_label')}
                aria-describedby="guided-tour-step-text"
                onKeyDown={handleTabTrap}
            >
                <p id="guided-tour-step-text" className="guided-tour-text">{formatHotkeys(step?.text)}</p>
                <div className="guided-tour-actions">
                    <span className="guided-tour-counter">
                        {globalIndex + 1} / {totalSteps}
                    </span>
                    <div className="guided-tour-buttons">
                        <button
                            ref={skipRef}
                            className="guided-tour-skip"
                            onClick={onClose}
                            onMouseEnter={() => updateFocusedBtn('skip')}
                        >
                            {t('ui.tour.skip')}
                        </button>
                        {hasPrev && (
                            <button
                                ref={prevRef}
                                className="guided-tour-prev"
                                onClick={onPrev}
                                onMouseEnter={() => updateFocusedBtn('prev')}
                            >
                                {t('ui.tour.prev')}
                            </button>
                        )}
                        {!step?.interactive && (
                            <button
                                ref={nextRef}
                                className="guided-tour-next"
                                onClick={onAdvance}
                                onMouseEnter={() => updateFocusedBtn('next')}
                            >
                                {isLast ? t('ui.tour.done') : t('ui.tour.next')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
