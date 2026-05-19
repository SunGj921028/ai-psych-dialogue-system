import { fireEvent, screen, waitFor } from '@testing-library/react'
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
