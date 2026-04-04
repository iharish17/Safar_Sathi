import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getPnrDetails, checkCatchStatus, getTteRequests } from '../services/api';
import { AlertCircle, ShieldCheck, CheckCircle, Home, ChevronRight, Train, MapPin, ArrowRight, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import '../styles/MissedTrainCalculator.css';

const RECENT_SEARCHES_KEY = 'safarsathi_recent_missed_train_searches_v1';
const MAX_RECENT_SEARCHES = 6;

const safeReadRecentSearches = () => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeRecentSearches = (entries = []) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
};

const normalizeRequestStatus = (status = '') => {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'approved') return 'approved';
    if (value === 'present') return 'present';
    if (value === 'rejected') return 'rejected';
    if (value === 'cancelled') return 'cancelled';
    return 'pending';
};

const toPassengerRequestPhase = (status = 'unknown') => {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'pending' || value === 'approved' || value === 'present') return value;
    return 'idle';
};

const getLatestStatusForSearch = (requests = [], search = {}) => {
    const pnrText = String(search?.pnr || '').trim();
    const boardingText = String(search?.boarding || '').trim();
    if (!pnrText) return 'unknown';

    const forSearch = requests.filter((request) => {
        if (String(request?.pnr || '').trim() !== pnrText) return false;
        if (!boardingText) return true;
        const requestBoarding = request?.boardingStation || request?.missedStation || '';
        return stationLabelsMatch(requestBoarding, boardingText);
    });

    if (forSearch.length === 0) return 'unknown';

    const priority = { pending: 1, cancelled: 2, rejected: 3, approved: 4, present: 5 };
    return forSearch
        .map((request) => normalizeRequestStatus(request?.status))
        .sort((a, b) => (priority[b] || 0) - (priority[a] || 0))[0];
};

const getLatestRequestForSearch = (requests = [], search = {}) => {
    const pnrText = String(search?.pnr || '').trim();
    const boardingText = String(search?.boarding || '').trim();
    if (!pnrText) return null;

    const matches = requests.filter((request) => {
        if (String(request?.pnr || '').trim() !== pnrText) return false;
        if (!boardingText) return true;
        const requestBoarding = request?.boardingStation || request?.missedStation || '';
        return stationLabelsMatch(requestBoarding, boardingText);
    });

    if (matches.length === 0) return null;
    return matches[matches.length - 1];
};

const mergeStatusIntoRecent = (recentEntries = [], requests = []) => {
    return recentEntries.map((entry) => ({
        ...entry,
        requestStatus: getLatestStatusForSearch(requests, { pnr: entry?.pnr, boarding: entry?.boarding }),
    }));
};

const upsertRecentEntry = (existingEntries = [], nextEntry = {}) => {
    const uniqueKey = `${String(nextEntry.pnr || '').trim()}::${String(nextEntry.boarding || '').trim().toUpperCase()}`;
    const normalizedEntry = {
        pnr: String(nextEntry.pnr || '').trim(),
        boarding: String(nextEntry.boarding || '').trim().toUpperCase(),
        trainNumber: String(nextEntry.trainNumber || '').trim(),
        catchStation: String(nextEntry.catchStation || '').trim(),
        requestStatus: nextEntry.requestStatus || 'unknown',
        updatedAt: new Date().toISOString(),
    };

    const withoutSame = existingEntries.filter((entry) => {
        const entryKey = `${String(entry?.pnr || '').trim()}::${String(entry?.boarding || '').trim().toUpperCase()}`;
        return entryKey !== uniqueKey;
    });

    return [normalizedEntry, ...withoutSame].slice(0, MAX_RECENT_SEARCHES);
};

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
    const leadFromServer = Number(train?.leadMins);
    if (Number.isFinite(leadFromServer)) {
        if (leadFromServer > 0) {
            return `Arrives ${formatDurationFromMinutes(leadFromServer)} earlier than original (${originalTimeLabel})`;
        }
        if (leadFromServer < 0) {
            return `Arrives ${formatDurationFromMinutes(Math.abs(leadFromServer))} after, original: ${originalTimeLabel}`;
        }
        return `Arrives at same time, original: ${originalTimeLabel}`;
    }

    const alternateArrivalMins = timeToTotalMinutes(train.arrivalTime, train.arrivalDay);
    const originalArrivalMins = timeToTotalMinutes(train.originalArrivalAtCatch, train.originalArrivalDayAtCatch);

    if (alternateArrivalMins === null || originalArrivalMins === null) {
        return `Original train: ${originalTimeLabel}`;
    }

    const diffMins = originalArrivalMins - alternateArrivalMins;
    if (diffMins > 0) {
        return `Arrives ${formatDurationFromMinutes(diffMins)} earlier than original (${originalTimeLabel})`;
    }
    if (diffMins < 0) {
        return `Arrives ${formatDurationFromMinutes(Math.abs(diffMins))} after, original: ${originalTimeLabel}`;
    }
    return `Arrives at same time, original: ${originalTimeLabel}`;
};

