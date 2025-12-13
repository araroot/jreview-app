// Popup script for showing user ID and stats

// Firebase Configuration (same as background.js)
const FIREBASE_CONFIG = {
  databaseURL: "https://japanese-learning-app-dc19d-default-rtdb.firebaseio.com"
};

// Helper function to get deleted words set from Firebase
async function getDeletedWordsSet(userId) {
  try {
    if (!userId || userId === 'Not initialized yet') {
      return new Set();
    }
    const url = `${FIREBASE_CONFIG.databaseURL}/users/${userId}/deletedWords.json`;
    const response = await fetch(url);
    if (!response.ok) {
      return new Set();
    }
    const deletedData = await response.json();
    if (!deletedData) {
      return new Set();
    }
    return new Set(Object.values(deletedData).map(w => w.word));
  } catch (error) {
    console.error('Error fetching deleted words:', error);
    return new Set();
  }
}

// Load user data when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get user ID and current show
    const result = await chrome.storage.local.get(['anonymousUserId', 'savedWords', 'currentShow']);
    const userId = result.anonymousUserId || 'Not initialized yet';
    const savedWords = result.savedWords || {};
    const currentShow = result.currentShow || null;

    // Display user ID
    document.getElementById('userId').textContent = userId;

    // Display current show
    const currentShowEl = document.getElementById('currentShow');
    if (currentShow && currentShow.name) {
      currentShowEl.textContent = `${currentShow.name} S${currentShow.season}E${currentShow.episode}`;
      currentShowEl.title = `Click to change: ${currentShow.name} Season ${currentShow.season} Episode ${currentShow.episode}`;
    } else {
      currentShowEl.textContent = 'Not set - Click to set';
    }

    // Get deleted words from Firebase and filter them out
    const deletedWordSet = await getDeletedWordsSet(userId);
    
    // Calculate stats (excluding deleted words)
    const words = Object.values(savedWords).filter(w => !deletedWordSet.has(w.word));
    const now = Date.now();

    const stats = {
      total: words.length,
      due: words.filter(w => !w.mastered && w.nextReview <= now).length,
      mastered: words.filter(w => w.mastered).length
    };

    // Display stats
    document.getElementById('totalWords').textContent = stats.total;
    document.getElementById('dueWords').textContent = stats.due;
    document.getElementById('masteredWords').textContent = stats.mastered;

    // Copy button
    document.getElementById('copyBtn').addEventListener('click', () => {
      if (userId !== 'Not initialized yet') {
        navigator.clipboard.writeText(userId).then(() => {
          const successMsg = document.getElementById('successMsg');
          successMsg.classList.add('show');
          setTimeout(() => {
            successMsg.classList.remove('show');
          }, 2000);
        });
      } else {
        alert('User ID not ready yet. Try watching a show and saving a word first!');
      }
    });

    // Open review app button
    document.getElementById('openReviewBtn').addEventListener('click', () => {
      // Open the GitHub Pages URL or local file
      chrome.tabs.create({
        url: 'https://araroot.github.io/jreview-app/review-app.html'
      });
    });

    // Show editor buttons
    document.getElementById('setShowBtn').addEventListener('click', () => {
      document.getElementById('showEditor').style.display = 'block';
      // Pre-fill with current show if exists
      if (currentShow && currentShow.name) {
        document.getElementById('showName').value = currentShow.name;
        document.getElementById('season').value = currentShow.season;
        document.getElementById('episode').value = currentShow.episode;
      }
    });

    document.getElementById('currentShow').addEventListener('click', () => {
      document.getElementById('setShowBtn').click();
    });

    document.getElementById('cancelShowBtn').addEventListener('click', () => {
      document.getElementById('showEditor').style.display = 'none';
    });

    document.getElementById('saveShowBtn').addEventListener('click', async () => {
      const name = document.getElementById('showName').value.trim();
      const season = parseInt(document.getElementById('season').value) || 1;
      const episode = parseInt(document.getElementById('episode').value) || 1;

      if (!name) {
        alert('Please enter a show name');
        return;
      }

      const showData = { name, season, episode };
      await chrome.storage.local.set({ currentShow: showData });

      // Update display
      currentShowEl.textContent = `${name} S${season}E${episode}`;
      currentShowEl.title = `Click to change: ${name} Season ${season} Episode ${episode}`;

      // Hide editor
      document.getElementById('showEditor').style.display = 'none';

      console.log('✅ Current show set to:', showData);
    });

  } catch (error) {
    console.error('Error loading popup:', error);
    document.getElementById('userId').textContent = 'Error loading';
  }
});
