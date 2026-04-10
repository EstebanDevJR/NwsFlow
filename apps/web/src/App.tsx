/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { NewRequest } from '@/pages/NewRequest';
import { Approvals } from '@/pages/Approvals';
import { Payments } from '@/pages/Payments';
import { History } from '@/pages/History';
import { Reports } from '@/pages/Reports';
import { Users } from '@/pages/Users';
import { ExecutedPayments } from '@/pages/ExecutedPayments';
import { Meetings } from '@/pages/Meetings';
import { Chat } from '@/pages/Chat';
import { Settings } from '@/pages/Settings';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppBackground } from '@/components/AppBackground';

function AppContent() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="request/new" element={<ProtectedRoute allowedRoles={['LIDER']}><NewRequest /></ProtectedRoute>} />
        <Route path="history" element={<History />} />
        <Route path="approvals" element={<ProtectedRoute allowedRoles={['HOLDER', 'CAJERO']}><Approvals /></ProtectedRoute>} />
        <Route
          path="payments"
          element={
            <ProtectedRoute allowedRoles={['HOLDER', 'CAJERO']}>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route path="reports" element={<ProtectedRoute allowedRoles={['HOLDER']}><Reports /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute allowedRoles={['HOLDER']}><Users /></ProtectedRoute>} />
        <Route path="executed" element={<ProtectedRoute allowedRoles={['HOLDER', 'CAJERO']}><ExecutedPayments /></ProtectedRoute>} />
        <Route path="meetings" element={<ProtectedRoute allowedRoles={['LIDER', 'HOLDER']}><Meetings /></ProtectedRoute>} />
        <Route path="chat" element={<Chat />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="relative min-h-screen">
          <AppBackground />
          <div className="relative z-10">
            <AppContent />
          </div>
        </div>
      </Router>
    </ErrorBoundary>
  );
}