const getArrivalLeadMinutes = (train) => {
    const leadFromServer = Number(train?.leadMins);
    if (Number.isFinite(leadFromServer)) return leadFromServer;

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

// Picks the best alternate train
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

const getStationCodeFromLabel = (label = '') => {
    const text = String(label || '').trim().toUpperCase();
    const splitByDash = text.split('-');
    return splitByDash.length > 1 ? splitByDash[splitByDash.length - 1].trim() : text;
};

const stationLabelsMatch = (routeStation = '', selectedStation = '') => {
    const routeText = String(routeStation || '').trim().toUpperCase();
    const selectedText = String(selectedStation || '').trim().toUpperCase();
    if (!routeText || !selectedText) return false;
    if (routeText === selectedText) return true;

    const routeCode = getStationCodeFromLabel(routeText);
    const selectedCode = getStationCodeFromLabel(selectedText);
    return routeCode && selectedCode && routeCode === selectedCode;
};

const MissedTrainCalculator = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [pnr, setPnr] = useState('');
    const [boarding, setBoarding] = useState('');
    const [pnrDetails, setPnrDetails] = useState(null);
    const [pnrChecked, setPnrChecked] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [recentSearches, setRecentSearches] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [inAppNotifications, setInAppNotifications] = useState([]);
    
    const [tteMessage, setTteMessage] = useState('');
    const [requestStatus, setRequestStatus] = useState('idle');
    const [activeRequestId, setActiveRequestId] = useState(null);
    const [socket, setSocket] = useState(null);

    const pushPassengerNotification = (message, tone = 'info') => {
        setInAppNotifications((prev) => [
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                message,
                tone,
                timestamp: new Date().toISOString(),
            },
            ...prev,
        ].slice(0, 5));
    };

    useEffect(() => {
        let cancelled = false;

        const hydrateFromPath = async () => {
            const path = String(location?.pathname || '');
            const routeMatch = path.match(/\/missed-train\/pnr\/([^/]+)(?:\/catch\/([^/]+))?/i);
            if (!routeMatch) return;

            const routePnr = decodeURIComponent(routeMatch[1] || '').trim();
            const routeBoarding = decodeURIComponent(routeMatch[2] || '').trim().toUpperCase();
            if (!routePnr) return;

            setLoading(true);
            setError(null);
            setPnr(routePnr);
            setBoarding(routeBoarding);

            try {
                const data = await getPnrDetails(routePnr);
                if (cancelled) return;

                setPnrDetails(data);
                setPnrChecked(true);

                updateRecentSearches((prev) => upsertRecentEntry(prev, {
                    pnr: routePnr,
                    trainNumber: data?.trainNumber,
                    boarding: routeBoarding,
                    requestStatus: 'unknown',
                }));

                if (routeBoarding) {
                    const catchStatus = await checkCatchStatus(data.trainNumber, routeBoarding, routeBoarding);
                    if (cancelled) return;
                    setResult({ ...data, ...catchStatus });
                } else {
                    setResult(null);
                }

                const requests = await getTteRequests();
                if (cancelled) return;
                const latestStatus = getLatestStatusForSearch(Array.isArray(requests) ? requests : [], {
                    pnr: routePnr,
                    boarding: routeBoarding,
                });
                const nextPhase = toPassengerRequestPhase(latestStatus);
                setRequestStatus(nextPhase);

                const latestRequest = getLatestRequestForSearch(Array.isArray(requests) ? requests : [], {
                    pnr: routePnr,
                    boarding: routeBoarding,
                });
                setActiveRequestId(nextPhase === 'idle' ? null : (latestRequest?.id || null));
                if (latestRequest?.message) {
                    setTteMessage(String(latestRequest.message));
                }

                updateRecentSearches((prev) => prev.map((item) => (
                    String(item?.pnr || '').trim() === routePnr && stationLabelsMatch(item?.boarding || '', routeBoarding)
                        ? { ...item, requestStatus: latestStatus, updatedAt: new Date().toISOString() }
                        : item
                )));
            } catch {
                if (!cancelled) {
                    setError('Could not restore page from URL. Please re-check the PNR.');
                    setPnrChecked(false);
                    setResult(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        hydrateFromPath();
        return () => {
            cancelled = true;
        };
    }, [location.pathname]);

    const updateRecentSearches = (updater) => {
        setRecentSearches((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            writeRecentSearches(next);
            return next;
        });
    };

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
        const initialRecent = safeReadRecentSearches();
        setRecentSearches(initialRecent);

        const hydrateStatuses = async () => {
            try {
                const requests = await getTteRequests();
                const merged = mergeStatusIntoRecent(initialRecent, Array.isArray(requests) ? requests : []);
                updateRecentSearches(merged);
            } catch {
                // keep locally stored statuses if server status fetch fails
            }
        };

        hydrateStatuses();
    }, []);

    useEffect(() => {
        const newSocket = io('http://localhost:5000');
        const refreshCurrentAndRecentStatuses = async () => {
            try {
                const requests = await getTteRequests();
                const safeRequests = Array.isArray(requests) ? requests : [];
                const currentStatus = getLatestStatusForSearch(safeRequests, { pnr, boarding });
                const nextPhase = toPassengerRequestPhase(currentStatus);
                setRequestStatus(nextPhase);
                const latestRequest = getLatestRequestForSearch(safeRequests, { pnr, boarding });
                setActiveRequestId(nextPhase === 'idle' ? null : (latestRequest?.id || null));
                if (latestRequest?.message && currentStatus === 'pending') {
                    setTteMessage(String(latestRequest.message));
                }
                updateRecentSearches((prev) => mergeStatusIntoRecent(prev, safeRequests));
            } catch {
                // no-op; keep existing local status
            }
        };
        
        newSocket.on('request_approved', (data) => {
            if (data?.pnr && String(data.pnr).trim() === String(pnr || '').trim()) {
                const eventBoarding = data.boardingStation || data.missedStation || '';
                if (!boarding || stationLabelsMatch(eventBoarding, boarding)) {
                    pushPassengerNotification('TTE approved your boarding protection request.', 'success');
                }
                refreshCurrentAndRecentStatuses();
            }
        });

        newSocket.on('request_marked_present', (data) => {
            if (data?.pnr && String(data.pnr).trim() === String(pnr || '').trim()) {
                const eventBoarding = data.boardingStation || data.missedStation || '';
                if (!boarding || stationLabelsMatch(eventBoarding, boarding)) {
                    pushPassengerNotification('TTE marked you present successfully.', 'success');
                }
                refreshCurrentAndRecentStatuses();
            }
        });

        newSocket.on('request_rejected', (data) => {
            if (data?.pnr && String(data.pnr).trim() === String(pnr || '').trim()) {
                const eventBoarding = data.boardingStation || data.missedStation || '';
                if (!boarding || stationLabelsMatch(eventBoarding, boarding)) {
                    pushPassengerNotification('TTE rejected your request. You can send a new one.', 'warning');
                    refreshCurrentAndRecentStatuses();
                }
            }
        });

        newSocket.on('request_cancelled', (data) => {
            if (data?.pnr && String(data.pnr).trim() === String(pnr || '').trim()) {
                const eventBoarding = data.boardingStation || data.missedStation || '';
                if (!boarding || stationLabelsMatch(eventBoarding, boarding)) {
                    pushPassengerNotification('Your request has been cancelled.', 'info');
                    refreshCurrentAndRecentStatuses();
                }
            }
        });

        newSocket.on('tte_request_updated', (updatedReq) => {
            const isSamePnr = String(updatedReq?.pnr || '').trim() === String(pnr || '').trim();
            if (!isSamePnr) return;
            const updatedBoarding = updatedReq?.boardingStation || updatedReq?.missedStation || '';
            if (!boarding || stationLabelsMatch(updatedBoarding, boarding)) {
                refreshCurrentAndRecentStatuses();
            }
        });
        
        setSocket(newSocket);
        return () => newSocket.disconnect();
    }, [pnr, boarding]);

    useEffect(() => {
        if (requestStatus === 'idle') {
            setStatusMessage('');
            return;
        }

        if (requestStatus === 'approved') {
            setStatusMessage('Your TTE boarding protection is approved.');
            return;
        }
        if (requestStatus === 'pending') {
            setStatusMessage('Your TTE request is still pending approval.');
            return;
        }
        if (requestStatus === 'present') {
            setStatusMessage('Passenger already marked present by TTE.');
            return;
        }
        setStatusMessage('');
    }, [requestStatus]);

    const handleCheckPnr = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const data = await getPnrDetails(pnr);
            setPnrDetails(data);
            setPnrChecked(true);
            updateRecentSearches((prev) => upsertRecentEntry(prev, {
                pnr,
                trainNumber: data?.trainNumber,
                boarding,
                requestStatus: 'unknown',
            }));
            navigate(`/missed-train/pnr/${pnr}`);
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
        setActiveRequestId(null);

        try {
            const catchStatus = await checkCatchStatus(pnrDetails.trainNumber, boarding, boarding);
            
            setResult({
                ...pnrDetails,
                ...catchStatus
            });

            updateRecentSearches((prev) => upsertRecentEntry(prev, {
                pnr,
                trainNumber: pnrDetails?.trainNumber,
                boarding,
                catchStation: catchStatus?.lastValidStation?.stationName || '',
                requestStatus: requestStatus === 'idle' ? 'unknown' : requestStatus,
            }));

            try {
                const requests = await getTteRequests();
                const latestStatus = getLatestStatusForSearch(Array.isArray(requests) ? requests : [], { pnr, boarding });
                if (latestStatus !== 'unknown') {
                    const nextPhase = toPassengerRequestPhase(latestStatus);
                    setRequestStatus(nextPhase);
                    if (nextPhase === 'idle') {
                        setActiveRequestId(null);
                    }
                    updateRecentSearches((prev) => prev.map((entry) => (
                        String(entry?.pnr || '').trim() === String(pnr).trim() && stationLabelsMatch(entry?.boarding || '', boarding)
                            ? { ...entry, requestStatus: latestStatus, updatedAt: new Date().toISOString() }
                            : entry
                    )));
                }
            } catch {
                // fallback to current in-memory status if request lookup fails
            }

            navigate(`/missed-train/pnr/${pnr}/catch/${boarding.trim().toUpperCase()}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to calculate status. Make sure Station is correct.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendTteRequest = () => {
        if (!socket || !result) return;

        const requestId = activeRequestId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setActiveRequestId(requestId);

        const selectedCatchIndex = (result.nextStations || []).findIndex((station) =>
            stationLabelsMatch(station?.stationName, preferredCatchStation)
        );

        const stationsGapForRequest = selectedCatchIndex >= 0
            ? selectedCatchIndex + 1
            : result.stationsGap;

        socket.emit('send_tte_request', {
            id: requestId,
            pnr,
            trainNumber: result.trainNumber,
            boardingStation: boarding,
            catchStation: preferredCatchStation,
            eta: recommendedTrain?.originalDepartureAtCatch || recommendedTrain?.arrivalTime || result?.lastValidStation?.departs || '-',
            stationsGap: stationsGapForRequest,
            totalStations: result.totalStations,
            skipLimit: result.skipLimit,
            message: tteMessage
        });
        
        setRequestStatus('pending');
        pushPassengerNotification('Request sent to TTE. You will be notified on status updates.', 'info');
        updateRecentSearches((prev) => upsertRecentEntry(prev, {
            pnr,
            trainNumber: result?.trainNumber,
            boarding,
            catchStation: preferredCatchStation,
            requestStatus: 'pending',
        }));
    };

    const handleUpdateTteRequest = () => {
        if (!socket || !activeRequestId) return;
        socket.emit('update_tte_request', {
            id: activeRequestId,
            pnr,
            boardingStation: boarding,
            message: tteMessage,
        });
    };

    const handleCancelTteRequest = () => {
        if (!socket || !activeRequestId) return;
        socket.emit('cancel_tte_request', {
            id: activeRequestId,
            pnr,
            boardingStation: boarding,
        });
        setRequestStatus('idle');
        setActiveRequestId(null);
        updateRecentSearches((prev) => upsertRecentEntry(prev, {
            pnr,
            trainNumber: result?.trainNumber,
            boarding,
            catchStation: preferredCatchStation,
            requestStatus: 'cancelled',
        }));
    };

    const handleUseRecentSearch = async (entry) => {
        const pickedPnr = String(entry?.pnr || '').trim();
        if (!pickedPnr) return;

        setLoading(true);
        setError(null);
        setPnr(pickedPnr);
        setBoarding(String(entry?.boarding || '').trim());
        setResult(null);
        setPnrChecked(false);

        try {
            const data = await getPnrDetails(pickedPnr);
            setPnrDetails(data);
            setPnrChecked(true);

            const savedBoarding = String(entry?.boarding || '').trim();
            if (savedBoarding) {
                const catchStatus = await checkCatchStatus(data.trainNumber, savedBoarding, savedBoarding);
                setResult({ ...data, ...catchStatus });
                navigate(`/missed-train/pnr/${pickedPnr}/catch/${savedBoarding.toUpperCase()}`);
            } else {
                navigate(`/missed-train/pnr/${pickedPnr}`);
            }

            const requests = await getTteRequests();
            const latestStatus = getLatestStatusForSearch(Array.isArray(requests) ? requests : [], { pnr: pickedPnr, boarding: savedBoarding });
            const nextPhase = toPassengerRequestPhase(latestStatus);
            setRequestStatus(nextPhase);
            const latestRequest = getLatestRequestForSearch(Array.isArray(requests) ? requests : [], { pnr: pickedPnr, boarding: savedBoarding });
            setActiveRequestId(nextPhase === 'idle' ? null : (latestRequest?.id || null));
            if (latestRequest?.message) {
                setTteMessage(String(latestRequest.message));
            }
            updateRecentSearches((prev) => prev.map((item) => (
                String(item?.pnr || '').trim() === pickedPnr && stationLabelsMatch(item?.boarding || '', savedBoarding)
                    ? { ...item, requestStatus: latestStatus, updatedAt: new Date().toISOString() }
                    : item
            )));
        } catch {
            setError('Could not restore this recent search. Please check the PNR again.');
        } finally {
            setLoading(false);
        }
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
        { label: 'Missed Train', icon: <Train size={14} />, onClick: () => { setPnrChecked(false); setResult(null); setPnrDetails(null); setBoarding(''); navigate('/missed-train', { replace: true }); } },
    ];
    if (pnrChecked && pnrDetails) {
        breadcrumbs.push({
            label: `PNR: ${pnr}`,
            icon: <ChevronRight size={14} />,
            onClick: () => { setResult(null); setBoarding(''); navigate(`/missed-train/pnr/${pnr}`, { replace: true }); },
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
            {inAppNotifications.length > 0 && (
                <div className="calculator-shell passenger-notification-stack">
                    {inAppNotifications.map((item) => (
                        <div key={item.id} className={`passenger-notification passenger-notification-${item.tone}`}>
                            <span>{item.message}</span>
                            <button
                                type="button"
                                className="passenger-notification-close"
                                onClick={() => setInAppNotifications((prev) => prev.filter((n) => n.id !== item.id))}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

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
                                  <button type="button" onClick={() => {setPnrChecked(false); setResult(null); setPnrDetails(null); navigate('/missed-train', { replace: true });}} className="text-xs text-primary underline">Change PNR</button>
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
                            {statusMessage && (
                                <div className="status-note">
                                    {statusMessage}
                                </div>
                            )}
                            {error && <div className="calculator-error"><AlertCircle size={18} /> {error}</div>}
                        </form>
                    )}
            </div>
            </div>

            {!pnrChecked && recentSearches.length > 0 && (
                <div className="calculator-shell recent-searches-section">
                    <div className="recent-searches">
                        <div className="recent-head">
                            <p className="recent-title">Recent Searches</p>
                        </div>
                        <div className="recent-list">
                            {recentSearches.map((item) => (
                                <button
                                    key={`${item.pnr}-${item.boarding}`}
                                    type="button"
                                    className="recent-item"
                                    onClick={() => handleUseRecentSearch(item)}
                                >
                                    <span className="recent-main">
                                        <strong>PNR {item.pnr}</strong>
                                        <span>{item.boarding ? `Missed at ${item.boarding}` : 'No station saved'}</span>
                                    </span>
                                    <span className={`recent-status status-${item.requestStatus || 'unknown'}`}>
                                        {item.requestStatus === 'approved' ? 'Approved' :
                                         item.requestStatus === 'pending' ? 'Pending' :
                                         item.requestStatus === 'rejected' ? 'Rejected' :
                                         item.requestStatus === 'cancelled' ? 'Cancelled' :
                                         item.requestStatus === 'present' ? 'Present' : 'Unknown'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

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
                            <div className="text-center py-4">
                                <div className="animate-pulse text-primary font-bold text-lg mb-3">
                                    ⏳ Request sent! Waiting for TTE Approval...
                                </div>
                                <textarea 
                                    value={tteMessage}
                                    onChange={e=>setTteMessage(e.target.value)}
                                    placeholder="Update your message before TTE action"
                                    className="input-field mb-3"
                                    rows="3"
                                />
                                <div className="flex gap-2 justify-center">
                                    <button onClick={handleUpdateTteRequest} className="btn btn-secondary">
                                        Update Request
                                    </button>
                                    <button onClick={handleCancelTteRequest} className="btn btn-outline">
                                        Cancel Request
                                    </button>
                                </div>
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
