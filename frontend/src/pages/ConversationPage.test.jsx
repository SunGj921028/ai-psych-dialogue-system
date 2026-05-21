import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ConversationPage from './ConversationPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createCase: vi.fn(),
  getSessionMessages: vi.fn(),
  getSessionSummaries: vi.fn(),
  listCases: vi.fn(),
  sendConversationTurn: vi.fn(),
}))

const activeCaseId = 'case-1'
const activeSessionId = 'session-1'

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

function getStoredBrowserData() {
  return [
    ...Object.entries(window.localStorage).flat(),
    ...Object.entries(window.sessionStorage).flat(),
  ].join('\n')
}

function mockSessionData({ summaries = [] } = {}) {
  api.listCases.mockResolvedValue([
    {
      id: activeCaseId,
      code_name: 'CASE-001',
      created_at: '2026-05-20T00:00:00Z',
      note: null,
    },
  ])
  api.getSessionMessages.mockResolvedValue([])
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

  test('mocked high crisis response shows red alert', async () => {
    api.sendConversationTurn.mockResolvedValue(
      makeCrisisResponse({
        crisis_flag: true,
        crisis_level: 'high',
        reason: 'SYNTHETIC_HIGH_REASON',
      }),
    )

    await renderReadyConversationPage()
    await submitSyntheticTurn()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC_HIGH_REASON')).toBeInTheDocument()
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
    expect(
      document.querySelector(
        'a[href="/report/query-case?sessionId=query-session"]',
      ),
    ).toBeInTheDocument()
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

    const storedData = getStoredBrowserData()
    expect(storedData).not.toContain(submittedMessage)
    expect(storedData).not.toContain(rawErrorSentinel)
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

    await user.click(submitButton)
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
