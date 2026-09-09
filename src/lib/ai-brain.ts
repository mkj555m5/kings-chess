// دماغ الذكاء الاصطناعي "الوزير" - يعمل على الخادم فقط
// يجمع بين محرك minimax المحلي (لضمان حركات قانونية قوية)
// ونموذج gemma4 عبر Ollama API (لاختيار النقلة الاستراتيجية وتوليد التعليقات)
import { Chess } from 'chess.js'
import { AI_MODEL, isOllamaConfigured, OLLAMA_API_KEY, OLLAMA_BASE_URL } from './ollama-config'
import { getRankedMoves, quickEval, type RankedMove } from './chess-engine'
import {
  AI_CAPTURE_COMMENTS,
  AI_CHECK_COMMENTS,
  AI_DRAW_COMMENTS,
  AI_LOSE_COMMENTS,
  AI_MOVE_COMMENTS,
  AI_PLAYER_BLUNDER,
  AI_PRAISE_PLAYER,
  AI_WIN_COMMENTS,
  OPENING_COMMENTS,
  pickFrom,
} from './fallback-comments'
import type { Difficulty, PieceColor } from './game-types'

const ENGINE_DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }

const PERSONA = `أنت "الوزير": لاعب شطرنج افتراضي واثق وبارع اللسان، تتحدث بالعربية الفصحى المبسطة بأسلوب ممتع وطموح.
قواعدك في الكلام:
- تعليقاتك قصيرة جداً: جملة واحدة إلى جملتين (لا تتجاوز 20 كلمة).
- لا تستخدم أي إيموجي أو رموز.
- لا تذكر كلمة FEN أو JSON أو مصطلحات برمجية.
- تتحدث مباشرة إلى الخصم بلطف متغطرس طريف.
- تذكر قيمة النقلة (أكل، كش، تهديد، تطوير) بلغة شطرنجية جميلة.`

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), ms)),
  ])
}

