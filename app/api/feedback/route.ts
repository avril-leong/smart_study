import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFeedback } from '@/lib/ai/get-feedback'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionText, correctAnswer, answerGiven, isCorrect } = await request.json()
  const feedback = await getFeedback(questionText, correctAnswer, answerGiven, isCorrect)
  return NextResponse.json({ feedback })
}
