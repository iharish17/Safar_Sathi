import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/VideoLoader.css';

const TITLE_REVEAL_MS = 2000;
const SHIMMER_START_MS = 2200;
const FALLBACK_COMPLETE_MS = 4500;

const VideoLoader = ({ 
  src = '/Safar_Sathi.mp4', 
  isLoading = true,
  onComplete
}) => {
  const [phase, setPhase] = useState('idle');
  const timeoutRefs = useRef([]);
  const hasCompletedRef = useRef(false);

  const clearPhaseTimers = useCallback(() => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
  }, []);

  const finishLoader = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    clearPhaseTimers();
    onComplete?.();
  }, [clearPhaseTimers, onComplete]);

  const schedulePhaseTimers = useCallback((durationMs = FALLBACK_COMPLETE_MS) => {
    const safeDurationMs = Math.max(durationMs, 400);
    const revealAtMs = Math.min(TITLE_REVEAL_MS, Math.max(safeDurationMs - 250, 0));
    const shimmerAtMs = Math.min(
      SHIMMER_START_MS,
      Math.max(safeDurationMs - 100, revealAtMs)
    );

    clearPhaseTimers();

    if (revealAtMs === 0) {
      setPhase('revealing');
    } else {
      timeoutRefs.current.push(setTimeout(() => setPhase('revealing'), revealAtMs));
    }

    if (shimmerAtMs === 0) {
      setPhase('shimmering');
    } else {
      timeoutRefs.current.push(setTimeout(() => setPhase('shimmering'), shimmerAtMs));
    }

    timeoutRefs.current.push(setTimeout(() => finishLoader(), safeDurationMs + 250));
  }, [clearPhaseTimers, finishLoader]);

  const handleLoadedMetadata = useCallback((event) => {
    const durationSeconds = event.currentTarget.duration;

    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      schedulePhaseTimers(durationSeconds * 1000);
    }
  }, [schedulePhaseTimers]);

  useEffect(() => {
    if (!isLoading) {
      clearPhaseTimers();
      return undefined;
    }

    hasCompletedRef.current = false;
    const kickoffId = setTimeout(() => {
      schedulePhaseTimers();
    }, 0);

    return () => {
      clearTimeout(kickoffId);
      clearPhaseTimers();
    };
  }, [clearPhaseTimers, isLoading, schedulePhaseTimers]);

  if (!isLoading) return null;

  const contentClassName = [
    'video-loader-content',
    phase !== 'idle' ? 'is-revealed' : '',
    phase === 'shimmering' ? 'is-shimmering' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="video-loader-container">
      <div className={contentClassName}>
        <video 
          className="video-loader-video" 
          autoPlay 
          muted 
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={finishLoader}
          onError={finishLoader}
        >
          <source src={src} type="video/mp4" />
        </video>
        <p className="video-loader-title">Safar Sathi</p>
      </div>
    </div>
  );
};

export default VideoLoader;