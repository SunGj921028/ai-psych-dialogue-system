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

function makeSummaryRow() {
  return {
    id: 'summary-1',
    case_id: caseId,
    session_id: sessionId,
    turn_number: 1,
    summary: {
      turn_number: 1,
      emotion: {
        primary: 'synthetic emotion',
        intensity: 2,
      },
      emotion_dimensions: {
        anxiety: 1,
        sadness: 1,
        anger: 0,
        hopelessness: 0,
        confusion: 1,
        hope: 5,
      },
      themes: ['synthetic report theme'],
      key_statement: 'SYNTHETIC_SUMMARY_KEY',
      crisis_flag: false,
    },
    crisis_flag: false,
    created_at: '2026-05-20T00:00:00Z',
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
    expect(api.generateReport).not.toHaveBeenCalled()
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
})
