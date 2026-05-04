import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import DisclaimerBanner from './components/DisclaimerBanner.jsx'
import ConversationPage from './pages/ConversationPage.jsx'
import ReportPage from './pages/ReportPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col pb-16">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<ConversationPage />} />
          <Route path="/report/:caseId" element={<ReportPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <DisclaimerBanner />
    </div>
  )
}
