// TODO: Task 11 - 實作 axios 實例（baseURL、攔截器、錯誤處理）
// 這個檔案將在 Task 11 填入完整實作

import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 60_000,
})

export function getApiClient() {
  return apiClient
}

export async function getHealth() {
  const response = await apiClient.get('/health')
  return response.data
}

export async function listCases() {
  const response = await apiClient.get('/api/cases')
  return response.data
}

export async function createCase({ code_name, note }) {
  const response = await apiClient.post('/api/cases', { code_name, note })
  return response.data
}

export async function getCase(caseId) {
  const response = await apiClient.get(`/api/cases/${caseId}`)
  return response.data
}

export async function sendConversationTurn(payload) {
  const response = await apiClient.post('/api/conversation/turn', payload)
  return response.data
}

export async function getSessionMessages(caseId, sessionId) {
  const response = await apiClient.get(
    `/api/cases/${caseId}/sessions/${sessionId}/messages`,
  )
  return response.data
}

export async function listCaseSessions(caseId, options = {}) {
  const query = options.includeArchived ? '?include_archived=true' : ''
  const response = await apiClient.get(`/api/cases/${caseId}/sessions${query}`)
  return response.data
}

export async function createSession(caseId, payload = {}) {
  const response = await apiClient.post(
    `/api/cases/${caseId}/sessions`,
    payload,
  )
  return response.data
}

export async function updateSessionTitle(caseId, sessionId, payload) {
  const response = await apiClient.patch(
    `/api/cases/${caseId}/sessions/${sessionId}`,
    payload,
  )
  return response.data
}

export async function archiveSession(caseId, sessionId) {
  const response = await apiClient.post(
    `/api/cases/${caseId}/sessions/${sessionId}/archive`,
  )
  return response.data
}

export async function unarchiveSession(caseId, sessionId) {
  const response = await apiClient.post(
    `/api/cases/${caseId}/sessions/${sessionId}/unarchive`,
  )
  return response.data
}

export async function getSessionSummaries(caseId, sessionId) {
  const response = await apiClient.get(
    `/api/cases/${caseId}/sessions/${sessionId}/summaries`,
  )
  return response.data
}

export async function generateReport({ case_id, session_id }) {
  const response = await apiClient.post('/api/reports/generate', {
    case_id,
    session_id,
  })
  return response.data
}

export async function getCurrentReportDraft(caseId, sessionId) {
  const response = await apiClient.get(
    `/api/cases/${caseId}/sessions/${sessionId}/report-drafts/current`,
  )
  return response.data
}

export async function createReportDraft(caseId, sessionId, payload = {}) {
  const response = await apiClient.post(
    `/api/cases/${caseId}/sessions/${sessionId}/report-drafts`,
    payload,
  )
  return response.data
}

export async function updateReportDraftManualInput(draftId, payload) {
  const response = await apiClient.patch(
    `/api/report-drafts/${draftId}/manual-input`,
    payload,
  )
  return response.data
}

export async function generateReportDraftV2(draftId) {
  const response = await apiClient.post(`/api/report-drafts/${draftId}/generate`)
  return response.data
}

export default apiClient
