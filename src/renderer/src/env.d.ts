/// <reference types="vite/client" />
import type { Puente } from '../../preload'

declare global {
  interface Window {
    puente: Puente
  }
}
