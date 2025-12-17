console.log('Streaming Language Assistant: Content script loading...');

let lastProcessedSubtitle = '';
let currentPlatform = '';
let lastSentSubtitle = '';
let lastRequestId = 0;

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

  // Send cleaned subtitle to background script (no logging for speed)
  lastRequestId += 1;
  lastSentSubtitle = cleanedText;
  chrome.runtime.sendMessage({
    type: 'PROCESS_SUBTITLE',
    subtitle: cleanedText,
    platform: currentPlatform,
    requestId: lastRequestId,
    ts: Date.now()
  });

  // Show a lightweight "loading" state immediately to stay in sync
  const insightPanel = document.getElementById('language-insights');
  if (insightPanel) {
    insightPanel.innerHTML = `
      <div class="platform-indicator">${currentPlatform.toUpperCase()}</div>
      <div style="opacity: 0.85; padding: 6px 0;">…</div>
    `;
    insightPanel.style.display = 'block';
  }
}

// Display insights in the panel (synchronous for maximum speed)
function displayInsights(subtitle, insights) {
  const insightPanel = document.getElementById('language-insights');
  if (!insightPanel) {
    initializeUI();
    return displayInsights(subtitle, insights);
  }

  try {
    const parsedInsights = JSON.parse(insights);
    const words = parsedInsights.words || [];

    // If no words found, hide panel
    if (words.length === 0) {
      insightPanel.style.display = 'none';
      return;
    }

    let html = `
      <div class="platform-indicator">${currentPlatform.toUpperCase()}</div>
    `;

    // Background chooses "difficult" words; show them as-is (kana-only difficult words included)
    // Add word explanations (words-only overlay; sentence mining happens in background)
    words.forEach((word, index) => {
      const wordId = `word-${index}`;
      html += `
        <div class="word-item" data-word-id="${wordId}">
          <div class="word-header">
            <div class="word">${word.word}</div>
          </div>
          ${word.romanization ? `<div class="reading">${word.romanization}</div>` : ''}
          ${word.reading ? `<div class="reading">${word.reading}</div>` : ''}
          <div class="meaning">${word.meaning}</div>
        </div>
      `;
    });

    insightPanel.innerHTML = html;
    insightPanel.style.display = 'block';
  } catch (error) {
    console.error('Error displaying insights:', error);
    if (insightPanel) insightPanel.style.display = 'none';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AI_RESPONSE') {
    // Ignore stale responses so the overlay stays synced to the latest subtitle
    if (typeof message.requestId === 'number' && message.requestId !== lastRequestId) return;
    if (typeof message.subtitle === 'string' && message.subtitle !== lastSentSubtitle) return;
    displayInsights(message.subtitle || lastSentSubtitle, message.data);
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

