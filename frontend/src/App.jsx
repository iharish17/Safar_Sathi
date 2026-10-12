import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import TteDashboard from './pages/TteDashboard';
import SearchTrains from './pages/SearchTrains';
import TrainView from './pages/TrainView';
import MissedTrainCalculator from './pages/MissedTrainCalculator';
import AppNavbar from './components/AppNavbar';
import VideoLoader from './components/VideoLoader';

const APP_LOADER_SEEN_KEY = 'safarsathi_app_loader_seen_v1';
const ROUTE_LOADING_MS = 520;

const getRouteKey = (routeLocation) => routeLocation.pathname;

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
  const [isAppReady, setIsAppReady] = useState(() => hasSeenAppLoader());
  const [renderedLocation, setRenderedLocation] = useState(location);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const routeLoaderTimerRefs = useRef([]);
  const currentRouteKey = getRouteKey(location);
  const renderedRouteKey = getRouteKey(renderedLocation);
  const hideNavbar = renderedLocation.pathname.startsWith('/tte-dashboard');

  const handleLoaderComplete = () => {
    markAppLoaderSeen();
    setIsAppReady(true);
  };

  useEffect(() => {
    routeLoaderTimerRefs.current.forEach(clearTimeout);
    routeLoaderTimerRefs.current = [];

    if (!isAppReady) {
      return undefined;
    }

    if (currentRouteKey === renderedRouteKey) {
      routeLoaderTimerRefs.current.push(setTimeout(() => {
        setRenderedLocation(location);
        setIsRouteLoading(false);
      }, 0));
      return undefined;
    }

    routeLoaderTimerRefs.current.push(setTimeout(() => {
      setIsRouteLoading(true);
    }, 0));

    routeLoaderTimerRefs.current.push(setTimeout(() => {
      setRenderedLocation(location);
      setIsRouteLoading(false);
    }, ROUTE_LOADING_MS));

    return () => {
      routeLoaderTimerRefs.current.forEach(clearTimeout);
      routeLoaderTimerRefs.current = [];
    };
  }, [currentRouteKey, isAppReady, location, renderedRouteKey]);

  return (
    <>
      <VideoLoader
        isLoading={!isAppReady}
        onComplete={handleLoaderComplete}
      />
      {isAppReady && (
        <div className="app-container">
          {!hideNavbar && <AppNavbar />}
          {isRouteLoading && (
            <div className="route-loading-overlay" role="status" aria-live="polite" aria-label="Loading page">
              <div className="route-loading-spinner" aria-hidden="true" />
            </div>
          )}
          <main style={{ flex: 1 }}>
            <Routes location={renderedLocation} key={renderedRouteKey}>
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
