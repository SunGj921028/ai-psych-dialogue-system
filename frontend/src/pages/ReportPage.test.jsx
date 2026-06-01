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
  generateReportDraftV2: vi.fn(),
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

function getSectionByHeading(name) {
  return screen.getByRole('heading', { name }).closest('section')
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

function makeAiField(value, overrides = {}) {
  return makeReportField(value, {
    label_zh: overrides.label_zh,
    source_type: overrides.source_type ?? 'ai',
    missing_reason: overrides.missing_reason ?? null,
    needs_review: overrides.needs_review ?? true,
    evidence_refs: overrides.evidence_refs ?? [],
  })
}

function makeAiGenerated(overrides = {}) {
  return {
    chief_complaint_draft: makeAiField(
      overrides.chiefComplaint ?? 'SYNTHETIC_V2_CHIEF_AI',
      {
        evidence_refs: [{ turn_number: 2, summary_id: 'summary-secret-2' }],
      },
    ),
    problem_development_draft: makeAiField(
      overrides.problemDevelopment ?? 'SYNTHETIC_V2_PROBLEM_AI',
    ),
    client_understanding_draft: makeAiField(
      overrides.clientUnderstanding ?? 'SYNTHETIC_V2_CLIENT_AI',
    ),
    emotion_pattern: makeAiField(overrides.emotionPattern ?? 'SYNTHETIC_V2_EMOTION_AI'),
    cognitive_pattern: makeAiField(
      overrides.cognitivePattern ?? 'SYNTHETIC_V2_COGNITIVE_AI',
    ),
    behavior_coping_pattern: makeAiField(
      overrides.behaviorCopingPattern ?? 'SYNTHETIC_V2_BEHAVIOR_AI',
    ),
    psychological_factors: makeAiField(
      overrides.psychologicalFactors ?? 'SYNTHETIC_V2_PSYCHOLOGICAL_AI',
    ),
    theoretical_orientation_rationale: makeAiField(
      overrides.theoryRationale ?? 'SYNTHETIC_V2_THEORY_AI',
    ),
    conceptualization_narrative: makeAiField(
      overrides.conceptualization ?? 'SYNTHETIC_V2_CONCEPTUALIZATION_AI',
    ),
    formation_factors: makeAiField(overrides.formation ?? 'SYNTHETIC_V2_FORMATION_AI'),
    precipitating_factors: makeAiField(
      overrides.precipitating ?? 'SYNTHETIC_V2_PRECIPITATING_AI',
    ),
    maintaining_factors: makeAiField(
      overrides.maintaining ?? 'SYNTHETIC_V2_MAINTAINING_AI',
    ),
    protective_factors: makeAiField(
      overrides.protective ?? 'SYNTHETIC_V2_PROTECTIVE_AI',
    ),
    crisis_language_summary: makeAiField(
      overrides.crisisLanguage ?? 'SYNTHETIC_V2_CRISIS_LANGUAGE_AI',
    ),
    formal_risk_level: makeAiField('SYNTHETIC_FORBIDDEN_RISK_LEVEL'),
    safety_plan: makeAiField('SYNTHETIC_FORBIDDEN_AI_SAFETY_PLAN'),
  }
}

function makeManualInput(overrides = {}) {
  return {
    basic_info: {
      session_date: makeReportField(
        Object.hasOwn(overrides, 'sessionDate') ? overrides.sessionDate : '2026-05-21',
      ),
      session_count: makeReportField(
        Object.hasOwn(overrides, 'sessionCount') ? overrides.sessionCount : '2',
      ),
      referral_source: makeReportField(
        Object.hasOwn(overrides, 'referralSource')
          ? overrides.referralSource
          : 'SYNTHETIC_REFERRAL_SOURCE',
        { missing_reason: 'no_data' },
      ),
      age_gender: makeReportField(
        Object.hasOwn(overrides, 'ageGender')
          ? overrides.ageGender
          : 'SYNTHETIC_AGE_GENDER',
      ),
      occupation_school_status: makeReportField(
        Object.hasOwn(overrides, 'occupationSchoolStatus')
          ? overrides.occupationSchoolStatus
          : 'SYNTHETIC_OCCUPATION_STATUS',
      ),
      marital_family_status: makeReportField(
        Object.hasOwn(overrides, 'maritalFamilyStatus')
          ? overrides.maritalFamilyStatus
          : 'SYNTHETIC_FAMILY_STATUS',
      ),
    },
    problem_onset_course: {
      client_understanding: makeReportField(
        Object.hasOwn(overrides, 'clientUnderstanding')
          ? overrides.clientUnderstanding
          : 'SYNTHETIC_CLIENT_UNDERSTANDING',
      ),
    },
    assessment_testing_data: makeReportField(
      Object.hasOwn(overrides, 'assessmentTestingData')
        ? overrides.assessmentTestingData
        : 'SYNTHETIC_ASSESSMENT_DATA',
    ),
    risk_assessment: {
      overall_risk_notes: makeReportField(
        Object.hasOwn(overrides, 'overallRiskNotes')
          ? overrides.overallRiskNotes
          : 'SYNTHETIC_RISK_NOTES',
      ),
      safety_plan: makeReportField(
        Object.hasOwn(overrides, 'safetyPlan')
          ? overrides.safetyPlan
          : 'SYNTHETIC_SAFETY_PLAN',
      ),
    },
  }
}

function makeReportDraft(overrides = {}) {
  const aiGenerated = Object.hasOwn(overrides, 'aiGenerated')
    ? overrides.aiGenerated
    : null

  return {
    schema_version: 'report_schema_v2',
    draft_id: overrides.draftId ?? 'draft-1',
    case_id: caseId,
    session_id: sessionId,
    status: overrides.status ?? (aiGenerated ? 'ai_generated' : 'manual_input_started'),
    manual_input: overrides.manualInput ?? makeManualInput(overrides),
    ai_generated: aiGenerated,
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
    generated_at: overrides.generatedAt ?? (aiGenerated ? '2026-05-21T00:00:00Z' : null),
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
    api.generateReportDraftV2.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )
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
    expect(api.generateReportDraftV2).not.toHaveBeenCalled()
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
    expect(screen.getByText('舊版 v1 暫存報告')).toBeInTheDocument()
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

  test('places session review aids before the v2 draft section', async () => {
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const reviewSectionHeading = await screen.findByText('會談整理輔助')
    const v2SectionHeading = screen.getByText('v2 報告草稿')

    expect(
      screen.getByText('建議先檢視本區整理，再建立或產生 v2 報告草稿。'),
    ).toBeInTheDocument()
    expect(screen.getByText('微摘要整理輔助')).toBeInTheDocument()
    expect(screen.getByText('危機標記彙整')).toBeInTheDocument()
    expect(screen.getByText('情緒強度趨勢')).toBeInTheDocument()
    expect(screen.getByText('情緒面向平均')).toBeInTheDocument()
    expect(screen.getByText('主題頻率')).toBeInTheDocument()
    expect(screen.getByText('會談微摘要時間軸')).toBeInTheDocument()
    expect(
      reviewSectionHeading.compareDocumentPosition(v2SectionHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  test('labels the v1 report area as legacy transient while keeping v1 generation isolated', async () => {
    const user = userEvent.setup()

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('舊版 v1 暫存報告')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '產生 v1 AI 草稿' }))

    await waitFor(() => {
      expect(api.generateReport).toHaveBeenCalledWith({
        case_id: caseId,
        session_id: sessionId,
      })
    })
    expect(api.generateReportDraftV2).not.toHaveBeenCalled()
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
    expect(screen.getByText('需先建立 v2 草稿後才可預覽')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '產生 v2 AI 草稿' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '建立 v2 手動資料草稿' }),
    ).toBeInTheDocument()
  })

  test('v2 generate action renders when a draft exists', async () => {
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('v2 AI 草稿產生')).toBeInTheDocument()
    expect(
      screen.getByText(
        '依目前已儲存的手動資料與會談摘要產生五段式報告的 AI 草稿。此草稿需由諮商師審閱，且不會影響目前 v1 暫時報告。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '產生 v2 AI 草稿' }),
    ).toBeInTheDocument()
  })

  test('successful v2 generation updates the draft preview without calling v1 generation', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.generateReportDraftV2.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(
      await screen.findByRole('button', { name: '產生 v2 AI 草稿' }),
    )

    await waitFor(() => {
      expect(api.generateReportDraftV2).toHaveBeenCalledWith('draft-1')
    })
    expect(api.generateReport).not.toHaveBeenCalled()
    expect(await screen.findByText('已產生 v2 AI 草稿')).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC_V2_CHIEF_AI')).toBeInTheDocument()
  })

  test('unsaved manual input blocks v2 generation until the counselor saves first', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.updateReportDraftManualInput.mockResolvedValue(
      makeReportDraft({ referralSource: 'UPDATED_REFERRAL_SOURCE' }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    const referralInput = await screen.findByLabelText('轉介來源')
    await user.clear(referralInput)
    await user.type(referralInput, 'UPDATED_REFERRAL_SOURCE')
    await user.click(screen.getByRole('button', { name: '產生 v2 AI 草稿' }))

    expect(api.generateReportDraftV2).not.toHaveBeenCalled()
    expect(
      screen.getByText('請先儲存手動資料，再產生 v2 AI 草稿'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '儲存 v2 手動資料' }))
    await user.click(await screen.findByRole('button', { name: '產生 v2 AI 草稿' }))

    await waitFor(() => {
      expect(api.generateReportDraftV2).toHaveBeenCalledWith('draft-1')
    })
  })

  test('existing ai_generated draft uses regeneration wording', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(
      await screen.findByRole('button', { name: '重新產生 v2 AI 草稿' }),
    ).toBeInTheDocument()
  })

  test('v2 generation 422 shows friendly insufficient-summary message and conversation link', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_BACKEND_DETAIL_SECRET'
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.generateReportDraftV2.mockRejectedValue({
      response: { status: 422, data: { detail: rawErrorSentinel } },
    })

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(
      await screen.findByRole('button', { name: '產生 v2 AI 草稿' }),
    )

    expect(
      await screen.findByText('至少需要一筆會談摘要才能產生 v2 AI 草稿'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '回到工作台新增會談摘要' }),
    ).toHaveAttribute('href', `/?caseId=${caseId}&sessionId=${sessionId}`)
    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(screen.queryByText('SYNTHETIC_V2_CHIEF_AI')).not.toBeInTheDocument()
  })

  test('generic v2 generation failure preserves existing preview and hides raw error text', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_V2_GENERATE_FAILURE_SECRET'
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated({ chiefComplaint: 'EXISTING_AI' }) }),
    )
    api.generateReportDraftV2.mockRejectedValue(new Error(rawErrorSentinel))

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('EXISTING_AI')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新產生 v2 AI 草稿' }))

    expect(await screen.findByText('產生失敗，請稍後再試')).toBeInTheDocument()
    expect(screen.getByText('EXISTING_AI')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(rawErrorSentinel)
  })

  test('loaded draft renders read-only v2 preview with five template sections and manual values', async () => {
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('v2 五段式報告預覽')).toBeInTheDocument()
    expect(
      screen.getByText('唯讀預覽，尚非正式報告；未產生 v2 AI 草稿。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '一、基本資料與主訴' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '二、現況評估與觀察' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '三、心理評估' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '四、理論取向與個案概念化' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '五、風險評估' })).toBeInTheDocument()

    const basicSection = getSectionByHeading('一、基本資料與主訴')
    expect(basicSection).toHaveTextContent('SYNTHETIC_AGE_GENDER')
    expect(basicSection).toHaveTextContent('SYNTHETIC_OCCUPATION_STATUS')
    expect(basicSection).toHaveTextContent('SYNTHETIC_FAMILY_STATUS')
    expect(basicSection).toHaveTextContent('SYNTHETIC_REFERRAL_SOURCE')
    expect(basicSection).toHaveTextContent('2 次／2026-05-21')
    expect(basicSection).toHaveTextContent('SYNTHETIC_CLIENT_UNDERSTANDING')

    const psychologicalSection = getSectionByHeading('三、心理評估')
    expect(psychologicalSection).toHaveTextContent('SYNTHETIC_ASSESSMENT_DATA')

    const riskSection = getSectionByHeading('五、風險評估')
    expect(riskSection).not.toHaveTextContent('SYNTHETIC_RISK_NOTES')
    expect(riskSection).not.toHaveTextContent('正式風險評估備註')
    expect(riskSection).toHaveTextContent('安全計畫（諮商師手動提供）')
    expect(riskSection).toHaveTextContent('SYNTHETIC_SAFETY_PLAN')
  })

  test('preview displays safe missing and future placeholders without implying no risk', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({
        ageGender: '',
        occupationSchoolStatus: '',
        maritalFamilyStatus: '',
        referralSource: '',
        sessionCount: '',
        sessionDate: '',
        clientUnderstanding: '',
        assessmentTestingData: '',
        overallRiskNotes: '',
        safetyPlan: '',
      }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('v2 五段式報告預覽')).toBeInTheDocument()
    expect(screen.getAllByText('待評估').length).toBeGreaterThan(3)
    expect(
      screen.getAllByText('此欄位待未來 AI 草稿或諮商師補充').length,
    ).toBeGreaterThan(3)
    const riskSection = getSectionByHeading('五、風險評估')
    expect(riskSection).not.toHaveTextContent('無風險')
    expect(riskSection).not.toHaveTextContent('安全計畫（諮商師手動提供）')
  })

  test('preview renders ai_generated fields with review badges and safe turn refs', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('SYNTHETIC_V2_CHIEF_AI')).toBeInTheDocument()
    const basicSection = getSectionByHeading('一、基本資料與主訴')
    expect(basicSection).toHaveTextContent('諮商師確認：個案對問題的理解')
    expect(basicSection).toHaveTextContent('SYNTHETIC_CLIENT_UNDERSTANDING')
    expect(basicSection).toHaveTextContent(
      'AI 補充草稿：個案對問題理解的可能表述，需審閱',
    )
    expect(basicSection).toHaveTextContent('SYNTHETIC_V2_CLIENT_AI')
    expect(basicSection).toHaveTextContent('第 2 輪')
    expect(basicSection).not.toHaveTextContent('summary-secret-2')

    const currentSection = getSectionByHeading('二、現況評估與觀察')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_EMOTION_AI')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_COGNITIVE_AI')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_BEHAVIOR_AI')

    const psychologicalSection = getSectionByHeading('三、心理評估')
    expect(psychologicalSection).toHaveTextContent('SYNTHETIC_V2_PSYCHOLOGICAL_AI')

    const formulationSection = getSectionByHeading('四、理論取向與個案概念化')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_THEORY_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_CONCEPTUALIZATION_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_FORMATION_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_PRECIPITATING_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_MAINTAINING_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_PROTECTIVE_AI')

    const riskSection = getSectionByHeading('五、風險評估')
    expect(riskSection).toHaveTextContent('SYNTHETIC_V2_CRISIS_LANGUAGE_AI')
    expect(riskSection).not.toHaveTextContent('SYNTHETIC_RISK_NOTES')
    expect(riskSection).not.toHaveTextContent('正式風險評估備註')
    expect(riskSection).toHaveTextContent('安全計畫（諮商師手動提供）')
    expect(riskSection).toHaveTextContent('SYNTHETIC_SAFETY_PLAN')
    expect(riskSection).not.toHaveTextContent('SYNTHETIC_FORBIDDEN_RISK_LEVEL')
    expect(riskSection).not.toHaveTextContent('SYNTHETIC_FORBIDDEN_AI_SAFETY_PLAN')
    expect(screen.getAllByText('AI 草稿，需諮商師審閱').length).toBeGreaterThan(5)
  })

  test('preview hides low-value demo placeholders while keeping core report fields visible', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('SYNTHETIC_V2_CHIEF_AI')).toBeInTheDocument()

    const currentSection = getSectionByHeading('二、現況評估與觀察')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_EMOTION_AI')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_COGNITIVE_AI')
    expect(currentSection).toHaveTextContent('SYNTHETIC_V2_BEHAVIOR_AI')
    expect(currentSection).not.toHaveTextContent('晤談觀察')
    expect(currentSection).not.toHaveTextContent('症狀與功能影響')

    const psychologicalSection = getSectionByHeading('三、心理評估')
    expect(psychologicalSection).toHaveTextContent('SYNTHETIC_V2_PSYCHOLOGICAL_AI')
    expect(psychologicalSection).not.toHaveTextContent('防衛機制')
    expect(psychologicalSection).not.toHaveTextContent('內在衝突')

    const formulationSection = getSectionByHeading('四、理論取向與個案概念化')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_THEORY_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_CONCEPTUALIZATION_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_FORMATION_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_PRECIPITATING_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_MAINTAINING_AI')
    expect(formulationSection).toHaveTextContent('SYNTHETIC_V2_PROTECTIVE_AI')

    const riskSection = getSectionByHeading('五、風險評估')
    expect(riskSection).toHaveTextContent('SYNTHETIC_V2_CRISIS_LANGUAGE_AI')
    expect(riskSection).not.toHaveTextContent('正式風險評估備註')
  })

  test('manual client understanding remains primary when both manual and ai draft exist', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({
        aiGenerated: makeAiGenerated({ clientUnderstanding: 'SYNTHETIC_AI_SUPPLEMENT' }),
        clientUnderstanding: 'SYNTHETIC_COUNSELOR_CONFIRMED_CLIENT',
      }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('v2 五段式報告預覽')).toBeInTheDocument()
    const basicSection = getSectionByHeading('一、基本資料與主訴')
    expect(basicSection).toHaveTextContent('諮商師確認：個案對問題的理解')
    expect(basicSection).toHaveTextContent('SYNTHETIC_COUNSELOR_CONFIRMED_CLIENT')
    expect(basicSection).toHaveTextContent(
      'AI 補充草稿：個案對問題理解的可能表述，需審閱',
    )
    expect(basicSection).toHaveTextContent('SYNTHETIC_AI_SUPPLEMENT')
  })

  test('manual client understanding can be empty so ai draft fills the main field with draft label', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({
        aiGenerated: makeAiGenerated({ clientUnderstanding: 'SYNTHETIC_AI_MAIN_CLIENT' }),
        clientUnderstanding: '',
      }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('SYNTHETIC_AI_MAIN_CLIENT')).toBeInTheDocument()
    const basicSection = getSectionByHeading('一、基本資料與主訴')
    expect(basicSection).toHaveTextContent(
      'AI 補充草稿：個案對問題理解的可能表述，需審閱',
    )
    expect(basicSection).toHaveTextContent('AI 草稿，需諮商師審閱')
    expect(basicSection).not.toHaveTextContent('諮商師確認：個案對問題的理解')
  })

  test('client understanding shows pending assessment when manual and ai draft are absent', async () => {
    api.getCurrentReportDraft.mockResolvedValue(
      makeReportDraft({
        aiGenerated: makeAiGenerated({ clientUnderstanding: '' }),
        clientUnderstanding: '',
      }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    expect(await screen.findByText('v2 五段式報告預覽')).toBeInTheDocument()
    const basicSection = getSectionByHeading('一、基本資料與主訴')
    expect(basicSection).toHaveTextContent('諮商師確認：個案對問題的理解')
    expect(basicSection).toHaveTextContent('待評估')
    expect(basicSection).not.toHaveTextContent(
      'AI 補充草稿：個案對問題理解的可能表述，需審閱',
    )
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
    expect(getSectionByHeading('五、風險評估')).toHaveTextContent(
      'UPDATED_SAFETY_PLAN',
    )
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

  test('does not write generated v2 draft content to browser storage', async () => {
    const user = userEvent.setup()
    api.getCurrentReportDraft.mockResolvedValue(makeReportDraft())
    api.generateReportDraftV2.mockResolvedValue(
      makeReportDraft({
        aiGenerated: makeAiGenerated({ chiefComplaint: 'SYNTHETIC_V2_GENERATED_SECRET' }),
      }),
    )

    renderReportPage(`/report/${caseId}?sessionId=${sessionId}`)

    await user.click(
      await screen.findByRole('button', { name: '產生 v2 AI 草稿' }),
    )
    expect(await screen.findByText('SYNTHETIC_V2_GENERATED_SECRET')).toBeInTheDocument()

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain('SYNTHETIC_V2_GENERATED_SECRET')
    expect(storedData).not.toContain('draft-1')
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
    api.generateReportDraftV2.mockResolvedValue(
      makeReportDraft({ aiGenerated: makeAiGenerated() }),
    )
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
