const express = require('express');
const { getMins } = require('../utils/helpers');

module.exports = (trains) => {
  const getTrainWithSortedRoute = (trainNumber) => {
    const train = trains.find(t => t.trainNumber === trainNumber);
    if (!train) return null;
    const sortedRoute = [...train.trainRoute].sort((a, b) => a.sno - b.sno);
    return { ...train, trainRoute: sortedRoute };
  };

  const buildSimulatedLiveRoute = (trainData) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let simulatedIndex = 0;
    for (let i = 0; i < trainData.trainRoute.length; i++) {
      const arrMins = getMins(trainData.trainRoute[i].arrives);
      if (currentMinutes < arrMins && i > 0) {
        simulatedIndex = i - 1;
        break;
      }
    }

    const currentStation = trainData.trainRoute[simulatedIndex];
    const nextStation = trainData.trainRoute[simulatedIndex + 1] || currentStation;

    return {
      trainNumber: trainData.trainNumber,
      trainName: trainData.trainName,
      currentStation,
      nextStation,
      delay: Math.floor(Math.random() * 15),
      route: trainData.trainRoute,
    };
  };

  const trainRouter = express.Router();
  trainRouter.get('/:trainNumber', (req, res) => {
    const trainData = getTrainWithSortedRoute(req.params.trainNumber);
    if (!trainData) return res.status(404).json({ error: 'Train not found' });
    res.json(trainData);
  });

  const liveRouter = express.Router();
  liveRouter.get('/:trainNumber', (req, res) => {
    const trainData = getTrainWithSortedRoute(req.params.trainNumber);
    if (!trainData) return res.status(404).json({ error: 'Train not found' });
    res.json(buildSimulatedLiveRoute(trainData));
  });

  return { trainRouter, liveRouter };
};
