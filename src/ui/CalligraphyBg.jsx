import rinSvg from '../assets/rin-calligraphy.svg?raw';
import kamaeSvg from '../assets/kamae-calligraphy.svg?raw';

/**
 * CalligraphyBg — inline SVG background watermark using traced calligraphy.
 * SVG assets use fill="currentColor", inheriting CSS color for theme support.
 * Content is static build-time assets (not user input), safe for innerHTML.
 */
const svgMap = {
    '臨': rinSvg,
    '構': kamaeSvg,
};

export default function CalligraphyBg({ char, className }) {
    const svg = svgMap[char];
    if (!svg) return null;

    // Static SVG from our own assets — safe for dangerouslySetInnerHTML
    return (
        <div
            className={className}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
