import axios from 'axios';

const API_BASE = 'http://localhost:5000';

export const searchTrains = async (query) => {
  const res = await axios.get(`${API_BASE}/search`, { params: { q: query } });
  return res.data;
};

export const getTrainDetails = async (trainNumber) => {
  const res = await axios.get(`${API_BASE}/train/${trainNumber}`);
  return res.data;
};

export const checkCatchStatus = async (train, boarding, current) => {
  const res = await axios.get(`${API_BASE}/can-catch`, { 
      params: { train, boarding, current } 
  });
  return res.data;
};

export const getLiveStatus = async (trainNumber) => {
  const res = await axios.get(`${API_BASE}/live/${trainNumber}`);
  return res.data;
};

export const getPnrDetails = async (pnr) => {
  const res = await axios.get(`${API_BASE}/pnr/${pnr}`);
  return res.data;
};

export const getTteRequests = async () => {
  const res = await axios.get(`${API_BASE}/tte/requests`);
  return res.data;
};
