'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionComplete } from '@/components/study/SessionComplete'
import type { Question } from '@/types'

export default function SessionCompletePage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const score = Number(params.get('score') ?? 0)
  const total = Number(params.get('total') ?? 1)
  const weakIdStr = params.get('weakIds') ?? ''
  const weakIds = weakIdStr ? weakIdStr.split(',').filter(Boolean) : []

  const [weakQuestions, setWeakQuestions] = useState<Pick<Question, 'id' | 'question_text'>[]>([])

  useEffect(() => {
    if (!weakIds.length) return
    createClient().from('questions').select('id, question_text').in('id', weakIds)
      .then(({ data }) => { if (data) setWeakQuestions(data as Pick<Question, 'id' | 'question_text'>[]) })
  }, [weakIdStr])  // eslint-disable-line

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <SessionComplete studySetId={id} score={score} total={total} weakQuestions={weakQuestions} />
    </main>
  )
}
