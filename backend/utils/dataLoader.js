const fs = require('fs');
const path = require('path');

const loadTrains = () => {
  const dataPath = path.join(__dirname, '..', 'data');

  const loadJson = (filename) => {
    const filePath = path.join(dataPath, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return [];
  };

  try {
    const expTrains = loadJson('EXP-TRAINS.json');
    const passTrains = loadJson('PASS-TRAINS.json');
    const sfTrains = loadJson('SF-TRAINS.json');
    const sfTrainsNoExt = loadJson('SF-TRAINS');

    const trains = [...expTrains, ...passTrains, ...sfTrains, ...sfTrainsNoExt];
    console.log(`Successfully loaded ${trains.length} trains from datasets.`);
    return trains;
  } catch (e) {
    console.error('Error loading train data:', e);
    return [];
  }
};

module.exports = { loadTrains };