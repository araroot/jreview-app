let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // Reduced for maximum speed

// Overlay sync: per-tab request tracking + abort control
const latestRequestIdByTab = new Map();
const abortControllerByTab = new Map();

// Firebase Configuration - Add your credentials here
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQgZ4XKuEbQ6mincj6R8bX6gBH_CUETUY",
  authDomain: "japanese-learning-app-dc19d.firebaseapp.com",
  databaseURL: "https://japanese-learning-app-dc19d-default-rtdb.firebaseio.com",
  projectId: "japanese-learning-app-dc19d",
  storageBucket: "japanese-learning-app-dc19d.firebasestorage.app",
  messagingSenderId: "68430245068",
  appId: "1:68430245068:web:c40f7e0a6717f054b4a669"
};

let firebaseInitialized = false;
let currentUserId = null;

// Shared users - words will be saved to all these User IDs
// Each person tracks their own progress, but sees the same words
const SHARED_USER_IDS = ['meg_shared']; // Add Meg's User ID here

function getPromptTemplate(subtitle, platform = 'streaming') {
  // Optimized for speed: return a small list of difficult words only (no translation)
  return `Analyze this Japanese subtitle from ${platform}: "${subtitle}"

You are helping an N2 level learner. Extract ONLY a small set of DIFFICULT words/expressions worth learning.

INCLUDE (be generous):
✓ Any word/expression above N3 level (N2, N1, or beyond JLPT)
✓ Honorifics and keigo: いらっしゃる, おっしゃる, 申す, 伺う
✓ Useful verbs and adjectives beyond basic ones
✓ Slang and colloquial expressions: やばい, マジで, ぶっちゃけ
✓ Idiomatic expressions: 気が利く, 腹が立つ
✓ Polite expressions: しょうがない, 構わない
✓ Common conversational words: 懐かしい, 相応しい, ややこしい, もったいない, 微妙
✓ Extract COMPLETE expressions with okurigana

SKIP (be strict here):
✗ Only these VERY basic words: です, ます, する, いる, ある, 行く, 来る, 見る, 食べる, 飲む, 今日, 明日, 時間, 人, 何, これ, それ, あれ
✗ Particles alone: は, が, を, に, で, と
✗ Basic adjectives: 良い, 悪い, 大きい, 小さい

OUTPUT REQUIREMENTS:
- Return AT MOST 8 items.
- Prefer harder, higher-value words over common/easy ones.
- If nothing suitable, return an empty words list.

Return ONLY JSON in this exact format:
{
  "words": [
    {
      "word": "しょうがない",
      "reading": "しょうがない",
      "meaning": "it can't be helped"
    }
  ]
}
Return ONLY JSON, no other text.`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_SUBTITLE') {
    const tabId = sender?.tab?.id;
    if (typeof tabId === 'number') {
      // Sentence-mining capture runs in the background and is throttled
      void recordSubtitleEvent({
        tabId,
        subtitle: message.subtitle,
        platform: message.platform,
        ts: message.ts,
      });
      processWithAI(message.subtitle, tabId, message.platform, message.requestId);
    }
  } else if (message.type === 'SAVE_WORD') {
    console.log('💾 Received SAVE_WORD request:', message.wordData.word);
    // Handle word saving
    handleSaveWord(message.wordData).then(result => {
      console.log('✅ Word saved successfully, sending response');
      sendResponse({ success: true, wordId: result });
    }).catch(error => {
      console.error('❌ Error saving word:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
});

// Initialize vocabulary manager and Firebase
async function initializeVocabularyManager() {
  // Get or create anonymous user ID
  const result = await chrome.storage.local.get('anonymousUserId');
  if (!result.anonymousUserId) {
    // Generate a unique user ID
    currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await chrome.storage.local.set({ anonymousUserId: currentUserId });
    console.log('🆔 Created new User ID:', currentUserId);
  } else {
    currentUserId = result.anonymousUserId;
    console.log('🆔 Using User ID:', currentUserId);
  }

  firebaseInitialized = true;
  console.log('✅ Extension ready! Firebase sync enabled.');
}

// Handle saving a word
async function handleSaveWord(wordData) {
  try {
    // Generate word ID
    const wordId = wordData.word.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_').toLowerCase();

    // Get current show info
    const showResult = await chrome.storage.local.get('currentShow');
    const currentShow = showResult.currentShow || null;

    const savedWord = {
      word: wordData.word,
      reading: wordData.reading,
      meaning: wordData.meaning,
      context: wordData.context || '',
      contextTranslation: wordData.contextTranslation || '',
      platform: wordData.platform || 'unknown',
      show: currentShow ? currentShow.name : null,
      season: currentShow ? currentShow.season : null,
      episode: currentShow ? currentShow.episode : null,
      savedAt: Date.now(),
      lastReviewed: null,
      nextReview: Date.now(),
      reviewCount: 0,
      difficulty: 'new',
      timesEncountered: 1,
      mastered: false
    };

    // Save to local storage (backup)
    const result = await chrome.storage.local.get('savedWords');
    const savedWords = result.savedWords || {};
    savedWords[wordId] = savedWord;
    await chrome.storage.local.set({ savedWords: savedWords });

    // Sync to Firebase for current user AND all shared users
    console.log('📤 Attempting Firebase sync...', { firebaseInitialized, currentUserId, wordId });
    if (firebaseInitialized && currentUserId) {
      // Save to current user
      await syncWordToFirebase(currentUserId, wordId, savedWord);

      // Save to all shared users
      for (const sharedUserId of SHARED_USER_IDS) {
        await syncWordToFirebase(sharedUserId, wordId, savedWord);
        console.log('📤 Also saved to shared user:', sharedUserId);
      }
    } else {
      console.log('⚠️ Firebase not initialized - word saved locally only');
    }

    return wordId;
  } catch (error) {
    console.error('Error in handleSaveWord:', error);
    throw error;
  }
}

// Sync word to Firebase using REST API
async function syncWordToFirebase(userId, wordId, wordData) {
  console.log('🔄 syncWordToFirebase called for:', userId, wordId);
  try {
    const url = `${FIREBASE_CONFIG.databaseURL}/users/${userId}/words/${wordId}.json`;
    console.log('🌐 Firebase URL:', url);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(wordData)
    });

    console.log('📡 Firebase response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Firebase error response:', errorText);
      throw new Error(`Firebase sync failed: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    console.log('🔥 FIREBASE SYNC SUCCESS:', wordId, 'Response:', responseData);

    // Update stats
    await updateFirebaseStats();

    return true;
  } catch (error) {
    console.error('❌ FIREBASE SYNC ERROR:', error);
    // Don't throw - we already saved locally
    return false;
  }
}

// Update stats in Firebase
async function updateFirebaseStats() {
  try {
    // Get all saved words from local storage
    const result = await chrome.storage.local.get('savedWords');
    const savedWords = result.savedWords || {};
    const words = Object.values(savedWords);

    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);

    const stats = {
      totalWords: words.length,
      mastered: words.filter(w => w.mastered).length,
      dueForReview: words.filter(w => !w.mastered && w.nextReview <= now).length,
      reviewedToday: words.filter(w => w.lastReviewed && w.lastReviewed >= today).length,
      lastUpdated: Date.now()
    };

    const url = `${FIREBASE_CONFIG.databaseURL}/users/${currentUserId}/stats.json`;

    await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(stats)
    });
  } catch (error) {
    console.error('Error updating Firebase stats:', error);
  }
}

// Initialize on load
initializeVocabularyManager();

// Randomly sample N items from an array
function randomSample(array, sampleSize) {
  if (array.length <= sampleSize) {
    return array;
  }

  const shuffled = [...array];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, sampleSize);
}

async function processWithAI(subtitle, tabId, platform = 'streaming', requestId) {
  try {
    // Track latest request per tab (used to drop stale responses)
    if (typeof tabId === 'number' && typeof requestId === 'number') {
      latestRequestIdByTab.set(tabId, requestId);
    }

    // Abort any in-flight request for this tab so we stay synced
    const prev = abortControllerByTab.get(tabId);
    if (prev) prev.abort();
    const controller = new AbortController();
    abortControllerByTab.set(tabId, controller);

    const { CONFIG } = await chrome.storage.local.get('CONFIG');

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    const promptContent = getPromptTemplate(subtitle, platform);

    if (!CONFIG || !CONFIG.OPENAI_API_KEY) {
      // No API key configured: keep overlay responsive
      chrome.tabs.sendMessage(tabId, {
        type: 'AI_RESPONSE',
        subtitle,
        requestId,
        data: JSON.stringify({ words: [] })
      });
      return;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: "user",
          content: promptContent
        }],
        temperature: 0.2,
        max_tokens: 450
      })
    });

    if (!response.ok) {
      console.error('API error:', response.status);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    let aiResponse = data.choices[0].message.content.trim();

    try {
      // Clean JSON response if wrapped in code fences
      if (aiResponse.startsWith('```json')) {
        aiResponse = aiResponse.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      } else if (aiResponse.startsWith('```')) {
        aiResponse = aiResponse.replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      }

      const parsed = JSON.parse(aiResponse);
      if (!parsed.words) throw new Error('Invalid response format');

      // Drop stale responses (user has moved on to a newer subtitle)
      if (typeof requestId === 'number' && latestRequestIdByTab.get(tabId) !== requestId) {
        return;
      }

      const words = Array.isArray(parsed.words) ? parsed.words.slice(0, 8) : [];
      chrome.tabs.sendMessage(tabId, {
        type: 'AI_RESPONSE',
        subtitle,
        requestId,
        data: JSON.stringify({ words })
      });
    } catch (e) {
      console.error('JSON parsing error:', e);
      throw new Error('Invalid JSON response');
    }

  } catch (error) {
    // Abort is expected when a newer subtitle arrives
    if (error && (error.name === 'AbortError' || String(error.message || '').includes('aborted'))) {
      return;
    }
    console.error('Processing error:', error);
    chrome.tabs.sendMessage(tabId, {
      type: 'AI_RESPONSE',
      subtitle,
      requestId,
      data: JSON.stringify({
        words: []
      })
    });
  }
}

