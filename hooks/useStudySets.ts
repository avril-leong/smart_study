'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StudySet, StudySetDocument, Subject, GenerationStatus } from '@/types'

export function useStudySets() {
  const [studySets, setStudySets] = useState<StudySet[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sets }, { data: subs }] = await Promise.all([
      supabase.from('study_sets').select('*, subject:subjects(*)').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('name'),
    ])

    if (sets) {
      // Batch fetch question counts (existing N+1 — out of scope to fix here)
      const withCounts = await Promise.all(sets.map(async (s) => {
        const { count } = await supabase.from('questions')
          .select('*', { count: 'exact', head: true }).eq('study_set_id', s.id)
        return { ...s, question_count: count ?? 0, documents: [] as StudySetDocument[], mastery: 0 }
      }))

      // Batch fetch documents (single query)
      const setIds = withCounts.map(s => s.id)
      if (setIds.length > 0) {
        const { data: allDocs } = await supabase
          .from('study_set_documents')
          .select('*')
          .in('study_set_id', setIds)
          .order('uploaded_at')

        const docsBySet = (allDocs ?? []).reduce((acc, doc) => {
          (acc[doc.study_set_id] ??= []).push(doc)
          return acc
        }, {} as Record<string, StudySetDocument[]>)

        withCounts.forEach(s => { s.documents = docsBySet[s.id] ?? [] })

        // Batch fetch mastery: question_state rows with repetitions > 0
        const { data: masteredStates } = await supabase
          .from('question_state')
          .select('question_id')
          .gt('repetitions', 0)

        if (masteredStates && masteredStates.length > 0) {
          const masteredIds = masteredStates.map((r: { question_id: string }) => r.question_id)
          const { data: masteredQs } = await supabase
            .from('questions')
            .select('id, study_set_id')
            .in('study_set_id', setIds)
            .in('id', masteredIds)

          const masteredBySet = (masteredQs ?? []).reduce((acc, q) => {
            acc[q.study_set_id] = (acc[q.study_set_id] ?? 0) + 1
            return acc
          }, {} as Record<string, number>)

          withCounts.forEach(s => {
            const mastered = masteredBySet[s.id] ?? 0
            s.mastery = s.question_count > 0 ? Math.round((mastered / s.question_count) * 100) : 0
          })
        }
      }

      setStudySets(withCounts)
    }
    if (subs) setSubjects(subs)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Poll generation status for any processing sets
  useEffect(() => {
    const processingIds = studySets.filter(s => s.generation_status === 'processing').map(s => s.id)
    if (processingIds.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      for (const id of processingIds) {
        const r = await window.fetch(`/api/generate/status/${id}`)
        if (!r.ok) continue
        const { status, questionCount } = await r.json()
        setStudySets(prev => prev.map(s =>
          s.id === id ? { ...s, generation_status: status, question_count: questionCount ?? s.question_count } : s
        ))
      }
    }, 3000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [studySets.filter(s => s.generation_status === 'processing').map(s => s.id).join(',')]) // eslint-disable-line

  async function renameSet(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ name }).eq('id', id)
    setStudySets(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  async function deleteSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').delete().eq('id', id)
    setStudySets(prev => prev.filter(s => s.id !== id))
  }

  async function assignSubject(id: string, subjectId: string | null) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ subject_id: subjectId }).eq('id', id)
    await loadData()
  }

  async function refreshSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ generation_status: 'pending' }).eq('id', id)
    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId: id, mode: 'regenerate' }),
    })
    await loadData()
  }

  function updateSetStatus(id: string, status: GenerationStatus) {
    setStudySets(prev =>
      prev.map(s => s.id === id ? { ...s, generation_status: status } : s)
    )
  }

  return {
    studySets, subjects, loading,
    renameSet, deleteSet, assignSubject,
    refreshSet, updateSetStatus,
    refresh: loadData,
  }
}
