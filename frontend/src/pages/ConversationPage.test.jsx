import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ConversationPage from './ConversationPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createCase: vi.fn(),
  createSession: vi.fn(),
  getSessionMessages: vi.fn(),
  getSessionSummaries: vi.fn(),
  listCases: vi.fn(),
  sendConversationTurn: vi.fn(),
}))

const activeCaseId = 'case-1'
const activeSessionId = 'session-1'
const restoredHighText =
  '此會談曾出現高風險標記，請諮商師審閱相關內容並依專業流程處理。'
const restoredLowText = '此會談曾有低度危機註記，請諮商師留意。'
const legacyFallbackText = '最新摘要有危機註記，請諮商師重新檢視'

function setActiveSession() {
  window.sessionStorage.setItem('ai-psych-active-case-id', activeCaseId)
  window.sessionStorage.setItem('ai-psych-active-session-id', activeSessionId)
}

function getConversationInput() {
  return document.getElementById('conversation-input')
}

function getSubmitTurnButton() {
  return getConversationInput().closest('form').querySelector('button[type="submit"]')
}

function getCreateCaseForm() {
  return document.querySelectorAll('form')[0]
}

function getNewSessionButton() {
  return screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('type') === 'button')
}

async function clickNewSessionButton(user) {
  await user.click(getNewSessionButton())
}

function getStoredBrowserData() {
  return [
    ...Object.entries(window.localStorage).flat(),
    ...Object.entries(window.sessionStorage).flat(),
  ].join('\n')
}

function mockSessionData({ messages = [], summaries = [] } = {}) {
  api.listCases.mockResolvedValue([
    {
      id: activeCaseId,
      code_name: 'CASE-001',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    },
  ])
  api.getSessionMessages.mockResolvedValue(messages)
  api.getSessionSummaries.mockResolvedValue(summaries)
}

function makeCrisisResponse(crisis) {
  return {
    case_id: activeCaseId,
    session_id: activeSessionId,
    turn_number: 1,
    assistant_response: {
      content: 'SYNTHETIC_ASSISTANT_REPLY',
      is_safe: true,
      warning: null,
    },
    crisis,
    summary: {
      turn_number: 1,
      emotion: {
        primary: 'synthetic emotion',
        intensity: 3,
      },
      emotion_dimensions: {
        anxiety: 1,
        sadness: 1,
        anger: 0,
        hopelessness: 0,
        confusion: 1,
        hope: 5,
      },
      themes: ['synthetic theme'],
      key_statement: 'SYNTHETIC_KEY_STATEMENT',
      crisis_flag: crisis.crisis_flag,
    },
  }
}

function makeLoadedSummaryRow({
  id = 'summary-row',
  turnNumber = 1,
  crisisFlag = false,
  crisisLevel = 'none',
} = {}) {
  return {
    id,
    case_id: activeCaseId,
    session_id: activeSessionId,
    turn_number: turnNumber,
    summary: {
      turn_number: turnNumber,
      emotion: {
        primary: 'synthetic emotion',
        intensity: 4,
      },
      emotion_dimensions: {
        anxiety: 2,
        sadness: 1,
        anger: 0,
        hopelessness: 1,
        confusion: 1,
        hope: 4,
      },
      themes: ['synthetic metadata theme'],
      key_statement: 'SYNTHETIC_SUMMARY_METADATA',
      crisis_flag: crisisFlag,
    },
    crisis_flag: crisisFlag,
    crisis_level: crisisLevel,
    created_at: '2026-05-20T00:00:00Z',
  }
}

async function submitSyntheticTurn() {
  const user = userEvent.setup()
  const input = getConversationInput()

  await user.type(input, 'SYNTHETIC_INPUT')
  fireEvent.submit(input.closest('form'))
  await waitFor(() => {
    expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)
  })
}

async function renderReadyConversationPage() {
  renderWithRouter(<ConversationPage />)
  await waitFor(() => {
    expect(api.listCases).toHaveBeenCalledTimes(1)
    expect(api.getSessionMessages).toHaveBeenCalled()
    expect(api.getSessionSummaries).toHaveBeenCalled()
  })
}

