/**
 * RinFacingMark
 * Geometric no-art fallback for the Rin art box (viewBox matches the box's
 * 1920:620 ratio). The viewer stands on the near ground, facing one large
 * triangle that rises from the horizon; nested triangles recede toward its
 * base so it reads as something with depth in front of you, and two floor
 * lines converge on it from the bottom edge. The triangle is Rin's own mode
 * symbol, so the box reads as "Rin, no art for this game", never as game
 * art. Decorative: stroke only, currentColor, hidden from assistive tech by
 * the parent RinArt box.
 */

// Scale factor toward the triangle's base-centre, stroke width (CSS px)
// and opacity, outermost first. Strokes thin and fade inward so the layers
// read as depth rather than as copies (user review 2026-09-26: bolder, but
// with hierarchy).
const LAYERS = [
    { s: 1, w: 4, o: 1 },
    { s: 0.74, w: 3, o: 0.82 },
    { s: 0.52, w: 2.25, o: 0.64 },
    { s: 0.34, w: 1.5, o: 0.46 },
    { s: 0.2, w: 1, o: 0.32 },
];

const HORIZON_Y = 470;
const CX = 960;
const APEX_Y = 96;
const HALF_BASE = 250;

function trianglePoints(s) {
    // Scale toward (CX, HORIZON_Y) so every layer stands on the horizon.
    // Only the two sides are drawn (open at the base): the horizon itself is
    // the shared base, so stacked base edges never pile up into a thick bar.
    const apexY = HORIZON_Y - (HORIZON_Y - APEX_Y) * s;
    const half = HALF_BASE * s;
    return `${CX - half},${HORIZON_Y} ${CX},${apexY} ${CX + half},${HORIZON_Y}`;
}

export default function RinFacingMark() {
    return (
        <svg
            className="rin-art__mark"
            viewBox="0 0 1920 620"
            preserveAspectRatio="xMidYMid slice"
            focusable="false"
            aria-hidden="true"
        >
            <g fill="none" stroke="currentColor" strokeLinejoin="round">
                <line className="rin-art__mark-horizon" x1="0" y1={HORIZON_Y} x2="1920" y2={HORIZON_Y} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <line className="rin-art__mark-floor" x1="560" y1="620" x2={CX - 70} y2={HORIZON_Y} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <line className="rin-art__mark-floor" x1="1360" y1="620" x2={CX + 70} y2={HORIZON_Y} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {LAYERS.map(({ s, w, o }) => (
                    <polyline key={s} points={trianglePoints(s)} strokeLinecap="round" strokeWidth={w} opacity={o} vectorEffect="non-scaling-stroke" />
                ))}
            </g>
        </svg>
    );
}
