const express = require('express');
const router = express.Router();
const mockPnrs = require('../data/mockPnrs');

module.exports = (trains) => {
  // GET /pnr/:pnr
  router.get('/:pnr', (req, res) => {
    const pnrData = mockPnrs[req.params.pnr];
    if (!pnrData) return res.status(404).json({ error: 'PNR not found' });

    const train = trains.find(t => t.trainNumber === pnrData.trainNumber);
    const trainName = train ? train.trainName : 'Unknown Train';
    const route = train ? train.trainRoute : [];

    res.json({
      ...pnrData,
      sourceCode: pnrData.source,
      destinationCode: pnrData.destination,
      trainName,
      route
    });
  });

  return router;
};
