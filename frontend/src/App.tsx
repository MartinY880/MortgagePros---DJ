import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import SessionPage from './pages/SessionPage';
import GuestRedirect from './pages/GuestRedirect';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/join/:sessionCode" element={<GuestRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
