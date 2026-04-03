const express = require('express');
const http = require('http');
const cors = require('cors');

// --- Setup ---
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// --- Start Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
