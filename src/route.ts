import { useEffect, useMemo, useState } from 'react'

const APP_BASE_PATH = new URL(import.meta.env.BASE_URL || './', window.location.href).pathname
  .replace(/\/$/, '')

function currentRoute(): string {
  const pathname = window.location.pathname
  const relativePath = APP_BASE_PATH && pathname.startsWith(APP_BASE_PATH)
    ? pathname.slice(APP_BASE_PATH.length) || '/'
    : pathname
  return relativePath + window.location.search
}

function browserPath(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  return `${APP_BASE_PATH}${normalized}` || '/'
}

export function usePath() {
  const [path, setPath] = useState(currentRoute)

  useEffect(() => {
    const onPop = () => setPath(currentRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useMemo(
    () => (to: string) => {
      if (to === path) return
      window.history.pushState(null, '', browserPath(to))
      setPath(to)
    },
    [path]
  )

  return { path, navigate }
}

export function parseEditorQuery(search: string): { isNew: boolean; fileType: string } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const neu = q.get('new')
  if (neu) return { isNew: true, fileType: neu.toLowerCase() }
  const open = q.get('open')
  if (open) return { isNew: false, fileType: open.toLowerCase() }
  return null
}
