/**
 * CalligraphyBg — inline SVG background watermark.
 * Replace with real calligraphy SVG path data later.
 */
export default function CalligraphyBg({ char, className }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 200"
            aria-hidden="true"
        >
            <text
                x="100"
                y="165"
                fontSize="180"
                fontWeight="300"
                textAnchor="middle"
                fontFamily="serif"
                fill="currentColor"
            >
                {char}
            </text>
        </svg>
    );
}
