import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { updateSM2 } from '@/lib/spaced-repetition/sm2'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionId, answerGiven, isCorrect: clientIsCorrect, smQuality } = await request.json()
  const service = createServiceRoleClient()

  // Fetch question to validate MCQ answer server-side
  const { data: question } = await service.from('questions').select('*').eq('id', questionId).single()
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  let isCorrect = clientIsCorrect
  if (question.type === 'mcq') {
    isCorrect = question.correct_answer === answerGiven
  }

  // Append to answer_log
  await service.from('answer_log').insert({
    user_id: user.id, question_id: questionId, answer_given: answerGiven, is_correct: isCorrect,
  })

  // Get current SM-2 state
  const { data: state } = await service.from('question_state')
    .select('*').eq('user_id', user.id).eq('question_id', questionId).single()

  const sm2Result = updateSM2({
    quality: smQuality,
    easeFactor: state?.ease_factor ?? 2.5,
    interval: state?.interval ?? 1,
    repetitions: state?.repetitions ?? 0,
  })

  // Upsert SM-2 state
  await service.from('question_state').upsert({
    user_id: user.id,
    question_id: questionId,
    ease_factor: sm2Result.easeFactor,
    interval: sm2Result.interval,
    repetitions: sm2Result.repetitions,
    next_review: sm2Result.nextReview.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  // Update last_studied_at on parent study set
  await service.from('study_sets')
    .update({ last_studied_at: new Date().toISOString() })
    .eq('id', question.study_set_id)

  return NextResponse.json({ updated: true, isCorrect })
}
