import { beforeEach, describe, expect, test, vi } from 'vitest'

const { axiosCreate, fakeApiClient } = vi.hoisted(() => {
  const fakeApiClient = {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  }

  return {
    axiosCreate: vi.fn(() => fakeApiClient),
    fakeApiClient,
  }
})

vi.mock('axios', () => ({
  default: {
    create: axiosCreate,
  },
}))

async function importClient() {
  return import('./client.js')
}

describe('API helper contracts', () => {
  beforeEach(() => {
    vi.resetModules()
    axiosCreate.mockClear()
    fakeApiClient.delete.mockReset()
    fakeApiClient.get.mockReset()
    fakeApiClient.patch.mockReset()
    fakeApiClient.post.mockReset()
  })

  test('getHealth calls GET /health', async () => {
    fakeApiClient.get.mockResolvedValue({ data: { status: 'ok' } })
    const { getHealth } = await importClient()

    const result = await getHealth()

    expect(fakeApiClient.get).toHaveBeenCalledWith('/health')
    expect(result).toEqual({ status: 'ok' })
  })

  test('listCases calls GET /api/cases', async () => {
    fakeApiClient.get.mockResolvedValue({ data: [] })
    const { listCases } = await importClient()

    const result = await listCases()

    expect(fakeApiClient.get).toHaveBeenCalledWith('/api/cases')
    expect(result).toEqual([])
  })

  test('createCase calls POST /api/cases with the exact payload', async () => {
    const payload = {
      code_name: 'CASE_ALPHA',
      note: 'SYNTHETIC_NOTE_VISIBLE',
    }
    fakeApiClient.post.mockResolvedValue({
      data: { id: 'case-1', ...payload },
    })
    const { createCase } = await importClient()

    const result = await createCase(payload)

    expect(fakeApiClient.post).toHaveBeenCalledWith('/api/cases', payload)
    expect(result).toEqual({ id: 'case-1', ...payload })
  })

  test('getCase calls GET /api/cases/{caseId}', async () => {
    fakeApiClient.get.mockResolvedValue({ data: { id: 'case-1' } })
    const { getCase } = await importClient()

    const result = await getCase('case-1')

    expect(fakeApiClient.get).toHaveBeenCalledWith('/api/cases/case-1')
    expect(result).toEqual({ id: 'case-1' })
  })

  test('sendConversationTurn calls POST /api/conversation/turn with the exact payload', async () => {
    const payload = {
      case_id: 'case-1',
      session_id: 'session-1',
      turn_number: 1,
      user_input: 'SYNTHETIC_PRIVATE_MESSAGE',
      conversation_history: [
        {
          role: 'user',
          content: 'previous synthetic message',
        },
      ],
    }
    fakeApiClient.post.mockResolvedValue({ data: { turn_number: 1 } })
    const { sendConversationTurn } = await importClient()

    const result = await sendConversationTurn(payload)

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/conversation/turn',
      payload,
    )
    expect(result).toEqual({ turn_number: 1 })
  })

  test('getSessionMessages calls the expected session messages path', async () => {
    fakeApiClient.get.mockResolvedValue({ data: [] })
    const { getSessionMessages } = await importClient()

    const result = await getSessionMessages('case-1', 'session-1')

    expect(fakeApiClient.get).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/messages',
    )
    expect(result).toEqual([])
  })

  test('listCaseSessions calls the expected case sessions path', async () => {
    fakeApiClient.get.mockResolvedValue({ data: [] })
    const { listCaseSessions } = await importClient()

    const result = await listCaseSessions('case-1')

    expect(fakeApiClient.get).toHaveBeenCalledWith('/api/cases/case-1/sessions')
    expect(result).toEqual([])
  })

  test('listCaseSessions can include archived sessions with query string', async () => {
    fakeApiClient.get.mockResolvedValue({ data: [] })
    const { listCaseSessions } = await importClient()

    const result = await listCaseSessions('case-1', { includeArchived: true })

    expect(fakeApiClient.get).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions?include_archived=true',
    )
    expect(result).toEqual([])
  })

  test('createSession calls POST /api/cases/{caseId}/sessions with an empty payload by default', async () => {
    fakeApiClient.post.mockResolvedValue({
      data: { session_id: 'backend-session-1' },
    })
    const { createSession } = await importClient()

    const result = await createSession('case-1')

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions',
      {},
    )
    expect(result).toEqual({ session_id: 'backend-session-1' })
  })

  test('createSession passes optional session payload through unchanged', async () => {
    const payload = {
      session_id: 'client-provided-session',
      title: 'Synthetic title',
    }
    fakeApiClient.post.mockResolvedValue({
      data: { session_id: 'client-provided-session', title: 'Synthetic title' },
    })
    const { createSession } = await importClient()

    const result = await createSession('case-1', payload)

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions',
      payload,
    )
    expect(result).toEqual({
      session_id: 'client-provided-session',
      title: 'Synthetic title',
    })
  })

  test('updateSessionTitle calls PATCH /api/cases/{caseId}/sessions/{sessionId} with title payload', async () => {
    const payload = { title: 'New title' }
    fakeApiClient.patch.mockResolvedValue({
      data: { session_id: 'session-1', title: 'New title' },
    })
    const { updateSessionTitle } = await importClient()

    const result = await updateSessionTitle('case-1', 'session-1', payload)

    expect(fakeApiClient.patch).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1',
      payload,
    )
    expect(result).toEqual({ session_id: 'session-1', title: 'New title' })
  })

  test('updateSessionTitle passes null title payload through unchanged', async () => {
    const payload = { title: null }
    fakeApiClient.patch.mockResolvedValue({
      data: { session_id: 'session-1', title: null },
    })
    const { updateSessionTitle } = await importClient()

    const result = await updateSessionTitle('case-1', 'session-1', payload)

    expect(fakeApiClient.patch).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1',
      payload,
    )
    expect(result).toEqual({ session_id: 'session-1', title: null })
  })

  test('archiveSession calls the expected session archive path', async () => {
    fakeApiClient.post.mockResolvedValue({
      data: {
        session_id: 'session-1',
        archived_at: '2026-05-20T00:00:00Z',
      },
    })
    const { archiveSession } = await importClient()

    const result = await archiveSession('case-1', 'session-1')

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/archive',
    )
    expect(result).toEqual({
      session_id: 'session-1',
      archived_at: '2026-05-20T00:00:00Z',
    })
  })

  test('unarchiveSession calls the expected session unarchive path', async () => {
    fakeApiClient.post.mockResolvedValue({
      data: { session_id: 'session-1', archived_at: null },
    })
    const { unarchiveSession } = await importClient()

    const result = await unarchiveSession('case-1', 'session-1')

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/unarchive',
    )
    expect(result).toEqual({ session_id: 'session-1', archived_at: null })
  })

  test('getSessionSummaries calls the expected session summaries path', async () => {
    fakeApiClient.get.mockResolvedValue({ data: [] })
    const { getSessionSummaries } = await importClient()

    const result = await getSessionSummaries('case-1', 'session-1')

    expect(fakeApiClient.get).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/summaries',
    )
    expect(result).toEqual([])
  })

  test('generateReport calls POST /api/reports/generate with the exact payload', async () => {
    const payload = {
      case_id: 'case-1',
      session_id: 'session-1',
    }
    fakeApiClient.post.mockResolvedValue({
      data: { case_id: 'case-1', session_id: 'session-1' },
    })
    const { generateReport } = await importClient()

    const result = await generateReport(payload)

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/reports/generate',
      payload,
    )
    expect(result).toEqual({ case_id: 'case-1', session_id: 'session-1' })
  })

  test('getCurrentReportDraft calls the expected current draft path', async () => {
    fakeApiClient.get.mockResolvedValue({
      data: { draft_id: 'draft-1', case_id: 'case-1', session_id: 'session-1' },
    })
    const { getCurrentReportDraft } = await importClient()

    const result = await getCurrentReportDraft('case-1', 'session-1')

    expect(fakeApiClient.get).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/report-drafts/current',
    )
    expect(result).toEqual({
      draft_id: 'draft-1',
      case_id: 'case-1',
      session_id: 'session-1',
    })
  })

  test('createReportDraft calls the expected path with an empty payload by default', async () => {
    fakeApiClient.post.mockResolvedValue({
      data: { draft_id: 'draft-1', case_id: 'case-1', session_id: 'session-1' },
    })
    const { createReportDraft } = await importClient()

    const result = await createReportDraft('case-1', 'session-1')

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/report-drafts',
      {},
    )
    expect(result).toEqual({
      draft_id: 'draft-1',
      case_id: 'case-1',
      session_id: 'session-1',
    })
  })

  test('createReportDraft passes optional payload through unchanged', async () => {
    const payload = {
      manual_input: {
        basic_info: {
          referral_source: { value: 'school counselor' },
        },
      },
    }
    fakeApiClient.post.mockResolvedValue({
      data: { draft_id: 'draft-1', manual_input: payload.manual_input },
    })
    const { createReportDraft } = await importClient()

    const result = await createReportDraft('case-1', 'session-1', payload)

    expect(fakeApiClient.post).toHaveBeenCalledWith(
      '/api/cases/case-1/sessions/session-1/report-drafts',
      payload,
    )
    expect(result).toEqual({
      draft_id: 'draft-1',
      manual_input: payload.manual_input,
    })
  })

  test('updateReportDraftManualInput calls PATCH with manual input payload', async () => {
    const payload = {
      manual_input: {
        risk_assessment: {
          safety_plan: { value: 'SYNTHETIC_SAFE_PLAN' },
        },
      },
    }
    fakeApiClient.patch.mockResolvedValue({
      data: { draft_id: 'draft-1', manual_input: payload.manual_input },
    })
    const { updateReportDraftManualInput } = await importClient()

    const result = await updateReportDraftManualInput('draft-1', payload)

    expect(fakeApiClient.patch).toHaveBeenCalledWith(
      '/api/report-drafts/draft-1/manual-input',
      payload,
    )
    expect(result).toEqual({
      draft_id: 'draft-1',
      manual_input: payload.manual_input,
    })
  })
})
