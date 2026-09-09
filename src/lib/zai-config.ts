// تهيئة إعدادات z-ai-web-dev-sdk من متغيرات البيئة
// ضروري للنشر على Railway حيث لا يوجد ملف .z-ai-config جاهز
import fs from 'fs/promises'
import path from 'path'

let ensured = false

export async function ensureZaiConfig(): Promise<void> {
  if (ensured) return
  ensured = true

  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) return // في بيئة التطوير يوجد /etc/.z-ai-config جاهز

  const baseUrl = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1'
  const configPath = path.join(process.cwd(), '.z-ai-config')

  try {
    // تحقق إن كان الملف موجوداً وصالحاً
    const existing = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(existing)
    if (parsed.baseUrl && parsed.apiKey) return
  } catch {
    // الملف غير موجود -> أنشئه من متغيرات البيئة
  }

  const config = JSON.stringify({ baseUrl, apiKey }, null, 2)
  await fs.writeFile(configPath, config, 'utf-8')
  console.log('[zai] created .z-ai-config from environment variables')
}

export function getAIModel(): string | undefined {
  const m = process.env.AI_MODEL?.trim()
  return m && m.length > 0 ? m : 'gemma4'
}
