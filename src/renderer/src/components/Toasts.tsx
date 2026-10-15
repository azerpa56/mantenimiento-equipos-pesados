import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

type Toast = { id: number; tipo: 'ok' | 'error'; texto: string }
let lista: Toast[] = []
let seq = 0
const oyentes = new Set<(t: Toast[]) => void>()

function emitir(t: Toast[]) {
  lista = t
  oyentes.forEach((o) => o(lista))
}

function agregar(tipo: Toast['tipo'], texto: string) {
  const id = ++seq
  emitir([...lista, { id, tipo, texto }])
  setTimeout(() => emitir(lista.filter((x) => x.id !== id)), tipo === 'error' ? 6000 : 3000)
}

export const toast = {
  ok: (t: string) => agregar('ok', t),
  error: (t: string) => agregar('error', t)
}

export function Toasts() {
  const [t, setT] = useState(lista)
  useEffect(() => {
    oyentes.add(setT)
    return () => void oyentes.delete(setT)
  }, [])
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-96 flex-col gap-2 print:hidden">
      {t.map((x) => (
        <div
          key={x.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            x.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {x.tipo === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          <span>{x.texto}</span>
        </div>
      ))}
    </div>
  )
}
