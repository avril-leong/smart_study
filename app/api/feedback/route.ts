// app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getFeedback } from '@/lib/ai/get-feedback'
import { getUserAIConfig } from '@/lib/ai/get-user-ai-config'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { questionText, correctAnswer, answerGiven, isCorrect } = await request.json()
  const aiConfig = await getUserAIConfig(user.id, service)
  const feedback = await getFeedback(questionText, correctAnswer, answerGiven, isCorrect, aiConfig)
  return NextResponse.json({ feedback })
}
