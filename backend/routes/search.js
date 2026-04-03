const express = require("express");
const router = express.Router();

module.exports = (trains) => {
  router.get("/", (req, res) => {
    const q = (req.query.q || "").toLowerCase();
    if (!q) return res.json([]);

    const results = trains
      .filter((t) => {
        if (
          t.trainNumber.toLowerCase().includes(q) ||
          t.trainName.toLowerCase().includes(q)
        )
          return true;
        return t.trainRoute.some((st) =>
          st.stationName.toLowerCase().includes(q),
        );
      })
      .slice(0, 20);

    res.json(results);
  });

  return router;
};
