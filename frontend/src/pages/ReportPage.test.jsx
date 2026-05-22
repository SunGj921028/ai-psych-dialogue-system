import { Routes, Route } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ReportPage from './ReportPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  generateReport: vi.fn(),
  getCase: vi.fn(),
  getSessionSummaries: vi.fn(),
}))

const caseId = 'case-1'
const sessionId = 'session-1'

function renderReportPage(entry) {
  return renderWithRouter(
    <Routes>
      <Route path="/report/:caseId" element={<ReportPage />} />
    </Routes>,
    { initialEntries: [entry] },
  )
}

function getStoredBrowserData() {
  return [
    ...Object.entries(window.localStorage).flat(),
    ...Object.entries(window.sessionStorage).flat(),
  ].join('\n')
}

function makeSummaryRow(overrides = {}) {
  const turnNumber = overrides.turn_number ?? 1

  return {
    id: `summary-${turnNumber}`,
    case_id: caseId,
    session_id: sessionId,
    turn_number: turnNumber,
    summary: {
      turn_number: turnNumber,
      emotion: {
        primary: overrides.primary ?? 'synthetic emotion',
        intensity: overrides.intensity ?? 2,
      },
      emotion_dimensions: {
        anxiety: overrides.dimensions?.anxiety ?? 1,
        sadness: overrides.dimensions?.sadness ?? 1,
        anger: overrides.dimensions?.anger ?? 0,
        hopelessness: overrides.dimensions?.hopelessness ?? 0,
        confusion: overrides.dimensions?.confusion ?? 1,
        hope: overrides.dimensions?.hope ?? 5,
      },
      themes: overrides.themes ?? ['synthetic report theme'],
      key_statement: overrides.key_statement ?? 'SYNTHETIC_SUMMARY_KEY',
      crisis_flag: overrides.crisis_flag ?? false,
    },
    crisis_flag: overrides.crisis_flag ?? false,
    created_at: overrides.created_at ?? '2026-05-20T00:00:00Z',
  }
}

function makeReport() {
  return {
    case_id: caseId,
    session_id: sessionId,
    generated_at: '2026-05-20T00:00:00Z',
    chief_complaint: 'SYNTHETIC_CHIEF_COMPLAINT',
    emotion_pattern: {
      description: 'SYNTHETIC_EMOTION_PATTERN',
      dominant_emotions: ['synthetic emotion'],
      intensity_trend: 'stable',
      peak_turn: 1,
    },
    cognitive_behavioral_analysis: 'SYNTHETIC_COGNITIVE_ANALYSIS',
    initial_conceptualization: 'SYNTHETIC_CONCEPTUALIZATION',
    suggested_directions: ['SYNTHETIC_DIRECTION'],
    crisis_summary: 'SYNTHETIC_CRISIS_SUMMARY',
    disclaimer: 'SYNTHETIC_BACKEND_DISCLAIMER',
    has_crisis: false,
  }
}

