# Keytag

The keyring tag that helps lost keys get home. This is the live site and the services behind it.

| Part | Does | Lives in |
| --- | --- | --- |
| Site | Homepage, shop, set-up, finder page, account, admin | `public/index.html` (built from `src/`) |
| Server functions | Scans, finder messages, text relay, tag set-up, account | `api/` |
| Database + login | Tags, owners, messages; email login links | Supabase (`supabase/schema.sql`) |
| Texts | Owner alerts and the masked reply relay | Twilio, one UK mobile number |
| Emails | Owner alerts, tests, gifts, admin alerts | Resend, from keytag.club |
| Checkout | Payment, VAT, orders, shipping | Shopify cart link |

## How it works

- **Tag codes.** Each tag has a 6-character code (e.g. `7H4-Q9M`). The QR code links to `KEYTAG.CLUB/T/CODE`.
- **Scan page.** `keytag.club/scan/CODE` is the page people land on after scanning. Registered tags show the finder form; new tags show the set-up form, with how it works, FAQs and buy-more below. `/scan` on its own asks for the code. It isn't linked from the homepage. The QR codes keep the shorter `/T/CODE` link (a smaller, easier-to-scan QR), which opens `/scan/CODE`.
- **Registering.** Register Keytag → enter the code → email and mobile (and an optional name like "House") → Save → enter the 6-digit code we email (and text, once texts are live). Codes expire in 15 minutes, allow 5 tries and work once. Changing your mobile later also needs a texted code. Unknown codes show "Code not found". A code that's already registered offers an email link to edit details. One email can hold any number of tags: extra tags join the same account and keep the existing mobile number. A confirmation email with a log-in link is sent each time.
- **Guessing protection.** Wrong codes are limited to 30 an hour per IP address, and registrations to 10 an hour. Only a scrambled IP is stored, for 24 hours.
- **Finder.** Scans the tag, says where the keys are, and can choose to leave a number. The owner gets a text and an email.
- **Masked replies.** Owner and finder text the one Keytag number, and the server passes messages between them. Neither ever sees the other's number. A finder can also text the tag code to the Keytag number to report keys. If someone is in two conversations at once, replies go to the most recent one.
- **Owner test.** Scanning your own tag while logged in shows "Your tag works" and sends a test email. No text, so testing is free.
- **Privacy.** Only name, email and mobile are kept. Finder numbers are never shown to owners, admins or the browser. Messages and finder numbers are deleted after 90 days.

## Setting it up

Do these in order. Each step says what to copy for the next.

### 1. Supabase (database and login)
1. Create a project at supabase.com. Choose the **London** region.
2. **SQL Editor → New query**: paste `supabase/schema.sql` and run it. Then run `supabase/test-tags.sql` to add five test tags. (Already ran schema.sql before? Also run `supabase/002-simple-registration.sql` and `supabase/003-verification-codes.sql`.)
3. **Authentication → URL Configuration**: Site URL `https://keytag.club`. Add redirect URL `https://keytag.club/**`.
4. **Authentication → Emails → SMTP settings**: turn on custom SMTP with Resend (step 2), so login emails come from keytag.club. Supabase's built-in sender only allows a few emails an hour.
   Host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender `hello@keytag.club`.
5. Optional but recommended: **Database → Extensions** turn on `pg_cron`, then in the SQL editor run
   `select cron.schedule('keytag-purge', '0 3 * * *', 'select public.purge_old_data()');`
6. Copy from **Project Settings → API**: Project URL, `anon` key, `service_role` key.

### 2. Resend (email)
1. Create an account at resend.com, **Domains → Add domain** `keytag.club`, and add the DNS records it shows at your domain registrar.
2. **API Keys → Create**. Copy it.

### 3. Twilio (texts)
1. Create an account at twilio.com and upgrade it (trial accounts can only text verified numbers).
2. **Phone Numbers → Buy a number**: United Kingdom, mobile, with SMS. UK numbers need a regulatory bundle (business address and ID). Approval can take a few days.
3. On the number's settings, under **Messaging → A message comes in**: Webhook, `https://keytag.club/api/sms-inbound`, HTTP POST.
4. Copy the Account SID, Auth Token and the number.

### 4. Shopify (checkout)
1. Add a product "Keytag" at **£14**.
2. **Discounts → Create discount → Amount off products**, automatic: £2 off each Keytag, minimum quantity 2. Make a second one: £4 off each, minimum quantity 5. Leave them set not to combine, so the bigger saving applies.
3. Find the product's variant ID (open the variant in the admin; it's the number at the end of the address).
4. Your checkout link is `https://YOUR-STORE.myshopify.com/cart/VARIANT_ID:{QTY}`. Leave `{QTY}` as it is.

### 5. Vercel (hosting)
1. Create an account at vercel.com. Either push this folder to a GitHub repo and import it, or run `npx vercel` in this folder.
2. **Settings → Environment Variables**: add everything in `.env.example`.
3. **Settings → Domains**: add `keytag.club` and follow the DNS instructions.
4. Redeploy after adding the variables.

### 6. Try it
- `https://keytag.club/t/TEST01` is the same as scanning a brand-new tag. Register it with your own email and mobile.
- Open `https://keytag.club/t/TEST01` in a private window (you're now a finder) and send a message. You should get a text and an email.
- Tick "Let the owner contact me" with a second phone, then reply to the text from your own phone.
- `https://keytag.club/admin` shows activity for the emails in `ADMIN_EMAILS`.
- Before launch: `delete from public.tags where batch = 'test';`

## Making tag codes for the manufacturer

```
npm install
npm run codes -- --count 500 --batch 001 --insert
```

With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, this checks for clashes and adds the tags to the database. It writes `out/batch-001/`:

- `codes.csv`: code, printed code (`7H4-Q9M`) and QR link. Send to the manufacturer.
- `qr/*.svg`: one vector QR per tag. Send to the manufacturer.
- `import.sql`: the same tags as SQL, if you'd rather paste them into Supabase.

Codes avoid look-alike characters (no 0/O, 1/I/L, 2/Z, 5/S, 8/B).

## Running costs

Texts are the only per-use cost. A finder's message is up to about 300 characters, so usually **2 text segments** (about 9p) to the owner. Each relayed reply is 1–2 segments, and incoming texts cost under 1p. Owner tests send an email, so they're free. Fixed: about $2.50 a month for the UK number, plus Vercel Pro ($20) and Supabase Pro ($25) once live.

## Changing the site

Edit files in `src/` (`app.js`, `styles.css`, `shell.html`, `helpers.js`), then run `node scripts/build-site.mjs`. Vercel runs this on every deploy too.

## Tests

```
npm test             # server functions against a fake database, texts and emails
node test/e2e.mjs    # the real page in a browser, through every journey (needs Playwright)
```
