const express = require("express");
const router = express.Router();

let tteRequests = [];

const getTteRequests = () => tteRequests;

module.exports = (trains) => {

    router.get("/requests", (req, res) => {
        res.json(getTteRequests());
});

    return router;
};

module.exports.getTteRequests = getTteRequests;
module.exports.tteRequests = tteRequests;