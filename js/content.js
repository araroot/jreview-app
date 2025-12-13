console.log('Streaming Language Assistant: Content script loading...');

let lastProcessedSubtitle = '';
let currentPlatform = '';
let deletedWordsCache = new Set();
let lastDeletedWordsFetch = 0;
const DELETED_WORDS_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

// Firebase Configuration (same as background.js)
const FIREBASE_CONFIG = {
  databaseURL: "https://japanese-learning-app-dc19d-default-rtdb.firebaseio.com"
};

// Fetch deleted words from Firebase (with caching)
async function fetchDeletedWords() {
  const now = Date.now();

  // Return cached if still fresh
  if (deletedWordsCache.size > 0 && (now - lastDeletedWordsFetch) < DELETED_WORDS_CACHE_TIME) {
    return deletedWordsCache;
  }

  try {
    // Get user ID from storage
    const result = await chrome.storage.local.get('anonymousUserId');
    const userId = result.anonymousUserId;

    if (!userId) {
      return new Set();
    }

    const url = `${FIREBASE_CONFIG.databaseURL}/users/${userId}/deletedWords.json`;
    const response = await fetch(url);

    if (!response.ok) {
      return new Set();
    }

    const deletedWords = await response.json();

    if (!deletedWords) {
      deletedWordsCache = new Set();
      lastDeletedWordsFetch = now;
      return new Set();
    }

    // Extract just the word text
    deletedWordsCache = new Set(Object.values(deletedWords).map(w => w.word));
    lastDeletedWordsFetch = now;

    console.log('📝 Loaded deleted words list:', deletedWordsCache.size, 'words');
    return deletedWordsCache;
  } catch (error) {
    console.error('Error fetching deleted words:', error);
    return new Set();
  }
}

// Detect which platform we're on
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('netflix.com')) {
    currentPlatform = 'netflix';
  } else if (hostname.includes('amazon.com') || hostname.includes('primevideo.com')) {
    currentPlatform = 'prime';
  } else {
    currentPlatform = 'unknown';
  }
  return currentPlatform;
}

// Initialize UI
function initializeUI() {
  // Remove existing panel if it exists
  const existingPanel = document.getElementById('language-insights');
  if (existingPanel) existingPanel.remove();

  // Create insights panel
  const insightPanel = document.createElement('div');
  insightPanel.id = 'language-insights';
  insightPanel.style.display = 'none';
  document.body.appendChild(insightPanel);
}

// Get subtitle selectors based on platform
function getSubtitleSelectors() {
  if (currentPlatform === 'netflix') {
    return [
      '.player-timedtext',
      '.VideoContainer div.player-timedtext',
      '[data-uia="player-timedtext-text"]',
      '.player-timedtext-text-container'
    ];
  } else if (currentPlatform === 'prime') {
    return [
      '.atvwebplayersdk-captions-text',
      '.atvwebplayersdk-captions-overlay',
      '.atvwebplayersdk-subtitle-text'
    ];
  }
  return [];
}

// Remove bracketed text (character names) but keep complete words/expressions
function cleanSubtitle(text) {
  // Remove text in brackets (character names)
  const withoutBrackets = text.replace(/\([^)]*\)/g, '').trim();

  // Check if there's at least one Kanji character in the text
  // Unicode ranges: \u4e00-\u9fff (main Kanji), \u3400-\u4dbf (Extension A)
  const hasKanji = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(withoutBrackets);

  if (!hasKanji) {
    return '';
  }

  // Return the complete text with Kanji + kana for context
  return withoutBrackets;
}

// Process subtitles
function processSubtitles() {
  const selectors = getSubtitleSelectors();
  let subtitleElement = null;

  // Try each selector until we find one
  for (const selector of selectors) {
    subtitleElement = document.querySelector(selector);
    if (subtitleElement) break;
  }

  // Reduced logging - only log when subtitle found
  if (!subtitleElement) return;

  const currentSubtitle = subtitleElement.textContent.trim();

  if (!currentSubtitle || currentSubtitle === lastProcessedSubtitle) return;

  // Remove bracketed names but keep complete expressions with Kanji
  const cleanedText = cleanSubtitle(currentSubtitle);

  // Skip if no Kanji found
  if (!cleanedText) return;

  lastProcessedSubtitle = currentSubtitle;

  console.log('📝 Subtitle detected:', cleanedText);

  // Send cleaned subtitle to background script
  chrome.runtime.sendMessage({
    type: 'PROCESS_SUBTITLE',
    subtitle: cleanedText,
    platform: currentPlatform
  });
}

