const express = require('express');
const router = express.Router();
const mockPnrs = require('../data/mockPnrs');
const { getStationCode } = require('../utils/helpers');

module.exports = (trains) => {
  const normalizeStationText = (value = '') => String(value || '').trim().toUpperCase();

  const findTrain = (trainNumber = '') => {
    const cleanTrainNumber = String(trainNumber || '').trim();
    if (!cleanTrainNumber) return null;
    return trains.find((train) => String(train?.trainNumber || '').trim() === cleanTrainNumber) || null;
  };

  const sortRoute = (route = []) => (
    Array.isArray(route)
      ? [...route].sort((a, b) => Number(a?.sno || 0) - Number(b?.sno || 0))
      : []
  );

  const findStation = (route = [], value = '') => {
    const search = normalizeStationText(value);
    if (!search) return null;

    return route.find((station) => {
      const stationName = normalizeStationText(station?.stationName);
      const stationCode = normalizeStationText(getStationCode(station?.stationName));
      return stationName === search || stationCode === search || stationName.includes(search);
    }) || null;
  };

  const buildStationDetails = (route = [], value = '', fallbackStation = null) => {
    const station = findStation(route, value) || fallbackStation || {};
    return {
      code: getStationCode(station?.stationName || value),
      name: station?.stationName || value || '',
    };
  };

  router.get('/:pnr', (req, res) => {
    const requestedPnr = String(req.params.pnr || '').trim();
    const pnrData = mockPnrs[requestedPnr];

    if (!pnrData) {
      return res.status(404).json({ error: 'PNR not found in mock data.' });
    }

    const train = findTrain(pnrData.trainNumber);
    const route = sortRoute(train?.trainRoute);
    const sourceDetails = buildStationDetails(route, pnrData.source, route[0]);
    const destinationDetails = buildStationDetails(route, pnrData.destination, route[route.length - 1]);

    return res.json({
      pnr: requestedPnr,
      trainNumber: String(pnrData.trainNumber || '').trim(),
      trainName: train?.trainName || pnrData.trainName || 'Unknown Train',
      source: pnrData.source || sourceDetails.name,
      destination: pnrData.destination || destinationDetails.name,
      sourceCode: sourceDetails.code,
      destinationCode: destinationDetails.code,
      sourceName: sourceDetails.name,
      destinationName: destinationDetails.name,
      status: pnrData.status || 'CONFIRMED',
      passengers: Array.isArray(pnrData.passengers) ? pnrData.passengers : [],
      route,
      raw: pnrData,
    });
  });

  return router;
};
