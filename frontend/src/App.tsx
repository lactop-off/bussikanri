import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth, canManage } from "./auth";
import { useT } from "./i18n";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Scan from "./pages/Scan";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import Loans from "./pages/Loans";
import Audit from "./pages/Audit";
import Manage from "./pages/Manage";
import type { ReactNode } from "react";

function Protected({ children, manager, admin }: { children: ReactNode; manager?: boolean; admin?: boolean }) {
  const { user, loading } = useAuth();
  const { t } = useT();
  if (loading) return <div className="splash">{t("common.loading")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (manager && !canManage(user)) return <Navigate to="/" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
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
            path="/assets/:id"
            element={
              <Protected>
                <AssetDetail />
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
          <Route
            path="/manage"
            element={
              <Protected manager>
                <Manage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
