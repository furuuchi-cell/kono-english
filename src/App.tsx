import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import HomePage from './components/student/HomePage';
import StudyPage from './components/student/StudyPage';
import JoinClassPage from './components/student/JoinClassPage';
import TestPage from './components/student/TestPage';
import WordListPage from './components/student/WordListPage';
import QuizHistoryPage from './components/student/QuizHistoryPage';
import StudentLayout from './components/student/StudentLayout';
import WeeklyPlanPage from './components/student/WeeklyPlanPage';
import TestWeekPage from './components/student/TestWeekPage';
import AdminDashboard from './components/admin/AdminDashboard';
import ClassManagePage from './components/admin/ClassManagePage';
import StudentProgressPage from './components/admin/StudentProgressPage';
import TestResultsPage from './components/admin/TestResultsPage';
import SessionResultsPage from './components/admin/SessionResultsPage';
import WordEditPage from './components/admin/WordEditPage';
import ClassSetupPage from './components/admin/ClassSetupPage';
import GrammarSetupPage from './components/admin/GrammarSetupPage';
import GrammarHomePage from './components/student/GrammarHomePage';
import GrammarWeekListPage from './components/student/GrammarWeekListPage';
import GrammarStudyPage from './components/student/GrammarStudyPage';
import GrammarQuizPage from './components/student/GrammarQuizPage';
import GrammarClassTestPage from './components/student/GrammarClassTestPage';
import './styles/global.css';

const RootRedirect: React.FC = () => {
  const { userProfile, loading } = useAuth();

  if (loading) return null;
  if (!userProfile) return <Navigate to="/login" />;
  if (userProfile.role === 'admin') return <Navigate to="/admin" />;
  return <Navigate to="/home" />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Student routes */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <StudentLayout><HomePage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/study/:classId/:rangeId"
            element={
              <ProtectedRoute>
                <StudentLayout><StudyPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/join-class"
            element={
              <ProtectedRoute>
                <StudentLayout><JoinClassPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/wordlist/:classId"
            element={
              <ProtectedRoute>
                <StudentLayout><WordListPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/test/:classId/:testId"
            element={
              <ProtectedRoute>
                <StudentLayout><TestPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz-history/:classId"
            element={
              <ProtectedRoute>
                <StudentLayout><QuizHistoryPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/weekly-plan/:classId/:rangeId"
            element={
              <ProtectedRoute>
                <StudentLayout><WeeklyPlanPage /></StudentLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/test-week/:classId/:rangeId"
            element={
              <ProtectedRoute>
                <StudentLayout><TestWeekPage /></StudentLayout>
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId"
            element={
              <ProtectedRoute requiredRole="admin">
                <ClassManagePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId/student/:studentId"
            element={
              <ProtectedRoute requiredRole="admin">
                <StudentProgressPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId/test/:testId"
            element={
              <ProtectedRoute requiredRole="admin">
                <TestResultsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId/session/:sessionId"
            element={
              <ProtectedRoute requiredRole="admin">
                <SessionResultsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/setup/AS2EN001"
            element={
              <ProtectedRoute requiredRole="admin">
                <ClassSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId/words"
            element={
              <ProtectedRoute requiredRole="admin">
                <WordEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/class/:classId/grammar-setup"
            element={
              <ProtectedRoute requiredRole="admin">
                <GrammarSetupPage />
              </ProtectedRoute>
            }
          />

          {/* Grammar routes (開発中・管理者のみアクセス可。各ページ内で isGrammarEnabled チェック) */}
          <Route
            path="/grammar"
            element={
              <ProtectedRoute>
                <GrammarHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grammar/:classId"
            element={
              <ProtectedRoute>
                <GrammarWeekListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grammar/:classId/study/:weekId"
            element={
              <ProtectedRoute>
                <GrammarStudyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grammar/:classId/quiz/:weekId"
            element={
              <ProtectedRoute>
                <GrammarQuizPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grammar/:classId/class-test/:weekId"
            element={
              <ProtectedRoute>
                <GrammarClassTestPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
