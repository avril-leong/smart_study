import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { studySetId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  const { data: studySet } = await service
    .from('study_sets')
    .select('id, user_id, name')
    .eq('id', params.studySetId)
    .single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: questions } = await service
    .from('questions')
    .select('id, question_text, type, correct_answer')
    .eq('study_set_id', params.studySetId)

  if (!questions || questions.length === 0) {
    return NextResponse.json({
      studySetName: studySet.name,
      questions: [],
      overall: { total_attempts: 0, correct_count: 0, accuracy: 0, questions_attempted: 0, total_questions: 0 },
    })
  }

  const questionIds = questions.map(q => q.id)

  const { data: logs } = await service
    .from('answer_log')
    .select('question_id, answer_given, is_correct, answered_at')
    .eq('user_id', user.id)
    .in('question_id', questionIds)
    .order('answered_at', { ascending: false })

  // Group logs by question
  const logsByQuestion: Record<string, { answer_given: string; is_correct: boolean; answered_at: string }[]> = {}
  for (const log of (logs ?? [])) {
    if (!logsByQuestion[log.question_id]) logsByQuestion[log.question_id] = []
    logsByQuestion[log.question_id].push(log)
  }

  const questionStats = questions.map(q => {
    const qLogs = logsByQuestion[q.id] ?? []
    const total = qLogs.length
    const correct = qLogs.filter(l => l.is_correct).length
    return {
      id: q.id,
      question_text: q.question_text,
      type: q.type,
      correct_answer: q.correct_answer,
      total_attempts: total,
      correct_count: correct,
      accuracy: total > 0 ? correct / total : 0,
      last_answered_at: qLogs[0]?.answered_at ?? null,
      recent_answers: qLogs.slice(0, 5).map(l => ({
        answer_given: l.answer_given,
        is_correct: l.is_correct,
        answered_at: l.answered_at,
      })),
    }
  })

  const allLogs = logs ?? []
  const totalAttempts = allLogs.length
  const correctCount = allLogs.filter(l => l.is_correct).length

  return NextResponse.json({
    studySetName: studySet.name,
    questions: questionStats,
    overall: {
      total_attempts: totalAttempts,
      correct_count: correctCount,
      accuracy: totalAttempts > 0 ? correctCount / totalAttempts : 0,
      questions_attempted: questionStats.filter(q => q.total_attempts > 0).length,
      total_questions: questions.length,
    },
  })
}
