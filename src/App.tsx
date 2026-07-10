import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoaderCircle } from 'lucide-react';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';
import { TooltipProvider } from './components/ui/tooltip';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

const Chat = lazy(() => import('./pages/Chat'));
const Settings = lazy(() => import('./pages/Settings'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DataPage = lazy(() => import('./pages/Data'));
const UsagePage = lazy(() => import('./pages/Usage'));
const HistoryPage = lazy(() => import('./pages/History'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function LanguageSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en';
  }, [i18n.resolvedLanguage]);
  return null;
}

function RouteLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted-foreground" role="status">
      <LoaderCircle className="h-5 w-5 animate-spin" />
      <span>Loading ONMI Chatbox...</span>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <TooltipProvider>
        <Router>
          <LanguageSync />
          <ErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
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
                path="/history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
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
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Router>
        <Toaster position="top-center" richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
