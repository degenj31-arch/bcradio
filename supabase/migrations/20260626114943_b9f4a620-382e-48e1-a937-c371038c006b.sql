
CREATE POLICY "radio-audio public read" ON storage.objects FOR SELECT USING (bucket_id = 'radio-audio');
CREATE POLICY "radio-audio public insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'radio-audio');
CREATE POLICY "radio-audio public update" ON storage.objects FOR UPDATE USING (bucket_id = 'radio-audio') WITH CHECK (bucket_id = 'radio-audio');
CREATE POLICY "radio-audio public delete" ON storage.objects FOR DELETE USING (bucket_id = 'radio-audio');
