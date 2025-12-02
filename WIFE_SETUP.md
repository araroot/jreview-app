# Setup Guide for Wife's iPhone Review App

## Overview
Your wife will have a completely separate account with her own words and progress.

## Step 1: Create Her Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Project name: `japanese-learning-wife` (or any name)
4. Disable Google Analytics (optional)
5. Click **Create project**

## Step 2: Set Up Realtime Database

1. In the Firebase console, click **Realtime Database** in left menu
2. Click **Create Database**
3. Choose location (us-central1 is fine)
4. Start in **test mode** (we'll secure it later)
5. Click **Enable**

## Step 3: Get Firebase Credentials

1. Click the **gear icon** ⚙️ → Project settings
2. Scroll down to "Your apps"
3. Click **Web** icon (</>)
4. Register app name: "Wife Review App"
5. Click **Register app**
6. **Copy the Firebase config** - it looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "...",
  databaseURL: "https://...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## Step 4: Create Her Review App File

1. Make a copy of `review-app.html` → `review-app-wife.html`
2. Open `review-app-wife.html` in a text editor
3. Find this section (around line 434):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDQgZ4XKuEbQ6mincj6R8bX6gBH_CUETUY",
  ...
};
```

4. **Replace** with her Firebase config from Step 3

## Step 5: Deploy Her Review App

**Option A: Same GitHub Repo**
```bash
cd /Users/raviaranke/Desktop/netflix-prime-language-assistant
git add review-app-wife.html
git commit -m "Add wife's review app"
git push origin main
```

Her review app URL: `https://araroot.github.io/jreview-app/review-app-wife.html`

**Option B: Separate GitHub Repo** (more private)
1. Create new repo: `jreview-app-wife`
2. Push `review-app-wife.html` there
3. Enable GitHub Pages
4. Her URL: `https://araroot.github.io/jreview-app-wife/review-app-wife.html`

## Step 6: Setup on Her iPhone

1. Open **Safari** on her iPhone
2. Go to her review app URL
3. **Tap Share icon** → **Add to Home Screen**
4. Name it: "Japanese Review"
5. **First time**: She won't have a User ID yet (that comes from the extension)

## Step 7: Setup Extension on Her Laptop (Later)

When you're ready to set up word collection:

1. Copy the extension folder to her laptop
2. Open `js/background.js`
3. Replace Firebase credentials (lines 5-13) with **HER** credentials
4. Load extension in Chrome on her laptop
5. Save a test word → Get her User ID from extension popup
6. Enter that User ID in the iPhone review app

## Summary

**On Her iPhone:**
- Review app URL with her Firebase credentials
- Add to home screen for easy access
- Enter her User ID (once she has it from extension)

**On Her Laptop (Later):**
- Extension with her Firebase credentials
- Saves words while watching dramas

**Completely separate data - no overlap!**

---

## Quick Start (iPhone Only)

If you want to test the review app on her iPhone first:

1. Complete Steps 1-5 above
2. Open review app on her iPhone
3. For testing, use User ID: `test_user`
4. Manually add a test word via Firebase Console to see it work
5. Later, set up the full extension on her laptop

---

## Need Help?

- Firebase setup issues: Check Database Rules are in test mode
- Review app not working: Check browser console for errors
- Separate accounts: Each person has their own Firebase project