// ----------------------------
// Sentence mining (background)
// ----------------------------

let currentShowCache = null;
chrome.storage.local.get('currentShow').then(r => { currentShowCache = r.currentShow || null; }).catch(() => {});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.currentShow) {
    currentShowCache = changes.currentShow.newValue || null;
  }
});

const subtitleEventBufferByTab = new Map(); // tabId -> events[]
let lastMiningRunAt = 0;
const MINING_THROTTLE_MS = 30_000;
const MAX_EVENTS_PER_TAB = 400;
const MAX_MINING_QUEUE = 600;
let lastSentenceCandidatesSyncAt = 0;
const MAX_CANDIDATES_SYNC_PER_RUN = 40;

function normalizeJapanese(s) {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[\u3000]/g, '')
    .trim();
}

function hashString(str) {
  // DJB2-ish, stable and fast
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  // Convert to unsigned base36
  return (h >>> 0).toString(36);
}

async function recordSubtitleEvent({ tabId, subtitle, platform, ts }) {
  try {
    if (!subtitle) return;
    const events = subtitleEventBufferByTab.get(tabId) || [];
    events.push({
      subtitle,
      platform: platform || 'unknown',
      ts: typeof ts === 'number' ? ts : Date.now(),
      show: currentShowCache || null
    });
    if (events.length > MAX_EVENTS_PER_TAB) events.splice(0, events.length - MAX_EVENTS_PER_TAB);
    subtitleEventBufferByTab.set(tabId, events);

    // Throttled mining queue update; never awaited by overlay path
    void maybeUpdateSentenceMiningQueue(tabId);
  } catch (e) {
    // Never throw from background capture
  }
}