// Store current translation globally so save buttons can access it
let currentTranslation = '';

// Display insights in the panel
async function displayInsights(subtitle, insights) {
  const insightPanel = document.getElementById('language-insights');
  if (!insightPanel) {
    initializeUI();
    return displayInsights(subtitle, insights);
  }

  try {
    console.log('📥 Raw insights received:', insights);
    const parsedInsights = JSON.parse(insights);
    console.log('📦 Parsed insights:', parsedInsights);
    const words = parsedInsights.words || [];
    const translation = parsedInsights.translation || '';
    currentTranslation = translation;

    console.log('📊 Final data:', { wordsCount: words.length, hasTranslation: !!translation, words });

    // If no words found, hide panel (translation is captured but we only show words)
    if (words.length === 0) {
      insightPanel.style.display = 'none';
      return;
    }

    let html = `
      <div class="platform-indicator">${currentPlatform.toUpperCase()}</div>
    `;

    // Translation is captured but not displayed in popup
    // It's only used when saving words to Firebase

    // Filter out words without kanji (likely basic hiragana words)
    const hasKanji = (text) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
    const wordsWithKanji = words.filter(word => hasKanji(word.word));

    console.log(`Filtered: ${words.length} words → ${wordsWithKanji.length} words with kanji`);

    // Get deleted words and filter them out
    const deletedWordSet = await fetchDeletedWords();
    const wordsToDisplay = wordsWithKanji.filter(word => !deletedWordSet.has(word.word));

    console.log(`After deleting filtered words: ${wordsWithKanji.length} → ${wordsToDisplay.length} words to display`);

    // If no words to display, hide panel
    if (wordsToDisplay.length === 0) {
      insightPanel.style.display = 'none';
      return;
    }

    // Add word explanations (with auto-saved indicator)
    wordsToDisplay.forEach((word, index) => {
      const wordId = `word-${index}`;
      html += `
        <div class="word-item" data-word-id="${wordId}">
          <div class="word-header">
            <div class="word">${word.word}</div>
            <div class="auto-saved">✓</div>
          </div>
          ${word.romanization ? `<div class="reading">${word.romanization}</div>` : ''}
          ${word.reading ? `<div class="reading">${word.reading}</div>` : ''}
          <div class="meaning">${word.meaning}</div>
        </div>
      `;
    });

    insightPanel.innerHTML = html;
    insightPanel.style.display = 'block';

    // Auto-save all words that are displayed (already filtered for deleted words)
    wordsToDisplay.forEach(word => {
      autoSaveWord(word, subtitle);
    });
  } catch (error) {
    console.error('Error displaying insights:', error);
    if (insightPanel) insightPanel.style.display = 'none';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AI_RESPONSE') {
    displayInsights(lastProcessedSubtitle, message.data);
  }
});

// Initialize extension
detectPlatform();
initializeUI();
console.log('✅ Japanese Learning Assistant loaded on', currentPlatform);

// Watch for subtitle changes (optimized for maximum speed)
const observer = new MutationObserver(() => {
  processSubtitles();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  characterDataOldValue: false
});

// Process subtitles periodically as backup (fast polling for immediate response)
setInterval(processSubtitles, 200);

// Reinitialize UI when navigating between pages
document.addEventListener('transitionend', (event) => {
  // Netflix specific
  if (event.target.id === 'appMountPoint') {
    setTimeout(initializeUI, 1000);
  }
});

// Prime Video specific - watch for URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(() => {
      detectPlatform();
      initializeUI();
    }, 2000);
  }
}).observe(document, { subtree: true, childList: true });

// Also reinitialize on page load for Prime Video
window.addEventListener('load', () => {
  setTimeout(() => {
    detectPlatform();
    initializeUI();
  }, 3000);
});

// Auto-save word to Firebase
function autoSaveWord(word, subtitle) {
  chrome.runtime.sendMessage({
    type: 'SAVE_WORD',
    wordData: {
      word: word.word,
      reading: word.reading || word.romanization || '',
      meaning: word.meaning,
      context: subtitle,
      contextTranslation: currentTranslation,
      platform: currentPlatform
    }
  }, (response) => {
    if (response && response.success) {
      console.log('✓ Auto-saved:', word.word);
    } else {
      console.error('Failed to auto-save:', word.word);
    }
  });
}