-- Test tags for trying the site before real tags are made.
-- Open in your browser:  https://keytag.co.uk/t/TEST01/PIN001  (and so on)
-- That's the same as scanning a brand-new tag's QR code.
-- Delete them before launch:  delete from public.tags where batch = 'test';

insert into public.tags (code, claim_key, batch) values
  ('TEST01', 'PIN001', 'test'),
  ('TEST02', 'PIN002', 'test'),
  ('TEST03', 'PIN003', 'test'),
  ('TEST04', 'PIN004', 'test'),
  ('TEST05', 'PIN005', 'test')
on conflict (code) do nothing;
