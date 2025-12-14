let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // Reduced for maximum speed

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
let deletedWordsCache = [];
let lastDeletedWordsFetch = 0;
const DELETED_WORDS_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

// Shared users - words will be saved to all these User IDs
// Each person tracks their own progress, but sees the same words
const SHARED_USER_IDS = ['meg_shared']; // Add Meg's User ID here

function getPromptTemplate(subtitle, platform = 'streaming', userDeletedWords = []) {
  let deletedWordsSection = '';
  if (userDeletedWords.length > 0) {
    deletedWordsSection = `\n✗ SKIP these words the user marked as not useful: ${userDeletedWords.join(', ')}`;
  }

  return `Analyze this Japanese subtitle from ${platform}: "${subtitle}"

You are helping an N2 level learner. Extract vocabulary and expressions that would be useful for learning:

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
✗ Basic adjectives: 良い, 悪い, 大きい, 小さい${deletedWordsSection}

Be VERY INCLUSIVE - extract as many useful words as possible (aim for 40-50 words if available). Include variations and related terms. Better to show more words than miss useful vocabulary

Format as JSON:
{
  "translation": "English translation of the full sentence",
  "words": [
    {
      "word": "しょうがない",
      "reading": "しょうがない",
      "meaning": "it can't be helped"
    }
  ]
}

IMPORTANT: Always include "translation" with the English translation of the full subtitle.
If there are NO suitable expressions, return: {"translation": "...", "words":[]}
Return ONLY the JSON, no other text.`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_SUBTITLE') {
    processWithAI(message.subtitle, sender.tab.id, message.platform);
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

// Fetch deleted words from Firebase (with caching)
async function fetchDeletedWords() {
  const now = Date.now();

  // Return cached if still fresh
  if (deletedWordsCache.length > 0 && (now - lastDeletedWordsFetch) < DELETED_WORDS_CACHE_TIME) {
    return deletedWordsCache;
  }

  try {
    if (!currentUserId) return [];

    const url = `${FIREBASE_CONFIG.databaseURL}/users/${currentUserId}/deletedWords.json`;
    const response = await fetch(url);

    if (!response.ok) {
      return [];
    }

    const deletedWords = await response.json();

    if (!deletedWords) {
      deletedWordsCache = [];
      lastDeletedWordsFetch = now;
      return [];
    }

    // Extract just the word text
    deletedWordsCache = Object.values(deletedWords).map(w => w.word);
    lastDeletedWordsFetch = now;

    console.log('📝 Loaded deleted words list:', deletedWordsCache.length, 'words');
    return deletedWordsCache;
  } catch (error) {
    console.error('Error fetching deleted words:', error);
    return [];
  }
}

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

  // Load deleted words on startup
  await fetchDeletedWords();
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

async function processWithAI(subtitle, tabId, platform = 'streaming') {
  try {
    const { CONFIG } = await chrome.storage.local.get('CONFIG');

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    // Skip deleted words check for speed - prioritize real-time sync
    const promptContent = getPromptTemplate(subtitle, platform, []);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: "user",
          content: promptContent
        }],
        temperature: 0.7,  // Add randomness to AI responses
        max_tokens: 2000  // Increased to handle more words
      })
    });

    if (!response.ok) {
      console.error('API error:', response.status);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    const aiResponse = data.choices[0].message.content.trim();
    console.log('🤖 AI Response for subtitle:', subtitle);
    console.log('Response:', aiResponse);

    try {
      const parsed = JSON.parse(aiResponse);
      if (!parsed.words) throw new Error('Invalid response format');
      console.log('✅ Parsed:', parsed.words.length, 'words found');

      // Randomly sample 20 words from the response for variety
      const sampledWords = randomSample(parsed.words, 20);
      console.log('🎲 Randomly selected:', sampledWords.length, 'words from', parsed.words.length);

      // Create new response with sampled words
      const sampledResponse = {
        translation: parsed.translation,
        words: sampledWords
      };

      chrome.tabs.sendMessage(tabId, {
        type: 'AI_RESPONSE',
        data: JSON.stringify(sampledResponse)
      });
    } catch (e) {
      console.error('JSON parsing error:', e);
      throw new Error('Invalid JSON response');
    }

  } catch (error) {
    console.error('Processing error:', error);
    chrome.tabs.sendMessage(tabId, {
      type: 'AI_RESPONSE',
      data: JSON.stringify({
        words: []
      })
    });
  }
}