import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPnrDetails, checkCatchStatus } from '../services/api';
import { AlertCircle, ShieldCheck, CheckCircle, Home, ChevronRight, Train, MapPin, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import '../styles/MissedTrainCalculator.css';

// Converts a train time and day into a single comparable minute count.
const timeToTotalMinutes = (timeString, dayValue) => {
    if (!timeString || typeof timeString !== 'string') return null;
    const [hourText, minuteText] = timeString.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    const normalizedDay = Number(dayValue) || 1;
    return ((normalizedDay - 1) * 24 * 60) + (hour * 60) + minute;
};

const formatTravelTime = (departureTime, departureDay, arrivalTime, arrivalDay) => {
    const departureMins = timeToTotalMinutes(departureTime, departureDay);
    const arrivalMins = timeToTotalMinutes(arrivalTime, arrivalDay);
    if (departureMins === null || arrivalMins === null) return 'N/A';
    const durationMins = Math.max(0, arrivalMins - departureMins);
    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
};

const formatDurationFromMinutes = (totalMinutes) => {
    const safeMinutes = Math.max(0, totalMinutes);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
};

// Compares an alternate train's arrival against the original train at the catch station.
const getArrivalComparisonText = (train) => {
    const originalTimeLabel = `${train.originalArrivalAtCatch || 'N/A'} (Day ${train.originalArrivalDayAtCatch || '?'})`;
    const alternateArrivalMins = timeToTotalMinutes(train.arrivalTime, train.arrivalDay);
    const originalArrivalMins = timeToTotalMinutes(train.originalArrivalAtCatch, train.originalArrivalDayAtCatch);

    if (alternateArrivalMins === null || originalArrivalMins === null) {
        return `Original train: ${originalTimeLabel}`;
    }

    const diffMins = originalArrivalMins - alternateArrivalMins;
// Scores alternate trains so the most practical option can be surfaced first.
    if (diffMins > 0) {
        return `Arrives ${formatDurationFromMinutes(diffMins)} earlier than original (${originalTimeLabel})`;
    }
    if (diffMins < 0) {
        return `Arrives ${formatDurationFromMinutes(Math.abs(diffMins))} after, original: ${originalTimeLabel}`;
    }
    return `Arrives at same time, original: ${originalTimeLabel}`;
};

const getArrivalLeadMinutes = (train) => {
    const alternateArrivalMins = timeToTotalMinutes(train.arrivalTime, train.arrivalDay);
    const originalArrivalMins = timeToTotalMinutes(train.originalArrivalAtCatch, train.originalArrivalDayAtCatch);
    if (alternateArrivalMins === null || originalArrivalMins === null) return null;
    return originalArrivalMins - alternateArrivalMins;
};

const getTravelDurationMinutes = (train) => {
    const departureMins = timeToTotalMinutes(train.departureTime, train.departureDay);
    const arrivalMins = timeToTotalMinutes(train.arrivalTime, train.arrivalDay);
    if (departureMins === null || arrivalMins === null) return null;
    return Math.max(0, arrivalMins - departureMins);
};

const getRecommendationScore = (train) => {
    const arrivalLeadMins = getArrivalLeadMinutes(train);
    const durationMins = getTravelDurationMinutes(train);
    const delayMins = Number(train.delayMins) || 0;
    let score = 0;

    if (arrivalLeadMins !== null) {
        score += Math.min(arrivalLeadMins, 360) * 2.2;
        if (arrivalLeadMins < 0) score += arrivalLeadMins * 2.8;
    }

    if (durationMins !== null) score -= durationMins * 0.12;
    if (train.isRunningLate) score -= delayMins * 1.35;
    if (!train.isRunningLate) score += 18;

    return score;
};

// Picks the strongest alternate train candidate using score, lead time, and duration.
const getRecommendedTrainIndex = (alternateTrains = []) => {
    if (!Array.isArray(alternateTrains) || alternateTrains.length === 0) return -1;

    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    alternateTrains.forEach((train, idx) => {
        const score = getRecommendationScore(train);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = idx;
            return;
        }

        if (score === bestScore) {
            const currentLead = getArrivalLeadMinutes(train) ?? Number.NEGATIVE_INFINITY;
            const bestLead = getArrivalLeadMinutes(alternateTrains[bestIndex]) ?? Number.NEGATIVE_INFINITY;
            if (currentLead > bestLead) {
                bestIndex = idx;
                return;
            }

            if (currentLead === bestLead) {
                const currentDuration = getTravelDurationMinutes(train) ?? Number.POSITIVE_INFINITY;
                const bestDuration = getTravelDurationMinutes(alternateTrains[bestIndex]) ?? Number.POSITIVE_INFINITY;
                if (currentDuration < bestDuration) {
                    bestIndex = idx;
                }
            }
        }
    });

    return bestIndex;
};