// استدعاء نموذج gemma4 عبر Ollama API (سحابي أو محلي حسب OLLAMA_BASE_URL)
async function callLLM(system: string, user: string, timeoutMs = 9000): Promise<string | null> {
  if (!isOllamaConfigured()) {
    console.error('[ai-brain] OLLAMA_API_KEY غير مضبوط - سيتم استخدام التعليقات الاحتياطية')
    return null
  }
  try {
    const res = await withTimeout(
      fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OLLAMA_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          stream: false,
          options: { temperature: 0.85, num_predict: 150 },
        }),
      }),
      timeoutMs,
    )
    if (!res.ok) {
      console.error('[ai-brain] Ollama HTTP error:', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const data = (await res.json()) as { message?: { content?: string } }
    const content = data?.message?.content
    return content && content.trim().length > 0 ? content.trim() : null
  } catch (e) {
    console.error('[ai-brain] LLM call failed:', e instanceof Error ? e.message : e)
    return null
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

export function shouldAICommentOnOwnMove(opts: {
  isCapture: boolean
  isCheck: boolean
  isMate: boolean
  moveNumber: number
}): boolean {
  if (opts.isMate) return true
  let p = 0.55
  if (opts.isCapture) p += 0.25
  if (opts.isCheck) p += 0.2
  if (opts.moveNumber <= 2) p = Math.min(p, 0.5)
  return Math.random() < p
}

export function shouldAIReactToPlayer(opts: {
  isCapture: boolean
  isCheck: boolean
  isMate: boolean
  evalSwingCp: number
}): boolean {
  if (opts.isMate) return true
  let p = 0.35
  if (opts.isCapture) p += 0.15
  if (opts.isCheck) p += 0.15
  if (opts.evalSwingCp > 250) p += 0.3 // خطأ من اللاعب
  if (opts.evalSwingCp < -250) p += 0.25 // نقلة قوية من اللاعب
  return Math.random() < Math.min(p, 0.9)
}

interface AIChoiceResult {
  move: RankedMove
  comment: string | null
  source: 'llm' | 'engine'
}

function pickEngineMove(ranked: RankedMove[], difficulty: Difficulty): RankedMove {
  if (ranked.length === 0) throw new Error('no moves')
  if (difficulty === 'easy') {
    // المبتدئ: عشوائي بين أفضل الحركات (يخطئ أحياناً)
    const pool = ranked.slice(0, Math.min(6, ranked.length))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  if (difficulty === 'medium' && Math.random() < 0.15) {
    const pool = ranked.slice(0, Math.min(3, ranked.length))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return ranked[0]
}

// اختيار نقلة الذكاء الاصطناعي مع تعليق محتمل
export async function getAIMoveWithComment(params: {
  fen: string
  difficulty: Difficulty
  historySan: string[]
  playerColor: PieceColor
  playerName: string
  moveNumber: number
}): Promise<AIChoiceResult> {
  const { fen, difficulty } = params
  const depth = ENGINE_DEPTH[difficulty]
  const ranked = getRankedMoves(fen, depth, 5, {
    maxNodes: difficulty === 'hard' ? 160000 : 90000,
    deadlineMs: difficulty === 'hard' ? 3000 : 1800,
  })
  if (ranked.length === 0) throw new Error('no legal moves')

  const enginePick = pickEngineMove(ranked, difficulty)
  const chess = new Chess(fen)
  const engineMove = chess.move({ from: enginePick.from, to: enginePick.to, promotion: enginePick.promotion })
  const isCapture = !!engineMove.captured
  const isCheck = engineMove.san.includes('+')
  const isMate = engineMove.san.includes('#')
  chess.undo()

  const wantComment = shouldAICommentOnOwnMove({ isCapture, isCheck, isMate, moveNumber: params.moveNumber })

  // المبتدئ لا يستخدم النموذج للاختيار
  const useLLMChoice = difficulty !== 'easy'
  let move = enginePick
  let comment: string | null = null
  let source: 'llm' | 'engine' = 'engine'

  if (useLLMChoice) {
    const candidates = ranked.slice(0, difficulty === 'hard' ? 2 : 3)
    const historyLine = params.historySan.slice(-8).join(' ')
    const prompt = `الوضعية الحالية (FEN): ${fen}
أنت تلعب بالـ ${fen.split(' ')[1] === 'w' ? 'الأبيض' : 'الأسود'}.
آخر النقلات: ${historyLine || 'بداية المباراة'}
الخصم: ${params.playerName}
النقلة رقم ${params.moveNumber} لك.

الحركات المرشحة من محرك التحليل (الأفضل أولاً):
${candidates.map((c, i) => `${i + 1}. ${c.san}`).join('\n')}

اختر أفضل نقلة استراتيجياً من القائمة أعلاه فقط.
${wantComment ? 'ثم اكتب تعليقاً قصيراً جداً على نقلتك بأسلوبك.' : 'لا تكتب أي تعليق، اجعل حقل التعليق فارغاً.'}

أجب بصيغة JSON فقط:
{"move": "<النقلة بالرمز مثل Nf3>", "comment": "<تعليق قصير أو فارغ>"}`

    const raw = await callLLM(PERSONA, prompt)
    if (raw) {
      const parsed = extractJson(raw)
      const chosenSan = typeof parsed?.move === 'string' ? (parsed.move as string).trim() : ''
      const match = candidates.find((c) => c.san === chosenSan) || candidates.find((c) => c.san.replace(/[+#]/g, '') === chosenSan.replace(/[+#]/g, ''))
      // نقبل اختيار النموذج فقط إذا كان قريباً من الأفضل بلا أكثر من 60 سنتيبون
      const bestScore = candidates[0].score
      if (match && match.score >= bestScore - 60) {
        move = match
        source = 'llm'
      }
      if (wantComment && typeof parsed?.comment === 'string' && parsed.comment.trim().length > 1) {
        comment = parsed.comment.trim().slice(0, 180)
      }
    }
  }

  if (!comment && wantComment) {
    comment = fallbackOwnMoveComment(isMate, isCheck, isCapture, params.moveNumber)
  }
  if (isMate) {
    comment = pickFrom(AI_WIN_COMMENTS)
  }

  return { move, comment, source }
}

function fallbackOwnMoveComment(isMate: boolean, isCheck: boolean, isCapture: boolean, moveNumber: number): string {
  if (isMate) return pickFrom(AI_WIN_COMMENTS)
  if (isCheck) return pickFrom(AI_CHECK_COMMENTS)
  if (isCapture) return pickFrom(AI_CAPTURE_COMMENTS)
  if (moveNumber <= 2) return pickFrom(OPENING_COMMENTS)
  return pickFrom(AI_MOVE_COMMENTS)
}

// تعليق على نقلة اللاعب
export async function getPlayerMoveReaction(params: {
  fenBefore: string
  fenAfter: string
  san: string
  playerColor: PieceColor
  playerName: string
  isCapture: boolean
  isCheck: boolean
  isMate: boolean
  evalSwingCp: number // موجب = تحسن وضع الذكاء الاصطناعي (خطأ من اللاعب)
}): Promise<string | null> {
  let category: 'blunder' | 'praise' | 'capture' | 'check' | 'mate' | 'generic' = 'generic'
  if (params.isMate) category = 'mate'
  else if (params.evalSwingCp > 250) category = 'blunder'
  else if (params.evalSwingCp < -220) category = 'praise'
  else if (params.isCapture) category = 'capture'
  else if (params.isCheck) category = 'check'

  const raw = await callLLM(
    PERSONA,
    `الخصم ${params.playerName} (يلعب بالـ ${params.playerColor === 'w' ? 'الأبيض' : 'الأسود'}) لعب للتو النقلة: ${params.san}
الوضعية قبله (FEN): ${params.fenBefore}
الوضعية بعده (FEN): ${params.fenAfter}
${params.isCapture ? '- هذه النقلة أكلت إحدى قطعك.' : ''}
${params.isCheck ? '- هذه النقلة كشت ملكك.' : ''}
${category === 'blunder' ? '- تحليل المحرك يقول إن هذه النقلة خطأ كبير من الخصم.' : ''}
${category === 'praise' ? '- تحليل المحرك يقول إن هذه نقلة قوية جداً من الخصم.' : ''}
${params.isMate ? '- هذه النقلة كش مات! الخصم فاز بالمباراة.' : ''}

علّق على نقلة الخصم بجملة أو جملتين قصيرتين بأسلوبك، بدون JSON، النص فقط.`,
    6000,
  )

  if (raw) {
    const cleaned = raw.replace(/```[a-z]*]/gi, '').replace(/```/g, '').trim()
    if (cleaned.length > 1) return cleaned.slice(0, 200)
  }

  // بدائل احتياطية
  if (category === 'mate') return pickFrom(AI_LOSE_COMMENTS)
  if (category === 'blunder') return pickFrom(AI_PLAYER_BLUNDER)
  if (category === 'praise') return pickFrom(AI_PRAISE_PLAYER)
  if (category === 'capture') return pickFrom(AI_CAPTURE_COMMENTS).replace('شكراً على الهدية', 'أيها اللص، أعدها')
  if (category === 'check') return 'كش عليّ؟ حسناً… أحسنتم، سأتحرك بعناية هذه المرة.'
  return pickFrom(AI_MOVE_COMMENTS)
}

// تعليق نهاية المباراة (يفوز الذكاء الاصطناعي أو يخسر أو تعادل)
export function getGameOverComment(result: 'ai_win' | 'ai_loss' | 'draw'): string {
  if (result === 'ai_win') return pickFrom(AI_WIN_COMMENTS)
  if (result === 'ai_loss') return pickFrom(AI_LOSE_COMMENTS)
  return pickFrom(AI_DRAW_COMMENTS)
}

export { quickEval }
