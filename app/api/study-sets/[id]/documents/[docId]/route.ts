import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  // Verify ownership of the study set
  const { data: studySet } = await service
    .from('study_sets')
    .select('id, user_id')
    .eq('id', params.id)
    .single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch the document to get its storage path
  const { data: doc } = await service
    .from('study_set_documents')
    .select('id, extracted_text_path')
    .eq('id', params.docId)
    .eq('study_set_id', params.id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Delete from storage (best-effort — don't fail if file already gone)
  await service.storage.from('study-files').remove([doc.extracted_text_path])

  // Delete DB record
  const { error: dbError } = await service
    .from('study_set_documents')
    .delete()
    .eq('id', params.docId)

  if (dbError) return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
