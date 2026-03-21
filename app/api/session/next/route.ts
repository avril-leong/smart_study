import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studySetId = request.nextUrl.searchParams.get('studySetId')
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  const userId = user.id

  // 1. Due for review
  const { data: rpcResult } = await supabase.rpc('get_next_question_due', { p_study_set_id: studySetId, p_user_id: userId })
  let question = Array.isArray(rpcResult) ? (rpcResult[0] ?? null) : (rpcResult ?? null)
  if (!question) {
    // 2. Never attempted
    const { data } = await supabase
      .from('questions')
      .select('*, question_state!left(question_id)')
      .eq('study_set_id', studySetId)
      .is('question_state.question_id', null)
      .limit(1)
      .single()
    question = data
  }
  if (!question) {
    // 3. Weakness targeting — lowest ease factor in this study set
    const { data } = await supabase
      .from('question_state')
      .select('question_id, ease_factor, questions!inner(*)')
      .eq('user_id', userId)
      .eq('questions.study_set_id', studySetId)
      .order('ease_factor', { ascending: true })
      .limit(1)
      .single()
    question = data?.questions ?? null
  }

  if (!question) return NextResponse.json({ done: true })
  return NextResponse.json({ question })
}
