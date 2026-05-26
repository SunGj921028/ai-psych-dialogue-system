import { Routes, Route } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ReportPage from './ReportPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createReportDraft: vi.fn(),
  generateReport: vi.fn(),
  getCurrentReportDraft: vi.fn(),
  getCase: vi.fn(),
  getSessionSummaries: vi.fn(),
  updateReportDraftManualInput: vi.fn(),
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

function makeReportField(value, overrides = {}) {
  return {
    label_zh: overrides.label_zh ?? '測試欄位',
    value,
    source_type: overrides.source_type ?? 'manual',
    missing_reason: overrides.missing_reason ?? null,
    needs_review: overrides.needs_review ?? true,
    evidence_refs: overrides.evidence_refs ?? [],
  }
}

function makeManualInput(overrides = {}) {
  return {
    basic_info: {
      session_date: makeReportField(overrides.sessionDate ?? '2026-05-21'),
      session_count: makeReportField(overrides.sessionCount ?? '2'),
      referral_source: makeReportField(
        overrides.referralSource ?? 'SYNTHETIC_REFERRAL_SOURCE',
        { missing_reason: 'no_data' },
      ),
      age_gender: makeReportField(overrides.ageGender ?? 'SYNTHETIC_AGE_GENDER'),
      occupation_school_status: makeReportField(
        overrides.occupationSchoolStatus ?? 'SYNTHETIC_OCCUPATION_STATUS',
      ),
      marital_family_status: makeReportField(
        overrides.maritalFamilyStatus ?? 'SYNTHETIC_FAMILY_STATUS',
      ),
    },
    problem_onset_course: {
      client_understanding: makeReportField(
        overrides.clientUnderstanding ?? 'SYNTHETIC_CLIENT_UNDERSTANDING',
      ),
    },
    assessment_testing_data: makeReportField(
      overrides.assessmentTestingData ?? 'SYNTHETIC_ASSESSMENT_DATA',
    ),
    risk_assessment: {
      overall_risk_notes: makeReportField(
        overrides.overallRiskNotes ?? 'SYNTHETIC_RISK_NOTES',
      ),
      safety_plan: makeReportField(overrides.safetyPlan ?? 'SYNTHETIC_SAFETY_PLAN'),
    },
  }
}

