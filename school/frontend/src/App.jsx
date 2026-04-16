import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Apply from './pages/Apply.jsx'
import VMList from './pages/VMList.jsx'
import VMDetail from './pages/VMDetail.jsx'
import Applications from './pages/admin/Applications.jsx'
import AdminVip from './pages/admin/Vip.jsx'
import AdminDashboard from './pages/admin/Dashboard.jsx'
import AdminSchedules from './pages/admin/Schedules.jsx'
import AdminAudit from './pages/admin/Audit.jsx'
import AdminAlerts from './pages/admin/Alerts.jsx'
import SshKey from './pages/settings/SshKey.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<Apply />} />

        {/* 需要登入的頁面 */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/vms" element={<VMList />} />
            <Route path="/vms/:id" element={<VMDetail />} />
            <Route path="/settings/ssh-key" element={<SshKey />} />
            <Route path="/admin/applications" element={<Applications />} />
            <Route path="/admin/vip" element={<AdminVip />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/schedules" element={<AdminSchedules />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/alerts" element={<AdminAlerts />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/vms" replace />} />
        <Route path="*" element={<Navigate to="/vms" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
