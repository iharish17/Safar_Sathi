const express = require('express');
const router = express.Router();
const { getMins } = require('../utils/helpers');

module.exports = (trains) => {
  // GET /train/:trainNumber — Train details
  router.get('/:trainNumber', (req, res) => {
    const train = trains.find(t => t.trainNumber === req.params.trainNumber);
    if (!train) return res.status(404).json({ error: 'Train not found' });

    const sortedRoute = [...train.trainRoute].sort((a, b) => a.sno - b.sno);
    res.json({ ...train, trainRoute: sortedRoute });
  });

  return router;
};