import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import '../styles/AppNavbar.css';

const AppNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const [menuState, setMenuState] = useState({ path: location.pathname, open: false });
  const isMenuOpen = menuState.path === location.pathname && menuState.open;

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const toggleMenu = () => {
    setMenuState({ path: location.pathname, open: !isMenuOpen });
  };

  const goTo = (path) => {
    setMenuState({ path: location.pathname, open: false });
    navigate(path);
  };

  return (
    <nav className={`app-nav glass-panel ${isMenuOpen ? 'menu-open' : ''}`}>
      <div className="app-nav-header">
        <div className="app-nav-logo" onClick={() => goTo('/')} role="button" tabIndex={0}>
          <img src="/header-logo.png" alt="Safar Sathi logo" className="app-nav-logo-image" />
          <span className="app-nav-brand">SAFAR SATHI</span>
        </div>

        <button
          type="button"
          className="app-nav-toggle"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          onClick={toggleMenu}
        >
          {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div className={`app-nav-links ${isMenuOpen ? 'is-open' : ''}`}>
        <button
          className="app-nav-link-btn"
          onClick={() => goTo('/')}
        >
          Train Recovery
        </button>

        <button
          className="app-nav-link-btn"
          onClick={() => goTo('/')}
        >
          Live Track
        </button>

        {isLandingPage && (
          <button className="btn btn-outline" onClick={() => goTo('/')}>
            TTE Login
          </button>
        )}
      </div>
    </nav>
  );
};

export default AppNavbar;
