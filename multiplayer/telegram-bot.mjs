// بوت تلجرام الرسمي لشطرنج الملوك 👑
// - تسجيل دخول تلقائي للموقع عبر روابط سحرية أحادية الاستخدام
// - إنشاء تحديات وإرسالها بأمر واحد مع روابط مباشرة للعب
// - لوحة مالك كاملة: إحصائيات، غرف نشطة، مستخدمون، بث إذاعي
// - يرد على الأوامر فقط — يتجاهل أي رسالة عادية بصمت (بدون إزعاج في المجموعات)
// - يعمل داخل server.mjs (Railway) عبر Webhook، أو Polling محلياً (TELEGRAM_POLLING=1)
import { createHash, randomBytes } from 'node:crypto'
import { coreBus } from './game-core.mjs'

const TG_API = 'https://api.telegram.org'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TC_ALIASES = {
  none: 'none', 'بدون': 'none', no: 'none',
  blitz3: 'blitz3', '3': 'blitz3', 3: 'blitz3',
  blitz5: 'blitz5', '5': 'blitz5', 5: 'blitz5',
  rapid10: 'rapid10', '10': 'rapid10', 10: 'rapid10',
}
const TC_LABEL = { none: 'بدون وقت ⏳', blitz3: 'سريع ٣ دقائق ⚡', blitz5: 'سريع ٥ دقائق ⚡', rapid10: 'سريع ١٠ دقائق 🕐' }
const REASON_AR = {
  checkmate: 'كش مات ♛', resign: 'استسلام', timeout: 'انتهاء الوقت ⏰', agreement: 'اتفاق على التعادل',
  stalemate: 'طريق مسدود', repetition: 'تكرار ثلاثي', insufficient_material: 'عدم كفاية القطع', fifty_move: 'قاعدة الخمسين نقلة',
}

const genCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function createTelegramBot({ core, prisma }) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  if (!token || !/^\d+:.+/.test(token)) {
    if (token) console.warn('[tg-bot] ⚠️ TELEGRAM_BOT_TOKEN غير صالح — البوت متوقف')
    return null
  }

  const apiBase = `${TG_API}/bot${token}`
  const webhookSecret = createHash('sha256').update(token).digest('hex').slice(0, 24)
  const webhookPath = `/telegram-webhook/${webhookSecret}`
  const ownerIds = new Set((process.env.TELEGRAM_OWNER_ID || '').split(',').map((s) => s.trim()).filter(Boolean))
  const broadcastMode = new Map() // chatId -> true (مالك يجهز رسالة بث)
  const pendingBroadcast = new Map() // chatId -> نص الرسالة
  let botUsername = ''
  let botId = 0
  let started = false

  // ============ Telegram API ============
  async function api(method, payload = {}, timeoutMs = 15000) {
    try {
      const res = await fetch(`${apiBase}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok && method !== 'getUpdates') console.warn(`[tg-bot] ${method}:`, data.description || 'فشل')
      return data
    } catch (err) {
      console.warn(`[tg-bot] ${method} خطأ:`, err?.message || err)
      return null
    }
  }

  const kb = (rows) => ({ inline_keyboard: rows })
  // أزرار تفتح اللعبة داخل تلجرام مباشرة (Mini App) — وإذا لم يكن الرابط HTTPS (تطوير محلي) ترجع لرابط خارجي
  const urlBtn = (text, url) => (typeof url === 'string' && url.startsWith('https://') ? { text, web_app: { url } } : { text, url })
  // زر يفتح في المتصفح الخارجي — مفيد للمشاركة/النسخ
  const extBtn = (text, url) => ({ text, url })
  const btn = (text, cb) => ({ text, callback_data: cb })

  function send(chatId, text, markup) {
    return api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) })
  }
  function edit(chatId, msgId, text, markup) {
    return api('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) })
  }

  function siteUrl() {
    const raw = process.env.SITE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
    return (raw || 'http://localhost:3000').replace(/\/+$/, '')
  }

  // ============ قاعدة البيانات ============
  const noDb = () => '⚠️ قاعدة البيانات غير متاحة على هذا الخادم حالياً.'

  function cleanDisplayName(raw, fallback) {
    let n = String(raw || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 20)
    return n.length >= 2 ? n : fallback
  }

  async function upsertUser(from) {
    if (!prisma) return null
    const tgId = String(from.id)
    const data = {
      username: from.username || null,
      firstName: from.first_name || null,
      lastSeenAt: new Date(),
    }
    const user = await prisma.telegramUser.upsert({
      where: { telegramId: tgId },
      update: data,
      create: {
        telegramId: tgId,
        ...data,
        displayName: cleanDisplayName(from.first_name, `لاعب ${tgId.slice(-4)}`),
        isOwner: ownerIds.has(tgId),
      },
    })
    if (ownerIds.has(tgId) && !user.isOwner) {
      return prisma.telegramUser.update({ where: { id: user.id }, data: { isOwner: true } })
    }
    return user
  }

  async function createLoginToken(telegramId, minutes = 30) {
    if (!prisma) return null
    const token = randomBytes(24).toString('base64url')
    await prisma.loginToken.create({ data: { token, telegramId, expiresAt: new Date(Date.now() + minutes * 60 * 1000) } })
    return token
  }

  async function authedOpenLink(telegramId, challengeCode = null) {
    const t = await createLoginToken(telegramId)
    if (!t) return null
    const q = challengeCode ? `challenge=${challengeCode}&auth=${t}` : `auth=${t}`
    return `${siteUrl()}/?${q}`
  }

  const isOwner = async (from) => ownerIds.has(String(from.id)) || !!(await prisma?.telegramUser.findUnique({ where: { telegramId: String(from.id) } }))?.isOwner

  // ============ نصوص الأوامر (الأوامر ظاهرة بالكامل) ============
  function commandsText(user) {
    return [
      `📜 <b>الأوامر الكاملة — مملكة الألعاب 🏰</b>`,
      ``,
      `🎮 <b>اللعب والدخول:</b>`,
      `/start — القائمة الرئيسية وتسجيل الدخول`,
      `/games — 🏰 كل ألعاب المملكة (شطرنج · XO · المزاد · المجهول)`,
      `/login — 🔑 رابط دخول فوري للموقع (تسجيل دخول تلقائي بحسابك)`,
      `/challenge — ⚔️ إنشاء تحدي وإرسال الرابط لخصمك`,
      `/challenge @user — تحدَّ مستخدمًا معيناً مباشرة`,
      `/challenge @user 3 — تحدي بوقت محدد (3 أو 5 أو 10 دقائق أو بدون)`,
      `/stats — 📊 إحصائياتك الشخصية`,
      `/top — 🏆 لوحة المتصدرين`,
      `/name — ✏️ تغيير اسمك داخل اللعبة (مثال: <code>/name الملك فهد</code>)`,
      `/myid — 🆔 عرض معرّف حسابك`,
      ``,
      `👑 <b>أوامر المالك:</b>`,
      `/panel — 🛠 لوحة المالك الكاملة (أزرار تفاعلية)`,
      `/broadcast — 📢 بث إذاعي لجميع مستخدمي البوت`,
      ``,
      `💡 الروابط تفتح اللعبة <b>داخل تلجرام مباشرة</b> مع تسجيل دخول تلقائي — بدون متصفح خارجي.\n💡 أو اضغط زر ☰ (شطرنج الملوك) أسفل شاشة المحادثة للدخول الفوري في أي وقت.`,
    ].join('\n')
  }

  const mainKb = (authLink) => kb([authLink ? [urlBtn('🎮 افتح الموقع — دخول تلقائي', authLink)] : [], [btn('⚔️ تحدَّ الآن', 'go:challenge'), btn('🔑 رابط دخول جديد', 'go:login')]].filter((r) => r.length))

  // ============ معالجة الرسائل ============
  async function sendGroupWelcome(chatId) {
    const atCmd = (c) => (botUsername ? `<code>/${c}@${esc(botUsername)}</code>` : `<code>/${c}</code>`)
    await send(
      chatId,
      `🏰 <b>مملكة الألعاب وصلت إلى المجموعة!</b>\n\n🎮 <b>الألعاب المتاحة:</b>\n♟️ شطرنج الملوك — <code>/challenge</code> لإنشاء تحدي ومشاركة الرابط\n⭕ XO — إكس أو أونلاين\n⚽ سوبر المزاد — كلاسيك ٥٠م / برو ماكس ٢٠٠م\n🃏 اللاعب المجهول — بطاقات سوداء غامضة\n🧪 <code>/ping</code> — اختبار استجابة البوت\n\n💡 <b>إذا لم يستجب البوت في المجموعة:</b>\n١ـ اكتب الأمر بصيغة ${atCmd('challenge')}\n٢ـ الأضمن: اجعل البوت <b>مشرفاً</b> أو عطّل Privacy Mode من @BotFather (‎/setprivacy ← Disable)\n\n🎮 وللدخول للمملكة في أي وقت اضغط زر ☰ أسفل الشاشة.`,
      kb([[btn('🎮 كل الألعاب', 'go:games'), btn('⚔️ تحدي شطرنج', 'go:challenge')]]),
    )
  }

  async function handleMessage(msg) {
    if (!msg?.from || msg.from.is_bot) return
    const chatId = msg.chat?.id
    if (!chatId) return

    // رسالة خدمة: أُضيف البوت إلى مجموعة — رحّب (تعمل حتى مع تفعيل Privacy Mode لأن رسائل الخدمة تصل دائماً)
    if (Array.isArray(msg.new_chat_members) && msg.new_chat_members.length) {
      if (msg.new_chat_members.some((m) => String(m?.id) === String(botId))) {
        await sendGroupWelcome(chatId).catch(() => {})
      }
      return
    }

    const text = (msg.text || msg.caption || '').trim()
    if (!text) return
    const from = msg.from

    // وضع البث الإذاعي (مالك)
    if (broadcastMode.get(chatId) && (await isOwner(from))) {
      if (text.startsWith('/cancel') || text === 'إلغاء') {
        broadcastMode.delete(chatId)
        await send(chatId, '❌ أُلغي وضع البث.')
        return
      }
      broadcastMode.delete(chatId)
      pendingBroadcast.set(chatId, text)
      await send(
        chatId,
        `📢 <b>معاينة البث الإذاعي:</b>\n\n${esc(text)}\n\n👥 سيُرسل إلى جميع مستخدمي البوت.\nهل تريد الإرسال؟`,
        kb([[btn('✅ إرسال للجميع', 'bc:yes'), btn('❌ إلغاء', 'bc:no')]]),
      )
      return
    }

    // 🔇 البوت يرد على الأوامر فقط — أي رسالة عادية (خصوصاً في المجموعات) تُتجاهل بصمت دون أي رد
    if (!text.startsWith('/')) {
      // استثناء: إن ذُكر اسم البوت صراحةً (@منشن) فهذا استدعاء مقصود — أجب بإرشاد موجز
      const isGroupChat = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup'
      if (isGroupChat && botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        await send(chatId, `👑 بوت شطرنج الملوك في خدمتك!\n⚔️ اكتب <code>/challenge</code> لإنشاء تحدي شطرنج فوراً.`)
      }
      return
    }

    const user = await upsertUser(from).catch(() => null)
    if (!prisma) { await send(chatId, noDb()); return }
    if (!user) { await send(chatId, '⚠️ تعذر الوصول لقاعدة البيانات حالياً — حاول بعد قليل.'); return }

    const parts = text.split(/\s+/)
    const cmd = parts[0].replace(/@[\w_]+$/, '').slice(1).toLowerCase()
    const args = parts.slice(1).join(' ')

    // حماية: أي استثناء في أمر لا يجب أن يسقط العملية
    try {
      await dispatchCommand(chatId, user, msg, from, cmd, args)
    } catch (err) {
      console.warn('[tg-bot] command error:', cmd, err?.message)
      await send(chatId, '⚠️ حدث خطأ أثناء تنفيذ الأمر — حاول مجدداً.').catch(() => {})
    }
  }

  async function dispatchCommand(chatId, user, msg, from, cmd, args) {
    switch (cmd) {
      case 'start':
      case 'menu': {
        const link = await authedOpenLink(user.telegramId)
        await send(
          chatId,
          `🏰 <b>أهلاً ${esc(user.displayName)} في مملكة الألعاب!</b>\n\nلعبة واحدة، أربع تجارب: شطرنج الملوك ♟️، XO ⭕، سوبر المزاد ⚽، واللاعب المجهول 🃏 — وكلها تمنحك نقاطاً ترفعك في التصنيف.\n\n${commandsText(user)}`,
          mainKb(link),
        )
        return
      }
      case 'help':
      case 'commands': {
        await send(chatId, commandsText(user), kb([[btn('⚔️ تحدَّ الآن', 'go:challenge'), btn('🔑 رابط دخول', 'go:login')]]))
        return
      }
      case 'login': {
        const link = await authedOpenLink(user.telegramId)
        if (!link) { await send(chatId, noDb()); return }
        await send(
          chatId,
          `🔑 <b>رابط الدخول التلقائي جاهز!</b>\n\nاضغط الزر بالأسفل وستُفتح اللعبة <b>داخل تلجرام مباشرة</b> مسجلاً باسمك — بدون كلمة مرور وبدون متصفح خارجي.\n💡 عند الفتح من داخل تلجرام يكون الدخول تلقائياً دائماً (الرابط احتياطي للمتصفح).\n🌱 اسمك في اللعبة: <b>${esc(user.displayName)}</b> (غيّره بـ <code>/name</code>)`,
          kb([[urlBtn('🎮 فتح الموقع وتسجيل الدخول', link)]]),
        )
        return
      }
      case 'challenge':
      case 'دوري': {
        await cmdChallenge(chatId, user, args)
        return
      }
      case 'stats': {
        await cmdStats(chatId, user)
        return
      }
      case 'top':
      case 'leaderboard': {
        await cmdTop(chatId)
        return
      }
      case 'name': {
        const newName = cleanDisplayName(args, '')
        if (!newName) {
          await send(chatId, `✏️ اكتب الاسم الجديد بعد الأمر:\n<code>/name الملك فهد</code>\n\nاسمك الحالي: <b>${esc(user.displayName)}</b>`)
          return
        }
        await prisma.telegramUser.update({ where: { id: user.id }, data: { displayName: newName } })
        await send(chatId, `✅ تم! اسمك في اللعبة الآن: <b>${esc(newName)}</b>\n\nسجّل دخولاً جديدة بـ /login ليظهر الاسم في الموقع.`)
        return
      }
      case 'myid': {
        await send(chatId, `🆔 معرّفك: <code>${user.telegramId}</code>\n👤 الاسم: <b>${esc(user.displayName)}</b>${user.username ? `\n🔗 المعرف: @${esc(user.username)}` : ''}${user.isOwner || ownerIds.has(user.telegramId) ? '\n👑 أنت مالك هذا البوت' : ''}`)
        return
      }
      case 'panel':
      case 'admin': {
        if (!(await isOwner(from))) { await send(chatId, '🚫 هذا الأمر للمالك فقط.'); return }
        await sendPanel(chatId)
        return
      }
      case 'broadcast':
      case 'بث': {
        if (!(await isOwner(from))) { await send(chatId, '🚫 هذا الأمر للمالك فقط.'); return }
        if (args) {
          pendingBroadcast.set(chatId, args)
          await send(chatId, `📢 <b>معاينة البث:</b>\n\n${esc(args)}\n\nهل تريد الإرسال للجميع؟`, kb([[btn('✅ إرسال للجميع', 'bc:yes'), btn('❌ إلغاء', 'bc:no')]]))
        } else {
          broadcastMode.set(chatId, true)
          await send(chatId, '📢 <b>وضع البث الإذاعي</b>\n\nأرسل الآن نص الرسالة التي تريد بثها لجميع المستخدمين.\nللإلغاء: <code>/cancel</code>', kb([[btn('❌ إلغاء', 'bc:no')]]))
        }
        return
      }
      case 'cancel': {
        broadcastMode.delete(chatId)
        pendingBroadcast.delete(chatId)
        await send(chatId, '✅ تم الإلغاء.')
        return
      }
      case 'games':
      case 'ألعاب':
      case 'kingdom': {
        const link = await authedOpenLink(user.telegramId)
        await send(
          chatId,
          `🏰 <b>مملكة الألعاب — ٤ ألعاب في مكان واحد!</b>\n\n♟️ <b>شطرنج الملوك</b> — ضد الوزير الذكي أو أصدقائك أونلاين\n⭕ <b>XO</b> — إكس أو سريع ضد الأصدقاء أو الذكاء الاصطناعي\n⚽ <b>سوبر المزاد</b> — راقب الكروت وزايد بالملايين: كلاسيك ٥٠ مليون · برو ماكس ٢٠٠ مليون\n🃏 <b>اللاعب المجهول</b> — بطاقة ظاهرة وبطاقة سوداء غامضة… قلبك مع مين؟\n\n🏆 اجمع النقاط وارتقِ في التصنيف من برونزي إلى ملكي!`,
          kb(link ? [[urlBtn('🎮 افتح المملكة — دخول تلقائي', link)], [btn('🏆 المتصدرون', 'go:top')]] : [[btn('🏆 المتصدرون', 'go:top')]]),
        )
        return
      }
      case 'ping': {
        const t0 = Date.now()
        const m = await api('sendMessage', { chat_id: chatId, text: '🏓 …' })
        const ms = m?.ok ? Date.now() - t0 : 0
        await edit(chatId, m?.result?.message_id, `🏓 <b>Pong!</b> البوت يستجيب بشكل طبيعي ✅\n⚡ زمن الاستجابة: <b>${ms}ms</b>\n💬 هذه المجموعة مدعومة — جرّب <code>/games</code> للترفيه!`)
        return
      }
      default: {
        // في المجموعات نتجاهل الأوامر غير المعروفة بصمت (غالباً أوامر بوتات أخرى مثل /gif) — بدون إزعاج
        const isGroup = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup'
        if (isGroup) return
        await send(chatId, `❓ أمر غير معروف: <code>${esc(cmd)}</code>\n\nاضغط /help لعرض كل الأوامر.`)
      }
    }
  }

  // ============ التحديات ============
  async function cmdChallenge(chatId, user, args) {
    let target = null
    let tc = 'none'
    for (const p of args.split(/\s+/).filter(Boolean)) {
      if (p.startsWith('@')) target = p.slice(1).toLowerCase()
      else if (TC_ALIASES[p] !== undefined) tc = TC_ALIASES[p]
      else if (TC_ALIASES[p.toLowerCase()] !== undefined) tc = TC_ALIASES[p.toLowerCase()]
    }

    let code = genCode()
    while (await prisma.challenge.findUnique({ where: { code } })) code = genCode()
    const ch = await prisma.challenge.create({
      data: { code, fromTgId: user.telegramId, fromName: user.displayName, toTgId: null, timeControl: tc, expiresAt: new Date(Date.now() + 2 * 3600 * 1000) },
    })

    const plainLink = `${siteUrl()}/?challenge=${ch.code}`
    let intro = `⚔️ <b>تحديك جاهز يا ${esc(user.displayName)}!</b>\n\n🎯 كود التحدي: <code>${ch.code}</code>\n⏱ الوقت: ${TC_LABEL[tc]}\n\n`

    if (target) {
      const t = await prisma.telegramUser.findFirst({ where: { username: target } })
      if (!t) {
        await send(chatId, `❌ لم أجد <b>@${esc(target)}</b> في سجل البوت.\n\nاطلب منه فتح البوت وإرسال <code>/start</code> أولاً، ثم أعد التحدي.\n\nرحّل رسالة الرابط أدناه له إن أردت.`)
      } else if (String(t.telegramId) === String(user.telegramId)) {
        await send(chatId, '😅 لا يمكنك تحدي نفسك! لكن يمكنك اللعب محلياً من الموقع.')
        return
      } else {
        await prisma.challenge.update({ where: { id: ch.id }, data: { toTgId: t.telegramId } })
        await send(
          t.telegramId,
          `⚔️ <b>تحدي جديد وصل!</b>\n\n👑 <b>${esc(user.displayName)}</b> يتحداك في الشطرنج!\n⏱ الوقت: ${TC_LABEL[tc]}\n\nاقبل التحدي ليرى كلٌّ منكما الرابط مباشرة:`,
          kb([[btn('⚔️ قبل التحدي!', `cacc:${ch.code}`), urlBtn('🎮 فتح الموقع', plainLink)]]),
        )
        intro += `📨 أُرسل التحدي إلى <b>@${esc(target)}</b> — سأخبرك فور قبوله! 🚀\n\n`
      }
    }

    const link = await authedOpenLink(user.telegramId, ch.code)
    const rows = []
    if (link) rows.push([urlBtn('🎮 العب الآن — دخول تلقائي', link)])
    rows.push([extBtn('🌐 رابط المشاركة (المتصفح)', plainLink)])
    await send(
      chatId,
      `${intro}🔗 <b>رابط التحدي (شاركه مع أي شخص):</b>\n${plainLink}\n\n💡 أول من يفتح الرابط ينتظر، والثاني ينضم تلقائياً وتبدأ المباراة!`,
      kb(rows),
    )
  }

  async function acceptChallenge(cb, code) {
    const chatId = cb.message?.chat?.id
    const user = await upsertUser(cb.from).catch(() => null)
    if (!prisma || !user || !chatId) return
    const ch = await prisma.challenge.findUnique({ where: { code } })
    if (!ch || ch.expiresAt < new Date()) {
      await api('answerCallbackQuery', { callback_query_id: cb.id, text: '⌛ انتهت صلاحية هذا التحدي', show_alert: true })
      return
    }
    if (String(ch.fromTgId) === String(user.telegramId)) {
      await api('answerCallbackQuery', { callback_query_id: cb.id, text: '😅 هذا تحديك أنت! افتح رابطك بالأعلى' })
      return
    }
    if (ch.status === 'started' || ch.status === 'done') {
      await api('answerCallbackQuery', { callback_query_id: cb.id, text: '✅ هذا التحدي بدأ بالفعل' })
      return
    }
    await prisma.challenge.update({ where: { id: ch.id }, data: { status: 'accepted', toTgId: user.telegramId } })
    await api('answerCallbackQuery', { callback_query_id: cb.id, text: '⚔️ قبلت التحدي! افتح الرابط' })

    const myLink = await authedOpenLink(user.telegramId, ch.code)
    await send(
      chatId,
      `⚔️ <b>قبلت تحدي ${esc(ch.fromName)}!</b>\n\n🎯 كود الغرفة: <code>${ch.code}</code>\n⏱ الوقت: ${TC_LABEL[ch.timeControl]}\n\nاضغط الزر — الموقع سيفتح <b>مسجلاً باسمك</b> وستنضم للمباراة تلقائياً:`,
      kb(myLink ? [[urlBtn('🎮 ادخل المباراة الآن', myLink)]] : [[urlBtn('🎮 فتح الموقع', `${siteUrl()}/?challenge=${ch.code}`)]]),
    )
    await send(
      ch.fromTgId,
      `🚨 <b>${esc(user.displayName)}</b> قبل تحديك!\n\n⏱ ${TC_LABEL[ch.timeControl]} · كود الغرفة: <code>${ch.code}</code>\n\nادخل الآن قبل أن يفقد صبره 😄:`,
      kb([[urlBtn('🎮 ادخل المباراة الآن', (await authedOpenLink(ch.fromTgId, ch.code)) || `${siteUrl()}/?challenge=${ch.code}`)]]),
    )
  }

  // ============ إشعارات أحداث اللعب (من coreBus) ============
  coreBus.on('room:filled', async (data) => {
    if (!prisma) return
    try {
      const ch = await prisma.challenge.findUnique({ where: { code: data.code } })
      if (!ch || ch.status === 'started' || ch.status === 'done') return
      await prisma.challenge.update({ where: { id: ch.id }, data: { status: 'started' } })
      const text = `🎮 <b>بدأت المباراة!</b>\n\n⚪ ${esc(data.white || 'الأبيض')}\n⚫ ${esc(data.black || 'الأسود')}\n⏱ ${TC_LABEL[data.timeControl] || ''}\n🎯 كود الغرفة: <code>${data.code}</code>\n\nحظاً موفقاً! ♟`
      const targets = [...new Set([ch.fromTgId, ch.toTgId].filter(Boolean))]
      for (const t of targets) await send(t, text).catch(() => {})
    } catch (err) { console.warn('[tg-bot] room:filled:', err?.message) }
  })

  coreBus.on('game:over', async (data) => {
    if (!prisma) return
    try {
      const ch = await prisma.challenge.findUnique({ where: { code: data.code } })
      if (!ch || ch.status !== 'started') return
      await prisma.challenge.update({ where: { id: ch.id }, data: { status: 'done' } })
      const resultText =
        data.result === 'draw'
          ? '🤝 انتهت المباراة <b>بالتعادل</b>!'
          : `🏆 انتهت المباراة! <b>الفائز: ${esc(data.result === 'white' ? data.white : data.black)}</b>\n💔 الخاسر: ${esc(data.result === 'white' ? data.black : data.white)}`
      const text = `${resultText}\n\n📌 السبب: ${REASON_AR[data.reason] || data.reason}\n🎯 الغرفة: <code>${data.code}</code>\n\nثأر؟ افتح الموقع واطلب مباراة ثأر من شاشة النتيجة 😎`
      const targets = [...new Set([ch.fromTgId, ch.toTgId].filter(Boolean))]
      for (const t of targets) await send(t, text).catch(() => {})
    } catch (err) { console.warn('[tg-bot] game:over:', err?.message) }
  })

  // ============ أوامر المعلومات ============
  async function cmdStats(chatId, user) {
    if (!prisma) { await send(chatId, noDb()); return }
    const [total, wins, losses, draws, onlineWins, aiWins] = await Promise.all([
      prisma.gameRecord.count({ where: { playerName: user.displayName } }),
      prisma.gameRecord.count({ where: { playerName: user.displayName, result: 'win' } }),
      prisma.gameRecord.count({ where: { playerName: user.displayName, result: 'loss' } }),
      prisma.gameRecord.count({ where: { playerName: user.displayName, result: 'draw' } }),
      prisma.gameRecord.count({ where: { playerName: user.displayName, result: 'win', mode: 'online' } }),
      prisma.gameRecord.count({ where: { playerName: user.displayName, result: 'win', mode: 'ai' } }),
    ])
    const rate = total ? Math.round((wins / total) * 100) : 0
    const bar = (n, d) => (d ? '▰'.repeat(Math.max(1, Math.round((n / d) * 10))) : '▱')
    await send(
      chatId,
      `📊 <b>إحصائيات ${esc(user.displayName)}</b>\n\n` +
        `🎮 المباريات: <b>${total}</b>\n` +
        `✅ الفوز: <b>${wins}</b> ${bar(wins, total)}\n` +
        `❌ الخسارة: <b>${losses}</b>\n` +
        `🤝 التعادل: <b>${draws}</b>\n` +
        `📈 نسبة الفوز: <b>${rate}%</b>\n\n` +
        `⚔️ انتصارات ضد لاعبين: <b>${onlineWins}</b>\n` +
        `🤖 انتصارات ضد الوزير: <b>${aiWins}</b>`,
      kb([[btn('🏆 المتصدرون', 'go:top'), btn('⚔️ تحدَّ الآن', 'go:challenge')]]),
    )
  }

  async function cmdTop(chatId) {
    if (!prisma) { await send(chatId, noDb()); return }
    const rows = await prisma.gameRecord.groupBy({
      by: ['playerName'],
      where: { mode: 'online', result: 'win' },
      _count: { _all: true },
      orderBy: { _count: { playerName: 'desc' } },
      take: 10,
    })
    if (!rows.length) { await send(chatId, '🏆 لا توجد نتائج أونلاين بعد — كن أول المتصدرين!'); return }
    const medals = ['🥇', '🥈', '🥉']
    const lines = rows.map((r, i) => `${medals[i] || `${i + 1}.`} ${esc(r.playerName)} — <b>${r._count._all}</b> فوز`)
    await send(chatId, `🏆 <b>لوحة متصدرين اللعب الأونلاين</b>\n\n${lines.join('\n')}`, kb([[btn('⚔️ تحدَّ الآن', 'go:challenge')]]))
  }

  // ============ لوحة المالك ============
  async function statsSummary() {
    if (!prisma) return null
    const [users, games, wins, onlineWins, aiWins, draws, lastUsers] = await Promise.all([
      prisma.telegramUser.count(),
      prisma.gameRecord.count(),
      prisma.gameRecord.count({ where: { result: 'win' } }),
      prisma.gameRecord.count({ where: { result: 'win', mode: 'online' } }),
      prisma.gameRecord.count({ where: { result: 'win', mode: 'ai' } }),
      prisma.gameRecord.count({ where: { result: 'draw' } }),
      prisma.telegramUser.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 5 }),
    ])
    const rooms = core?.rooms || new Map()
    let playing = 0; let waiting = 0
    for (const r of rooms.values()) {
      if (r.over) continue
      if (r.players.white && r.players.black) playing++
      else waiting++
    }
    return { users, games, wins, onlineWins, aiWins, draws, lastUsers, rooms: rooms.size, playing, waiting, uptime: process.uptime(), rss: process.memoryUsage().rss }
  }

  function panelText(s) {
    const fmtUptime = () => {
      const h = Math.floor(s.uptime / 3600); const m = Math.floor((s.uptime % 3600) / 60)
      return `${h}س ${m}د`
    }
    return [
      `👑 <b>لوحة المالك — شطرنج الملوك</b>`,
      ``,
      `👥 مستخدمو البوت: <b>${s.users}</b>`,
      `🎮 إجمالي المباريات المسجلة: <b>${s.games}</b>`,
      `✅ انتصارات: <b>${s.wins}</b> (أونلاين ${s.onlineWins} · ضد الوزير ${s.aiWins})`,
      `🤝 تعادلات: <b>${s.draws}</b>`,
      ``,
      `🟢 الغرف الآن: <b>${s.rooms}</b> — جارٍ اللعب: <b>${s.playing}</b> · انتظار: <b>${s.waiting}</b>`,
      `⏱ زمن التشغيل: <b>${fmtUptime()}</b> · الذاكرة: <b>${Math.round(s.rss / 1048576)}MB</b>`,
      ``,
      `🆕 آخر ${s.lastUsers.length} مستخدمين:`,
      s.lastUsers.map((u) => `• ${esc(u.displayName)}${u.username ? ` (@${esc(u.username)})` : ''} — ${u.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')}`).join('\n') || '—',
    ].join('\n')
  }

  const panelKb = () =>
    kb([
      [btn('📊 إحصائيات شاملة', 'p:stats'), btn('🟢 الغرف النشطة', 'p:rooms')],
      [btn('👥 مستخدمو البوت', 'p:users'), btn('🎮 آخر المباريات', 'p:games')],
      [btn('🏆 المتصدرون', 'p:top'), btn('📢 بث إذاعي', 'p:bcast')],
      [btn('🔄 تحديث اللوحة', 'p:home')],
    ])

  async function sendPanel(chatId, msgId = null) {
    const s = await statsSummary()
    if (!s) { await send(chatId, noDb()); return }
    if (msgId) await edit(chatId, msgId, panelText(s), panelKb())
    else await send(chatId, panelText(s), panelKb())
  }

  async function broadcastAll(chatId, text) {
    if (!prisma) { await send(chatId, noDb()); return }
    const users = await prisma.telegramUser.findMany({ select: { telegramId: true } })
    let ok = 0; let fail = 0
    for (const u of users) {
      const r = await api('sendMessage', { chat_id: u.telegramId, text, parse_mode: 'HTML', disable_web_page_preview: true }, 10000)
      if (r?.ok) ok++; else fail++
      await sleep(60) // احترام حدود الإرسال
    }
    await send(chatId, `✅ اكتمل البث!\n\n📬 وصل إلى: <b>${ok}</b>\n🚫 فشل: <b>${fail}</b>`)
  }

  // ============ معالجة الأزرار ============
  async function handleCallback(cb) {
    const data = cb.data || ''
    const chatId = cb.message?.chat?.id
    const from = cb.from
    try {
      if (data.startsWith('cacc:')) {
        await acceptChallenge(cb, data.slice(5))
        return
      }
      if (!chatId) { await api('answerCallbackQuery', { callback_query_id: cb.id }); return }
      const owner = await isOwner(from)
      if (data.startsWith('p:')) {
        if (!owner) { await api('answerCallbackQuery', { callback_query_id: cb.id, text: '🚫 للمالك فقط', show_alert: true }); return }
        if (data === 'p:home') { await api('answerCallbackQuery', { callback_query_id: cb.id }); await sendPanel(chatId, cb.message?.message_id); return }
        if (data === 'p:stats') {
          const s = await statsSummary()
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          if (s) {
            await send(
              chatId,
              `📊 <b>إحصائيات شاملة</b>\n\n👥 مستخدمو البوت: <b>${s.users}</b>\n🎮 المباريات: <b>${s.games}</b>\n✅ انتصارات: <b>${s.wins}</b>\n⚔️ أونلاين: <b>${s.onlineWins}</b> · 🤖 ضد الوزير: <b>${s.aiWins}</b>\n🤝 تعادلات: <b>${s.draws}</b>\n🟢 غرف نشطة: <b>${s.rooms}</b> (لعب ${s.playing} · انتظار ${s.waiting})\n💾 الذاكرة: <b>${Math.round(s.rss / 1048576)}MB</b>`,
              panelKb(),
            )
          }
          return
        }
        if (data === 'p:rooms') {
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          const rooms = core?.rooms || new Map()
          if (!rooms.size) { await send(chatId, '🟢 لا توجد غرف مفتوحة الآن.', panelKb()); return }
          const lines = [...rooms.values()].slice(0, 15).map((r) => {
            const state = r.over ? '🏁 انتهت' : r.players.white && r.players.black ? '🎮 جارية' : '⏳ انتظار'
            return `• <code>${r.code}</code> — ${state} — ⚪ ${esc(r.players.white?.name || '—')} · ⚫ ${esc(r.players.black?.name || '—')}`
          })
          await send(chatId, `🟢 <b>الغرف النشطة (${rooms.size})</b>\n\n${lines.join('\n')}`, panelKb())
          return
        }
        if (data === 'p:users') {
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          const [total, list] = await Promise.all([
            prisma.telegramUser.count(),
            prisma.telegramUser.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 15 }),
          ])
          const lines = list.map((u) => `• ${esc(u.displayName)}${u.username ? ` (@${esc(u.username)})` : ''} — <code>${u.telegramId}</code>${u.isOwner ? ' 👑' : ''}`)
          await send(chatId, `👥 <b>مستخدمو البوت (${total})</b>\n\n${lines.join('\n') || 'لا يوجد بعد'}`, panelKb())
          return
        }
        if (data === 'p:games') {
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          const games = await prisma.gameRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 12 })
          const modeAr = { ai: '🤖', online: '⚔️', local: '🏠' }
          const lines = games.map((g) => `• ${modeAr[g.mode] || '🎮'} ${esc(g.playerName)} ${g.result === 'win' ? '✅' : g.result === 'loss' ? '❌' : '🤝'} ضد ${esc(g.opponent || '—')} (${g.moves} نقلة)`)
          await send(chatId, `🎮 <b>آخر المباريات المسجلة</b>\n\n${lines.join('\n') || 'لا مباريات بعد'}`, panelKb())
          return
        }
        if (data === 'p:top') {
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          await cmdTop(chatId)
          return
        }
        if (data === 'p:bcast') {
          await api('answerCallbackQuery', { callback_query_id: cb.id })
          broadcastMode.set(chatId, true)
          await send(chatId, '📢 <b>وضع البث الإذاعي</b>\n\nأرسل نص الرسالة الآن، أو <code>/cancel</code> للإلغاء.', kb([[btn('❌ إلغاء', 'bc:no')]]))
          return
        }
      }
      if (data === 'bc:yes' || data === 'bc:no') {
        if (!owner) { await api('answerCallbackQuery', { callback_query_id: cb.id, text: '🚫 للمالك فقط', show_alert: true }); return }
        const text = pendingBroadcast.get(chatId)
        pendingBroadcast.delete(chatId)
        broadcastMode.delete(chatId)
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        if (data === 'bc:no' || !text) { await edit(chatId, cb.message?.message_id, '❌ أُلغي البث.'); return }
        await edit(chatId, cb.message?.message_id, `📨 جارٍ البث إلى جميع المستخدمين…`)
        await broadcastAll(chatId, text)
        return
      }
      if (data === 'go:challenge') {
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        const at = botUsername && (cb.message?.chat?.type === 'group' || cb.message?.chat?.type === 'supergroup') ? `\n\n💡 أنت في مجموعة — الأضمن أن تكتب: <code>/challenge@${esc(botUsername)}</code>` : ''
        await send(chatId, `⚔️ اختر وقت المباراة ثم أرسل الأمر:\n\n<code>/challenge</code> — بدون وقت\n<code>/challenge 3</code> — سريع ٣ دقائق\n<code>/challenge 5</code> — سريع ٥ دقائق\n<code>/challenge 10</code> — ١٠ دقائق\n<code>/challenge @user 3</code> — تحدي مستخدم معين${at}`)
        return
      }
      if (data === 'go:open') {
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        const u = await upsertUser(from).catch(() => null)
        const link = u ? await authedOpenLink(u.telegramId) : null
        await send(chatId, link ? '🎮 اللعبة داخل تلجرام مباشرة:' : '🎮 افتح اللعبة من زر ☰ أسفل الشاشة.', link ? kb([[urlBtn('▶️ فتح اللعبة الآن', link)]]) : undefined)
        return
      }
      if (data === 'go:login') {
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        const user = await upsertUser(from).catch(() => null)
        if (!user) { await send(chatId, noDb()); return }
        const link = await authedOpenLink(user.telegramId)
        if (!link) { await send(chatId, noDb()); return }
        await send(chatId, `🔑 رابط دخول جديد (صالح ٣٠ دقيقة):`, kb([[urlBtn('🎮 فتح الموقع — دخول تلقائي', link)]]))
        return
      }
      if (data === 'go:top') {
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        await cmdTop(chatId)
        return
      }
      if (data === 'go:games') {
        await api('answerCallbackQuery', { callback_query_id: cb.id })
        const u = await upsertUser(from).catch(() => null)
        const link = u ? await authedOpenLink(u.telegramId) : null
        await send(
          chatId,
          `🏰 <b>مملكة الألعاب — ٤ ألعاب في مكان واحد!</b>\n\n♟️ <b>شطرنج الملوك</b> · ⭕ <b>XO</b>\n⚽ <b>سوبر المزاد</b> (كلاسيك/برو ماكس) · 🃏 <b>اللاعب المجهول</b>\n\n🏆 اجمع النقاط وارتقِ في التصنيف!`,
          kb(link ? [[urlBtn('🎮 افتح المملكة الآن', link)], [btn('⚔️ تحدي شطرنج', 'go:challenge')]] : [[btn('⚔️ تحدي شطرنج', 'go:challenge')]]),
        )
        return
      }
      await api('answerCallbackQuery', { callback_query_id: cb.id })
    } catch (err) {
      console.warn('[tg-bot] callback:', err?.message)
      await api('answerCallbackQuery', { callback_query_id: cb.id, text: 'حدث خطأ، حاول مجدداً' }).catch(() => {})
    }
  }

  // ============ التحديثات ============
  // ترحيب عند إضافة البوت إلى مجموعة (my_chat_member — يصل حتى مع Privacy Mode)
  async function handleMyChatMember(mcm) {
    try {
      const chat = mcm?.chat
      if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return
      const oldStatus = mcm.old_chat_member?.status
      const newStatus = mcm.new_chat_member?.status
      const isMe = String(mcm.new_chat_member?.user?.id || '') === String(botId)
      if (isMe && ['left', 'kicked'].includes(oldStatus) && ['member', 'administrator'].includes(newStatus)) {
        await sendGroupWelcome(chat.id)
      }
    } catch (err) { console.warn('[tg-bot] my_chat_member:', err?.message) }
  }

  async function handleUpdate(update) {
    // حماية كاملة: أي استثناء في تحديث واحد لا يجب أن يسقط العملية أو يوقف بقية التحديثات
    try {
      if (update.message) await handleMessage(update.message)
      else if (update.callback_query) await handleCallback(update.callback_query)
      else if (update.my_chat_member) await handleMyChatMember(update.my_chat_member)
    } catch (err) {
      console.warn('[tg-bot] ⚠️ استثناء في تحديث — تجاهل آمن:', err?.stack || err?.message || err)
    }
  }

  function handleWebhook(req, res) {
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 1e6) req.destroy()
    })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      try {
        const update = JSON.parse(body)
        void handleUpdate(update)
      } catch (err) {
        console.warn('[tg-bot] webhook parse:', err?.message)
      }
    })
  }

  // ============ بدء التشغيل ============
  async function start() {
    if (started) return true
    const meRes = await api('getMe')
    if (!meRes?.ok) {
      console.warn('[tg-bot] ❌ getMe فشل — تحقق من TELEGRAM_BOT_TOKEN')
      return false
    }
    botUsername = meRes.result.username
    botId = meRes.result.id
    started = true
    console.log(`[tg-bot] ✅ متصل باسم @${botUsername}`)

    await api('setMyCommands', {
      commands: [
        { command: 'start', description: '👑 القائمة الرئيسية وتسجيل الدخول' },
        { command: 'login', description: '🔑 رابط دخول تلقائي للموقع' },
        { command: 'challenge', description: '⚔️ إنشاء تحدي وإرسال الرابط' },
        { command: 'stats', description: '📊 إحصائياتك الشخصية' },
        { command: 'top', description: '🏆 لوحة المتصدرين' },
        { command: 'name', description: '✏️ تغيير اسمك في اللعبة' },
        { command: 'myid', description: '🆔 معرّف حسابك في تلجرام' },
        { command: 'help', description: '📖 دليل الأوامر الكامل' },
        { command: 'panel', description: '🛠 لوحة المالك (للمالك فقط)' },
        { command: 'broadcast', description: '📢 بث إذاعي (للمالك فقط)' },
      ],
    })

    // قائمة أوامر مختصرة داخل المجموعات (تظهر عند كتابة / في المجموعة)
    await api('setMyCommands', {
      scope: { type: 'all_group_chats' },
      commands: [
        { command: 'challenge', description: '⚔️ إنشاء تحدي شطرنج' },
        { command: 'start', description: '👑 قائمة شطرنج الملوك' },
        { command: 'stats', description: '📊 إحصائياتك' },
        { command: 'help', description: '📖 دليل الأوامر' },
      ],
    })

    // زر قائمة البوت (☰) يفتح اللعبة داخل تلجرام مباشرة كتطبيق مصغر (Mini App)
    if (siteUrl().startsWith('https://')) {
      const mb = await api('setChatMenuButton', {
        menu_button: { type: 'web_app', text: '🎮 شطرنج الملوك', web_app: { url: siteUrl() } },
      })
      console.log(mb?.ok ? '[tg-bot] ✅ زر القائمة ☰ يفتح اللعبة داخل تلجرام (Mini App)' : '[tg-bot] ⚠️ فشل ضبط زر القائمة')
    }

    const publicBase = process.env.SITE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
    const ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member']
    if (process.env.TELEGRAM_POLLING === '1') {
      console.log('[tg-bot] 🔄 وضع Polling المحلي مفعّل')
      void pollingLoop()
    } else if (publicBase) {
      const hookUrl = `${publicBase.replace(/\/+$/, '')}${webhookPath}`
      const r = await api('setWebhook', { url: hookUrl, allowed_updates: ALLOWED_UPDATES, drop_pending_updates: false })
      console.log(r?.ok ? `[tg-bot] ✅ Webhook مفعّل: ${hookUrl}` : '[tg-bot] ⚠️ فشل تفعيل Webhook')
    } else {
      console.log('[tg-bot] ℹ️ لا يوجد SITE_URL/RAILWAY_PUBLIC_DOMAIN — لن يُفعَّل Webhook (استخدم TELEGRAM_POLLING=1 محلياً)')
    }
    return true
  }

  async function pollingLoop() {
    let offset = 0
    for (;;) {
      const res = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query', 'my_chat_member'] }, 35000)
      if (res?.ok) {
        for (const u of res.result) {
          offset = u.update_id + 1
          void handleUpdate(u)
        }
      } else {
        await sleep(3000)
      }
    }
  }

  return { start, handleWebhook, handleUpdate, webhookPath, get botUsername() { return botUsername } }
}
