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

export default apiClient
