-- Alinha políticas de anexos (payable-attachments) ao RLS financeiro

DROP POLICY IF EXISTS payable_attachments_select ON storage.objects;
DROP POLICY IF EXISTS payable_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS payable_attachments_update ON storage.objects;
DROP POLICY IF EXISTS payable_attachments_delete ON storage.objects;

CREATE POLICY payable_attachments_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payable-attachments'
    AND public.can_read_workspace((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY payable_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY payable_attachments_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  )
  WITH CHECK (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  );

CREATE POLICY payable_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payable-attachments'
    AND public.can_write_financial((storage.foldername(name))[1]::UUID)
  );
