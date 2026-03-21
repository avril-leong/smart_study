'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useStudySession } from '@/hooks/useStudySession'
import { QuestionCard } from '@/components/study/QuestionCard'
import { FeedbackPanel } from '@/components/study/FeedbackPanel'
import { SessionProgress } from '@/components/study/SessionProgress'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'

export default function StudyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useStudySession(id)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [studySetName, setStudySetName] = useState('Study Session')

  useEffect(() => {
    session.fetchNext()
    const supabase = createClient()
    Promise.all([
      supabase.from('study_sets').select('name').eq('id', id).single(),
      supabase.from('questions').select('*', { count: 'exact', head: true }).eq('study_set_id', id),
    ]).then(([{ data: set }, { count }]) => {
      if (set) setStudySetName(set.name)
      if (count) setTotalQuestions(count)
    })
  }, [])  // eslint-disable-line

  useEffect(() => {
    if (!session.done) return
    async function redirectWithWeakIds() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('question_state')
        .select('question_id, ease_factor, questions!inner(study_set_id)')
        .eq('user_id', user?.id ?? '')
        .eq('questions.study_set_id', id)
        .lt('ease_factor', 2.0)
        .order('ease_factor', { ascending: true })
        .limit(5)
      const weakIds = (data ?? []).map((r: { question_id: string }) => r.question_id).join(',')
      router.push(`/study/${id}/complete?score=${session.score}&total=${session.total}&weakIds=${weakIds}`)
    }
    redirectWithWeakIds()
  }, [session.done])  // eslint-disable-line

  if (!session.question && !session.done) return (
    <main className="min-h-screen flex items-center justify-center"><Spinner size={36} /></main>
  )

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <SessionProgress current={session.total} total={totalQuestions}
        correct={session.score} studySetName={studySetName} />
      {session.question && (
        <QuestionCard question={session.question} onAnswer={session.submitAnswer}
          answered={session.answered} correctAnswer={session.question.correct_answer}
          givenAnswer={session.givenAnswer} />
      )}
      <FeedbackPanel visible={session.answered} feedback={session.feedback}
        loading={session.feedbackLoading} isCorrect={session.isCorrect}
        onNext={session.fetchNext} />
    </main>
  )
}
