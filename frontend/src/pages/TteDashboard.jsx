import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Train, LayoutDashboard, Ticket, Users, 
  LogOut, Bell, Search, 
  FileCheck, ShieldAlert, Menu, X,
  MapPin, Clock, BadgeCheck, UserCircle, Phone, Mail, QrCode, Check
} from 'lucide-react';
import { getTteRequests } from '../services/api';
import RequestCard from '../components/RequestCard';
import { io } from 'socket.io-client';
import '../styles/TteDashboard.css';

const TTE_CACHE_KEY = 'safarsathi_tte_cached_requests_v1';
const TTE_QUEUE_KEY = 'safarsathi_tte_action_queue_v1';
const PRIORITY_CATCH_WINDOW_MINS = 90;

// Mock passenger manifest data
const mockPassengers = [
  { pnr: '8291047591', name: 'Ravi Kumar', age: 34, gender: 'M', coach: 'A1', seat: '45', from: 'DHN', to: 'NDLS', status: 'CNF' },
  { pnr: '4928174021', name: 'Anjali Sharma', age: 28, gender: 'F', coach: 'S4', seat: '12', from: 'LKO', to: 'NDLS', status: 'CNF' },
  { pnr: '4928174021', name: 'Vikram Sharma', age: 30, gender: 'M', coach: 'S4', seat: '13', from: 'LKO', to: 'NDLS', status: 'CNF' },
  { pnr: '1234123412', name: 'Suresh Raina', age: 35, gender: 'M', coach: 'B2', seat: '41', from: 'JAT', to: 'TATA', status: 'CNF' },
  { pnr: '1234567890', name: 'Amit Singh', age: 40, gender: 'M', coach: 'B1', seat: '12', from: 'TNA', to: 'LUR', status: 'CNF' },
  { pnr: '0987654321', name: 'Pooja Verma', age: 25, gender: 'F', coach: 'S2', seat: '54', from: 'IGP', to: 'DNR', status: 'CNF' },
  { pnr: '5544332211', name: 'Sneha Patel', age: 32, gender: 'F', coach: 'S5', seat: '22', from: 'DNR', to: 'LTT', status: 'CNF' },
  { pnr: '5544332211', name: 'Vikas Patel', age: 35, gender: 'M', coach: 'S5', seat: '23', from: 'DNR', to: 'LTT', status: 'CNF' },
];

// Mock staff data
const mockStaff = [
  { name: 'Jagdish Singh', role: 'Chief TTE', zone: 'Full Train', phone: '+91 98765 43210', email: 'jagdish.s@irctc.gov.in' },
  { name: 'Priya Mehra', role: 'TTE - Coach A1-A4', zone: 'AC First & 2-Tier', phone: '+91 91234 56780', email: 'priya.m@irctc.gov.in' },
  { name: 'Rahul Tiwari', role: 'TTE - Coach B1-B4', zone: 'AC 3-Tier', phone: '+91 87654 32100', email: 'rahul.t@irctc.gov.in' },
  { name: 'Meena Kumari', role: 'TTE - Coach S1-S6', zone: 'Sleeper', phone: '+91 99887 76650', email: 'meena.k@irctc.gov.in' },
];

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'approved') return 'Approved';
  if (value === 'present') return 'Present';
  if (value === 'rejected') return 'Rejected';
  if (value === 'cancelled') return 'Cancelled';
  return 'Pending';
};

const normalizeRequest = (request = {}) => ({
  ...request,
  status: normalizeStatus(request.status),
  missedStation: request.missedStation || request.boardingStation || 'N/A',
  boardingStation: request.boardingStation || request.missedStation || 'N/A',
  catchStation: request.catchStation || 'N/A',
  passengers: Array.isArray(request.passengers) && request.passengers.length > 0
    ? request.passengers
    : [{ name: 'Passenger', age: '', gender: '', coach: '-', seat: '-' }],
  changeLog: Array.isArray(request.changeLog) ? request.changeLog : [],
  timestamp: request.timestamp || request.createdAt || new Date().toISOString(),
});

