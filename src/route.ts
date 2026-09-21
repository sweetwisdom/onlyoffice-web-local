import { useEffect, useMemo, useState } from 'react'

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useMemo(
    () => (to: string) => {
      if (to === path) return
      window.history.pushState(null, '', to)
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
