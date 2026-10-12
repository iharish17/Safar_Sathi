import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div;

const TrainTracker = ({ positionValue, isMoving }) => {
  const [forwardIndex, setForwardIndex] = useState(0);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setForwardIndex((currentIndex) => {
        if (positionValue === 0) return 0;
        return Math.max(positionValue, currentIndex);
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [positionValue]);

  const yPos = useMemo(() => forwardIndex * 110 + 40, [forwardIndex]);
  
  return (
    <MotionDiv
      className="train-tracker"
      initial={{ y: 0 }}
      animate={{ y: yPos }}
      transition={{ duration: 4.2, ease: 'easeInOut' }}
    >
      <div className="tracker-shell">
        <MotionDiv
          className={`tracker-glow ${isMoving ? 'is-moving' : ''}`}
          animate={{ scale: [1, 1.2, 1], opacity: [0.42, 0.22, 0.42] }}
          transition={{ repeat: Infinity, duration: 5.4, ease: 'easeInOut' }}
        />
        <div className={`tracker-core ${isMoving ? 'is-moving' : ''}`}>
          <div className="tracker-dot" />
        </div>
      </div>
    </MotionDiv>
  );
};

export default TrainTracker;
