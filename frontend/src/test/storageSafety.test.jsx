import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ConversationPage from '../pages/ConversationPage.jsx'
import { renderWithRouter } from './renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createCase: vi.fn(),
  getSessionMessages: vi.fn(),
  getSessionSummaries: vi.fn(),
  listCases: vi.fn(),
  sendConversationTurn: vi.fn(),
}))

const activeCaseId = 'case-storage-safe'
const activeSessionId = 'session-storage-safe'

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

function expectStorageDoesNotContainClinicalSentinels(storage) {
  const serializedStorage = JSON.stringify(storageEntries(storage))

  for (const sentinel of clinicalSentinels) {
    expect(serializedStorage).not.toContain(sentinel)
  }
}

function makeSummaryRow() {
  return {
    id: 'summary-storage-safe',
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
      themes: ['SYNTHETIC_SUMMARY_SECRET'],
      key_statement: 'SYNTHETIC_SUMMARY_SECRET',
      crisis_flag: true,
    },
    crisis_flag: true,
    created_at: '2026-05-20T00:00:00Z',
  }
}

describe('browser storage safety', () => {
  beforeEach(() => {
    window.sessionStorage.setItem('ai-psych-active-case-id', activeCaseId)
    window.sessionStorage.setItem('ai-psych-active-session-id', activeSessionId)

    api.listCases.mockResolvedValue([
      {
        id: activeCaseId,
        code_name: 'CASE_STORAGE_SAFE',
        created_at: '2026-05-20T00:00:00Z',
        note: 'SYNTHETIC_CASE_NOTE_SECRET',
      },
    ])
    api.getSessionMessages.mockResolvedValue([
      {
        id: 'message-storage-safe',
        case_id: activeCaseId,
        session_id: activeSessionId,
        turn_number: 1,
        role: 'user',
        content: 'SYNTHETIC_PRIVATE_MESSAGE',
        created_at: '2026-05-20T00:00:00Z',
      },
    ])
    api.getSessionSummaries.mockResolvedValue([makeSummaryRow()])
    api.sendConversationTurn.mockResolvedValue({
      case_id: activeCaseId,
      session_id: activeSessionId,
      turn_number: 2,
      assistant_response: {
        content: 'SYNTHETIC_REPORT_TEXT',
        is_safe: true,
        warning: null,
      },
      crisis: {
        crisis_flag: true,
        crisis_level: 'low',
        reason: 'SYNTHETIC_CRISIS_REASON',
      },
      summary: makeSummaryRow().summary,
    })
  })

  test('does not persist clinical message, summary, report, crisis, or note text', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ConversationPage />)

    expect(await screen.findByText('SYNTHETIC_PRIVATE_MESSAGE')).toBeInTheDocument()
    expect(screen.getAllByText('SYNTHETIC_SUMMARY_SECRET').length).toBeGreaterThan(0)

    const input = document.getElementById('conversation-input')
    await user.type(input, 'SYNTHETIC_PRIVATE_MESSAGE')
    fireEvent.submit(input.closest('form'))

    await waitFor(() => {
      expect(api.sendConversationTurn).toHaveBeenCalledTimes(1)
    })

    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage).sort()).toEqual([
      'ai-psych-active-case-id',
      'ai-psych-active-session-id',
    ])
    expect(window.sessionStorage.getItem('ai-psych-active-case-id')).toBe(
      activeCaseId,
    )
    expect(window.sessionStorage.getItem('ai-psych-active-session-id')).toBe(
      activeSessionId,
    )
    expectStorageDoesNotContainClinicalSentinels(window.localStorage)
    expectStorageDoesNotContainClinicalSentinels(window.sessionStorage)
  })
})
