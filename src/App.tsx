import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import AuthPage from './pages/AuthPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        {/* 认证页面 - 不需要登录 */}
        <Route path="/auth" element={<AuthPage />} />
        
        {/* 受保护的页面 - 需要登录 */}
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
      </Routes>
    </Router>
  );
}

export default App;
