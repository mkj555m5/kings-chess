import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// معلومات تحدي (من بوت تلجرام) لعرضها في الموقع قبل الانضمام
// GET /api/telegram/challenge?code=XXXXX
export async function GET(req: NextRequest) {
  if (process.env.CF_DEPLOY === '1') {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 })
  }
  try {
    const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase().slice(0, 5)
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
    }

    const ch = await db.challenge.findUnique({ where: { code } })
    if (!ch) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    }
    if (ch.expiresAt < new Date()) {
      return NextResponse.json({ ok: true, challenge: { code: ch.code, fromName: ch.fromName, timeControl: ch.timeControl, status: 'expired' } })
    }

    return NextResponse.json({
      ok: true,
      challenge: {
        code: ch.code,
        fromName: ch.fromName,
        timeControl: ch.timeControl,
        status: ch.status, // pending | accepted | started | done
      },
    })
  } catch (err) {
    console.error('[telegram/challenge]', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
