import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MapPin, Clock } from 'lucide-react';
import { searchTrains, getTrainDetails, getLiveStatus } from '../services/api';
import '../styles/SearchTrains.css';
void motion;

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const DATE_OPTIONS = [
  { value: -2, label: '2 days ago' },
  { value: -1, label: 'Yesterday' },
  { value: 0, label: 'Today' },
  { value: 1, label: 'Tomorrow' },
  { value: 2, label: 'Day after tomorrow' },
];

const RECENT_SEARCHES_KEY = 'safar-sathi-recent-train-searches';
const TRACKING_STATE_PREFIX = 'safar-sathi-tracking-state';
const MAX_RECENT_SEARCHES = 6;
const VALID_DATE_OFFSETS = new Set(DATE_OPTIONS.map((option) => option.value));

const formatStationLabel = (stationName) => stationName?.split(' - ')[0]?.trim() || stationName || 'Unknown';

const parse24HourMinutes = (value) => {
  if (!value || /source|destination/i.test(value)) return null;

  const [hh, mm] = String(value).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return (hh * 60) + mm;
};

const formatTime12Hour = (value) => {
  const minutes = parse24HourMinutes(value);
  if (minutes === null) return '---';

  const hh24 = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const meridiem = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = ((hh24 + 11) % 12) + 1;
  return `${hh12}:${String(mm).padStart(2, '0')} ${meridiem}`;
};

const getShiftedTime = (value, delayMins) => {
  const minutes = parse24HourMinutes(value);
  if (minutes === null) return '---';

  const shifted = ((minutes + delayMins) % 1440 + 1440) % 1440;
  const hh = Math.floor(shifted / 60);
  const mm = shifted % 60;
  return formatTime12Hour(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
};

const getTimelineDateLabel = (offsetDays, routeDay) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays + (Number(routeDay || 1) - 1));
  return `Day ${routeDay || 1} - ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })}`;
};

const dayLabelForOffset = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

const getRunStatus = (train, offsetDays) => {
  if (!train?.runningDays) return true;
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const dayKey = DAY_KEYS[date.getDay()];
  return Boolean(train.runningDays[dayKey]);
};

const readRecentSearches = () => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        trainNumber: String(item?.trainNumber || '').trim(),
        trainName: String(item?.trainName || '').trim(),
      }))
      .filter((item) => item.trainNumber)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
};

const getTrackingStateKey = (trainNumber) => `${TRACKING_STATE_PREFIX}:${String(trainNumber || '').trim()}`;

const readTrackingState = (trainNumber) => {
  if (typeof window === 'undefined') return null;

  const cleanTrainNumber = String(trainNumber || '').trim();
  if (!cleanTrainNumber) return null;

  try {
    const raw = window.localStorage.getItem(getTrackingStateKey(cleanTrainNumber));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const station = String(parsed?.station || '').trim();
    const dateOffset = Number(parsed?.dateOffset);

    return {
      station,
      dateOffset: VALID_DATE_OFFSETS.has(dateOffset) ? dateOffset : 0,
    };
  } catch {
    return null;
  }
};

const writeTrackingState = (trainNumber, nextState) => {
  if (typeof window === 'undefined') return;

  const cleanTrainNumber = String(trainNumber || '').trim();
  if (!cleanTrainNumber) return;

  const payload = {
    station: String(nextState?.station || '').trim(),
    dateOffset: VALID_DATE_OFFSETS.has(Number(nextState?.dateOffset)) ? Number(nextState.dateOffset) : 0,
  };

  window.localStorage.setItem(getTrackingStateKey(cleanTrainNumber), JSON.stringify(payload));
};