function makeReportDraft(overrides = {}) {
  return {
    schema_version: 'report_schema_v2',
    draft_id: overrides.draftId ?? 'draft-1',
    case_id: caseId,
    session_id: sessionId,
    status: 'manual_input_started',
    manual_input: overrides.manualInput ?? makeManualInput(overrides),
    ai_generated: null,
    counselor_edits: null,
    final_report: null,
    source_refs: [],
    safety_flags: {
      has_crisis: false,
      has_persisted_high_crisis: false,
      contains_diagnostic_language_needing_review: false,
      contains_manual_risk_input: false,
      missing_required_manual_fields: true,
    },
    disclaimer: 'SYNTHETIC_BACKEND_DISCLAIMER',
    created_at: '2026-05-20T00:00:00Z',
    updated_at: overrides.updatedAt ?? '2026-05-20T00:00:00Z',
    generated_at: null,
    reviewed_at: null,
    exported_at: null,
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
    api.getCurrentReportDraft.mockRejectedValue({
      response: { status: 404 },
    })
    api.createReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockResolvedValue(makeReportDraft())
    api.generateReport.mockResolvedValue(makeReport())
  })

  test('missing sessionId shows missing-session state and does not call report generation', () => {
    renderReportPage(`/report/${caseId}`)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(api.getCase).not.toHaveBeenCalled()
    expect(api.getSessionSummaries).not.toHaveBeenCalled()
    expect(api.getCurrentReportDraft).not.toHaveBeenCalled()
    expect(api.createReportDraft).not.toHaveBeenCalled()
    expect(api.updateReportDraftManualInput).not.toHaveBeenCalled()
    expect(api.generateReport).not.toHaveBeenCalled()
  })

  test('with sessionId loads case and summaries but does not auto-generate report', async () => {
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await waitFor(() => {
      expect(api.getCase).toHaveBeenCalledWith(caseId)
      expect(api.getSessionSummaries).toHaveBeenCalledWith(caseId, sessionId)
      expect(api.getCurrentReportDraft).toHaveBeenCalledWith(caseId, sessionId)
    })
    expect(await screen.findByText('SYNTHETIC_SUMMARY_KEY')).toBeInTheDocument()
    expect(screen.getByText('目前 v1 AI 草稿產生')).toBeInTheDocument()
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

    await user.click(await screen.findByRole('button', { name: '產生 v1 AI 草稿' }))

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

    await user.click(await screen.findByRole('button', { name: '產生 v1 AI 草稿' }))

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

    await user.click(await screen.findByRole('button', { name: '產生 v1 AI 草稿' }))
    await screen.findByText('SYNTHETIC_BACKEND_DISCLAIMER')

    const storedValues = [
      ...Object.values(window.localStorage),
      ...Object.values(window.sessionStorage),
    ].join('\n')

    expect(storedValues).not.toContain('SYNTHETIC_SUMMARY_KEY')
    expect(storedValues).not.toContain('SYNTHETIC_CHIEF_COMPLAINT')
    expect(storedValues).not.toContain('SYNTHETIC_BACKEND_DISCLAIMER')
  })

  test('loads current draft when it exists and renders manual input values', async () => {
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByDisplayValue('SYNTHETIC_REFERRAL_SOURCE')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_AGE_GENDER')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_OCCUPATION_STATUS')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_FAMILY_STATUS')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_CLIENT_UNDERSTANDING')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_ASSESSMENT_DATA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_RISK_NOTES')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SYNTHETIC_SAFETY_PLAN')).toBeInTheDocument()
  })

  test('missing current draft shows create state', async () => {
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('尚未建立 v2 手動資料草稿')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '建立 v2 手動資料草稿' }),
    ).toBeInTheDocument()
  })

  test('Create Draft calls API and renders returned form', async () => {
    const user = userEvent.setup()
    api.createReportDraft.mockResolvedValue(makeReportDraft())
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(
      await screen.findByRole('button', { name: '建立 v2 手動資料草稿' }),
    )

    expect(api.createReportDraft).toHaveBeenCalledWith(caseId, sessionId, {})
    expect(await screen.findByDisplayValue('SYNTHETIC_SAFETY_PLAN')).toBeInTheDocument()
  })

  test('editing fields then saving calls PATCH with manual_input payload', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockResolvedValue(
      makeReportDraft({ referralSource: 'UPDATED_REFERRAL_SOURCE' }),
    )
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const referralInput = await screen.findByLabelText('轉介來源')
    await user.clear(referralInput)
    await user.type(referralInput, 'UPDATED_REFERRAL_SOURCE')
    await user.click(screen.getByRole('button', { name: '儲存 v2 手動資料' }))

    await waitFor(() => {
      expect(api.updateReportDraftManualInput).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({
          manual_input: expect.objectContaining({
            basic_info: expect.objectContaining({
              referral_source: expect.objectContaining({
                value: 'UPDATED_REFERRAL_SOURCE',
                missing_reason: 'no_data',
              }),
            }),
          }),
        }),
      )
    })
    expect(api.generateReport).not.toHaveBeenCalled()
  })

  test('save success updates status and display', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockResolvedValue(
      makeReportDraft({ safetyPlan: 'UPDATED_SAFETY_PLAN' }),
    )
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const safetyPlan = await screen.findByLabelText('安全計畫')
    await user.clear(safetyPlan)
    await user.type(safetyPlan, 'UPDATED_SAFETY_PLAN')
    expect(screen.getByText('未儲存變更')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '儲存 v2 手動資料' }))

    expect(await screen.findByText('已儲存')).toBeInTheDocument()
    expect(screen.getByDisplayValue('UPDATED_SAFETY_PLAN')).toBeInTheDocument()
  })

  test('save failure shows generic error and preserves typed values', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_MANUAL_INPUT_SAVE_SECRET'
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockRejectedValue(new Error(rawErrorSentinel))
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const riskNotes = await screen.findByLabelText('正式風險評估備註')
    await user.clear(riskNotes)
    await user.type(riskNotes, 'UNSAVED_RISK_NOTES')
    await user.click(screen.getByRole('button', { name: '儲存 v2 手動資料' }))

    expect(await screen.findByText('儲存失敗，請稍後再試')).toBeInTheDocument()
    expect(screen.getByDisplayValue('UNSAVED_RISK_NOTES')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(rawErrorSentinel)
  })

  test('draft load failure is sanitized and keeps v1 generation usable', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_DRAFT_LOAD_SECRET'
    api.getCurrentReportDraft.mockRejectedValue(new Error(rawErrorSentinel))
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('無法載入 v2 手動資料草稿，請稍後再試。')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(rawErrorSentinel)

    await user.click(screen.getByRole('button', { name: '產生 v1 AI 草稿' }))

    await waitFor(() => {
      expect(api.generateReport).toHaveBeenCalledWith({
        case_id: caseId,
        session_id: sessionId,
      })
    })
  })

  test('does not write manual input or report draft content to browser storage', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({ safetyPlan: 'SYNTHETIC_MANUAL_INPUT_SECRET' }),
    )
    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const safetyPlan = await screen.findByLabelText('安全計畫')
    await user.clear(safetyPlan)
    await user.type(safetyPlan, 'SYNTHETIC_UNSAVED_DRAFT_SECRET')

    const storedValues = [
      ...Object.values(window.localStorage),
      ...Object.values(window.sessionStorage),
    ].join('\n')

    expect(storedValues).not.toContain('SYNTHETIC_MANUAL_INPUT_SECRET')
    expect(storedValues).not.toContain('SYNTHETIC_UNSAVED_DRAFT_SECRET')
    expect(storedValues).not.toContain('draft-1')
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
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
    api.getCurrentReportDraft.mockRejectedValue({
      response: { status: 404 },
    })
    api.createReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockResolvedValue(makeReportDraft())
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

    await user.click(await screen.findByRole('button', { name: '產生 v1 AI 草稿' }))

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
