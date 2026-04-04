const express = require('express');
const router = express.Router();
const { getStationCode, timeToMins } = require('../utils/helpers');

module.exports = (trains) => {

  const MAX_ALT_WAIT_MINS = 6 * 60;
  const MAX_EARLY_ARRIVAL_MINS = 6 * 60;
  const DAY_MINS = 24 * 60;
  const isSchedulableTime = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return text && text !== 'source' && text !== 'destination';
  };
  const hhmmToMinutes = (value) => {
    const [h, m] = String(value || '').split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return (h * 60) + m;
  };
  const minutesUntilNextOccurrence = (fromClockMins, toClockMins) => {
    if (fromClockMins === null || toClockMins === null) return null;
    const diff = toClockMins - fromClockMins;
    return diff >= 0 ? diff : diff + DAY_MINS;
  };

  router.get('/', (req, res) => {
    const { train: trainNumber, boarding, current } = req.query;
    const train = trains.find(t => t.trainNumber === trainNumber);
    if (!train) return res.status(404).json({ error: 'Train not found' });

    const route = [...train.trainRoute].sort((a, b) => a.sno - b.sno);

    const matchStation = (stName, searchStr) => {
      const search = searchStr.trim().toUpperCase();

      return getStationCode(stName) === search || stName.toUpperCase().includes(search);
    };

    const boardingIndex = route.findIndex(st => matchStation(st.stationName, boarding));
    const currentIndex = route.findIndex(st => matchStation(st.stationName, current));

    if (boardingIndex === -1 || currentIndex === -1) {
      return res.status(400).json({ error: 'Invalid stations provided or not on this train route' });
    }

    const isMissed = currentIndex >= boardingIndex;

    if (currentIndex < boardingIndex) {
      return res.json({
        missed: false,
        canCatch: true,
        nextStations: route.slice(currentIndex + 1),
        lastValidStation: route[route.length - 1]
      });
    }

    // Calculation of how many stations can be skipped
    const totalStops = route.length;
    let skipLimit = 5;
    if (totalStops > 40) skipLimit = 15;
    else if (totalStops > 20) skipLimit = 10;

    const lastValidIndex = boardingIndex + skipLimit;
    const boundedLastValidIndex = Math.min(lastValidIndex, route.length - 1);
    const canCatch = currentIndex <= boundedLastValidIndex;

    const nextStations = route.slice(currentIndex + 1, boundedLastValidIndex + 1);
    const lastValidStation = route[boundedLastValidIndex];

    let alternateTrains = [];

    if (canCatch && lastValidStation) {
      const currentStationCode = getStationCode(route[currentIndex].stationName);
      const originalDepMinsFromCurrent = timeToMins(route[currentIndex].departs, route[currentIndex].day);
      const originalDepClockMins = hhmmToMinutes(route[currentIndex].departs);

      const candidateCatchStops = route
        .slice(currentIndex + 1, boundedLastValidIndex + 1)
        .map((stop, offset) => ({
          stop,
          routeIndex: currentIndex + 1 + offset,
          stationCode: getStationCode(stop.stationName),
          originalArrMins: timeToMins(stop.arrives, stop.day),
          originalTravelMins: Math.max(0, timeToMins(stop.arrives, stop.day) - originalDepMinsFromCurrent)
        }));

      const findEarliestCatchForAltTrain = (altTrain) => {
        const altRoute = altTrain.trainRoute;
        const altCurrentIndex = altRoute.findIndex(
          st => getStationCode(st.stationName) === currentStationCode
        );

        if (altCurrentIndex === -1) return null;

        const altCurrentStop = altRoute[altCurrentIndex];
        if (!isSchedulableTime(altCurrentStop?.departs)) return null;

        const altDepMins = timeToMins(altCurrentStop.departs, altCurrentStop.day);
        const altDepClockMins = hhmmToMinutes(altCurrentStop.departs);
        const waitMins = minutesUntilNextOccurrence(originalDepClockMins, altDepClockMins);
        const depAfterMissedPoint = waitMins !== null && waitMins > 0;

        if (!depAfterMissedPoint || waitMins > MAX_ALT_WAIT_MINS) return null;

        for (const candidate of candidateCatchStops) {
          const altCatchIndex = altRoute.findIndex(
            st => getStationCode(st.stationName) === candidate.stationCode
          );

          if (altCatchIndex === -1 || altCurrentIndex >= altCatchIndex) continue;

          const altCatchStop = altRoute[altCatchIndex];
          if (!isSchedulableTime(altCatchStop?.arrives) || !isSchedulableTime(candidate.stop?.arrives)) continue;

          const altArrMins = timeToMins(altCatchStop.arrives, altCatchStop.day);
          const altTravelMins = Math.max(0, altArrMins - altDepMins);
          const altArrivalFromMissedMins = waitMins + altTravelMins;
          const originalArrivalFromMissedMins = candidate.originalTravelMins;

          const leadMins = originalArrivalFromMissedMins - altArrivalFromMissedMins;
          const arrivesBeforeOriginal = leadMins > 0;
          const withinPracticalArrivalWindow = leadMins <= MAX_EARLY_ARRIVAL_MINS;
          if (!arrivesBeforeOriginal || !withinPracticalArrivalWindow) continue;

          return {
            trainNumber: altTrain.trainNumber,
            trainName: altTrain.trainName,
            departureTime: altCurrentStop.departs,
            departureDay: altCurrentStop.day,
            arrivalTime: altCatchStop.arrives,
            arrivalDay: altCatchStop.day,
            boardingStation: altCurrentStop.stationName,
            catchStation: altCatchStop.stationName,
            originalCatchStation: candidate.stop.stationName,
            originalArrivalAtCatch: candidate.stop.arrives,
            originalArrivalDayAtCatch: candidate.stop.day,
            originalDepartureAtCatch: candidate.stop.departs,
            originalDepartureDayAtCatch: candidate.stop.day,
            catchRouteIndex: candidate.routeIndex,
            leadMins,
            isRunningLate: true,
            delayMins: Math.floor(Math.random() * 60) + 15
          };
        }

        return null;
      };

      for (const altTrain of trains) {
        if (altTrain.trainNumber === trainNumber) continue;
        const match = findEarliestCatchForAltTrain(altTrain);
        if (match) alternateTrains.push(match);
      }

      alternateTrains.sort((a, b) => a.catchRouteIndex - b.catchRouteIndex);
      alternateTrains = alternateTrains.map(({ catchRouteIndex, ...rest }) => rest);
    }

    res.json({
      missed: true,
      canCatch,
      nextStations,
      lastValidStation,
      skipLimit,
      boardingIndex,
      currentIndex,
      lastValidIndex,
      totalStations: route.length,
      stationsGap: Math.max(0, boundedLastValidIndex - currentIndex),
      alternateTrains: alternateTrains.length > 0 ? alternateTrains : null
    });
  });

  return router;
};
