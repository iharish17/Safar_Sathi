const express = require('express');
const router = express.Router();
const { getStationCode, timeToMins } = require('../utils/helpers');

module.exports = (trains) => {

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
    const canCatch = currentIndex <= lastValidIndex && lastValidIndex < route.length;

    const nextStations = route.slice(currentIndex + 1, lastValidIndex + 1);
    const lastValidStation = route[Math.min(lastValidIndex, route.length - 1)];

    let alternateTrains = [];

    if (canCatch && lastValidStation) {
      const currentStationCode = getStationCode(route[currentIndex].stationName);
      const originalDepMinsFromCurrent = timeToMins(route[currentIndex].departs, route[currentIndex].day);

      const candidateCatchStops = route
        .slice(currentIndex + 1, lastValidIndex + 1)
        .map((stop, offset) => ({
          stop,
          routeIndex: currentIndex + 1 + offset,
          stationCode: getStationCode(stop.stationName),
          originalArrMins: timeToMins(stop.arrives, stop.day)
        }));

      const findEarliestCatchForAltTrain = (altTrain, strictTimeCheck) => {
        const altRoute = altTrain.trainRoute;
        const altCurrentIndex = altRoute.findIndex(
          st => getStationCode(st.stationName) === currentStationCode
        );

        if (altCurrentIndex === -1) return null;

        const altDepMins = timeToMins(altRoute[altCurrentIndex].departs, altRoute[altCurrentIndex].day);

        for (const candidate of candidateCatchStops) {
          const altCatchIndex = altRoute.findIndex(
            st => getStationCode(st.stationName) === candidate.stationCode
          );

          if (altCatchIndex === -1 || altCurrentIndex >= altCatchIndex) continue;

          if (strictTimeCheck) {
            const depAfterMissedPoint = altDepMins > originalDepMinsFromCurrent;
            const altArrMins = timeToMins(altRoute[altCatchIndex].arrives, altRoute[altCatchIndex].day);
            const arrivesBeforeOriginal = altArrMins < candidate.originalArrMins;
            if (!depAfterMissedPoint || !arrivesBeforeOriginal) continue;
          }

          return {
            trainNumber: altTrain.trainNumber,
            trainName: altTrain.trainName,
            departureTime: altRoute[altCurrentIndex].departs,
            departureDay: altRoute[altCurrentIndex].day,
            arrivalTime: altRoute[altCatchIndex].arrives,
            arrivalDay: altRoute[altCatchIndex].day,
            boardingStation: altRoute[altCurrentIndex].stationName,
            catchStation: altRoute[altCatchIndex].stationName,
            originalCatchStation: candidate.stop.stationName,
            originalArrivalAtCatch: candidate.stop.arrives,
            originalArrivalDayAtCatch: candidate.stop.day,
            originalDepartureAtCatch: candidate.stop.departs,
            originalDepartureDayAtCatch: candidate.stop.day,
            catchRouteIndex: candidate.routeIndex,
            isRunningLate: true,
            delayMins: Math.floor(Math.random() * 60) + 15
          };
        }

        return null;
      };

      for (const altTrain of trains) {
        if (altTrain.trainNumber === trainNumber) continue;
        const match = findEarliestCatchForAltTrain(altTrain, true);
        if (match) alternateTrains.push(match);
      }

      if (alternateTrains.length === 0) {
        for (const altTrain of trains) {
          if (altTrain.trainNumber === trainNumber) continue;
          const match = findEarliestCatchForAltTrain(altTrain, false);
          if (match) alternateTrains.push(match);
        }
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
      stationsGap: lastValidIndex - boardingIndex,
      alternateTrains: alternateTrains.length > 0 ? alternateTrains : null
    });
  });

  return router;
};
