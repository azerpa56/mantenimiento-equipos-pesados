import type { Api } from '../../../main/ipc'

export class ApiError extends Error {
  constructor(
    mensaje: string,
    public campos?: Record<string, string>
  ) {
    super(mensaje)
  }
}

type Respuesta = { ok: true; data: unknown } | { ok: false; error: string; campos?: Record<string, string> }

/** api.modulo.funcion(arg) -> IPC "modulo.funcion". Lanza ApiError si el main responde ok:false. */
export const api = new Proxy({} as Api, {
  get: (_, modulo: string) =>
    new Proxy(
      {},
      {
        get: (_, funcion: string) => async (arg?: unknown) => {
          const r = (await window.puente.invocar(`${modulo}.${funcion}`, arg)) as Respuesta
          if (!r.ok) throw new ApiError(r.error, r.campos)
          return r.data
        }
      }
    )
})
