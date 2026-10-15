import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import type { ZodType } from 'zod'
import { erroresDeCampo } from '@shared/esquemas'
import { ApiError } from './api'
import { toast } from '../components/Toasts'

/** Carga asíncrona con estado y recarga manual. */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    fn()
      .then((d) => {
        if (!vivo) return
        setData(d)
        setError(undefined)
      })
      .catch((e: Error) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, cargando, recargar, setData }
}

type Valores = Record<string, unknown>
type Cambio = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>

/**
 * Estado de formulario con validación zod en cliente (mismos esquemas que el main)
 * y errores por campo devueltos por el main.
 */
export function useFormulario<T extends Valores>(inicial: T) {
  const [valores, setValores] = useState<T>(inicial)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const set = useCallback((k: string, v: unknown) => {
    setValores((p) => ({ ...p, [k]: v }))
    setErrores((p) => {
      if (!(k in p)) return p
      const { [k]: _omit, ...resto } = p
      return resto
    })
  }, [])

  const campo = (k: keyof T & string) => ({
    name: k,
    value: (valores[k] ?? '') as string,
    onChange: (e: Cambio) => set(k, e.target.value),
    invalido: !!errores[k]
  })

  async function enviar<R>(esquema: ZodType | null, accion: (v: T) => Promise<R>): Promise<R | undefined> {
    if (esquema) {
      const r = esquema.safeParse(valores)
      if (!r.success) {
        setErrores(erroresDeCampo(r.error))
        toast.error('Revise los campos marcados')
        return undefined
      }
    }
    setEnviando(true)
    try {
      return await accion(valores)
    } catch (e) {
      if (e instanceof ApiError && e.campos) setErrores(e.campos)
      toast.error((e as Error).message)
      return undefined
    } finally {
      setEnviando(false)
    }
  }

  return { valores, setValores, set, errores, setErrores, campo, enviar, enviando }
}
