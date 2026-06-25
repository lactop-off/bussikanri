import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth, canManage } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Scan from "./pages/Scan";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import Loans from "./pages/Loans";
import Audit from "./pages/Audit";
import type { ReactNode } from "react";

function Protected({ children, manager }: { children: ReactNode; manager?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (manager && !canManage(user)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Scan />
              </Protected>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
          <Route
            path="/assets"
            element={
              <Protected>
                <Assets />
              </Protected>
            }
          />
          <Route
            path="/loans"
            element={
              <Protected>
                <Loans />
              </Protected>
            }
          />
          <Route
            path="/audit"
            element={
              <Protected manager>
                <Audit />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
