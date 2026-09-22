import { NavLink, Route, Routes } from "react-router-dom";
import SessionDetailPage from "./pages/SessionDetailPage";
import SessionListPage from "./pages/SessionListPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="app-title" end>
          hrCollector
        </NavLink>
        <NavLink to="/settings" className="settings-link">
          Settings
        </NavLink>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SessionListPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
