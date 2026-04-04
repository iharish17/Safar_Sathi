import React from 'react';
import { motion } from 'framer-motion';
import { User, Train, Clock, MapPin, Check, X, ShieldAlert } from 'lucide-react';
import '../styles/RequestCard.css';

const RequestCard = ({ request, onAccept, onReject, onMarkPresent }) => {
  const MotionDiv = motion.div;
  const isPending = request.status === 'Pending';
  const isApproved = request.status === 'Approved';
  const isPresent = request.status === 'Present';
  const stationsGapValue = Number(request.stationsGap);
  const skipLimitValue = Number(request.skipLimit);
  const hasStationsGap = Number.isFinite(stationsGapValue);
  const hasSkipLimit = Number.isFinite(skipLimitValue);
  const statusClass = isPending
    ? 'status-pending'
    : isApproved
    ? 'status-approved'
    : isPresent
    ? 'status-present'
    : 'status-rejected';

  return (
    <MotionDiv 
      className={`card request-card ${statusClass} ${isPresent ? 'request-muted' : ''}`}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      style={{ marginBottom: '1rem' }}
    >
      <div className="request-head">
        <div className="request-user">
          <div className="user-avatar">
            <User size={20} />
          </div>
          <div>
            <h4 className="font-bold text-lg leading-tight">{request.passengers[0].name}</h4>
            <span className="text-xs text-muted font-mono">PNR: {request.pnr}</span>
          </div>
        </div>
        
        <span className={`badge ${
          isPending ? 'badge-warning' : 
          isApproved ? 'badge-info' : 
          isPresent ? 'badge-success' : 'badge-danger'
        }`}>
          {request.status}
        </span>
      </div>

      <div className="request-grid">
        <div className="request-meta">
           <MapPin size={16} className="text-error" />
           <div className="flex flex-col">
             <span className="request-label">Missed At</span>
             <span className="request-value">{request.missedStation}</span>
           </div>
        </div>
        <div className="request-meta">
           <MapPin size={16} className="text-success" />
           <div className="flex flex-col">
             <span className="request-label">Catching At</span>
             <span className="request-value">{request.catchStation}</span>
           </div>
        </div>
        <div className="request-meta">
           <Clock size={16} className="text-accent" />
           <div className="flex flex-col">
             <span className="request-label">ETA at {request.catchStation}</span>
             <span className="request-value">{request.eta}</span>
           </div>
        </div>
        <div className="request-meta">
           <Train size={16} className="text-primary" />
           <div className="flex flex-col">
             <span className="request-label">Seat Info</span>
             <span className="request-value">{request.passengers[0].coach} - {request.passengers[0].seat}</span>
           </div>
        </div>
      </div>

      <div className="my-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
        <div className="flex justify-between items-center mb-1">
           <span className="font-semibold text-gray-700">Boarding after {hasStationsGap ? stationsGapValue : '?'} stations</span>
           {hasStationsGap && hasSkipLimit && stationsGapValue > skipLimitValue ? (
               <span className="px-2 py-0.5 rounded text-white bg-error text-xs font-bold">Exceeds Limit ({request.skipLimit})</span>
           ) : (
               <span className="px-2 py-0.5 rounded text-white bg-success text-xs font-bold">Within Limit ({request.skipLimit})</span>
           )}
        </div>
        <p className="text-xs text-secondary">
          Train has {request.totalStations || '?'} stations. Max allowed skip is {request.skipLimit || '?'} stations.
        </p>
      </div>

      {request.message && (
        <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg text-sm text-blue-900 italic">
          "{request.message}"
        </div>
      )}

      {Array.isArray(request.changeLog) && request.changeLog.length > 0 && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs">
          <p className="font-semibold text-gray-700 mb-2">Request History</p>
          <div className="flex flex-col gap-1">
            {request.changeLog.slice(-4).reverse().map((entry, idx) => (
              <div key={`${entry.timestamp || 't'}-${idx}`} className="text-secondary">
                <span className="font-semibold text-gray-700">{entry.action || 'updated'}</span>
                {' '}
                <span>by {entry.actor || 'system'}</span>
                {entry.timestamp && <span> at {new Date(entry.timestamp).toLocaleTimeString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isPending && (
        <div className="request-actions">
          <button 
            className="btn btn-primary flex-1 py-2 text-sm"
            onClick={() => onAccept(request.id)}
          >
            <Check size={16} /> Accept
          </button>
          <button 
            className="btn btn-outline flex-1 py-2 text-sm"
            onClick={() => onReject(request.id)}
          >
            <X size={16} /> Reject
          </button>
        </div>
      )}

      {isApproved && (
        <div className="request-approved">
          <div className="flex items-center gap-2 text-sm text-primary">
            <ShieldAlert size={16} />
            <span>Protected from No-Show</span>
          </div>
          <button 
            className="btn btn-success py-2 text-sm px-4"
            onClick={() => onMarkPresent(request.id)}
          >
            <Check size={16} /> Mark Present
          </button>
        </div>
      )}
    </MotionDiv>
  );
};

export default RequestCard;
