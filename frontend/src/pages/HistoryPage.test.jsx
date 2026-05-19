import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import HistoryPage from './HistoryPage.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
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

describe('HistoryPage behavior', () => {
  beforeEach(() => {
    api.listCases.mockResolvedValue([])
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
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /delete|刪除/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /session|summary|report/i })).not.toBeInTheDocument()
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
