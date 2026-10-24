-- Test tags for trying the site before real tags are made.
-- Open in your browser:  https://keytag.co.uk/t/TEST01  (and so on)
-- That's the same as scanning a brand-new tag's QR code.
-- Delete them before launch:  delete from public.tags where batch = 'test';

insert into public.tags (code, batch) values
  ('TEST01', 'test'),
  ('TEST02', 'test'),
  ('TEST03', 'test'),
  ('TEST04', 'test'),
  ('TEST05', 'test')
on conflict (code) do nothing;
