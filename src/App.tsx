import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';
import { TooltipProvider } from './components/ui/tooltip';
import ProtectedRoute from './components/ProtectedRoute';

const Chat = lazy(() => import('./pages/Chat'));
const Settings = lazy(() => import('./pages/Settings'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DataPage = lazy(() => import('./pages/Data'));
const UsagePage = lazy(() => import('./pages/Usage'));

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <TooltipProvider>
        <Router>
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/data"
                element={
                  <ProtectedRoute>
                    <DataPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usage"
                element={
                  <ProtectedRoute>
                    <UsagePage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </Router>
        <Toaster position="top-center" richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
