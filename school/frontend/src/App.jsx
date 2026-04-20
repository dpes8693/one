import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import RegisterVerify from './pages/RegisterVerify.jsx'
import RegisterPending from './pages/RegisterPending.jsx'
import Apply from './pages/Apply.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'
import VMList from './pages/VMList.jsx'
import VMDetail from './pages/VMDetail.jsx'
import Applications from './pages/admin/Applications.jsx'
import AdminRegistrations from './pages/admin/Registrations.jsx'
import AdminVip from './pages/admin/Vip.jsx'
import AdminDashboard from './pages/admin/Dashboard.jsx'
import AdminSchedules from './pages/admin/Schedules.jsx'
import AdminAudit from './pages/admin/Audit.jsx'
import AdminAlerts from './pages/admin/Alerts.jsx'
import AdminUsers from './pages/admin/Users.jsx'
import AdminSettings from './pages/admin/Settings.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/verify" element={<RegisterVerify />} />
        <Route path="/register/pending" element={<RegisterPending />} />

        {/* 需要登入的頁面 */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/apply" element={<Apply />} />
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/vms" element={<VMList />} />
            <Route path="/vms/:id" element={<VMDetail />} />
            <Route path="/admin/registrations" element={<AdminRegistrations />} />
            <Route path="/admin/applications" element={<Applications />} />
            <Route path="/admin/vip" element={<AdminVip />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/schedules" element={<AdminSchedules />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/alerts" element={<AdminAlerts />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/student/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/student/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
