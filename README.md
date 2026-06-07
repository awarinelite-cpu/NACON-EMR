# NACON MRS EMR System
### Nigerian Army College of Nursing — Medical Reception Station, Yaba · Lagos

---

## Tech Stack
- **React 18** — frontend UI
- **Firebase Auth** — login / authentication
- **Cloud Firestore** — real-time database
- **Firebase Storage** — file uploads (PDFs, images)
- **PWA** — works offline, installable on mobile

---

## Setup in 5 steps

### 1. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Create a new project → call it `nacon-mrs-emr`
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Firestore Database** → Start in production mode
5. Enable **Storage** → Start in production mode
6. Go to Project Settings → Web App → Register app → Copy config

### 2. Configure environment
```bash
cp .env.example .env
# Paste your Firebase config values into .env
```

### 3. Install and run
```bash
npm install
npm start
```

### 4. Deploy Firestore & Storage rules
```bash
npm install -g firebase-tools
firebase login
firebase init   # select Firestore + Storage + Hosting
firebase deploy --only firestore:rules,storage
```

### 5. Create the first admin user
Since the admin creates all other users, bootstrap the first one:
1. Go to Firebase Console → Authentication → Add user manually
2. Note the UID
3. Go to Firestore → Create document at `users/{UID}` with:
```json
{
  "displayName": "Administrator",
  "email": "admin@naconmrs.ng",
  "role": "admin",
  "active": true
}
```
4. Log in → go to `/admin/users` → create all other staff accounts from there.

---

## User roles

| Role       | Can do |
|------------|--------|
| **Admin**  | Everything — create users, set roles, view audit log |
| **Sub-admin** | View patients, reports, staff list (no user management) |
| **Doctor** | Consult, prescribe, upload results, refer, discharge |
| **Nurse**  | Vitals, nursing notes, prescribe (flagged), fluid/glucose charts |
| **Records**| Register patients, manage case folders |

---

## EMR Number format
`EMR-YYYY-NNNN` e.g. `EMR-2025-0041`

- Unique per patient — auto-generated, never editable
- Resets to 0001 at start of each year
- Maps to folder number: `FN: 0041/25`
- Generated with a Firestore atomic transaction (no duplicates possible)

---

## Deploy to Vercel
```bash
npm run build
npx vercel --prod
```
Or connect your GitHub repo to Vercel for auto-deploy.

---

## Firestore indexes needed
Add these composite indexes in Firebase Console → Firestore → Indexes:

| Collection      | Fields |
|-----------------|--------|
| notes           | emrNumber ASC, createdAt DESC |
| vitals          | emrNumber ASC, recordedAt DESC |
| prescriptions   | emrNumber ASC, createdAt DESC |
| fluid_charts    | emrNumber ASC, recordedAt ASC |
| glucose_charts  | emrNumber ASC, recordedAt ASC |
| uploads         | emrNumber ASC, uploadedAt DESC |
| visits          | emrNumber ASC, createdAt DESC |
| visits          | createdAt ASC (for today's stats) |
| patients        | searchTokens ARRAY, (for search) |

---

Built by [Your class name] — donated to Nigerian Army College of Nursing, Yaba, Lagos.
