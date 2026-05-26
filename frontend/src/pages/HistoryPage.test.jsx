import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import HistoryPage from './HistoryPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  archiveSession: vi.fn(),
  listCaseSessions: vi.fn(),
  listCases: vi.fn(),
  unarchiveSession: vi.fn(),
  updateSessionTitle: vi.fn(),
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
    title: null,
    archived_at: null,
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
    api.archiveSession.mockReset()
    api.unarchiveSession.mockReset()
    api.updateSessionTitle.mockReset()
    window.confirm = vi.fn(() => true)
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
    expect(screen.getByRole('button', { name: /封存/i })).toBeInTheDocument()
  })

  test('archive confirmation is required before calling the archive API', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])
    window.confirm = vi.fn(() => false)

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /封存/i }))

    expect(window.confirm).toHaveBeenCalledWith('確認封存此會談？')
    expect(api.archiveSession).not.toHaveBeenCalled()
  })

  test('archiving a session removes it from the default visible list', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])
    api.archiveSession.mockResolvedValue(
      makeSession({
        archived_at: '2026-05-20T02:00:00Z',
      }),
    )
    window.confirm = vi.fn(() => true)

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /封存/i }))

    await waitFor(() => {
      expect(api.archiveSession).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
      )
    })

    expect(screen.queryByText('session-alpha-id')).not.toBeInTheDocument()
  })

  test('show archived toggle loads archived sessions and keeps navigation links', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeSession({
          archived_at: '2026-05-20T02:00:00Z',
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

    fireEvent.click(
      within(caseArticle).getByRole('checkbox', {
        name: '顯示已封存會談',
      }),
    )

    await waitFor(() => {
      expect(api.listCaseSessions).toHaveBeenLastCalledWith('case-alpha-id', {
        includeArchived: true,
      })
    })

    expect(await screen.findByText('session-alpha-id')).toBeInTheDocument()
    expect(screen.getByText('已封存')).toBeInTheDocument()
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

  test('unarchive control updates a visible archived session', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        archived_at: '2026-05-20T02:00:00Z',
      }),
    ])
    api.unarchiveSession.mockResolvedValue(makeSession())

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )
    fireEvent.click(
      within(caseArticle).getByRole('checkbox', {
        name: '顯示已封存會談',
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /取消封存/i }))

    await waitFor(() => {
      expect(api.unarchiveSession).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
      )
    })

    expect(screen.queryByText('已封存')).not.toBeInTheDocument()
    expect(screen.getByText('session-alpha-id')).toBeInTheDocument()
  })

  test('renders provided session title as the primary session label', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        title: 'SYNTHETIC_SESSION_TITLE_VISIBLE',
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

    expect(await screen.findByText('SYNTHETIC_SESSION_TITLE_VISIBLE')).toBeInTheDocument()
    expect(screen.getByText('session-alpha-id')).toBeInTheDocument()
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

  test('renders fallback label for null or blank session titles with edit controls', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        session_id: 'session-null-title',
        title: null,
      }),
      makeSession({
        session_id: 'session-blank-title',
        title: '   ',
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

    expect(await screen.findByText('session-null-title')).toBeInTheDocument()
    expect(screen.getByText('session-blank-title')).toBeInTheDocument()
    expect(screen.getAllByText('未命名會談')).toHaveLength(2)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /edit title/i })).toHaveLength(2)
  })

  test('clicking edit shows inline rename controls and privacy helper text', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        title: 'Existing session title',
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

    const sessionTitle = await screen.findByText('Existing session title')
    const sessionRow = sessionTitle.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))

    expect(within(sessionRow).getByRole('textbox', { name: /session title/i })).toHaveValue(
      'Existing session title',
    )
    expect(within(sessionRow).getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(within(sessionRow).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(within(sessionRow).getByRole('button', { name: /clear title/i })).toBeInTheDocument()
    expect(
      within(sessionRow).getByText('請避免輸入可識別個資或敏感臨床內容'),
    ).toBeInTheDocument()
  })

  test('saving a trimmed title updates the displayed label and keeps navigation links unchanged', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])
    api.updateSessionTitle.mockResolvedValue(
      makeSession({
        title: 'Renamed session',
      }),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))

    const input = within(sessionRow).getByRole('textbox', { name: /session title/i })
    await user.clear(input)
    await user.type(input, '  Renamed session  ')
    await user.click(within(sessionRow).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(api.updateSessionTitle).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
        { title: 'Renamed session' },
      )
    })

    expect(await screen.findByText('Renamed session')).toBeInTheDocument()
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

  test('rename still works for a visible archived session', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        archived_at: '2026-05-20T02:00:00Z',
      }),
    ])
    api.updateSessionTitle.mockResolvedValue(
      makeSession({
        title: 'Archived renamed session',
        archived_at: '2026-05-20T02:00:00Z',
      }),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )
    fireEvent.click(
      within(caseArticle).getByRole('checkbox', {
        name: '顯示已封存會談',
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))

    const input = within(sessionRow).getByRole('textbox', { name: /session title/i })
    await user.clear(input)
    await user.type(input, 'Archived renamed session')
    await user.click(within(sessionRow).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(api.updateSessionTitle).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
        { title: 'Archived renamed session' },
      )
    })
    expect(await screen.findByText('Archived renamed session')).toBeInTheDocument()
    expect(screen.getByText('已封存')).toBeInTheDocument()
  })

  test('clear title saves null and restores the fallback label', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        title: 'Existing session title',
      }),
    ])
    api.updateSessionTitle.mockResolvedValue(
      makeSession({
        title: null,
      }),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionTitle = await screen.findByText('Existing session title')
    const sessionRow = sessionTitle.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    fireEvent.click(within(sessionRow).getByRole('button', { name: /clear title/i }))

    await waitFor(() => {
      expect(api.updateSessionTitle).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
        { title: null },
      )
    })

    expect(await screen.findByText('未命名會談')).toBeInTheDocument()
  })

  test('Escape, Cancel, and Enter keyboard behavior match rename expectations', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        title: 'Original title',
      }),
    ])
    api.updateSessionTitle.mockResolvedValue(
      makeSession({
        title: 'Keyboard title',
      }),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionTitle = await screen.findByText('Original title')
    const sessionRow = sessionTitle.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    await user.clear(within(sessionRow).getByRole('textbox', { name: /session title/i }))
    await user.type(
      within(sessionRow).getByRole('textbox', { name: /session title/i }),
      'Draft canceled with escape',
    )
    fireEvent.keyDown(within(sessionRow).getByRole('textbox', { name: /session title/i }), {
      key: 'Escape',
    })

    expect(api.updateSessionTitle).not.toHaveBeenCalled()
    expect(screen.getByText('Original title')).toBeInTheDocument()

    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    await user.clear(within(sessionRow).getByRole('textbox', { name: /session title/i }))
    await user.type(
      within(sessionRow).getByRole('textbox', { name: /session title/i }),
      'Draft canceled by button',
    )
    await user.click(within(sessionRow).getByRole('button', { name: /^cancel$/i }))

    expect(api.updateSessionTitle).not.toHaveBeenCalled()
    expect(screen.getByText('Original title')).toBeInTheDocument()

    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    await user.clear(within(sessionRow).getByRole('textbox', { name: /session title/i }))
    await user.type(
      within(sessionRow).getByRole('textbox', { name: /session title/i }),
      'Keyboard title',
    )
    fireEvent.keyDown(within(sessionRow).getByRole('textbox', { name: /session title/i }), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(api.updateSessionTitle).toHaveBeenCalledWith(
        'case-alpha-id',
        'session-alpha-id',
        { title: 'Keyboard title' },
      )
    })
    expect(await screen.findByText('Keyboard title')).toBeInTheDocument()
  })

  test('over-length title shows validation and does not call the API', async () => {
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

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    fireEvent.change(within(sessionRow).getByRole('textbox', { name: /session title/i }), {
      target: { value: 'A'.repeat(81) },
    })
    fireEvent.click(within(sessionRow).getByRole('button', { name: /^save$/i }))

    expect(screen.getByText('標題最多 80 個字')).toBeInTheDocument()
    expect(api.updateSessionTitle).not.toHaveBeenCalled()
  })

  test('save failure shows friendly error, hides raw text, and preserves draft', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])
    api.updateSessionTitle.mockRejectedValue(
      new Error('INTERNAL_RENAME_FAILURE_SECRET'),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    const input = within(sessionRow).getByRole('textbox', { name: /session title/i })
    await user.clear(input)
    await user.type(input, 'Draft survives failed save')
    await user.click(within(sessionRow).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(api.updateSessionTitle).toHaveBeenCalledTimes(1)
    })

    expect(document.body.textContent).not.toContain('INTERNAL_RENAME_FAILURE_SECRET')
    expect(within(sessionRow).getByText('無法更新會談標題，請稍後再試。')).toBeInTheDocument()
    expect(within(sessionRow).getByRole('textbox', { name: /session title/i })).toHaveValue(
      'Draft survives failed save',
    )
  })

  test('archive failure shows friendly error without raw text', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([makeSession()])
    api.archiveSession.mockRejectedValue(
      new Error('INTERNAL_ARCHIVE_FAILURE_SECRET'),
    )
    window.confirm = vi.fn(() => true)

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /封存/i }))

    await waitFor(() => {
      expect(api.archiveSession).toHaveBeenCalledTimes(1)
    })

    expect(document.body.textContent).not.toContain('INTERNAL_ARCHIVE_FAILURE_SECRET')
    expect(within(sessionRow).getByText('封存狀態更新失敗，請稍後再試。')).toBeInTheDocument()
  })

  test('unarchive failure shows friendly error without raw text', async () => {
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        archived_at: '2026-05-20T02:00:00Z',
      }),
    ])
    api.unarchiveSession.mockRejectedValue(
      new Error('INTERNAL_UNARCHIVE_FAILURE_SECRET'),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )
    fireEvent.click(
      within(caseArticle).getByRole('checkbox', {
        name: '顯示已封存會談',
      }),
    )

    const sessionId = await screen.findByText('session-alpha-id')
    const sessionRow = sessionId.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /取消封存/i }))

    await waitFor(() => {
      expect(api.unarchiveSession).toHaveBeenCalledTimes(1)
    })

    expect(document.body.textContent).not.toContain(
      'INTERNAL_UNARCHIVE_FAILURE_SECRET',
    )
    expect(within(sessionRow).getByText('封存狀態更新失敗，請稍後再試。')).toBeInTheDocument()
  })

  test('starting edit on another session closes the previous editor without saving', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        session_id: 'session-alpha-id',
        title: 'First title',
      }),
      makeSession({
        session_id: 'session-beta-id',
        title: 'Second title',
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

    const firstRow = (await screen.findByText('First title')).closest('section')
    const secondRow = screen.getByText('Second title').closest('section')

    fireEvent.click(within(firstRow).getByRole('button', { name: /edit title/i }))
    await user.clear(within(firstRow).getByRole('textbox', { name: /session title/i }))
    await user.type(
      within(firstRow).getByRole('textbox', { name: /session title/i }),
      'Unsaved first draft',
    )
    fireEvent.click(within(secondRow).getByRole('button', { name: /edit title/i }))

    expect(api.updateSessionTitle).not.toHaveBeenCalled()
    expect(within(firstRow).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(secondRow).getByRole('textbox', { name: /session title/i })).toHaveValue(
      'Second title',
    )
  })

  test('rename interaction does not write title drafts to browser storage', async () => {
    const user = userEvent.setup()
    api.listCases.mockResolvedValue([makeCase()])
    api.listCaseSessions.mockResolvedValue([
      makeSession({
        title: 'Existing session title',
      }),
    ])
    api.updateSessionTitle.mockResolvedValue(
      makeSession({
        title: 'SYNTHETIC_RENAME_TITLE_SENTINEL',
      }),
    )

    renderWithRouter(<HistoryPage />, { initialEntries: ['/history'] })

    const caseHeading = await screen.findByText('CASE_ALPHA')
    const caseArticle = caseHeading.closest('article')
    fireEvent.click(
      within(caseArticle).getByRole('button', {
        name: /show sessions for CASE_ALPHA/i,
      }),
    )

    const sessionTitle = await screen.findByText('Existing session title')
    const sessionRow = sessionTitle.closest('section')
    fireEvent.click(within(sessionRow).getByRole('button', { name: /edit title/i }))
    const input = within(sessionRow).getByRole('textbox', { name: /session title/i })
    await user.clear(input)
    await user.type(input, 'SYNTHETIC_RENAME_DRAFT_SENTINEL')
    await user.click(within(sessionRow).getByRole('button', { name: /^save$/i }))

    await screen.findByText('SYNTHETIC_RENAME_TITLE_SENTINEL')

    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain(
      'SYNTHETIC_RENAME_DRAFT_SENTINEL',
    )
    expect(JSON.stringify(Object.entries(window.sessionStorage))).not.toContain(
      'SYNTHETIC_RENAME_TITLE_SENTINEL',
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