const SearchTrains = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [trainData, setTrainData] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [draftStation, setDraftStation] = useState('');
  const [appliedStation, setAppliedStation] = useState('');
  const [draftDateOffset, setDraftDateOffset] = useState(0);
  const [appliedDateOffset, setAppliedDateOffset] = useState(0);
  const [fetchingTrain, setFetchingTrain] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [activeHeaderDay, setActiveHeaderDay] = useState(1);
  const [recentSearches, setRecentSearches] = useState([]);
  const dayMarkerRefs = useRef({});
  const timelineHeaderRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isRunningOnSelectedDate = useMemo(
    () => getRunStatus(trainData || selectedTrain, appliedDateOffset),
    [trainData, selectedTrain, appliedDateOffset]
  );

  const visibleRoute = useMemo(() => {
    if (!trainData?.trainRoute) return [];
    if (!appliedStation) return trainData.trainRoute;
    const idx = trainData.trainRoute.findIndex((stop) => stop.stationName === appliedStation);
    return idx >= 0 ? trainData.trainRoute.slice(idx) : trainData.trainRoute;
  }, [trainData, appliedStation]);

  const currentSno = Number(liveData?.currentStation?.sno || 0);
  const routeDelay = Number(liveData?.delay || 0);

  const clearLoadedTracking = () => {
    setTrainData(null);
    setLiveData(null);
    setFetchError('');
    setDraftStation('');
    setAppliedStation('');
    setDraftDateOffset(0);
    setAppliedDateOffset(0);
  };

  const recordRecentSearch = useCallback((trainNumber, trainName = '') => {
    const cleanTrainNumber = String(trainNumber || '').trim();
    if (!cleanTrainNumber) return;

    const nextEntry = {
      trainNumber: cleanTrainNumber,
      trainName: String(trainName || '').trim(),
    };

    setRecentSearches((prev) => {
      const next = [
        nextEntry,
        ...prev.filter((item) => item.trainNumber !== cleanTrainNumber),
      ].slice(0, MAX_RECENT_SEARCHES);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      }

      return next;
    });
  }, []);

  const openTrainTracking = useCallback((trainNumber, options = {}) => {
    const cleanTrainNumber = String(trainNumber || '').trim();
    if (!cleanTrainNumber) return;

    const params = new URLSearchParams(location.search);
    params.set('train', cleanTrainNumber);
    const cleanFocus = String(options?.focus || '').trim();
    if (cleanFocus) {
      params.set('focus', cleanFocus);
    }
    navigate(`/search?${params.toString()}`);
  }, [location.search, navigate]);

  const applyTrackerFilters = () => {
    setAppliedStation(draftStation);
    setAppliedDateOffset(draftDateOffset);

    if (trainData?.trainNumber) {
      writeTrackingState(trainData.trainNumber, {
        station: draftStation,
        dateOffset: draftDateOffset,
      });
    }
  };

  const renderRecentSearches = (mode = 'idle') => {
    if (!recentSearches.length) return null;

    return (
      <div className={`recent-searches-inline recent-searches-inline--${mode}`} aria-label="Recent searches">
        <div className="recent-searches-head">
          <div>
            <p className="recent-searches-title">Recent searches</p>
            <p className="recent-searches-note">Tap one to reopen live tracking.</p>
          </div>
        </div>
        <div className="recent-searches-list">
          {recentSearches.map((train) => (
            <button
              key={train.trainNumber}
              type="button"
              className="recent-search-chip"
              onClick={() => {
                setSelectedTrain({ trainNumber: train.trainNumber, trainName: train.trainName });
                openTrainTracking(train.trainNumber);
              }}
            >
              <span className="recent-search-chip-number">{train.trainNumber}</span>
              <span className="recent-search-chip-name">{train.trainName || 'Train'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const loadTrainDetails = useCallback(async (trainNumber) => {
    setFetchingTrain(true);
    setFetchError('');

    try {
      const [details, live] = await Promise.all([
        getTrainDetails(trainNumber),
        getLiveStatus(trainNumber).catch(() => null),
      ]);

      setTrainData(details);
      setLiveData(live);
        recordRecentSearch(details?.trainNumber || trainNumber, details?.trainName || '');
      const firstStation = details?.trainRoute?.[0]?.stationName || '';
      const savedState = readTrackingState(details?.trainNumber || trainNumber);
      const savedStation = savedState?.station || '';
      const savedDateOffset = VALID_DATE_OFFSETS.has(savedState?.dateOffset) ? savedState.dateOffset : 0;
      const routeHasSavedStation = Boolean(savedStation)
        && (details?.trainRoute || []).some((stop) => stop.stationName === savedStation);

      const nextStation = routeHasSavedStation ? savedStation : firstStation;
      const nextDateOffset = savedDateOffset;

      setDraftStation(nextStation);
      setAppliedStation(nextStation);
      setDraftDateOffset(nextDateOffset);
      setAppliedDateOffset(nextDateOffset);

      writeTrackingState(details?.trainNumber || trainNumber, {
        station: nextStation,
        dateOffset: nextDateOffset,
      });
    } catch (err) {
      setTrainData(null);
      setLiveData(null);
      setFetchError(err.response?.data?.error || 'Unable to load train details right now.');
    } finally {
      setFetchingTrain(false);
    }
  }, [recordRecentSearch]);

  const applyTracking = async (train) => {
    if (!train) return;
    setQuery('');
    setResults([]);
    setSelectedTrain(train);
    clearLoadedTracking();
    openTrainTracking(train.trainNumber);
  };

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query || query.length < 2) {
        setResults([]);
        return;
      }

      // If input is in "NUMBER - NAME" format, query backend with the primary segment.
      const apiQuery = query.includes('-')
        ? query.split('-')[0].trim()
        : query.trim();

      if (apiQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await searchTrains(apiQuery);
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(fetchResults, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trainFromUrl = params.get('train')?.trim();
    const pendingTrain = String(location.state?.pendingTrain || '').trim();
    const pendingFocus = String(location.state?.pendingFocus || '').trim();

    if (!trainFromUrl && pendingTrain) {
      navigate(`${location.pathname}?${params.toString()}`, { replace: true, state: null });
      openTrainTracking(pendingTrain, { focus: pendingFocus });
      return;
    }

    if (!trainFromUrl) {
      clearLoadedTracking();
      setSelectedTrain(null);
      setFetchError('');
      return;
    }

    clearLoadedTracking();
    loadTrainDetails(trainFromUrl);
  }, [location.pathname, location.search, location.state, loadTrainDetails, navigate, openTrainTracking]);

  useEffect(() => {
    if (!trainData?.trainNumber) return;

    const timer = setInterval(async () => {
      try {
        const live = await getLiveStatus(trainData.trainNumber);
        setLiveData(live);
      } catch {
        // Keep previous snapshot if refresh fails.
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [trainData?.trainNumber]);

  useEffect(() => {
    const initialDay = Number(visibleRoute?.[0]?.day || 1);
    dayMarkerRefs.current = {};
    setActiveHeaderDay(initialDay);
  }, [visibleRoute]);

  useEffect(() => {
    if (!visibleRoute.length) return undefined;

    const updateActiveDayFromScroll = () => {
      const headerBottom = timelineHeaderRef.current?.getBoundingClientRect()?.bottom;
      const viewportThreshold = Number.isFinite(headerBottom) ? headerBottom : 74;
      let currentDay = Number(visibleRoute[0]?.day || 1);

      Object.entries(dayMarkerRefs.current)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .forEach(([day, el]) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= viewportThreshold) {
          currentDay = Number(day);
        }
      });

      setActiveHeaderDay((prev) => (prev === currentDay ? prev : currentDay));
    };

    updateActiveDayFromScroll();
    window.addEventListener('scroll', updateActiveDayFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveDayFromScroll);

    return () => {
      window.removeEventListener('scroll', updateActiveDayFromScroll);
      window.removeEventListener('resize', updateActiveDayFromScroll);
    };
  }, [visibleRoute]);

  return (
    <motion.div
      className="search-page"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="search-header">
        <h2>{trainData?.trainNumber || 'Train'} running status | Live train status</h2>
      </div>

      <div className="search-shell">
        <div className="search-input-shell">
          <div className={`search-input-wrap ${!isRunningOnSelectedDate && trainData ? 'search-input-error' : ''}`}>
          <Search className="text-muted" />
          <input
            type="text"
            placeholder="Train Number or Name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedTrain(null);
              clearLoadedTracking();
            }}
          />
          <button
            type="button"
            className="check-status-btn"
            onClick={() => applyTracking(selectedTrain || results[0])}
            disabled={fetchingTrain || (!selectedTrain && results.length === 0)}
            aria-label={fetchingTrain ? 'Searching trains' : 'Search train'}
            title={fetchingTrain ? 'Searching trains' : 'Search train'}
          >
            <Search size={18} aria-hidden="true" />
          </button>
          </div>

          {query.length >= 2 && results.length > 0 && !loading && !selectedTrain && (
            <div className="train-suggestion-list" role="listbox" aria-label="Train suggestions">
              {results.map((train) => (
                <button
                  key={train.trainNumber}
                  type="button"
                  className="train-suggestion-item"
                  onClick={() => {
                    setSelectedTrain(train);
                    setQuery(`${train.trainNumber} - ${train.trainName}`);
                    clearLoadedTracking();
                  }}
                >
                  {train.trainNumber} - {train.trainName}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {!query && !trainData && !fetchingTrain && renderRecentSearches('idle')}

      {!isRunningOnSelectedDate && trainData && (
        <p className="running-alert">
          Train does not run on {dayLabelForOffset(appliedDateOffset)} at {appliedStation || 'selected station'}. Please select a different station or date.
        </p>
      )}

      {loading && <p className="search-status">Searching live routes...</p>}

      {query.length >= 2 && results.length === 0 && !loading && !selectedTrain && (
        <motion.p
          className="no-results"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          No trains found. Try another station or number.
        </motion.p>
      )}

      {fetchError && <p className="running-alert">{fetchError}</p>}

      {trainData && (
          <div className="tracker-layout">
            <div className="tracker-controls">
              <div className="tracker-control-group">
                <label>Select Journey Station</label>
                <div className="tracker-select-wrap">
                  <MapPin size={16} />
                  <select
                    value={draftStation}
                    onChange={(e) => {
                      const nextStation = e.target.value;
                      setDraftStation(nextStation);

                      if (trainData?.trainNumber) {
                        writeTrackingState(trainData.trainNumber, {
                          station: nextStation,
                          dateOffset: draftDateOffset,
                        });
                      }
                    }}
                  >
                    {(trainData.trainRoute || []).map((stop) => (
                      <option key={`${stop.sno}-${stop.stationName}`} value={stop.stationName}>
                        {stop.stationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tracker-control-group">
                <label>Select Journey Date</label>
                <div className="tracker-select-wrap">
                  <Clock size={16} />
                  <select
                    value={draftDateOffset}
                    onChange={(e) => {
                      const nextDateOffset = Number(e.target.value);
                      setDraftDateOffset(nextDateOffset);

                      if (trainData?.trainNumber) {
                        writeTrackingState(trainData.trainNumber, {
                          station: draftStation,
                          dateOffset: nextDateOffset,
                        });
                      }
                    }}
                  >
                    {DATE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                className="submit-filter-btn"
                onClick={applyTrackerFilters}
                disabled={fetchingTrain}
              >
                Submit
              </button>
            </div>

            {isRunningOnSelectedDate && (
              <div className="status-card-compact">
                <p className="status-title">
                  Train departed from {liveData?.currentStation?.stationName || appliedStation}
                </p>
                <p className="status-note">
                  Last updated: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>

                <div className="status-timeline-header" ref={timelineHeaderRef}>
                  <span>Arrival</span>
                  <span>{getTimelineDateLabel(appliedDateOffset, activeHeaderDay)}</span>
                  <span>Departure</span>
                </div>

                <div className="status-timeline-list">
                {visibleRoute.map((stop, index) => {
                  const stopDay = Number(stop.day || 1);
                  const stopSno = Number(stop.sno || 0);
                  const hasPassedOrCurrent = currentSno > 0 ? stopSno <= currentSno : false;
                  const isCurrent = currentSno > 0 && stopSno === currentSno;
                  const prevDay = Number(visibleRoute[index - 1]?.day || stopDay);
                  const isFirstOfDay = index === 0 || stopDay !== prevDay;
                  const delayState = hasPassedOrCurrent
                    ? (routeDelay > 0 ? 'is-late' : routeDelay < 0 ? 'is-early' : 'is-ontime')
                    : 'is-upcoming';

                  const platform = stop.platform || stop.platformNo || stop.pfNo || '--';
                  const showPlatform = platform !== '--';
                  const scheduledArrival = formatTime12Hour(stop.arrives);
                  const scheduledDeparture = formatTime12Hour(stop.departs);
                  const actualArrival = hasPassedOrCurrent ? getShiftedTime(stop.arrives, routeDelay) : '---';
                  const actualDeparture = hasPassedOrCurrent ? getShiftedTime(stop.departs, routeDelay) : '---';

                  return (
                    <React.Fragment key={`${stop.sno}-${stop.stationName}`}>
                      {isFirstOfDay && (
                        <div
                          className="status-day-marker"
                          ref={(el) => {
                            dayMarkerRefs.current[stopDay] = el;
                          }}
                        >
                          <span>{getTimelineDateLabel(appliedDateOffset, stopDay)}</span>
                        </div>
                      )}
                      <div className={`status-row ${delayState} ${isCurrent ? 'is-current-station' : ''}`}>
                        <div className="timeline-time-col arrival-col">
                          <span className="time-scheduled">{scheduledArrival}</span>
                          <span className={`time-live ${delayState}`}>{actualArrival}</span>
                        </div>

                        <span className="timeline-stop-dot" aria-hidden="true" />

                        <div className="timeline-station-col">
                          <p className="status-station-name">{formatStationLabel(stop.stationName)}</p>
                          <div className="timeline-station-meta">
                            <p className="status-date-cell">{stop.distance || '--'}</p>
                            {showPlatform && (
                              <>
                                <span className="station-platform-label">Platform</span>
                                <div className="station-platform-chip" aria-label="station platform">
                                  <span>{platform}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="timeline-time-col departure-col">
                          <span className="time-scheduled">{scheduledDeparture}</span>
                          <span className={`time-live ${delayState}`}>{actualDeparture}</span>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                </div>
              </div>
            )}

            {trainData && !fetchingTrain && renderRecentSearches('tracked')}
          </div>
        )}
    </motion.div>
  );
};

export default SearchTrains;
