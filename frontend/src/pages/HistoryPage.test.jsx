import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import HistoryPage from './HistoryPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  listCaseSessions: vi.fn(),
  listCases: vi.fn(),
}))

function makeCase(overrides = {}) {
  return {
    id: 'case-alpha-id',
    code_name: 'CASE_ALPHA',
    created_at: '2026-05-20T00:00:00Z',
    note: 'SYNTHETIC_NOTE_VISIBLE',
    ...overrides,
  }
}

function makeSession(overrides = {}) {
  return {
    session_id: 'session-alpha-id',
    message_count: 2,
    summary_count: 1,
    last_turn_number: 3,
    last_updated: '2026-05-20T01:00:00Z',
    has_crisis: true,
    latest_summary_preview: '第 3 輪 · 主要情緒：焦慮 · 強度 6/10',
    ...overrides,
  }
}

describe('HistoryPage behavior', () => {
  beforeEach(() => {
    api.listCases.mockResolvedValue([])
    api.listCaseSessions.mockResolvedValue([])
  })

  test('calls listCases on mount', async () => {
    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })
  })

  test('renders resolved synthetic case code names and notes', async () => {
    api.listCases.mockResolvedValue([
      makeCase(),
      makeCase({
        id: 'case-beta-id',
        code_name: 'CASE_BETA',
        note: 'SYNTHETIC_SECOND_NOTE_VISIBLE',
      }),
    ])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    expect(await screen.findByText('CASE_ALPHA')).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC_NOTE_VISIBLE')).toBeInTheDocument()
    expect(screen.getByText('CASE_BETA')).toBeInTheDocument()
    expect(screen.getByText('SYNTHETIC_SECOND_NOTE_VISIBLE')).toBeInTheDocument()
  })

  test('renders an empty state when the case list is empty', async () => {
    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByText('CASE_ALPHA')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/')
  })

  test('renders a friendly error without exposing raw internal error text', async () => {
    api.listCases.mockRejectedValue(
      new Error('INTERNAL_HISTORY_FAILURE_SECRET'),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    await waitFor(() => {
      expect(api.listCases).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByText('INTERNAL_HISTORY_FAILURE_SECRET')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('INTERNAL_HISTORY_FAILURE_SECRET')
    expect(document.querySelector('[class*="text-destructive"]')).toBeInTheDocument()
  })

  test('does not render future delete or session-browser controls', async () => {
    api.listCases.mockResolvedValue([makeCase()])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    expect(await screen.findByText('CASE_ALPHA')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /delete|刪除/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /session|summary|report/i })).not.toBeInTheDocument()
  })

  test('does not load sessions until a case is expanded', async () => {
    api.listCases.mockResolvedValue([makeCase()])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    expect(await screen.findByText('CASE_ALPHA')).toBeInTheDocument()
    expect(api.listCaseSessions).not.toHaveBeenCalled()
  })

  test('expanding a case loads and renders session metadata links', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    await waitFor(() => {
      expect(api.listCaseSessions).toHaveBeenCalledWith('case-alpha-id')
    })

    expect(await screen.findByText('session-alpha-id')).toBeInTheDocument()
    expect(screen.getByText('第 3 輪 · 主要情緒：焦慮 · 強度 6/10')).toBeInTheDocument()
    expect(screen.getByText(/messages: 2/i)).toBeInTheDocument()
    expect(screen.getByText(/summaries: 1/i)).toBeInTheDocument()
    expect(screen.getByText(/last turn: 3/i)).toBeInTheDocument()
    expect(screen.getByText(/crisis metadata/i)).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: /resume conversation/i }),
    ).toHaveAttribute(
      'href',
      '/?caseId=case-alpha-id&sessionId=session-alpha-id',
    )
    expect(screen.getByRole('link', { name: /open report/i })).toHaveAttribute(
      'href',
      '/report/case-alpha-id?sessionId=session-alpha-id',
    )
  })

  test('renders backend-provided empty durable sessions without preview or crisis chip', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        session_id: 'empty-session-id',
        message_count: 0,
        summary_count: 0,
        last_turn_number: null,
        has_crisis: false,
        latest_summary_preview: null,
      }),
    ])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    await waitFor(() => {
      expect(api.listCaseSessions).toHaveBeenCalledWith('case-alpha-id')
    })

    expect(await screen.findByText('empty-session-id')).toBeInTheDocument()
    expect(screen.getByText(/messages: 0/i)).toBeInTheDocument()
    expect(screen.getByText(/summaries: 0/i)).toBeInTheDocument()
    expect(screen.getByText(/last turn:/i)).toBeInTheDocument()
    expect(screen.queryByText(/crisis metadata/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText('蝚?3 頛?繚 銝餉???嚗??繚 撘瑕漲 6/10'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /resume conversation/i }),
    ).toHaveAttribute(
      'href',
      '/?caseId=case-alpha-id&sessionId=empty-session-id',
    )
    expect(screen.getByRole('link', { name: /open report/i })).toHaveAttribute(
      'href',
      '/report/case-alpha-id?sessionId=empty-session-id',
    )
  })

  test('session load failure shows friendly error without leaking raw text', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockRejectedValue(
      new Error('INTERNAL_SESSION_FAILURE_SECRET'),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    await waitFor(() => {
      expect(api.listCaseSessions).toHaveBeenCalledWith('case-alpha-id')
    })

    expect(document.body.textContent).not.toContain('INTERNAL_SESSION_FAILURE_SECRET')
    expect(document.querySelector('[class*="text-destructive"]')).toBeInTheDocument()
  })

  test('does not render delete or PDF export controls', async () => {
    api.listCases.mockResolvedValue([makeCase()])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    expect(await screen.findByText('CASE_ALPHA')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    /*
    expect(screen.queryByRole('link', { name: /delete|?èŠ·î¨’/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete|?èŠ·î¨’/i })).not.toBeInTheDocument()
    */
    expect(screen.queryByRole('link', { name: /pdf|export/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pdf|export/i })).not.toBeInTheDocument()
  })

  test('current case workspace link points to root', async () => {
    api.listCases.mockResolvedValue([makeCase()])

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    const caseLinks = within(caseArticle).getAllByRole('link')

    expect(caseLinks).toHaveLength(1)
    expect(caseLinks[0]).toHaveAttribute('href', '/')
  })
})