async function maybeUpdateSentenceMiningQueue(tabId) {
  const now = Date.now();
  if ((now - lastMiningRunAt) < MINING_THROTTLE_MS) return;
  lastMiningRunAt = now;

  const events = subtitleEventBufferByTab.get(tabId) || [];
  if (events.length < 3) return;

  // Build simple candidates: each line with +/- 1 context line
  const candidates = [];
  for (let i = Math.max(1, events.length - 60); i < events.length - 1; i++) {
    const cur = events[i];
    const before = events[i - 1];
    const after = events[i + 1];
    const text = cur.subtitle;
    const norm = normalizeJapanese(text);
    if (!norm) continue;
    // Skip very short fragments
    if (norm.length < 6) continue;
    const id = hashString(norm);
    candidates.push({
      id,
      text,
      before: before ? before.subtitle : '',
      after: after ? after.subtitle : '',
      firstSeenAt: cur.ts,
      platform: cur.platform,
      show: cur.show
    });
  }

  if (candidates.length === 0) return;

  // Merge into stored mining queue (dedupe by id)
  const existing = await chrome.storage.local.get('sentenceMiningQueue');
  const queue = Array.isArray(existing.sentenceMiningQueue) ? existing.sentenceMiningQueue : [];
  const byId = new Map(queue.map(item => [item.id, item]));

  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (prev) {
      prev.lastSeenAt = now;
      prev.occurrences = (prev.occurrences || 1) + 1;
    } else {
      byId.set(c.id, {
        id: c.id,
        text: c.text,
        before: c.before,
        after: c.after,
        show: c.show,
        platform: c.platform,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: now,
        occurrences: 1,
        status: 'new'
      });
    }
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    .slice(0, MAX_MINING_QUEUE);

  await chrome.storage.local.set({ sentenceMiningQueue: merged });

  // Sync newest candidates to Firebase for mobile review app (throttled; never blocks overlay)
  void syncSentenceCandidatesToFirebase(merged, now);
}

async function syncSentenceCandidatesToFirebase(mergedQueue, now) {
  try {
    if (!firebaseInitialized || !currentUserId) return;
    if (!Array.isArray(mergedQueue) || mergedQueue.length === 0) return;

    // Only sync items seen since last sync; cap to keep this lightweight
    const toSync = mergedQueue
      .filter(c => (c.lastSeenAt || 0) > lastSentenceCandidatesSyncAt)
      .slice(0, MAX_CANDIDATES_SYNC_PER_RUN);

    if (toSync.length === 0) return;

    const payload = {};
    for (const c of toSync) {
      payload[c.id] = {
        id: c.id,
        text: c.text,
        before: c.before || '',
        after: c.after || '',
        show: c.show || null,
        platform: c.platform || 'unknown',
        firstSeenAt: c.firstSeenAt || now,
        lastSeenAt: c.lastSeenAt || now,
        occurrences: c.occurrences || 1,
        status: c.status || 'new',
      };
    }

    // Write to current user and shared users. Use PATCH to batch.
    const userIds = [currentUserId, ...SHARED_USER_IDS];
    await Promise.all(userIds.map(async (uid) => {
      const url = `${FIREBASE_CONFIG.databaseURL}/users/${uid}/sentenceCandidates.json`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }));

    lastSentenceCandidatesSyncAt = now;
  } catch (e) {
    // Best effort only—never impact overlay responsiveness
  }
}
