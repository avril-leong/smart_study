import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: studySet } = await supabase.from('study_sets')
    .select('id, user_id, generation_status').eq('id', params.id).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceRoleClient()
  const { count } = await service.from('questions')
    .select('*', { count: 'exact', head: true }).eq('study_set_id', params.id)

  return NextResponse.json({ status: studySet.generation_status, questionCount: count ?? 0 })
}
