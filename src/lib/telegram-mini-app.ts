'use client'

// جسر تلجرام Mini App: يكتشف أن اللعبة فُتحت داخل تلجرام (زر web_app أو زر القائمة ☰)
// ويحمّل سكربت تلجرام الرسمي للوصول إلى initData الموّقعة (دخول تلقائي دائم)

export interface TelegramWebApp {
  initData: string
  initDataUnsafe?: {
    start_param?: string
    user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }
  }
  version?: string
  platform?: string
  ready?: () => void
  expand?: () => void
  close?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  enableClosingConfirmation?: () => void
  disableVerticalSwipes?: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

const SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js'

/** يحمّل سكربت تلجرام الرسمي ويعيد WebApp إذا كانت اللعبة مفتوحة داخل تلجرام، أو null */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp)

    let settled = false
    const done = (wa: TelegramWebApp | null) => {
      if (settled) return
      settled = true
      resolve(wa)
    }

    // مهلة احتياطية حتى لا تعلق اللعبة إذا كان CDN تلجرام محجوباً
    setTimeout(() => done(window.Telegram?.WebApp || null), 3000)

    try {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => done(window.Telegram?.WebApp || null)
      s.onerror = () => done(null)
      document.head.appendChild(s)
    } catch {
      done(null)
    }
  })
}
