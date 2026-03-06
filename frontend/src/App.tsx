import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import SessionPage from './pages/SessionPage';
import GuestRedirect from './pages/GuestRedirect';
import LogtoCallback from './pages/LogtoCallback';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/join/:sessionCode" element={<GuestRedirect />} />
        <Route path="/callback" element={<LogtoCallback />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
