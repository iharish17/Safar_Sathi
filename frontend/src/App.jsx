import { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import TteDashboard from './pages/TteDashboard';
import SearchTrains from './pages/SearchTrains';
import TrainView from './pages/TrainView';
import MissedTrainCalculator from './pages/MissedTrainCalculator';
import AppNavbar from './components/AppNavbar';
import VideoLoader from './components/VideoLoader';

const APP_LOADER_SEEN_KEY = 'safarsathi_app_loader_seen_v1';

const hasSeenAppLoader = () => {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(APP_LOADER_SEEN_KEY) === '1';
};

const markAppLoaderSeen = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(APP_LOADER_SEEN_KEY, '1');
};

function App() {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith('/tte-dashboard');
  const [isAppReady, setIsAppReady] = useState(() => hasSeenAppLoader());

  const handleLoaderComplete = () => {
    markAppLoaderSeen();
    setIsAppReady(true);
  };

  return (
    <>
          <VideoLoader
        isLoading={!isAppReady}
            onComplete={handleLoaderComplete}
      />
      {isAppReady && (
        <div className="app-container">
          {!hideNavbar && <AppNavbar />}
          <main style={{ flex: 1 }}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/search" element={<SearchTrains />} />
              <Route path="/train/:trainNumber" element={<TrainView />} />
              <Route path="/missed-train/*" element={<MissedTrainCalculator />} />
              <Route path="/tte-dashboard" element={<TteDashboard />} />
            </Routes>
          </main>
        </div>
      )}
    </>
  );
}

export default App;
