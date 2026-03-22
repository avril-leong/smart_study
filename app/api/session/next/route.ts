import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { Question } from '@/types'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studySetId = request.nextUrl.searchParams.get('studySetId')
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  const practice = request.nextUrl.searchParams.get('practice') === 'true'
  const userId = user.id
  const service = createServiceRoleClient()

  // Step 1: Due for review (questions with next_review <= now)
  const { data: dueResult } = await service
    .from('question_state')
    .select('question_id, questions!inner(*)')
    .eq('user_id', userId)
    .eq('questions.study_set_id', studySetId)
    .lte('next_review', new Date().toISOString())
    .order('next_review', { ascending: true })
    .limit(1)
    .maybeSingle()

  let question: Question | null = dueResult
    ? (dueResult.questions as unknown as Question)
    : null

  if (!question) {
    // Step 2: Never attempted — get answered IDs first, then exclude them
    const { data: answered } = await service
      .from('question_state')
      .select('question_id, questions!inner(study_set_id)')
      .eq('user_id', userId)
      .eq('questions.study_set_id', studySetId)

    const answeredIds = (answered ?? []).map((s: { question_id: string }) => s.question_id)

    let newQQuery = supabase.from('questions').select('*').eq('study_set_id', studySetId)
    if (answeredIds.length > 0) {
      newQQuery = newQQuery.not('id', 'in', `(${answeredIds.join(',')})`)
    }
    const { data: newQ } = await newQQuery.limit(1).maybeSingle()
    question = newQ
  }

  // In normal mode: done when all questions have been seen at least once
  if (!question && !practice) return NextResponse.json({ done: true })

  if (!question && practice) {
    // Step 3 (practice only): serve weakest question
    const { data: weakResult } = await service
      .from('question_state')
      .select('question_id, questions!inner(*)')
      .eq('user_id', userId)
      .eq('questions.study_set_id', studySetId)
      .order('ease_factor', { ascending: true })
      .limit(1)
      .maybeSingle()

    question = weakResult ? (weakResult.questions as unknown as Question) : null
  }

  if (!question) return NextResponse.json({ done: true })
  return NextResponse.json({ question })
}
