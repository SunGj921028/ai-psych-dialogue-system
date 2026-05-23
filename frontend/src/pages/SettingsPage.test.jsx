import { screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import SettingsPage from './SettingsPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createCase: vi.fn(),
  createSession: vi.fn(),
  generateReport: vi.fn(),
  getCase: vi.fn(),
  getSessionMessages: vi.fn(),
  getSessionSummaries: vi.fn(),
  listCaseSessions: vi.fn(),
  listCases: vi.fn(),
  sendConversationTurn: vi.fn(),
}))

const clinicalSentinels = [
  'SYNTHETIC_PRIVATE_MESSAGE',
  'SYNTHETIC_SUMMARY_SECRET',
  'SYNTHETIC_REPORT_TEXT',
  'SYNTHETIC_CRISIS_REASON',
  'SYNTHETIC_CASE_NOTE_SECRET',
]

function storageEntries(storage) {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index)
    return [key, storage.getItem(key)]
  })
}

function renderSettingsPage() {
  return renderWithRouter(<SettingsPage />, { initialEntries: ['/settings'] })
}

describe('SettingsPage informational safety content', () => {
  test('renders counselor-facing system purpose section', () => {
    renderSettingsPage()

    expect(
      screen.getByRole('heading', { name: '設定與安全說明' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '系統用途' })).toBeInTheDocument()
    expect(screen.getByText(/諮商文件整理/)).toBeInTheDocument()
    expect(screen.getByText(/諮商師審閱/)).toBeInTheDocument()
  })

  test('renders safety boundary section without diagnostic or treatment authority', () => {
    renderSettingsPage()

    expect(screen.getByRole('heading', { name: '安全邊界' })).toBeInTheDocument()
    expect(screen.getByText(/不提供診斷/)).toBeInTheDocument()
    expect(screen.getAllByText(/不是正式治療計畫/).length).toBeGreaterThan(0)
    expect(screen.getByText(/不提供藥物或劑量建議/)).toBeInTheDocument()
    expect(screen.getByText(/crisis_level === "high"/)).toBeInTheDocument()
  })

  test('renders privacy and storage explanation', () => {
    renderSettingsPage()

    expect(
      screen.getByRole('heading', { name: '隱私與瀏覽器儲存' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/localStorage/)).toBeInTheDocument()
    expect(screen.getAllByText(/ai-psych-theme/).length).toBeGreaterThan(0)
    expect(screen.getByText(/sessionStorage/)).toBeInTheDocument()
    expect(screen.getByText(/不會儲存會談文字/)).toBeInTheDocument()
    expect(screen.getByText(/報告草稿目前不持久化/)).toBeInTheDocument()
  })

  test('renders theme preference explanation without a second toggle', () => {
    renderSettingsPage()

    expect(screen.getByRole('heading', { name: '外觀偏好' })).toBeInTheDocument()
    expect(screen.getByText(/頁首按鈕/)).toBeInTheDocument()
    expect(screen.getByText(/只保存為 ai-psych-theme/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('renders provider configuration explanation without secret controls', () => {
    renderSettingsPage()

    expect(
      screen.getByRole('heading', { name: '模型與服務設定' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/由後端環境設定管理/)).toBeInTheDocument()
    expect(screen.getByText(/不會在瀏覽器顯示或儲存/)).toBeInTheDocument()
    expect(document.querySelector('input, textarea, select')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/api key|金鑰|secret|provider/i)).not.toBeInTheDocument()
  })
})

describe('SettingsPage storage and API safety', () => {
  test('does not call backend API helpers', () => {
    renderSettingsPage()

    Object.values(api).forEach((mockFn) => {
      expect(mockFn).not.toHaveBeenCalled()
    })
  })

  test('does not create storage keys or persist clinical sentinel strings', () => {
    renderSettingsPage()

    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])

    const serializedStorage = JSON.stringify([
      ...storageEntries(window.localStorage),
      ...storageEntries(window.sessionStorage),
    ])

    clinicalSentinels.forEach((sentinel) => {
      expect(serializedStorage).not.toContain(sentinel)
    })
  })
})
