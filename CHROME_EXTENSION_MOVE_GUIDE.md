# Chrome Extension - Move to Another Machine Guide

## Extension Files (Required)

Copy these files/folders to the new machine:

### Root Directory Files:
- `manifest.json` (required - extension config)
- `popup.html` (required - extension popup UI)
- `icon-180.png` (optional - app icon)
- `icon-192.png` (optional - app icon)
- `icon-512.png` (optional - app icon)

### Folders:
- `css/` folder (contains `styles.css` - required)
- `js/` folder (contains all JavaScript files - required)
  - `background.js` (required - background service worker)
  - `content.js` (required - Netflix/Prime page script)
  - `config.js` (required - content script dependency)
  - `firebase-config.js` (optional - if used)
  - `vocabulary-manager.js` (optional - if used)
  - `common-verbs.js` (optional - if used)

## Complete File List

```
netflix-prime-language-assistant/
├── manifest.json          ← REQUIRED
├── popup.html             ← REQUIRED
├── icon-180.png          ← Optional (for app icon)
├── icon-192.png          ← Optional (for app icon)
├── icon-512.png          ← Optional (for app icon)
├── css/
│   └── styles.css        ← REQUIRED
└── js/
    ├── background.js     ← REQUIRED
    ├── content.js        ← REQUIRED
    └── config.js         ← REQUIRED
```

## Step-by-Step Instructions

### Option 1: Copy via Git (Recommended - Easiest)

**On the NEW machine:**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/araroot/jreview-app.git
   cd jreview-app
   ```

2. **Load the extension in Chrome:**
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable **"Developer mode"** (toggle in top-right)
   - Click **"Load unpacked"**
   - Select the `jreview-app` folder
   - Done! ✅

### Option 2: Manual Copy (If you don't want Git)

**On the OLD machine:**

1. **Create a folder** (e.g., `chrome-extension-backup/`)

2. **Copy these files/folders:**
   ```bash
   # From your project root, copy:
   manifest.json
   popup.html
   icon-180.png
   icon-192.png
   icon-512.png
   css/          (entire folder)
   js/           (entire folder)
   ```

3. **Transfer to new machine:**
   - Use USB drive, cloud storage (Dropbox/Google Drive), or network share
   - Copy the entire folder structure to the new machine

**On the NEW machine:**

4. **Load the extension:**
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable **"Developer mode"** (toggle in top-right)
   - Click **"Load unpacked"**
   - Select the folder you copied
   - Done! ✅

## Important Notes

### ⚠️ Settings/Data:
- **Extension settings are stored in Chrome's local storage** (not in the files)
- After moving, you'll need to:
  1. **Set your OpenAI API key** again (click extension icon → enter API key)
  2. **Set your current show** (click extension icon → Set Show/Episode)
  3. **Your User ID** will be auto-generated (or you can reuse the same one)

### 📍 Where Chrome Stores Extension Data:
- **Extension files location:** Wherever you load it from (the folder you select)
- **Extension data (storage):** Chrome's internal storage (synced if you're signed into Chrome)
- **User ID & settings:** Stored in Chrome's `chrome.storage.local` (per browser profile)

### 🔄 If You Want to Keep Your Settings:
If you want to keep your User ID and settings, you can:
1. On old machine: Open extension popup → Copy your User ID
2. On new machine: After loading extension → Enter the same User ID in the popup

### ✅ Verification:
After loading on the new machine:
1. Click the extension icon → You should see the popup
2. Watch Netflix/Prime → You should see the word overlay appear
3. Check `chrome://extensions/` → Extension should show "Enabled"

## Troubleshooting

**Extension doesn't load:**
- Check that `manifest.json` is in the root folder
- Check that all required files exist (see list above)
- Check Chrome console (`chrome://extensions/` → click "Errors" if any)

**Overlay doesn't appear on Netflix/Prime:**
- Make sure extension is enabled
- Refresh the Netflix/Prime page
- Check browser console (F12) for errors

**Settings lost:**
- This is normal - re-enter your OpenAI API key and show info
