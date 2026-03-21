'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StudySet, Subject } from '@/types'

export function useStudySets() {
  const [studySets, setStudySets] = useState<StudySet[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sets }, { data: subs }] = await Promise.all([
      supabase.from('study_sets').select('*, subject:subjects(*)').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('name'),
    ])
    if (sets) {
      const withCounts = await Promise.all(sets.map(async (s) => {
        const { count } = await supabase.from('questions')
          .select('*', { count: 'exact', head: true }).eq('study_set_id', s.id)
        return { ...s, question_count: count ?? 0 }
      }))
      setStudySets(withCounts)
    }
    if (subs) setSubjects(subs)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

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
    await fetch()
  }

  async function refreshSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ generation_status: 'pending' }).eq('id', id)
    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId: id }),
    })
    await fetch()
  }

  return { studySets, subjects, loading, renameSet, deleteSet, assignSubject, refreshSet, refresh: fetch }
}
