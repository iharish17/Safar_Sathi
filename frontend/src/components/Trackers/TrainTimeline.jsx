import React, { useEffect, useMemo, useState } from 'react';
import StationNode from './StationNode';
import TrainTracker from './TrainTracker';
import '../../styles/LiveTracker.css';

const parseMinutes = (value) => {
  if (!value || /source|destination/i.test(value)) return null;
  const [hh, mm] = String(value).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return (hh * 60) + mm;
};

const TrainTimeline = ({ trainRoute, liveData, missedInfo }) => {
  const routeStops = trainRoute || [];

  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Find the exact index in trainRoute array matching currentStation
  let currentPosIndex = -1;
  if (liveData?.currentStation && routeStops.length) {
    const currentSno = Number(liveData.currentStation.sno);
    currentPosIndex = routeStops.findIndex(st => Number(st.sno) === currentSno);
  }

  const trackerPosition = useMemo(() => {
    if (currentPosIndex < 0) return 0;

    const departureMinutes = parseMinutes(liveData?.currentStation?.departs);
    const nextArrivalMinutes = parseMinutes(liveData?.nextStation?.arrives);

    if (departureMinutes === null || nextArrivalMinutes === null || nextArrivalMinutes <= departureMinutes) {
      return currentPosIndex;
    }

    if (nowMinutes <= departureMinutes) {
      return currentPosIndex;
    }

    const progress = (nowMinutes - departureMinutes) / (nextArrivalMinutes - departureMinutes);
    const clampedProgress = Math.max(0, Math.min(1, progress));
    return currentPosIndex + clampedProgress;
  }, [currentPosIndex, liveData?.currentStation?.departs, liveData?.nextStation?.arrives, nowMinutes]);

  const isTrackerMoving = useMemo(() => {
    if (currentPosIndex < 0) return false;

    const departureMinutes = parseMinutes(liveData?.currentStation?.departs);
    const nextArrivalMinutes = parseMinutes(liveData?.nextStation?.arrives);
    if (departureMinutes === null || nextArrivalMinutes === null || nextArrivalMinutes <= departureMinutes) {
      return false;
    }

    return nowMinutes > departureMinutes && nowMinutes < nextArrivalMinutes;
  }, [currentPosIndex, liveData?.currentStation?.departs, liveData?.nextStation?.arrives, nowMinutes]);

  return (
    <div className="timeline-shell">
      {currentPosIndex >= 0 && (
         <TrainTracker positionValue={trackerPosition} isMoving={isTrackerMoving} />
      )}
      
      {routeStops.length === 0 ? null : routeStops.map((stop, idx) => {
         let status = 'upcoming';
         
         // Apply Missed Train Status rules if active
         if (missedInfo && missedInfo.missed) {
             const boardingIndex = Number(missedInfo.boardingIndex);
             const currentIndex = Number(missedInfo.currentIndex);
             const lastValidIndex = Number(missedInfo.lastValidIndex);

           if (idx <= boardingIndex) {
             status = 'completed';
           } else if (idx === currentIndex) {
             status = 'current';
           } else if (idx > boardingIndex && idx < currentIndex) {
             status = 'missed';
             } else if (idx > currentIndex && idx < lastValidIndex) {
                 status = 'catchable';
             } else if (idx === lastValidIndex && missedInfo.canCatch) {
                 status = 'last-catchable';
             }
         } else {
             // Normal Tracking Status
             if (idx < currentPosIndex) status = 'completed';
             else if (idx === currentPosIndex) status = 'current';
         }

         return (
           <div key={idx}>
              <StationNode 
                 station={stop} 
                 status={status} 
                 isLast={idx === routeStops.length - 1} 
              />
           </div>
         );
      })}
    </div>
  );
};

export default TrainTimeline;
