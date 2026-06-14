import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Loading from './components/common/Loading';
import './styles/global.css';

// ログイン・登録は最初に表示される画面なので eager import（追加のチャンクfetch不要）
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';

// 残りは route-level code splitting で初回バンドルから切り離す
const HomePage = lazy(() => import('./components/student/HomePage'));
const StudyPage = lazy(() => import('./components/student/StudyPage'));
const JoinClassPage = lazy(() => import('./components/student/JoinClassPage'));
const TestPage = lazy(() => import('./components/student/TestPage'));
const WordListPage = lazy(() => import('./components/student/WordListPage'));
const QuizHistoryPage = lazy(() => import('./components/student/QuizHistoryPage'));
const StudentLayout = lazy(() => import('./components/student/StudentLayout'));
const WeeklyPlanPage = lazy(() => import('./components/student/WeeklyPlanPage'));
const TestWeekPage = lazy(() => import('./components/student/TestWeekPage'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const ClassManagePage = lazy(() => import('./components/admin/ClassManagePage'));
const StudentProgressPage = lazy(() => import('./components/admin/StudentProgressPage'));
const TestResultsPage = lazy(() => import('./components/admin/TestResultsPage'));
const SessionResultsPage = lazy(() => import('./components/admin/SessionResultsPage'));
const WordEditPage = lazy(() => import('./components/admin/WordEditPage'));
const ClassSetupPage = lazy(() => import('./components/admin/ClassSetupPage'));
const GrammarSetupPage = lazy(() => import('./components/admin/GrammarSetupPage'));
const GrammarHomePage = lazy(() => import('./components/student/GrammarHomePage'));
const GrammarWeekListPage = lazy(() => import('./components/student/GrammarWeekListPage'));
const GrammarStudyPage = lazy(() => import('./components/student/GrammarStudyPage'));
const GrammarQuizPage = lazy(() => import('./components/student/GrammarQuizPage'));
const GrammarClassTestPage = lazy(() => import('./components/student/GrammarClassTestPage'));

const RootRedirect: React.FC = () => {
  const { userProfile, loading } = useAuth();

  if (loading) return <Loading branded />;
  if (!userProfile) return <Navigate to="/login" />;
  if (userProfile.role === 'admin') return <Navigate to="/admin" />;
  return <Navigate to="/home" />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loading branded message="読み込み中..." />}>
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
