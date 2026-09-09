// إعدادات الاتصال بنموذج gemma4 عبر Ollama API
// يعمل على الخادم فقط - المفتاح يُدار عبر متغيرات البيئة لأمان النشر على Railway

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/+$/, '')

export const OLLAMA_API_KEY = (process.env.OLLAMA_API_KEY || '').trim()

export const AI_MODEL = (process.env.AI_MODEL || 'gemma4').trim()

export function isOllamaConfigured(): boolean {
  return OLLAMA_API_KEY.length > 0
}
