// Getting stations codes from station names
const getLastSegment = (str, separator) => {
  if (!str) return '';
  const parts = str.split(separator);
  return parts.length > 1 ? parts[parts.length - 1].trim() : str.trim();
};

const extractStationCode = (str) => {
  return getLastSegment(str, ' - ');
};

const parseDistance = (distStr) => {
  return parseInt((distStr || '').replace(/[^\d]/g, ''), 10) || 0;
};

//Extracting of station codes from end of a station name
const getStationCode = (name) => {
  return getLastSegment(name, '-').toUpperCase();
};

const hhmmToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const timeToMins = (timeStr, dayStr) => {
  if (!timeStr || timeStr === 'Source' || timeStr === 'Destination') return 0;
  const day = parseInt(dayStr || '1', 10);
  return ((day - 1) * 24 * 60) + hhmmToMinutes(timeStr);
};

const getMins = (timeStr) => {
  return hhmmToMinutes(timeStr);
};

module.exports = {
  extractStationCode,
  parseDistance,
  getStationCode,
  timeToMins,
  getMins
};
