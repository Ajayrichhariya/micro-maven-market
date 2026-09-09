DROP POLICY IF EXISTS "proofs_auth_read" ON storage.objects;

CREATE POLICY "proofs_read_owner_or_brand_or_admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'proofs' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.current_role_is('admin')
    OR EXISTS (
      SELECT 1
      FROM public.campaign_applications a
      JOIN public.campaigns c ON c.id = a.campaign_id
      WHERE a.proof_screenshot_url = storage.objects.name
        AND c.brand_id = auth.uid()
    )
  )
);