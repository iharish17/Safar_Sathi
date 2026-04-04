require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const { loadTrains } = require('./utils/dataLoader');
const trains = loadTrains();

const { trainRouter, liveRouter } = require('./routes/train')(trains);

app.use('/search', require('./routes/search')(trains));
app.use('/train', trainRouter);
app.use('/pnr', require('./routes/pnr')(trains));
app.use('/can-catch', require('./routes/canCatch')(trains));
app.use('/tte', require('./routes/tte')(trains));
app.use('/live', liveRouter);

require('./socket/socket')(io, trains);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
