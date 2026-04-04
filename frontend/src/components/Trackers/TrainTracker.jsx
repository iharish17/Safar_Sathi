import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';

const TrainTracker = ({ positionValue, isMoving }) => {
  const lastForwardIndexRef = useRef(0);

  // Reset on fresh route loads where the index starts from the beginning.
  if (positionValue === 0 && lastForwardIndexRef.current > 0) {
    lastForwardIndexRef.current = 0;
  }

  // Keep the tracker moving forward only as stations advance.
  const forwardIndex = Math.max(positionValue, lastForwardIndexRef.current);
  lastForwardIndexRef.current = forwardIndex;

  const yPos = useMemo(() => forwardIndex * 110 + 40, [forwardIndex]);
  
  return (
    <motion.div
      className="train-tracker"
      initial={{ y: 0 }}
      animate={{ y: yPos }}
      transition={{ duration: 4.2, ease: 'easeInOut' }}
    >
      <div className="tracker-shell">
        <motion.div
          className={`tracker-glow ${isMoving ? 'is-moving' : ''}`}
          animate={{ scale: [1, 1.2, 1], opacity: [0.42, 0.22, 0.42] }}
          transition={{ repeat: Infinity, duration: 5.4, ease: 'easeInOut' }}
        />
        <div className={`tracker-core ${isMoving ? 'is-moving' : ''}`}>
          <div className="tracker-dot" />
        </div>
      </div>
    </motion.div>
  );
};

export default TrainTracker;