describe('ConversationPage crisis behavior', () => {
  beforeEach(() => {
    setActiveSession()
    mockSessionData()
  })

  test('default crisis metadata uses cautious no-crisis wording', async () => {
    await renderReadyConversationPage()

    expect(screen.getByText('未偵測到危機')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('restored persisted high crisis level shows page metadata without replaying modal', async () => {
    mockSessionData({
      summaries: [
        makeLoadedSummaryRow({
          id: 'summary-restored-high',
          crisisFlag: true,
          crisisLevel: 'high',
        }),
      ],
    })

    await renderReadyConversationPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(restoredHighText)
    expect(screen.getAllByText(restoredHighText).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('live high crisis response opens modal without page-level detail block or backend reason', async () => {
    const user = userEvent.setup()
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: true,
        crisis_level: 'high',
        reason: 'SYNTHETIC_HIGH_REASON',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    const dialog = await screen.findByRole('dialog', { name: '高風險提醒' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '我已了解' })).toBeInTheDocument()
    expect(
      screen.queryByText(
        '後端回傳 crisis_level 為 high。請諮商師立即審閱本輪內容，並依專業流程處理。',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('SYNTHETIC_HIGH_REASON')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '我已了解' }))

    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('SYNTHETIC_HIGH_REASON')).not.toBeInTheDocument()
  })

  test('restored persisted high crisis level does not show backend reason text inline', async () => {
    mockSessionData({
      summaries: [
        {
          ...makeLoadedSummaryRow({
            id: 'summary-restored-high-no-reason',
            crisisFlag: true,
            crisisLevel: 'high',
          }),
          reason: 'SYNTHETIC_RESTORED_HIGH_REASON',
        },
      ],
    })

    await renderReadyConversationPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(restoredHighText)
    expect(screen.queryByText('SYNTHETIC_RESTORED_HIGH_REASON')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('mocked low crisis response does not show red alert', async () => {
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: true,
        crisis_level: 'low',
        reason: 'SYNTHETIC_LOW_REASON',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('low crisis appears as ordinary metadata', async () => {
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: true,
        crisis_level: 'low',
        reason: 'SYNTHETIC_LOW_METADATA_REASON',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    expect(await screen.findByText('SYNTHETIC_LOW_METADATA_REASON')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('restored persisted low crisis level appears as ordinary metadata', async () => {
    mockSessionData({
      summaries: [
        makeLoadedSummaryRow({
          id: 'summary-restored-low',
          crisisFlag: true,
          crisisLevel: 'low',
        }),
      ],
    })

    await renderReadyConversationPage()

    expect(screen.getByText(restoredLowText)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('none crisis level uses cautious non-crisis wording', async () => {
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: false,
        crisis_level: 'none',
        reason: '',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    expect(await screen.findByText('未偵測到危機')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('restored persisted none crisis level uses no-crisis wording', async () => {
    mockSessionData({
      summaries: [
        makeLoadedSummaryRow({
          id: 'summary-restored-none',
          crisisFlag: false,
          crisisLevel: 'none',
        }),
      ],
    })

    await renderReadyConversationPage()

    expect(screen.getByText('未偵測到危機')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('loaded summary crisis flag shows safe metadata fallback without high modal', async () => {
    mockSessionData({
      summaries: [
        {
          id: 'summary-crisis-flag',
          case_id: activeCaseId,
          session_id: activeSessionId,
          turn_number: 1,
          summary: {
            turn_number: 1,
            emotion: {
              primary: 'synthetic emotion',
              intensity: 4,
            },
            emotion_dimensions: {
              anxiety: 2,
              sadness: 1,
              anger: 0,
              hopelessness: 1,
              confusion: 1,
              hope: 4,
            },
            themes: ['synthetic metadata theme'],
            key_statement: 'SYNTHETIC_SUMMARY_METADATA',
            crisis_flag: true,
          },
          crisis_flag: true,
          created_at: '2026-05-20T00:00:00Z',
        },
      ],
    })

    await renderReadyConversationPage()

    expect(screen.getByText(legacyFallbackText)).toBeInTheDocument()
    expect(screen.queryByText(restoredHighText)).not.toBeInTheDocument()
    expect(screen.queryByText(restoredLowText)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('restored persisted high crisis level takes precedence over low', async () => {
    mockSessionData({
      summaries: [
        makeLoadedSummaryRow({
          id: 'summary-restored-low',
          turnNumber: 1,
          crisisFlag: true,
          crisisLevel: 'low',
        }),
        makeLoadedSummaryRow({
          id: 'summary-restored-high',
          turnNumber: 2,
          crisisFlag: true,
          crisisLevel: 'high',
        }),
      ],
    })

    await renderReadyConversationPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(restoredHighText)
    expect(screen.queryByText(restoredLowText)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '高風險提醒' })).not.toBeInTheDocument()
  })

  test('restored persisted low crisis level takes precedence over none', async () => {
    mockSessionData({
      summaries: [
        makeLoadedSummaryRow({
          id: 'summary-restored-none',
          turnNumber: 1,
          crisisFlag: false,
          crisisLevel: 'none',
        }),
        makeLoadedSummaryRow({
          id: 'summary-restored-low',
          turnNumber: 2,
          crisisFlag: true,
          crisisLevel: 'low',
        }),
      ],
    })

    await renderReadyConversationPage()

    expect(screen.getByText(restoredLowText)).toBeInTheDocument()
    expect(screen.queryByText('未偵測到危機')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('summary crisis_flag true with low crisis level does not produce red alert', async () => {
    mockSessionData({
      summaries: [
        {
          id: 'summary-1',
          case_id: activeCaseId,
          session_id: activeSessionId,
          turn_number: 1,
          summary: {
            turn_number: 1,
            emotion: {
              primary: 'synthetic emotion',
              intensity: 4,
            },
            emotion_dimensions: {
              anxiety: 2,
              sadness: 1,
              anger: 0,
              hopelessness: 1,
              confusion: 1,
              hope: 4,
            },
            themes: ['synthetic metadata theme'],
            key_statement: 'SYNTHETIC_SUMMARY_METADATA',
            crisis_flag: true,
          },
          crisis_flag: true,
          created_at: '2026-05-20T00:00:00Z',
        },
      ],
    })
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: true,
        crisis_level: 'low',
        reason: 'SYNTHETIC_LOW_WITH_SUMMARY_FLAG',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    expect(await screen.findByText('SYNTHETIC_LOW_WITH_SUMMARY_FLAG')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('uses mocked API helpers without fetch network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: false,
        crisis_level: 'none',
        reason: 'SYNTHETIC_NONE_REASON',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('ConversationPage resume query behavior', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('ai-psych-active-case-id', 'stale-case')
    window.sessionStorage.setItem('ai-psych-active-session-id', 'stale-session')
    api.listCases.mockResolvedValue([
      {
        id: 'query-case',
        code_name: 'CASE_QUERY',
        created_at: '2026-05-20T00:00:00Z',
        note: 'SYNTHETIC_CASE_NOTE_SHOULD_NOT_PERSIST',
      },
    ])
    api.getSessionMessages.mockResolvedValue([
      {
        id: 'query-message',
        case_id: 'query-case',
        session_id: 'query-session',
        turn_number: 2,
        role: 'user',
        content: 'SYNTHETIC_RESUMED_MESSAGE',
        created_at: '2026-05-20T00:00:00Z',
      },
    ])
    api.getSessionSummaries.mockResolvedValue([
      {
        id: 'query-summary',
        case_id: 'query-case',
        session_id: 'query-session',
        turn_number: 3,
        summary: {
          turn_number: 3,
          emotion: {
            primary: 'synthetic emotion',
            intensity: 5,
          },
          emotion_dimensions: {
            anxiety: 5,
            sadness: 1,
            anger: 0,
            hopelessness: 1,
            confusion: 1,
            hope: 3,
          },
          themes: ['SYNTHETIC_RESUMED_SUMMARY'],
          key_statement: 'SYNTHETIC_RESUMED_SUMMARY',
          crisis_flag: false,
        },
        crisis_flag: false,
        created_at: '2026-05-20T00:00:00Z',
      },
    ])
  })

  test('query params take precedence over stale storage and load the resumed session', async () => {
    renderWithRouter(<ConversationPage />, {
      initialEntries: ['/?caseId=query-case&sessionId=query-session'],
    })

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith(
        'query-case',
        'query-session',
      )
      expect(api.getSessionSummaries).toHaveBeenCalledWith(
        'query-case',
        'query-session',
      )
    })

    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'query-case',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBe(
      'query-session',
    )
    expect(await screen.findByText('SYNTHETIC_RESUMED_MESSAGE')).toBeInTheDocument()
    expect(screen.getByText('已從歷史紀錄恢復此會談')).toBeInTheDocument()
    expect(
      document.querySelector(
        'a[href="/report/query-case?sessionId=query-session"]',
      ),
    ).toBeInTheDocument()
    expect(api.createSession).not.toHaveBeenCalled()
  })

  test('new session from a resumed query session creates a durable backend session', async () => {
    const user = userEvent.setup()
    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('unexpected-local-session')
    api.createSession.mockResolvedValue({
      session_id: 'backend-new-session-from-button',
      message_count: 0,
      summary_count: 0,
      last_turn_number: null,
      latest_summary_preview: null,
      has_crisis: false,
    })
    api.getSessionMessages.mockImplementation((_caseId, requestedSessionId) => {
      if (requestedSessionId === 'query-session') {
        return Promise.resolve([
          {
            id: 'query-message',
            case_id: 'query-case',
            session_id: 'query-session',
            turn_number: 2,
            role: 'user',
            content: 'SYNTHETIC_RESUMED_MESSAGE',
            created_at: '2026-05-20T00:00:00Z',
          },
        ])
      }

      return Promise.resolve([])
    })
    api.getSessionSummaries.mockImplementation((_caseId, requestedSessionId) => {
      if (requestedSessionId === 'query-session') {
        return Promise.resolve([
          {
            id: 'query-summary',
            case_id: 'query-case',
            session_id: 'query-session',
            turn_number: 3,
            summary: {
              turn_number: 3,
              emotion: {
                primary: 'synthetic emotion',
                intensity: 5,
              },
              emotion_dimensions: {
                anxiety: 5,
                sadness: 1,
                anger: 0,
                hopelessness: 1,
                confusion: 1,
                hope: 3,
              },
              themes: ['SYNTHETIC_RESUMED_SUMMARY'],
              key_statement: 'SYNTHETIC_RESUMED_SUMMARY',
              crisis_flag: false,
            },
            crisis_flag: false,
            created_at: '2026-05-20T00:00:00Z',
          },
        ])
      }

      return Promise.resolve([])
    })

    renderWithRouter(<ConversationPage />, {
      initialEntries: ['/?caseId=query-case&sessionId=query-session'],
    })

    expect(await screen.findByText('SYNTHETIC_RESUMED_MESSAGE')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /新會談/ }))

    expect(api.createSession).toHaveBeenCalledWith('query-case')
    expect(uuidSpy).not.toHaveBeenCalled()
    expect(screen.queryByText('SYNTHETIC_RESUMED_MESSAGE')).not.toBeInTheDocument()
    expect(screen.queryByText('SYNTHETIC_RESUMED_SUMMARY')).not.toBeInTheDocument()
    expect(screen.queryByText('已從歷史紀錄恢復此會談')).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'query-case',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBe(
      'backend-new-session-from-button',
    )
    expect(
      document.querySelector(
        'a[href="/report/query-case?sessionId=backend-new-session-from-button"]',
      ),
    ).toBeInTheDocument()
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage).sort()).toEqual([
      'ai-psych-active-case-id',
      'ai-psych-active-session-id',
    ])
  })

  test('resumed session uses loaded messages and summaries for the next turn number', async () => {
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: false,
        crisis_level: 'none',
        reason: 'SYNTHETIC_NONE_REASON',
      }),
    )

    renderWithRouter(<ConversationPage />, {
      initialEntries: ['/?caseId=query-case&sessionId=query-session'],
    })

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith(
        'query-case',
        'query-session',
      )
    })

    await submitSyntheticTurn()

    expect(api.sendConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        case_id: 'query-case',
        session_id: 'query-session',
        turn_number: 4,
      }),
    )
  })
})

describe('ConversationPage durable session creation behavior', () => {
  beforeEach(() => {
    api.listCases.mockResolvedValue([
      {
        id: 'existing-case',
        code_name: 'EXISTING_CASE',
        created_at: '2026-05-20T00:00:00Z',
        note: null,
      },
    ])
    api.getSessionMessages.mockResolvedValue([])
    api.getSessionSummaries.mockResolvedValue([])
    api.createSession.mockResolvedValue({
      session_id: 'backend-created-session',
      message_count: 0,
      summary_count: 0,
      last_turn_number: null,
      latest_summary_preview: null,
      has_crisis: false,
    })
  })

  test('create-case flow creates a backend durable session and uses the returned session id', async () => {
    const user = userEvent.setup()
    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('unexpected-local-session')
    api.createCase.mockResolvedValue({
      id: 'new-case-id',
      code_name: 'NEW_CASE',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    })
    api.createSession.mockResolvedValue({
      session_id: 'backend-session-after-case-create',
      message_count: 0,
      summary_count: 0,
      last_turn_number: null,
      latest_summary_preview: null,
      has_crisis: false,
    })

    renderWithRouter(<ConversationPage />)

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })

    const createCaseForm = getCreateCaseForm()
    const [codeNameInput] = within(createCaseForm).getAllByRole('textbox')
    await user.type(codeNameInput, 'NEW_CASE')
    fireEvent.submit(createCaseForm)

    await waitFor(() => {
      expect(api.createCase).toHaveBeenCalledWith({
        code_name: 'NEW_CASE',
        note: null,
      })
      expect(api.createSession).toHaveBeenCalledWith('new-case-id')
    })

    expect(uuidSpy).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'new-case-id',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBe(
      'backend-session-after-case-create',
    )
    expect(
      document.querySelector(
        'a[href="/report/new-case-id?sessionId=backend-session-after-case-create"]',
      ),
    ).toBeInTheDocument()
  })

  test('create-case partial session failure keeps the new case without a fake local session', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_CREATE_SESSION_STACK_SECRET'
    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('unexpected-local-session')
    api.createCase.mockResolvedValue({
      id: 'new-case-without-session',
      code_name: 'NEW_CASE_WITHOUT_SESSION',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    })
    api.createSession.mockRejectedValue(new Error(rawErrorSentinel))

    renderWithRouter(<ConversationPage />)

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })

    const createCaseForm = getCreateCaseForm()
    const [codeNameInput] = within(createCaseForm).getAllByRole('textbox')
    await user.type(codeNameInput, 'NEW_CASE_WITHOUT_SESSION')
    fireEvent.submit(createCaseForm)

    expect(
      await screen.findByText('個案已建立，但會談尚未建立，請稍後再試或點選新會談。'),
    ).toBeInTheDocument()
    expect(api.createSession).toHaveBeenCalledWith('new-case-without-session')
    expect(uuidSpy).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'new-case-without-session',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBeNull()
    expect(document.querySelector('a[href^="/report/"]')).not.toBeInTheDocument()
  })

  test('selecting an existing case clears the active session without creating one', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem('ai-psych-active-case-id', 'stale-case')
    window.sessionStorage.setItem('ai-psych-active-session-id', 'stale-session')

    renderWithRouter(<ConversationPage />)

    await screen.findByText('EXISTING_CASE')

    await user.selectOptions(screen.getByRole('combobox'), 'existing-case')

    expect(api.createSession).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'existing-case',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBeNull()
    expect(document.querySelector('a[href^="/report/"]')).not.toBeInTheDocument()
  })

  test('new-session failure keeps the current session and visible messages', async () => {
    const user = userEvent.setup()
    const rawErrorSentinel = 'RAW_NEW_SESSION_FAILURE_SECRET'
    api.listCases.mockResolvedValue([
      {
        id: 'query-case',
        code_name: 'CASE_QUERY',
        created_at: '2026-05-20T00:00:00Z',
        note: null,
      },
    ])
    api.getSessionMessages.mockResolvedValue([
      {
        id: 'query-message',
        case_id: 'query-case',
        session_id: 'query-session',
        turn_number: 2,
        role: 'user',
        content: 'SYNTHETIC_VISIBLE_MESSAGE_STAYS',
        created_at: '2026-05-20T00:00:00Z',
      },
    ])
    api.getSessionSummaries.mockResolvedValue([])
    api.createSession.mockRejectedValue(new Error(rawErrorSentinel))

    renderWithRouter(<ConversationPage />, {
      initialEntries: ['/?caseId=query-case&sessionId=query-session'],
    })

    expect(await screen.findByText('SYNTHETIC_VISIBLE_MESSAGE_STAYS')).toBeInTheDocument()

    await clickNewSessionButton(user)

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith('query-case')
    })
    expect(screen.getByText('SYNTHETIC_VISIBLE_MESSAGE_STAYS')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      'query-case',
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBe(
      'query-session',
    )
    expect(
      document.querySelector('a[href="/report/query-case?sessionId=query-session"]'),
    ).toBeInTheDocument()
  })
})

describe('ConversationPage input keyboard UX', () => {
  beforeEach(() => {
    setActiveSession()
    mockSessionData()
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: false,
        crisis_level: 'none',
        reason: 'SYNTHETIC_NONE_REASON',
      }),
    )
  })

  test('Enter submits a non-empty message', async () => {
    const user = userEvent.setup()
    await renderReadyConversationPage()

    const input = getConversationInput()
    await user.type(input, 'SYNTHETIC_ENTER_MESSAGE')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)
    })
    expect(api.sendConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        user_input: 'SYNTHETIC_ENTER_MESSAGE',
      }),
    )
  })

  test('Shift+Enter inserts newline and does not submit', async () => {
    const user = userEvent.setup()
    await renderReadyConversationPage()

    const input = getConversationInput()
    await user.type(input, 'LINE_ONE')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(input, 'LINE_TWO')

    expect(api.sendConversationTurn).not.toHaveBeenCalled()
    expect(input).toHaveValue('LINE_ONE\nLINE_TWO')
  })

  test('whitespace-only Enter does not submit', async () => {
    const user = userEvent.setup()
    await renderReadyConversationPage()

    const input = getConversationInput()
    await user.type(input, '   ')
    await user.keyboard('{Enter}')

    expect(api.sendConversationTurn).not.toHaveBeenCalled()
  })

  test('IME composing Enter does not submit', async () => {
    const user = userEvent.setup()
    await renderReadyConversationPage()

    const input = getConversationInput()
    await user.type(input, 'SYNTHETIC_COMPOSING_MESSAGE')
    fireEvent.keyDown(input, {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
      isComposing: true,
    })

    expect(api.sendConversationTurn).not.toHaveBeenCalled()
  })
})

