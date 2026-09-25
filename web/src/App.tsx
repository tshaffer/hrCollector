import { NavLink, Route, Routes } from "react-router-dom";
import SessionDetailPage from "./pages/SessionDetailPage";
import SessionListPage from "./pages/SessionListPage";
import SettingsPage from "./pages/SettingsPage";
import { UserProvider, useUsers } from "./lib/userContext";

function UserSwitcher() {
  const { users, selectedUserId, setSelectedUserId, loading, error } = useUsers();

  if (loading || error || users.length === 0) return null;

  return (
    <select
      className="user-switcher"
      aria-label="Viewing sessions for"
      value={selectedUserId ?? ""}
      onChange={(e) => setSelectedUserId(e.target.value)}
    >
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

export default function App() {
  return (
    <UserProvider>
      <div className="app">
        <header className="app-header">
          <NavLink to="/" className="app-title" end>
            hrCollector
          </NavLink>
          <div className="app-header-right">
            <UserSwitcher />
            <NavLink to="/settings" className="settings-link">
              Settings
            </NavLink>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<SessionListPage />} />
            <Route path="/sessions/:id" element={<SessionDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </UserProvider>
  );
}
