# ORCA Ireland — Setup Guide
# Complete these steps in order before deploying

## ── STEP 1: SUPABASE (Database) ─────────────────────────────────────────

1. Go to https://supabase.com and sign up (free)
2. Click "New Project" — name it "orca-ireland"
3. Choose a region close to Ireland (e.g. EU West)
4. Once created, go to: Project Settings → API
5. Copy these two values (you'll need them later):
   - Project URL  →  SUPABASE_URL
   - service_role key (under "Project API keys")  →  SUPABASE_SERVICE_KEY
     ⚠️  Use the service_role key, NOT the anon key

6. Go to SQL Editor → New Query
7. Paste the contents of supabase-schema.sql and click Run


## ── STEP 2: GMAIL APP PASSWORD ─────────────────────────────────────────

Gmail requires an "App Password" — not your normal Gmail password.

1. Go to your Google Account → Security
2. Make sure 2-Step Verification is ON
3. Search for "App passwords" (or go to myaccount.google.com/apppasswords)
4. Create a new app password:
   - App name: ORCA Ireland Website
5. Copy the 16-character password shown  →  GMAIL_APP_PASSWORD
   ⚠️  You only see it once — copy it immediately


## ── STEP 3: NETLIFY ENVIRONMENT VARIABLES ──────────────────────────────

In your Netlify dashboard:
Site → Project configuration → Environment variables → Add variable

Add ALL of these:

  SUPABASE_URL          =  (paste from Step 1)
  SUPABASE_SERVICE_KEY  =  (paste from Step 1)
  GMAIL_USER            =  orcaireland25@gmail.com
  GMAIL_APP_PASSWORD    =  (paste from Step 2)
  SITE_URL              =  https://melodic-gumption-c64a78.netlify.app
                           (or your custom domain once set up)


## ── STEP 4: REVOLUT PAYMENT LINK REDIRECTS ─────────────────────────────

Revolut free plan doesn't support automatic redirects after payment.
The flow works like this:

  Member pays on Revolut → Revolut shows "Payment complete" page
  → Member clicks back/continues → They go to /register.html to complete signup

To make this smoother, in each Revolut payment link settings:
1. Open the payment link in Revolut Business
2. Look for "Redirect URL" or "Success URL" setting
3. Set it to:
   - Full membership:   https://your-site.com/register.html?type=full
   - Junior membership: https://your-site.com/register.html?type=junior
   - Race entry:        no redirect needed (no account created)

If Revolut doesn't show this option on your plan, just add a note on
the payment page telling members to return to the site to complete signup.


## ── STEP 5: DEPLOY ──────────────────────────────────────────────────────

Option A — Drag & Drop (simplest):
  Zip the entire orca-site folder and drag it to Netlify

Option B — Via Netlify CLI:
  cd orca-site
  npm install
  netlify deploy --prod


## ── HOW IT ALL WORKS ────────────────────────────────────────────────────

NEW MEMBER:
  1. Clicks "Join Now" → pays on Revolut
  2. Returns to /register.html → fills in name, email, username
  3. System creates account in Supabase with 1-year expiry
  4. Welcome email sent with username + auto-generated password
  5. Admin notified at orcaireland25@gmail.com

RENEWING MEMBER:
  1. Pays on Revolut again
  2. Returns to /register.html → fills in same email
  3. System recognises existing account → extends expiry by 1 year
     (from current expiry date if still valid, otherwise from today)
  4. Renewal confirmation email sent with updated expiry date

EXPIRED MEMBER trying to log in:
  - Login modal shows "Your membership expired on [date]"
  - Renew Now button links straight to Revolut payment

EXPIRING SOON (within 30 days):
  - Warning shown inside members area after login
  - Admin gets weekly email every Monday listing all expiring/expired members


## ── VIEWING MEMBERS ─────────────────────────────────────────────────────

All members are visible in your Supabase dashboard:
  supabase.com → your project → Table Editor → members

You can view, search, edit, and export from there.
It's essentially a spreadsheet of all your members.
