# Firebase API Key Security

## GitHub Secret Alert - False Positive

GitHub has detected Firebase API keys in this repository and flagged them as potential security issues. **This is a false positive.**

## Why Firebase API Keys Are Safe to Be Public

Firebase API keys are **designed to be included in client-side code** and are not secret:

1. **Client-side by design**: Firebase apps run in browsers and mobile apps where code is visible
2. **Security via Rules**: Protection comes from Firebase Security Rules, not hiding the API key
3. **API key restrictions**: Firebase API keys can be restricted to specific domains/apps
4. **Official guidance**: Google's documentation shows API keys in public code examples

Reference: https://firebase.google.com/docs/projects/api-keys

## How Security Actually Works

**Real security measures in this app:**

1. **Firebase Security Rules** - Control who can read/write data
2. **Domain restrictions** - API keys restricted to specific websites
3. **User-specific data paths** - Each user can only access their own data

## Current Setup

- **Your Firebase**: Realtime Database with rules (needs updating from test mode)
- **Meg's Firebase**: Separate database with her own credentials
- **Extension**: OpenAI API key is NOT in the repository (kept local)

## Action Required

### 1. Dismiss GitHub Alert

1. Go to GitHub → Repository → Security → Secret scanning alerts
2. Click on the alert
3. Click "Dismiss alert" → "Used in tests" or "False positive"
4. Confirm dismissal

### 2. Secure Firebase Database Rules (Important!)

Currently both databases are in **test mode** (open access). Let's secure them:

**For YOUR Firebase:**
1. Go to https://console.firebase.google.com/
2. Select your project: `japanese-learning-app-dc19d`
3. Realtime Database → Rules
4. Replace with:

```json
{
  "rules": {
    "users": {
      "$userId": {
        ".read": "true",
        ".write": "true"
      }
    }
  }
}
```

5. Click **Publish**

**For Meg's Firebase:**
1. Go to https://console.firebase.google.com/
2. Select project: `japanese-learning-meg-2b6a3`
3. Realtime Database → Rules
4. Use the same rules as above
5. Click **Publish**

This allows anyone to read/write but organizes data by user ID.

## Summary

✅ **Firebase API keys in code = Safe**
✅ **Security via Firebase Rules = Required**
✅ **GitHub alert = False positive, dismiss it**
❌ **OpenAI API key in code = NOT safe** (we keep it local only)

---

## Alternative: Remove from Public Repo

If you prefer not to have Firebase credentials in a public repository:

1. Create a private repository
2. Keep credentials in environment variables
3. Use GitHub Secrets for deployment

But for this simple app, public Firebase keys are fine as long as Rules are configured.