const toClockMinutes = (timeLabel = '') => {
  const match = String(timeLabel || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return (hour * 60) + minute;
};

const getMinutesUntilClock = (timeLabel = '') => {
  const target = toClockMinutes(timeLabel);
  if (target === null) return null;
  const now = new Date();
  const nowMins = (now.getHours() * 60) + now.getMinutes();
  const diff = target - nowMins;
  return diff >= 0 ? diff : diff + (24 * 60);
};

const getPriorityInfo = (request = {}) => {
  const stationsGap = Number(request.stationsGap);
  const minsUntilEta = getMinutesUntilClock(request.eta);
  const byEta = Number.isFinite(minsUntilEta) && minsUntilEta >= 0 && minsUntilEta <= PRIORITY_CATCH_WINDOW_MINS;
  const byGap = Number.isFinite(stationsGap) && stationsGap <= 2;

  if (byEta || byGap) {
    const reason = byEta
      ? `Catch window closes in ~${minsUntilEta} min`
      : 'Very few stations left to catch';
    return { level: 'high', reason };
  }

  return { level: 'normal', reason: '' };
};

const sortNotifications = (items = []) => {
  return [...items].sort((a, b) => {
    const priorityScore = (value) => (value === 'high' ? 1 : 0);
    const pa = priorityScore(a.priorityLevel);
    const pb = priorityScore(b.priorityLevel);
    if (pb !== pa) return pb - pa;
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    return tb - ta;
  });
};

const toNotification = (request = {}) => ({
  ...(() => {
    const p = getPriorityInfo(request);
    return { priorityLevel: p.level, priorityReason: p.reason };
  })(),
  id: request.id,
  pnr: request.pnr,
  trainNumber: request.trainNumber,
  boardingStation: request.boardingStation || request.missedStation || 'N/A',
  catchStation: request.catchStation || 'N/A',
  eta: request.eta || '-',
  message: request.message || '',
  timestamp: request.timestamp || request.createdAt || new Date().toISOString(),
  read: false
});

const parseQrPayload = (payload = '') => {
  const pnrMatch = payload.match(/PNR:\s*([0-9]{6,12})/i);
  const trainMatch = payload.match(/Train:\s*([A-Z0-9]+)/i);
  const catchMatch = payload.match(/Catch At:\s*([A-Z0-9\s]+)/i);

  const passengers = [];
  payload.split('\n').forEach((line) => {
    const m = line.match(/^\s*\d+\.\s*([^,]+),\s*(\d+)([A-Z])?\s*\|\s*([A-Z0-9-]+)/i);
    if (m) {
      const seatText = m[4] || '';
      const [coachPart, seatPart] = seatText.split('-');
      passengers.push({
        name: m[1]?.trim() || '',
        age: m[2] || '',
        gender: m[3] || '',
        coach: coachPart || seatText,
        seat: seatPart || seatText
      });
    }
  });

  return {
    pnr: pnrMatch?.[1] || '',
    trainNumber: trainMatch?.[1] || '',
    catchAt: catchMatch?.[1]?.trim() || '',
    passengers,
    raw: payload
  };
};

const TteDashboard = () => {
  const MotionDiv = motion.div;
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const detectorRef = useRef(null);
  const socketRef = useRef(null);
  const requestsRef = useRef([]);
  const actionQueueRef = useRef([]);

  const persistQueue = useCallback((queue = []) => {
    actionQueueRef.current = queue;
    window.localStorage.setItem(TTE_QUEUE_KEY, JSON.stringify(queue));
  }, []);

  const enqueueSocketAction = useCallback((event, payload = {}) => {
    const next = [...actionQueueRef.current, { event, payload }];
    persistQueue(next);
  }, [persistQueue]);

  const flushQueue = useCallback(() => {
    if (!socketRef.current?.connected || actionQueueRef.current.length === 0) return;
    actionQueueRef.current.forEach((item) => {
      socketRef.current.emit(item.event, item.payload);
    });
    persistQueue([]);
  }, [persistQueue]);

  const emitOrQueue = useCallback((event, payload = {}) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, payload);
      return;
    }
    enqueueSocketAction(event, payload);
  }, [enqueueSocketAction]);

  const cleanupScanner = () => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    detectorRef.current = null;
  };

  const handleScanSuccess = useCallback((payload = '') => {
    const parsed = parseQrPayload(payload);
    const matchingReq = requestsRef.current.find(r => r.pnr === parsed.pnr);
    setScanResult({
      ...parsed,
      status: matchingReq?.status || 'Not Found',
      requestId: matchingReq?.id || null,
      detectedAt: new Date().toISOString()
    });
    setScannerActive(false);
  }, []);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
     const fetchInitialRequests = async () => {
         const cached = window.localStorage.getItem(TTE_CACHE_KEY);
         if (cached) {
           try {
             const parsed = JSON.parse(cached);
             if (Array.isArray(parsed) && parsed.length > 0) {
               const normalizedCached = parsed.map(normalizeRequest);
               setRequests(normalizedCached);
             }
           } catch {
             // ignore bad cache
           }
         }

         const queued = window.localStorage.getItem(TTE_QUEUE_KEY);
         if (queued) {
           try {
             const parsedQueue = JSON.parse(queued);
             if (Array.isArray(parsedQueue)) {
               actionQueueRef.current = parsedQueue;
             }
           } catch {
             actionQueueRef.current = [];
           }
         }

         try {
             const data = await getTteRequests();
             const normalized = Array.isArray(data) ? data.map(normalizeRequest) : [];
             setRequests(normalized);
             const pendingNotifs = normalized
               .filter(r => r.status === 'Pending')
               .map(toNotification);
             setNotifications(sortNotifications(pendingNotifs));
         } catch {
             // silently fail
         }
     };
     fetchInitialRequests();

     const newSocket = io('http://localhost:5000');
     newSocket.emit('tte_join');
     
     const onNewRequest = (req) => {
         const normalizedReq = normalizeRequest(req);
         const nextNotif = toNotification(normalizedReq);
         setRequests(prev => [normalizedReq, ...prev]);
         setNotifications(prev => sortNotifications([
           nextNotif,
           ...prev
         ]));
         if (nextNotif.priorityLevel === 'high') {
           setShowNotifications(true);
         }
     };

     newSocket.on('new_request', onNewRequest);
     newSocket.on('tte_request_received', onNewRequest);

     newSocket.on('connect', () => {
       flushQueue();
     });

     newSocket.on('tte_request_updated', (req) => {
       const normalizedReq = normalizeRequest(req);
       setRequests(prev => {
         const exists = prev.some((r) => r.id === normalizedReq.id);
         if (!exists) return [normalizedReq, ...prev];
         return prev.map((r) => (r.id === normalizedReq.id ? { ...r, ...normalizedReq } : r));
       });
     });

     newSocket.on('request_cancelled', (data) => {
       setRequests(prev => prev.map((r) =>
         r.id === data?.id || r.pnr === data?.pnr ? { ...r, status: 'Cancelled' } : r
       ));
     });

     newSocket.on('request_marked_present', (data) => {
         setRequests(prev => prev.map(r => 
           r.pnr === data.pnr ? { ...r, status: 'Present' } : r
         ));
     });

     socketRef.current = newSocket;
     return () => {
       newSocket.disconnect();
       socketRef.current = null;
     };
  }, [flushQueue]);

  useEffect(() => {
    window.localStorage.setItem(TTE_CACHE_KEY, JSON.stringify(requests));
  }, [requests]);

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!scannerActive) {
      cleanupScanner();
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setScanError('');
      setScanResult(null);

      if (!navigator?.mediaDevices?.getUserMedia) {
        setScanError('Camera API not available on this browser/device.');
        setScannerActive(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setScanError('Unable to access camera. Please allow camera permission on this page.');
        setScannerActive(false);
        return;
      }

      if (!('BarcodeDetector' in window)) {
        setScanError('QR scanning is not supported by this browser. You can still mark passengers present manually.');
        return;
      }

      detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });

      const scan = async () => {
        if (cancelled || !scannerActive || !detectorRef.current || !videoRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0) {
            handleScanSuccess(codes[0].rawValue);
            return;
          }
        } catch {
          // keep scanning even if a frame fails
        }
        scanLoopRef.current = requestAnimationFrame(scan);
      };

      scanLoopRef.current = requestAnimationFrame(scan);
    };

    startScanner();
    return () => {
      cancelled = true;
      cleanupScanner();
    };
  }, [scannerActive, handleScanSuccess]);

  const pendingRequests = requests.filter(r => r.status === 'Pending');
  const approvedRequests = requests.filter(r => r.status === 'Approved');
  const presentRequests = requests.filter(r => r.status === 'Present');
  const rejectedRequests = requests.filter(r => r.status === 'Rejected');

  const handleAccept = (id) => {
    const req = requests.find(r => r.id === id);
    if(req) {
      emitOrQueue('tte_approve', { pnr: req.pnr, id: req.id, boardingStation: req.boardingStation });
    }
    setRequests(prev => prev.map(r => 
      r.id === id ? { ...r, status: 'Approved' } : r
    ));
  };

  const handleReject = (id) => {
    const req = requests.find(r => r.id === id);
    if (req) {
      emitOrQueue('tte_reject', {
        id: req.id,
        pnr: req.pnr,
        boardingStation: req.boardingStation || req.missedStation || 'N/A'
      });
    }
    setRequests(prev => prev.map(req => 
      req.id === id ? { ...req, status: 'Rejected' } : req
    ));
  };

  const handleMarkPresent = (id) => {
    const req = requests.find(r => r.id === id);
    if (req) {
      emitOrQueue('tte_mark_present', { pnr: req.pnr, id: req.id, boardingStation: req.boardingStation });
    }
    setRequests(prev => prev.map(req => 
      req.id === id ? { ...req, status: 'Present' } : req
    ));
  };

  const handleMarkPresentFromScan = () => {
    if (!scanResult) return;

    if (scanResult.requestId) {
      handleMarkPresent(scanResult.requestId);
      setScanResult(prev => prev ? { ...prev, status: 'Present' } : prev);
      return;
    }

    if (scanResult.pnr) {
      emitOrQueue('tte_mark_present', { pnr: scanResult.pnr });
    }

    if (scanResult.pnr) {
      const newReq = {
        id: 'scan-' + Date.now(),
        pnr: scanResult.pnr,
        trainNumber: scanResult.trainNumber || 'Unknown',
        catchStation: scanResult.catchAt || 'Unknown',
        missedStation: scanResult.catchAt || 'Unknown',
        eta: '-',
        passengers: scanResult.passengers?.length ? scanResult.passengers : [{ name: 'Passenger', age: '', gender: '', coach: '-', seat: '-' }],
        status: 'Present',
        timestamp: new Date().toISOString()
      };
      setRequests(prev => [newReq, ...prev]);
      setScanResult(prev => prev ? { ...prev, status: 'Present', requestId: newReq.id } : prev);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    if (tab !== 'scan') {
      setScannerActive(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleBellClick = () => {
    setShowNotifications(!showNotifications);
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const formatTime = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // ─── Tab Content Renderers ───────────────────────────────

  const renderDashboard = () => (
    <>
      <div className="section-header">
        <h2>Overview</h2>
        <div className="live-badge">
          <span className="live-dot"></span> Live Sync Active
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card stat-warning">
           <div className="stat-icon bg-warning text-white"><ShieldAlert size={24} /></div>
           <div className="stat-info">
             <h3>{pendingRequests.length}</h3>
             <p>Pending Requests</p>
           </div>
        </div>
        <div className="card stat-card stat-info">
           <div className="stat-icon bg-info text-white"><FileCheck size={24} /></div>
           <div className="stat-info">
             <h3>{approvedRequests.length}</h3>
             <p>Approved Delayed</p>
           </div>
        </div>
        <div className="card stat-card stat-success">
           <div className="stat-icon bg-success text-white"><Users size={24} /></div>
           <div className="stat-info">
             <h3>{presentRequests.length}</h3>
             <p>Boarded Later</p>
           </div>
        </div>
        <div className="card stat-card stat-error">
           <div className="stat-icon bg-error text-white"><X size={24} /></div>
           <div className="stat-info">
             <h3>{rejectedRequests.length}</h3>
             <p>Rejected</p>
           </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="section-header">
        <h2>Recent Missed Boarding Requests</h2>
      </div>
      <AnimatePresence>
        {pendingRequests.length === 0 ? (
          <div className="empty-state">
            <ShieldAlert size={48} className="text-gray-300 mb-3" />
            <p>No new delayed passenger requests</p>
            <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Requests from passengers will appear here in real-time.</p>
          </div>
        ) : (
          <div className="requests-grid">
            {pendingRequests.map(req => (
              <RequestCard 
                key={req.id} 
                request={req}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </>
  );

  const renderRequests = () => (
    <>
      <div className="section-header">
        <h2>All Missed Boarding Requests</h2>
        <div className="live-badge">
          <span className="live-dot"></span> Real-time
        </div>
      </div>

      <div className="requests-layout">
        <div className="requests-column">
           <div className="section-header">
             <h2 className="column-title"><ShieldAlert size={18} className="inline mr-2 text-warning" />Pending ({pendingRequests.length})</h2>
           </div>
           <AnimatePresence>
             {pendingRequests.length === 0 ? (
               <div className="empty-state">
                 <ShieldAlert size={48} className="text-gray-300 mb-3" />
                 <p>No pending requests</p>
               </div>
             ) : (
               pendingRequests.map(req => (
                 <RequestCard 
                   key={req.id} 
                   request={req}
                   onAccept={handleAccept}
                   onReject={handleReject}
                 />
               ))
             )}
           </AnimatePresence>
        </div>

        <div className="requests-column">
           <div className="section-header">
             <h2 className="column-title"><FileCheck size={18} className="inline mr-2 text-info" />Approved & Protected ({approvedRequests.length + presentRequests.length})</h2>
           </div>
           <AnimatePresence>
             {approvedRequests.length === 0 && presentRequests.length === 0 ? (
               <div className="empty-state">
                 <FileCheck size={48} className="text-gray-300 mb-3" />
                 <p>No protected passengers</p>
               </div>
             ) : (
               <>
                 {approvedRequests.map(req => (
                   <RequestCard 
                     key={req.id} 
                     request={req}
                     onMarkPresent={handleMarkPresent}
                   />
                 ))}
                 {presentRequests.map(req => (
                   <RequestCard 
                     key={req.id} 
                     request={req}
                   />
                 ))}
               </>
             )}
           </AnimatePresence>
        </div>
      </div>
    </>
  );

  const renderScanner = () => {
    const matchedRequest = scanResult ? requests.find(r => r.pnr === scanResult.pnr) : null;
    const alreadyPresent = matchedRequest?.status === 'Present' || scanResult?.status === 'Present';

    return (
      <>
        <div className="section-header">
          <div>
            <h2>Scan Catch Pass QR</h2>
            <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Scan passenger QR to auto-verify and mark as onboard.</p>
          </div>
          <div className="scanner-actions">
            {!scannerActive ? (
              <button className="btn btn-primary" onClick={() => setScannerActive(true)}>
                <QrCode size={16} /> Start Scanner
              </button>
            ) : (
              <button className="btn btn-outline" onClick={() => setScannerActive(false)}>
                <X size={16} /> Stop
              </button>
            )}
          </div>
        </div>

        <div className="scan-grid">
          <div className="card scan-card">
            <div className="scan-video-wrapper">
              <video ref={videoRef} className="scan-video" muted playsInline />
              <div className={`scan-overlay ${scannerActive ? 'active' : 'idle'}`}>
                {scannerActive ? 'Scanning...' : 'Scanner paused'}
              </div>
            </div>
            <p className="text-xs" style={{color:'var(--color-text-muted)', marginTop: '0.5rem'}}>Use rear camera and keep QR within the frame.</p>
            {scanError && <div className="scan-error">{scanError}</div>}
          </div>

          <div className="card scan-card">
            {scanResult ? (
              <div className="scan-result">
                <div className="scan-result-header">
                  <h3>Pass Details</h3>
                  <span className={`badge ${alreadyPresent ? 'badge-success' : matchedRequest ? 'badge-info' : 'badge-warning'}`}>
                    {alreadyPresent ? 'Present' : matchedRequest ? matchedRequest.status : 'New Scan'}
                  </span>
                </div>
                <div className="scan-fields">
                  <div>
                    <p className="label">PNR</p>
                    <p className="value">{scanResult.pnr || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="label">Train</p>
                    <p className="value">{scanResult.trainNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="label">Catch At</p>
                    <p className="value">{scanResult.catchAt || 'N/A'}</p>
                  </div>
                </div>

                <div className="scan-passengers">
                  <p className="label">Passengers</p>
                  <div className="passenger-chips">
                    {(scanResult.passengers && scanResult.passengers.length > 0 ? scanResult.passengers : [{ name: 'Passenger', coach: '-', seat: '-' }]).map((p, idx) => (
                      <span key={idx} className="passenger-chip">
                        {p.name} ({p.coach}-{p.seat})
                      </span>
                    ))}
                  </div>
                </div>

                <button 
                  className="btn btn-success w-full mt-3"
                  onClick={handleMarkPresentFromScan}
                  disabled={alreadyPresent || !scanResult.pnr}
                >
                  <Check size={16} /> {alreadyPresent ? 'Already Marked' : 'Mark Present'}
                </button>

                {matchedRequest && matchedRequest.status !== 'Present' && (
                  <p className="text-xs mt-2" style={{color:'var(--color-text-muted)'}}>Linked to request {matchedRequest.id}</p>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{height:'100%'}}>
                <QrCode size={48} className="text-gray-300 mb-3" />
                <p>No QR scanned yet</p>
                <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Start the scanner and point it at the passenger pass.</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderPassengers = () => {
    const filtered = searchQuery 
      ? mockPassengers.filter(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.pnr.includes(searchQuery) ||
          p.coach.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : mockPassengers;

    return (
      <>
        <div className="section-header">
          <h2>Passenger Manifest</h2>
          <span className="text-sm" style={{color:'var(--color-text-muted)'}}>{filtered.length} passengers</span>
        </div>

        <div className="passenger-table-wrapper">
          <table className="passenger-table">
            <thead>
              <tr>
                <th>PNR</th>
                <th>Passenger</th>
                <th>Age/Gender</th>
                <th>Coach-Seat</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={i}>
                  <td className="font-mono font-bold">{p.pnr}</td>
                  <td className="font-semibold">{p.name}</td>
                  <td>{p.age} / {p.gender}</td>
                  <td><span className="coach-badge">{p.coach}-{p.seat}</span></td>
                  <td><MapPin size={14} className="inline mr-1 text-primary" />{p.from}</td>
                  <td><MapPin size={14} className="inline mr-1 text-success" />{p.to}</td>
                  <td><span className="status-badge status-cnf">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card fallback */}
        <div className="passenger-cards-mobile">
          {filtered.map((p, i) => (
            <div key={i} className="passenger-card">
              <div className="passenger-card-header">
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs" style={{color:'var(--color-text-muted)'}}>PNR: {p.pnr}</p>
                </div>
                <span className="status-badge status-cnf">{p.status}</span>
              </div>
              <div className="passenger-card-body">
                <span><strong>Coach:</strong> {p.coach}-{p.seat}</span>
                <span><strong>Age:</strong> {p.age} / {p.gender}</span>
                <span><MapPin size={12} className="inline mr-1" />{p.from} → {p.to}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderStaff = () => (
    <>
      <div className="section-header">
        <h2>Train Staff</h2>
        <span className="text-sm" style={{color:'var(--color-text-muted)'}}>{mockStaff.length} staff members</span>
      </div>

      <div className="staff-grid">
        {mockStaff.map((s, i) => (
          <MotionDiv 
            key={i} 
            className="staff-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="staff-avatar">
              <UserCircle size={48} />
            </div>
            <div className="staff-info">
              <h3>{s.name}</h3>
              <p className="staff-role">{s.role}</p>
              <p className="staff-zone"><BadgeCheck size={14} className="inline mr-1" />{s.zone}</p>
              <div className="staff-contact">
                <a href={`tel:${s.phone}`}><Phone size={14} /> {s.phone}</a>
                <a href={`mailto:${s.email}`}><Mail size={14} /> {s.email}</a>
              </div>
            </div>
          </MotionDiv>
        ))}
      </div>
    </>
  );

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return renderDashboard();
      case 'requests': return renderRequests();
      case 'scan': return renderScanner();
      case 'passengers': return renderPassengers();
      case 'staff': return renderStaff();
      default: return renderDashboard();
    }
  };

  const tabTitles = {
    dashboard: 'Dashboard',
    requests: 'Missed Requests',
    scan: 'Scan QR',
    passengers: 'Passenger List',
    staff: 'Train Staff'
  };

  return (
    <div className="dashboard-container">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
          <div 
            className="sidebar-overlay" 
            onClick={() => setSidebarOpen(false)}
          />
      )}
      
      {/* Sidebar Navigation */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Train size={28} className="text-primary" />
          <h2>Safar Sathi <span className="text-sm font-normal text-muted block">TTE Portal</span></h2>
        </div>
        
        <nav className="sidebar-nav">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => switchTab('dashboard')}>
            <LayoutDashboard size={20} /> Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => switchTab('requests')}>
            <ShieldAlert size={20} /> Missed Requests
            {pendingRequests.length > 0 && <span className="nav-badge">{pendingRequests.length}</span>}
          </div>
          <div className={`nav-item ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => switchTab('scan')}>
            <QrCode size={20} /> Scan QR
          </div>
          <div className={`nav-item ${activeTab === 'passengers' ? 'active' : ''}`} onClick={() => switchTab('passengers')}>
            <Ticket size={20} /> Passenger List
          </div>
          <div className={`nav-item ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => switchTab('staff')}>
            <Users size={20} /> Train Staff
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-item" onClick={() => navigate('/')}>
            <LogOut size={20} /> Logout
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        {/* Top Header */}
        <header className="dashboard-header">
          <div className="header-left">
             <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <Menu size={24} />
             </button>
             <div>
               <h1 className="header-page-title">{tabTitles[activeTab]}</h1>
             </div>
          </div>
          <div className="header-actions">
            <div className="search-box">
               <Search size={18} className="search-icon" />
               <input 
                 type="text" 
                 placeholder="Search PNR or name..." 
                 className="input-field search-input" 
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
               />
            </div>
            <div className="notif-wrapper" ref={notifRef}>
              <button className="btn-icon bell-btn" onClick={handleBellClick}>
                <Bell size={22} />
                {unreadCount > 0 && <span className="bell-dot"></span>}
              </button>

              {showNotifications && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <h4>Notifications</h4>
                    {unreadCount > 0 && (
                      <button className="notif-mark-read" onClick={markAllRead}>Mark all read</button>
                    )}
                  </div>
                  <div className="notif-dropdown-body">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">
                        <Bell size={32} style={{opacity:0.2, marginBottom:8}} />
                        <p>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read ? 'notif-unread' : ''} ${n.priorityLevel === 'high' ? 'notif-priority' : ''}`}
                          onClick={() => {
                            setNotifications(prev => prev.map(x => x.id === n.id ? {...x, read: true} : x));
                            switchTab('requests');
                            setShowNotifications(false);
                          }}
                        >
                          <div className="notif-icon-circle">
                            <ShieldAlert size={16} />
                          </div>
                          <div className="notif-content">
                            <p className="notif-title">{n.priorityLevel === 'high' ? 'Priority Catch Window Alert' : 'New Missed Train Request'}</p>
                            <p className="notif-detail">PNR: {n.pnr} • Train {n.trainNumber}</p>
                            <p className="notif-detail">{n.boardingStation} → {n.catchStation}</p>
                            {n.priorityReason && <p className="notif-detail">{n.priorityReason}</p>}
                            {n.eta && n.eta !== '-' && <p className="notif-detail">ETA: {n.eta}</p>}
                            {n.message && <p className="notif-msg">"{n.message}"</p>}
                          </div>
                          <span className="notif-time">{formatTime(n.timestamp)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="avatar-circle">JS</div>
          </div>
        </header>

        {/* Dynamic Tab Content */}
        <div className="dashboard-content">
          <AnimatePresence mode="wait">
            <MotionDiv
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </MotionDiv>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default TteDashboard;
