-- Add image_url to questions
alter table public.questions add column if not exists image_url text;

-- Storage bucket for question images
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

-- RLS policies for question-images bucket
create policy "Public read question images"
  on storage.objects for select
  using (bucket_id = 'question-images');

create policy "Authenticated users upload question images"
  on storage.objects for insert
  with check (bucket_id = 'question-images' and auth.role() = 'authenticated');

create policy "Authenticated users delete question images"
  on storage.objects for delete
  using (bucket_id = 'question-images' and auth.role() = 'authenticated');