describe('ConversationPage chat layout behavior', () => {
  test('renders messages inside a contained scrollable message list', async () => {
    setActiveSession()
    mockSessionData({
      messages: [
        {
          id: 'message-1',
          case_id: activeCaseId,
          session_id: activeSessionId,
          turn_number: 1,
          role: 'user',
          content: 'SYNTHETIC_SCROLL_MESSAGE',
          created_at: '2026-05-20T00:00:00Z',
        },
      ],
    })

    await renderReadyConversationPage()

    const messageList = screen.getByRole('log', { name: '會談訊息列表' })
    expect(messageList).toHaveClass('overflow-y-auto')
    expect(messageList).toHaveClass('min-h-0')
    expect(screen.getByText('SYNTHETIC_SCROLL_MESSAGE')).toBeInTheDocument()
  })
})

describe('ConversationPage submit error handling', () => {
  test('blocks submit when no active case is selected', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([])
    api.getSessionMessages.mockResolvedValue([])
    api.getSessionSummaries.mockResolvedValue([])

    renderWithRouter(<ConversationPage />)

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })

    const input = getConversationInput()
    const submitButton = getSubmitTurnButton()

    await user.type(input, 'SYNTHETIC_BLOCKED_MESSAGE')
    expect(submitButton).toBeDisabled()
    await user.click(submitButton)

    expect(api.sendConversationTurn).not.toHaveBeenCalled()
  })

  test('sendConversationTurn failure is sanitized and does not persist sensitive input', async () => {
    const rawErrorSentinel = 'RAW_PROVIDER_STACK_SECRET'
    const submittedMessage = 'SYNTHETIC_SUBMITTED_MESSAGE_SHOULD_NOT_PERSIST'
    setActiveSession()
    mockSessionData()
    api.sendConversationTurn.mockRejectedValue(new Error(rawErrorSentinel))

    await renderReadyConversationPage()

    const user = userEvent.setup()
    const input = getConversationInput()
    await user.type(input, submittedMessage)
    await user.click(getSubmitTurnButton())

    await waitFor(() => {
      expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)
    })

    expect(document.body.textContent).not.toContain(rawErrorSentinel)
    expect(screen.getByText('送出失敗，內容仍保留，可稍後再試。')).toBeInTheDocument()
    expect(input).toHaveValue(submittedMessage)

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(submittedMessage)
    expect(storedData).not.toContain(rawErrorSentinel)
    expect(storedData).not.toContain('送出失敗，內容仍保留，可稍後再試。')
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage).sort()).toEqual([
      'ai-psych-active-case-id',
      'ai-psych-active-session-id',
    ])
  })

  test('resumed session reload failure is sanitized and keeps storage safe', async () => {
    const rawErrorSentinel = 'RAW_RELOAD_INTERNAL_SECRET'
    const clinicalFixtureText = 'SYNTHETIC_RELOAD_CLINICAL_FIXTURE'
    api.listCases.mockResolvedValue([
      {
        id: 'query-case',
        code_name: 'CASE_QUERY',
        created_at: '2026-05-20T00:00:00Z',
        note: clinicalFixtureText,
      },
    ])
    api.getSessionMessages.mockRejectedValue(new Error(rawErrorSentinel))
    api.getSessionSummaries.mockResolvedValue([
      {
        id: 'query-summary',
        case_id: 'query-case',
        session_id: 'query-session',
        turn_number: 1,
        summary: {
          turn_number: 1,
          emotion: {
            primary: 'synthetic emotion',
            intensity: 3,
          },
          emotion_dimensions: {
            anxiety: 1,
            sadness: 1,
            anger: 0,
            hopelessness: 0,
            confusion: 1,
            hope: 5,
          },
          themes: [clinicalFixtureText],
          key_statement: clinicalFixtureText,
          crisis_flag: false,
        },
        crisis_flag: false,
        created_at: '2026-05-20T00:00:00Z',
      },
    ])

    renderWithRouter(<ConversationPage />, {
      initialEntries: ['/?caseId=query-case&sessionId=query-session'],
    })

    await waitFor(() => {
      expect(api.getSessionMessages).toHaveBeenCalledWith(
        'query-case',
        'query-session',
      )
      expect(api.getSessionSummaries).toHaveBeenCalledWith(
        'query-case',
        'query-session',
      )
    })

    expect(document.body.textContent).not.toContain(rawErrorSentinel)

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(rawErrorSentinel)
    expect(storedData).not.toContain(clinicalFixtureText)
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage).sort()).toEqual([
      'ai-psych-active-case-id',
      'ai-psych-active-session-id',
    ])
  })

  test('prevents duplicate submit while a turn request is in flight', async () => {
    let resolveTurn
    const pendingTurn = new Promise((resolve) => {
      resolveTurn = resolve
    })
    setActiveSession()
    mockSessionData()
    api.sendConversationTurn.mockReturnValue(pendingTurn)

    await renderReadyConversationPage()

    const user = userEvent.setup()
    const input = getConversationInput()
    const submitButton = getSubmitTurnButton()

    await user.type(input, 'SYNTHETIC_DUPLICATE_SUBMIT_MESSAGE')
    await user.click(submitButton)

    await waitFor(() => {
      expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)
      expect(submitButton).toBeDisabled()
    })
    expect(screen.getByText('正在送出並等待回覆...')).toBeInTheDocument()

    await user.click(submitButton)
    fireEvent.submit(input.closest('form'))
    expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveTurn(
        makeCrisisResponse({
          crisis_flag: false,
          crisis_level: 'none',
          reason: 'SYNTHETIC_DUPLICATE_REASON',
        }),
      )
      await pendingTurn
    })

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled()
    })
  })
})
