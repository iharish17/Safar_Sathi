import React from 'react';

const StationNode = ({ station, status, isLast }) => {
  let textColor = 'text-gray-700';
  let pulse = false;

  switch (status) {
    case 'completed':
      textColor = 'text-gray-400';
      break;
    case 'current':
      textColor = 'text-blue-700';
      pulse = true;
      break;
    case 'missed':
      textColor = 'text-red-700';
      break;
    case 'catchable':
      textColor = 'text-green-700';
      break;
    case 'last-catchable':
      textColor = 'text-red-700 font-extrabold';
      break;
    default:
      // upcoming
      textColor = 'text-gray-800';
      break;
  }

  const stateClass = `state-${status}`;

  return (
    <div className={`station-node ${stateClass}`}>
      {/* Timeline Line (connector) */}
      {!isLast && (
        <div className="station-connector" />
      )}

      {/* Node Circle */}
      <div className="station-bullet-wrap">
        <div className="station-bullet">
          {pulse && <div className="station-pulse" />}
          <div className={`station-dot ${pulse ? 'pulse' : ''} ${status === 'current' ? 'current-dot' : ''}`} />
        </div>
      </div>

      {/* Station Info */}
      <div className={`station-content ${textColor}`}>
        <div className="station-top">
           <div>
              <h3 className="station-title">
                 {station.stationName}
                 {status === 'current' && <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Current</span>}
                 {status === 'missed' && <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Missed</span>}
                 {status === 'catchable' && <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Safe Catch</span>}
                 {status === 'last-catchable' && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full uppercase tracking-widest font-black shadow-sm">Last Valid Catch</span>}
              </h3>
              <div className="station-meta">
                 <span>Arr: {station.arrives}</span>
                 <span>Dep: {station.departs}</span>
                 <span>Dist: {station.distance}</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default StationNode;
