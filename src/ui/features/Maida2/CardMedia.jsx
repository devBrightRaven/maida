import { useState, useEffect, useRef } from 'react';
import { getLocale } from '../../../i18n';
import bridge from '../../../services/bridge';

const SLIDE_INTERVAL_MS = 3000;
const MAX_SCREENSHOTS = 4;

// Session caches (appId -> Promise|MediaInfo|null; `${appId}:${index}` ->
// Promise|dataUrl|null), same in-flight-then-resolved convention as
// Maida2View's capsuleCache/heroCache — a repeated dwell on the same game
// this app run never re-invokes an in-flight or already-resolved fetch.
const mediaCache = new Map();
const screenshotCache = new Map();

function cachedMedia(appId) {
    if (!mediaCache.has(appId)) {
        mediaCache.set(appId, bridge.getGameMedia(appId, getLocale()));
    }
    return Promise.resolve(mediaCache.get(appId)).then((info) => {
        mediaCache.set(appId, info);
        return info;
    });
}

function cachedScreenshot(appId, index) {
    const key = `${appId}:${index}`;
    if (!screenshotCache.has(key)) {
        screenshotCache.set(key, bridge.getScreenshot(appId, index));
    }
    return Promise.resolve(screenshotCache.get(key)).then((url) => {
        screenshotCache.set(key, url);
        return url;
    });
}

/**
 * CardMedia — ambient video/slideshow preview for a dwelled Maida2 card.
 * Purely decorative (aria-hidden, no controls, never focusable) — the
 * card's own title remains its accessible name. Parent mounts this
 * component only while its card is the current dwell-to-play target;
 * unmounting is the stop signal and every effect below cleans up on it
 * (interval cleared, video paused before React detaches it).
 *
 * audioEnabled (user ruling 2026-08-31: silence clause repealed, default
 * on at low volume): true unmutes at volume 0.35; false stays muted as
 * before. Volume/play are (re)applied on native 'canplay', which fires
 * once media is actually playable on both the direct-mp4 and hls.js/MSE
 * paths — the explicit play() there also turns an autoplay-policy
 * rejection into a promise we can catch and fall back to the slideshow.
 */
export default function CardMedia({ appId, reducedMotion, audioEnabled }) {
    const [media, setMedia] = useState(undefined); // undefined = loading, null = none available
    const [videoFailed, setVideoFailed] = useState(false);
    const [slides, setSlides] = useState([]);
    const [slideIndex, setSlideIndex] = useState(0);
    const videoRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setMedia(undefined);
        setVideoFailed(false);
        setSlides([]);
        setSlideIndex(0);
        if (!appId) return undefined;
        cachedMedia(appId).then((info) => {
            if (!cancelled) setMedia(info ?? null);
        });
        return () => { cancelled = true; };
    }, [appId]);

    const movie = media?.movie;
    // mp4 (legacy-forward, plays natively) wins over hls (needs hls.js) when
    // both happen to be present. dash_h264-only has no player here — falls
    // through to the slideshow like "no movie" would.
    const hasDirectMp4 = !!(movie && (movie.mp4_480 || movie.mp4_max));
    const hasHls = !!(movie && movie.hls_h264 && !hasDirectMp4);
    const showVideo = !!(movie && (hasDirectMp4 || hasHls) && !reducedMotion && !videoFailed);
    // Fall back to the slideshow once metadata has resolved and video isn't
    // the plan (no movie, reduced motion, or the video failed to play).
    const showSlideshow = media !== undefined && !showVideo;

    // hls.js is only pulled in when there's an hls manifest to actually
    // play, and only at play time (dynamic import keeps it out of the main
    // bundle). Destroys on unmount/appId change/collapse (cleanup) and on
    // fatal error, then falls back to the slideshow via videoFailed.
    useEffect(() => {
        if (!showVideo || !hasHls || !videoRef.current) return undefined;
        let cancelled = false;
        let hls = null;
        import('hls.js').then(({ default: Hls }) => {
            if (cancelled || !videoRef.current) return;
            if (!Hls.isSupported()) {
                setVideoFailed(true);
                return;
            }
            hls = new Hls({ lowLatencyMode: false });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;
                setVideoFailed(true);
                hls?.destroy();
                hls = null;
            });
            hls.loadSource(movie.hls_h264);
            hls.attachMedia(videoRef.current);
        }).catch(() => setVideoFailed(true));
        return () => {
            cancelled = true;
            hls?.destroy();
            hls = null;
        };
    }, [showVideo, hasHls, movie?.hls_h264]);

    useEffect(() => {
        if (!showSlideshow || !appId || !media) return undefined;
        // Reduced motion never cycles, so only the first screenshot is worth
        // fetching — no point paying for 3 images nobody will see move.
        const count = reducedMotion
            ? Math.min(media.screenshots?.length || 0, 1)
            : Math.min(media.screenshots?.length || 0, MAX_SCREENSHOTS);
        if (count === 0) return undefined;
        let cancelled = false;
        (async () => {
            for (let i = 0; i < count; i++) {
                const url = await cachedScreenshot(appId, i);
                if (cancelled) return;
                if (url) setSlides((prev) => [...prev, url]);
            }
        })();
        return () => { cancelled = true; };
    }, [showSlideshow, appId, media, reducedMotion]);

    useEffect(() => {
        if (!showSlideshow || reducedMotion || slides.length <= 1) return undefined;
        const id = setInterval(() => {
            setSlideIndex((i) => (i + 1) % slides.length);
        }, SLIDE_INTERVAL_MS);
        return () => clearInterval(id);
    }, [showSlideshow, reducedMotion, slides.length]);

    // Pause on unmount/collapse — the stop signal for any audio too, since
    // playback (and volume) start over fresh on the next mount.
    useEffect(() => () => { videoRef.current?.pause(); }, []);

    const handleVideoReady = () => {
        const v = videoRef.current;
        if (!v) return;
        if (audioEnabled) v.volume = 0.35;
        // Explicit play() (redundant with the autoplay attribute when it
        // succeeds) so an autoplay-policy rejection is a promise we can
        // catch, rather than a silently-paused video with no signal.
        // Unmuted autoplay only works where the platform's browser engine
        // allows it (here, Windows dev/prod via additionalBrowserArgs's
        // --autoplay-policy flag) — elsewhere the first play() rejects, so
        // retry once muted before falling back to the slideshow.
        v.play()?.catch(() => {
            v.muted = true;
            v.play()?.catch(() => setVideoFailed(true));
        });
    };

    if (showVideo) {
        return (
            <video
                ref={videoRef}
                className="m2-card-media-video"
                muted={!audioEnabled}
                autoPlay
                loop
                playsInline
                aria-hidden="true"
                tabIndex={-1}
                // hasHls path: no src attribute — hls.js's attachMedia
                // effect above drives the element directly (MSE blob).
                src={hasDirectMp4 ? (movie.mp4_480 || movie.mp4_max) : undefined}
                onCanPlay={handleVideoReady}
                onError={() => setVideoFailed(true)}
            />
        );
    }

    if (showSlideshow && slides.length > 0) {
        return (
            <div className="m2-card-media-slideshow" aria-hidden="true">
                {slides.map((url, i) => (
                    <img
                        key={url}
                        className={`m2-card-media-slide${i === slideIndex ? ' m2-card-media-slide--active' : ''}`}
                        alt=""
                        draggable={false}
                        src={url}
                    />
                ))}
            </div>
        );
    }

    return null;
}