describe('ReportPage behavior', () => {
  beforeEach(() => {
    api.getCase.mockResolvedValue({
      id: caseId,
      code_name: 'CASE-001',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    })
    api.getSessionSummaries.mockResolvedValue([makeSummaryRow()])
    api.generateReport.mockResolvedValue(makeReport())
  })

  test('missing sessionId shows missing-session state and does not call report generation', () => {
    renderReportPage(`/report/${caseId}`)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(api.getCase).not.toHaveBeenCalled()
    expect(api.getSessionSummaries).not.toHaveBeenCalled()
    expect(api.generateReport).not.toHaveBeenCalled()
  })

  test('with sessionId loads case and summaries but does not auto-generate report', async () => {
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
      expect(api.getSessionSummaries).toHaveBeenCalledWith(caseId, sessionId)
    })
    expect(await screen.findByText('SYNTHETIC_SUMMARY_KEY')).toBeInTheDocument()
    expect(
      screen.getByText('目前草稿報告僅在本頁暫時顯示，離開或重新整理後需重新產生。'),
    ).toBeInTheDocument()
    expect(api.generateReport).not.toHaveBeenCalled()
  })

  test('back to conversation link preserves case and session query params', async () => {
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
    })

    expect(
      document.querySelector(`a[href="/?caseId=${caseId}&sessionId=${sessionId}"]`),
    ).toBeInTheDocument()
  })

  test('clicking generate calls generateReport with case_id and session_id', async () => {
    const user = userEvent.setup()
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(screen.getAllByRole('button')[0])

    await waitFor(() => {
      expect(api.generateReport).toHaveBeenCalledWith({
        case_id: caseId,
        session_id: sessionId,
      })
    })
  })

  test('after manual generation displays backend-supplied disclaimer', async () => {
    const user = userEvent.setup()
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(screen.getAllByRole('button')[0])

    expect(await screen.findByText('SYNTHETIC_BACKEND_DISCLAIMER')).toBeInTheDocument()
  })

  test('renders lightweight summary review aids from loaded summaries', async () => {
    api.getSessionSummaries.mockResolvedValue([
      makeSummaryRow({
        turn_number: 1,
        intensity: 2,
        themes: ['synthetic report theme', 'work stress'],
        key_statement: 'SYNTHETIC_SUMMARY_KEY_ONE',
      }),
      makeSummaryRow({
        turn_number: 2,
        primary: 'synthetic worry',
        intensity: 8,
        dimensions: {
          anxiety: 7,
          sadness: 3,
          anger: 1,
          hopelessness: 4,
          confusion: 5,
          hope: 2,
        },
        themes: ['synthetic report theme'],
        key_statement: 'SYNTHETIC_SUMMARY_KEY_TWO',
        crisis_flag: true,
      }),
    ])

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('微摘要整理輔助')).toBeInTheDocument()
    expect(screen.getByText('情緒強度趨勢')).toBeInTheDocument()
    expect(screen.getByText('情緒面向平均')).toBeInTheDocument()
    expect(screen.getByText('主題頻率')).toBeInTheDocument()
    expect(screen.getAllByText('synthetic report theme').length).toBeGreaterThan(1)
    expect(screen.getByText('2 次')).toBeInTheDocument()
    expect(screen.getByText('第 2 輪')).toBeInTheDocument()
    expect(screen.getByText('摘要危機標記：是')).toBeInTheDocument()
    expect(screen.getByText('僅為 AI 微摘要整理，非客觀臨床量表。')).toBeInTheDocument()
  })

  test('does not write clinical report or summary content to browser storage', async () => {
    const user = userEvent.setup()
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(screen.getAllByRole('button')[0])
    await screen.findByText('SYNTHETIC_BACKEND_DISCLAIMER')

    const storedValues = [
      ...Object.values(window.localStorage),
      ...Object.values(window.sessionStorage),
    ].join('\n')

    expect(storedValues).not.toContain('SYNTHETIC_SUMMARY_KEY')
    expect(storedValues).not.toContain('SYNTHETIC_CHIEF_COMPLAINT')
    expect(storedValues).not.toContain('SYNTHETIC_BACKEND_DISCLAIMER')
  })
})

describe('ReportPage error handling', () => {
  beforeEach(() => {
    api.getCase.mockResolvedValue({
      id: caseId,
      code_name: 'CASE-001',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    })
    api.getSessionSummaries.mockResolvedValue([makeSummaryRow()])
    api.generateReport.mockResolvedValue(makeReport())
  })

  test('getCase failure is sanitized and does not generate a report', async () => {
    const rawErrorSentinel = 'RAW_CASE_LOAD_SECRET'
    api.getCase.mockRejectedValue(new Error(rawErrorSentinel))

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
      expect(api.getSessionSummaries).toHaveBeenCalledWith(caseId, sessionId)
    })

    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(api.generateReport).not.toHaveBeenCalled()

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(rawErrorSentinel)
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
  })

  test('getSessionSummaries failure is sanitized and does not generate a report', async () => {
    const rawErrorSentinel = 'RAW_SUMMARY_LOAD_SECRET'
    const summaryFixtureText = 'SYNTHETIC_SUMMARY_FAILURE_FIXTURE'
    api.getSessionSummaries.mockRejectedValue(new Error(rawErrorSentinel))
    api.getCase.mockResolvedValue({
      id: caseId,
      code_name: 'CASE-001',
      created_at: '2026-05-20T00:00:00Z',
      note: summaryFixtureText,
    })

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
      expect(api.getSessionSummaries).toHaveBeenCalledWith(caseId, sessionId)
    })

    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(api.generateReport).not.toHaveBeenCalled()

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(rawErrorSentinel)
    expect(storedData).not.toContain(summaryFixtureText)
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
  })

  test('generateReport failure is sanitized and leaves generated report content absent', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_REPORT_GENERATION_SECRET'
    api.generateReport.mockRejectedValue(new Error(rawErrorSentinel))

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
      expect(api.getSessionSummaries).toHaveBeenCalledWith(caseId, sessionId)
    })

    expect(api.generateReport).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button')[0])

    await waitFor(() => {
      expect(api.generateReport).toHaveBeenCalledTimes(1)
      expect(api.generateReport).toHaveBeenCalledWith({
        case_id: caseId,
        session_id: sessionId,
      })
    })

    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(screen.queryByText('SYNTHETIC_BACKEND_DISCLAIMER')).not.toBeInTheDocument()
    expect(screen.queryByText('SYNTHETIC_CHIEF_COMPLAINT')).not.toBeInTheDocument()

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(rawErrorSentinel)
    expect(storedData).not.toContain('SYNTHETIC_BACKEND_DISCLAIMER')
    expect(storedData).not.toContain('SYNTHETIC_CHIEF_COMPLAINT')
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
  })
})
