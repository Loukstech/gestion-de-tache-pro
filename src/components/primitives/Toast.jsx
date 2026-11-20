import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, XCircle, X, Undo2 } from 'lucide-react'
import { uid } from '../../lib/utils.js'

const ICONS = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
}

/** File de notifications maison (aucune dépendance externe). */
export function useToaster() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast) => {
      const id = uid('toast')
      const entry = { id, tone: 'info', duration: 4200, ...toast }
      setToasts((current) => [...current.slice(-3), entry])
      if (entry.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), entry.duration),
        )
      }
      return id
    },
    [dismiss],
  )

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), [])

  const node = (
    <div className="toast-stack" role="region" aria-label="Notifications">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const ToastIcon = ICONS[toast.tone] || Info
          return (
            <motion.div
              key={toast.id}
              className="toast"
              data-tone={toast.tone}
              layout
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              role="status"
            >
              <span className="t-icon"><ToastIcon size={19} /></span>
              <div className="t-body">
                <div className="t-title">{toast.title}</div>
                {toast.description && <div className="t-desc">{toast.description}</div>}
                {toast.action && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 6, paddingLeft: 0 }}
                    onClick={() => {
                      toast.action.onClick?.()
                      dismiss(toast.id)
                    }}
                  >
                    <Undo2 size={14} /> {toast.action.label}
                  </button>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => dismiss(toast.id)} aria-label="Fermer la notification">
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )

  return { push, dismiss, node: createPortal(node, document.body) }
}