const getPreferredCatchStation = (train, result, fallback = 'Unknown') => {
    return train?.originalCatchStation || train?.catchStation || result?.lastValidStation?.stationName || fallback;
};

const MissedTrainCalculator = () => {
    const navigate = useNavigate();
    const [pnr, setPnr] = useState('');
    const [boarding, setBoarding] = useState('');
    const [pnrDetails, setPnrDetails] = useState(null);
    const [pnrChecked, setPnrChecked] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    
    const [tteMessage, setTteMessage] = useState('');
    const [requestStatus, setRequestStatus] = useState('idle');
    const [socket, setSocket] = useState(null);

    const recommendedTrainIndex = getRecommendedTrainIndex(result?.alternateTrains || []);
    const recommendedTrain = recommendedTrainIndex >= 0 ? result?.alternateTrains?.[recommendedTrainIndex] : null;
    const preferredCatchStation = getPreferredCatchStation(recommendedTrain || result?.alternateTrains?.[0], result);
    const orderedAlternateTrains = (() => {
        const trains = result?.alternateTrains || [];
        if (!Array.isArray(trains) || trains.length === 0) return [];

        const withIndex = trains.map((train, index) => ({ train, originalIndex: index }));
        if (recommendedTrainIndex <= 0) return withIndex;

        return [
            withIndex[recommendedTrainIndex],
            ...withIndex.filter((_, index) => index !== recommendedTrainIndex)
        ];
    })();

    useEffect(() => {
        const newSocket = io('http://localhost:5000');
        
        newSocket.on('request_approved', (data) => {
            if (pnr && data.pnr === pnr) {
                setRequestStatus('approved');
            }
        });
        
        setSocket(newSocket);
        return () => newSocket.disconnect();
    }, [pnr]);

    const handleCheckPnr = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const data = await getPnrDetails(pnr);
            setPnrDetails(data);
            setPnrChecked(true);
            window.history.replaceState(null, '', `/missed-train/pnr/${pnr}`);
        } catch {
            setError('Failed to fetch PNR or Invalid PNR.');
        } finally {
            setLoading(false);
        }
    };

    const handleCalculate = async (e) => {
        e.preventDefault();

        const destCode = pnrDetails.destinationCode?.trim().toUpperCase();
        const destName = pnrDetails.destinationName?.trim().toUpperCase();
        const entered = boarding.trim().toUpperCase();
        
        if (entered === destCode || (destName && destName.includes(entered))) {
            setError('Missed station and destination cannot be the same.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);
        setRequestStatus('idle');

        try {
            const catchStatus = await checkCatchStatus(pnrDetails.trainNumber, boarding, boarding);
            
            setResult({
                ...pnrDetails,
                ...catchStatus
            });
            window.history.replaceState(null, '', `/missed-train/pnr/${pnr}/catch/${boarding.trim().toUpperCase()}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to calculate status. Make sure Station is correct.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendTteRequest = () => {
        if (!socket || !result) return;

        socket.emit('send_tte_request', {
            pnr,
            trainNumber: result.trainNumber,
            boardingStation: boarding,
            catchStation: preferredCatchStation,
            stationsGap: result.stationsGap,
            totalStations: result.totalStations,
            skipLimit: result.skipLimit,
            message: tteMessage
        });
        
        setRequestStatus('pending');
    };

    const handleOpenTrainView = (trainNumber, focusSection) => {
        navigate('/search?from=missed', {
            state: {
                pendingTrain: String(trainNumber || '').trim(),
                pendingFocus: String(focusSection || '').trim(),
            },
        });
    };

    const breadcrumbs = [
        { label: 'Home', icon: <Home size={14} />, onClick: () => navigate('/') },
        { label: 'Missed Train', icon: <Train size={14} />, onClick: () => { setPnrChecked(false); setResult(null); setPnrDetails(null); setBoarding(''); window.history.replaceState(null, '', '/missed-train'); } },
    ];
    if (pnrChecked && pnrDetails) {
        breadcrumbs.push({
            label: `PNR: ${pnr}`,
            icon: <ChevronRight size={14} />,
            onClick: () => { setResult(null); setBoarding(''); window.history.replaceState(null, '', `/missed-train/pnr/${pnr}`); },
            active: !result
        });
    }
    if (result) {
        breadcrumbs.push({
            label: `Station: ${boarding.toUpperCase()}`,
            icon: <MapPin size={14} />,
            active: true
        });
    }

    return (
        <div className="calculator-page">
            <nav className="breadcrumb-bar">
                {breadcrumbs.map((crumb, idx) => (
                    <span key={idx} className={`breadcrumb-item ${crumb.active ? 'breadcrumb-active' : ''}`}>
                        {idx > 0 && <ChevronRight size={14} className="breadcrumb-sep" />}
                        <span
                            className={crumb.onClick && !crumb.active ? 'breadcrumb-link' : 'breadcrumb-current'}
                            onClick={crumb.onClick && !crumb.active ? crumb.onClick : undefined}
                        >
                            {crumb.icon && idx === 0 && <span className="breadcrumb-icon">{crumb.icon}</span>}
                            {crumb.label}
                        </span>
                    </span>
                ))}
            </nav>

            <div className="calculator-header">
            <h1>
                <ShieldCheck size={32} /> Missed Train Catch System
            </h1>
            <p className="calculator-subtitle">
                Enter your details to find an alternate train and request the TTE to hold your seat.
            </p>
            </div>

            <div className="calculator-shell">
            <div className="calculator-card">
                    {!pnrChecked ? (
                        <form onSubmit={handleCheckPnr} className="flex flex-col gap-4">
                            <div>
                                <label className="calculator-label">PNR Number</label>
                                <input required type="text" maxLength={10} value={pnr} onChange={e=>setPnr(e.target.value)}
                                    placeholder="e.g., 1234123412" className="input-field font-bold" />
                            </div>
                            <div className="calculator-actions">
                              <button disabled={loading} type="submit" className="btn btn-primary">
                                  {loading ? 'Checking...' : 'Check PNR'}
                              </button>
                            </div>
                            {error && <div className="calculator-error"><AlertCircle size={18} /> {error}</div>}
                        </form>
                    ) : (
                        <form onSubmit={handleCalculate} className="flex flex-col gap-4">
                            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl mb-4">
                               <div className="flex justify-between items-center mb-2">
                                  <h4 className="font-bold text-lg">PNR: {pnr}</h4>
                                  <button type="button" onClick={() => {setPnrChecked(false); setResult(null); setPnrDetails(null); window.history.replaceState(null, '', '/missed-train');}} className="text-xs text-primary underline">Change PNR</button>
                               </div>
                               <div className="text-sm text-secondary">
                                  <p><strong>Train:</strong> {pnrDetails.trainNumber} - {pnrDetails.trainName}</p>
                                  <p><strong>Route:</strong> {pnrDetails.sourceCode} to {pnrDetails.destinationCode}</p>
                                  {pnrDetails.passengers?.map((p, i) => (
                                      <p key={i}><strong>Passenger {i+1}:</strong> {p.name} ({p.coach}-{p.seat})</p>
                                  ))}
                               </div>
                            </div>
                            <div>
                                <label className="calculator-label">Missed Station (Code)</label>
                                <input required type="text" value={boarding} onChange={e=>setBoarding(e.target.value)}
                                    placeholder="e.g., JAT for Jammu Tawi" className="input-field font-bold" />
                            </div>
                            <div className="calculator-actions">
                              <button disabled={loading} type="submit" className="btn btn-primary">
                                  {loading ? 'Analyzing...' : 'Find Catchable Route'}
                              </button>
                            </div>
                            {error && <div className="calculator-error"><AlertCircle size={18} /> {error}</div>}
                        </form>
                    )}
            </div>
            </div>

            {result && result.canCatch && (
                <div className="calculator-shell result-stack">
                    {result.alternateTrains && result.alternateTrains.length > 0 && (
                        <div className="trains-found-banner">
                            <CheckCircle size={18} />
                            <span><strong>{result.alternateTrains.length}</strong> alternate {result.alternateTrains.length === 1 ? 'train' : 'trains'} found for your route</span>
                        </div>
                    )}
                    {result.alternateTrains && result.alternateTrains.length > 0 && (
                        orderedAlternateTrains.map(({ train, originalIndex }, idx) => (
                            <div key={`${train.trainNumber}-${idx}`} className={`success-card ${originalIndex === recommendedTrainIndex ? 'recommended-card' : ''}`}>
                                <div className="alt-train-header">
                                    <div className="alt-train-mainrow">
                                        <div className="alt-train-idblock">
                                            <div className="alt-train-title-row">
                                                <p className="connection-title">Alternate Train {idx + 1}</p>
                                                {originalIndex === recommendedTrainIndex && (
                                                    <span className="recommended-badge">Recommended for you</span>
                                                )}
                                            </div>
                                            <p className="alt-train-route">{train.trainNumber} - {train.trainName}</p>
                                            <p className="travel-time-pill">
                                                Travel time: {formatTravelTime(train.departureTime, train.departureDay, train.arrivalTime, train.arrivalDay)}
                                            </p>
                                        </div>
                                        <div className="arrival-compare-copy" role="status" aria-live="polite">
                                            {getArrivalComparisonText(train)}
                                        </div>
                                    </div>
                                </div>
                                <div className="connection-layout">
                                    <div className="journey-card">
                                        <p className="connection-title">You Missed From </p>
                                        <p className="connection-station">{train.boardingStation}</p>
                                        <div className="journey-meta-row">
                                            <p className="connection-time">Departure: {train.departureTime} (Day {train.departureDay || '?'})</p>
                                            <p className="meta-inline">Platform: N/A</p>
                                        </div>
                                    </div>

                                    <div className="journey-arrow" aria-hidden="true">
                                        <ArrowRight size={18} />
                                    </div>

                                    <div className="journey-card">
                                        <p className="connection-title">Board Here Instead</p>
                                        <p className="connection-station">{train.originalCatchStation || train.catchStation}</p>
                                        <div className="journey-meta-row">
                                            <p className="connection-time">Arriving: {train.arrivalTime} (Day {train.arrivalDay || '?'})</p>
                                            <p className="meta-inline">Platform: N/A</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="alt-train-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary alt-train-btn alt-train-btn-route"
                                        onClick={() => handleOpenTrainView(train.trainNumber, 'route')}
                                    >
                                        View Route
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary alt-train-btn"
                                        onClick={() => handleOpenTrainView(train.trainNumber, 'track')}
                                    >
                                        Track Train
                                    </button>
                                </div>
                            </div>
                        ))
                    )}

                    <div className="tte-card">
                        <h3 className="font-black text-xl">TTE Boarding Protection</h3>
                        
                        {requestStatus === 'idle' && (
                            <>
                                <p className="mb-4 font-medium text-center">
                                    Send a direct alert to the TTE of {result.trainNumber} to hold your seat until {preferredCatchStation}.
                                </p>
                                <textarea 
                                    value={tteMessage} 
                                    onChange={e=>setTteMessage(e.target.value)}
                                    placeholder="Optional message to TTE (e.g., Taking connecting train, arriving at 14:00. Please do not mark No-Show.)"
                                    className="input-field mb-4"
                                    rows="3"
                                />
                                <button onClick={handleSendTteRequest} className="btn btn-accent w-full">
                                    Send Request to TTE
                                </button>
                            </>
                        )}

                        {requestStatus === 'pending' && (
                            <div className="text-center py-6 animate-pulse text-primary font-bold text-lg">
                                ⏳ Request sent! Waiting for TTE Approval...
                            </div>
                        )}

                        {requestStatus === 'approved' && (() => {
                            const passengersText = pnrDetails?.passengers?.map((p, i) => 
                                `${i+1}. ${p.name}, ${p.age}${p.gender} | ${p.coach}-${p.seat}`
                            ).join('\n') || '';
                            
                            const qrPayload = `SAFAR SATHI - CATCH PASS\n========================\nPNR: ${pnrDetails?.pnr}\nTrain: ${pnrDetails?.trainNumber}\nCatch At: ${preferredCatchStation}\n========================\nPassengers:\n${passengersText}`;

                            return (
                                <div className="tte-approved">
                                    <div className="w-16 h-16 bg-success-light text-success rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={36} />
                                    </div>
                                    <h3 className="font-black text-success text-2xl mb-1">Approved!</h3>
                                    <p className="font-bold">TTE has protected your seat. You will not be marked No-Show.</p>
                                    
                                    <div className="qr-container">
                                        <QRCodeSVG value={qrPayload} size={160} level="H" />
                                        <p className="qr-hint">Scan with TTE App to verify passenger</p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                </div>
            )}
        </div>
    );
};

export default MissedTrainCalculator;
