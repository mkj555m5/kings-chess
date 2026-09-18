// إعداد OpenNext لنشر Next.js على Cloudflare Workers
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({
  // لا نستخدم ذاكرة تخزين مؤقتة موزعة - اللعبة ديناميكية بالكامل
})
