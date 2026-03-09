import { useEffect, useState } from 'react'

const LOG_FILES = [
  { label: 'Node Server', path: '/logs/node-server.out.log' },
  { label: 'Node Server Errors', path: '/logs/node-server.err.log' },
  { label: 'Vite Client', path: '/logs/vite-client.out.log' },
  { label: 'Vite Client Errors', path: '/logs/vite-client.err.log' },
  { label: 'Python API', path: '/logs/python-api.out.log' },
  { label: 'Python API Errors', path: '/logs/python-api.err.log' },
]

function LogsOverlay({ isOpen, onClose }) {
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    setError('')
    Promise.all(
      LOG_FILES.map(async (file) => {
        try {
          const res = await fetch(file.path)
          if (!res.ok) throw new Error(`Failed to fetch ${file.label}`)
          const text = await res.text()
          return { ...file, content: text }
        } catch (err) {
          return { ...file, content: `Error: ${err.message}` }
        }
      })
    )
      .then(setLogs)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          aria-label="Close logs overlay"
        >
          X
        </button>
        <div className="mb-4 pr-10">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Logs</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-100">Server & Client Logs</h3>
        </div>
        {isLoading ? <p className="text-sm text-slate-300">Loading logs...</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <div className="max-h-[62vh] space-y-6 overflow-y-auto pr-1">
          {logs.map((log) => (
            <section key={log.label} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h4 className="mb-2 text-sm font-semibold text-sky-400">{log.label}</h4>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-slate-200 bg-slate-900 p-2 rounded-md border border-slate-800">
                {log.content ? log.content.slice(-4000) : 'No log data.'}
              </pre>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LogsOverlay
