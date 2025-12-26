// Winna Rain Claimer - Content Script
(function() {
  'use strict';

  // Configuration
  let settings = {
    enabled: false,
    delay: 3,
    minAmount: 100,
    totalJoins: 0,
    lastRainTime: null
  };

  let isWaitingToJoin = false;
  let joinTimeout = null;
  let observer = null;

  // Logging with prefix
  function log(message, ...args) {
    console.log(`[Rain Claimer] ${message}`, ...args);
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['rainClaimerSettings']);
      if (result.rainClaimerSettings) {
        settings = { ...settings, ...result.rainClaimerSettings };
      }
      log('Settings loaded:', settings);
    } catch (error) {
      log('Error loading settings:', error);
    }
  }

  // Save settings to storage
  async function saveSettings() {
    try {
      await chrome.storage.local.set({ rainClaimerSettings: settings });
      // Notify popup about stats update
      chrome.runtime.sendMessage({
        type: 'STATS_UPDATED',
        totalJoins: settings.totalJoins,
        lastRainTime: settings.lastRainTime
      }).catch(() => {});
    } catch (error) {
      log('Error saving settings:', error);
    }
  }

  // Find the Join button for Live Rain
  function findJoinButton() {
    // Strategy 1: Look for button with exact "Join" text near "Live Rain" text
    const allElements = document.querySelectorAll('*');
    let rainContainer = null;
    
    // First, find the Live Rain container
    for (const el of allElements) {
      const text = el.textContent || '';
      if (text.includes('Live Rain') && el.children.length > 0) {
        // Found potential rain container
        rainContainer = el;
        break;
      }
    }
    
    // Strategy 2: Look for all buttons with "Join" text
    const buttons = document.querySelectorAll('button');
    
    for (const button of buttons) {
      const buttonText = button.textContent.trim();
      
      // Check if it's the Join button (exact match or contains Join)
      if (buttonText === 'Join' || buttonText.toLowerCase() === 'join') {
        // Verify button is visible and enabled
        if (!button.disabled && button.offsetParent !== null) {
          // Check if it's near the Live Rain section
          const parent = button.closest('[class*="rain"]') || 
                         button.closest('[class*="Rain"]') ||
                         button.closest('[class*="live"]') ||
                         button.closest('[class*="Live"]');
          
          if (parent) {
            log('Found Join button in rain container');
            return button;
          }
          
          // Check parent hierarchy for "Live Rain" text
          let currentEl = button.parentElement;
          let depth = 0;
          while (currentEl && depth < 10) {
            if (currentEl.textContent && currentEl.textContent.includes('Live Rain')) {
              log('Found Join button near Live Rain text');
              return button;
            }
            currentEl = currentEl.parentElement;
            depth++;
          }
          
          // Also check by looking at sibling elements
          const parentEl = button.parentElement;
          if (parentEl) {
            const siblingText = parentEl.textContent || '';
            if (siblingText.includes('Rain') || siblingText.includes('rain')) {
              log('Found Join button with Rain sibling');
              return button;
            }
          }
        }
      }
    }
    
    // Strategy 3: Look for specific CSS selectors commonly used
    const joinSelectors = [
      'button[class*="join"]',
      'button[class*="Join"]',
      '[class*="rain"] button',
      '[class*="Rain"] button',
      '[class*="live-rain"] button',
      '[class*="liveRain"] button',
      '[data-testid*="join"]',
      '[data-testid*="rain"]',
      // Common React/Next.js patterns
      'div[class*="rain"] button',
      'div[class*="Rain"] button'
    ];
    
    for (const selector of joinSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent.toLowerCase().trim();
          if (text === 'join' && !element.disabled) {
            log('Found Join button via selector:', selector);
            return element;
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Strategy 4: Last resort - any visible "Join" button
    for (const button of buttons) {
      const buttonText = button.textContent.trim().toLowerCase();
      if (buttonText === 'join' && !button.disabled && button.offsetParent !== null) {
        // Make sure it's not a generic join button (like join chat)
        const ariaLabel = button.getAttribute('aria-label') || '';
        if (!ariaLabel.toLowerCase().includes('chat')) {
          log('Found Join button (fallback)');
          return button;
        }
      }
    }
    
    return null;
  }

  // Get current rain amount from the page
  function getRainAmount() {
    // Strategy 1: Find the exact element with rain amount
    // The amount is in a div with classes "flex w-full min-w-[50px] grow items-center justify-center"
    // inside the Live Rain container
    
    // First, find the Live Rain container (has "Live Rain" text)
    const liveRainContainers = document.querySelectorAll('[class*="glowBorderContainer"], [class*="GlowBorder"]');
    
    for (const container of liveRainContainers) {
      if (container.textContent && container.textContent.includes('Live Rain')) {
        // Found Live Rain container, now find the amount
        // Look for div with min-w-[50px] that contains $ amount
        const amountDivs = container.querySelectorAll('div.flex.grow');
        
        for (const div of amountDivs) {
          const text = div.textContent.trim();
          // Check if it's a dollar amount like $149.89
          if (/^\$[\d,]+\.?\d*$/.test(text)) {
            const amountStr = text.replace('$', '').replace(/,/g, '');
            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && amount > 0) {
              log(`Found rain amount: $${amount}`);
              return amount;
            }
          }
        }
        
        // Fallback: search all divs in container for $ pattern
        const allDivs = container.querySelectorAll('div');
        for (const div of allDivs) {
          // Only check leaf nodes (no child divs) or specific structure
          if (div.children.length === 0 || div.classList.contains('grow')) {
            const text = div.textContent.trim();
            // Match exact dollar amount pattern like $149.89 or $1,234.56
            if (/^\$[\d,]+\.?\d*$/.test(text)) {
              const amountStr = text.replace('$', '').replace(/,/g, '');
              const amount = parseFloat(amountStr);
              // Filter out very large amounts that might be from leaderboard ($34k etc)
              if (!isNaN(amount) && amount > 0 && amount < 50000 && !text.includes('k')) {
                log(`Found rain amount (fallback): $${amount}`);
                return amount;
              }
            }
          }
        }
      }
    }
    
    // Strategy 2: Find by looking near Join/Joined button
    const joinButtons = document.querySelectorAll('button');
    for (const button of joinButtons) {
      const buttonText = button.textContent.trim().toLowerCase();
      if (buttonText === 'join' || buttonText.includes('joined')) {
        // Go up to find parent container and look for amount
        let parent = button.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const divs = parent.querySelectorAll('div');
          for (const div of divs) {
            const text = div.textContent.trim();
            if (/^\$\d+\.?\d*$/.test(text)) {
              const amountStr = text.replace('$', '');
              const amount = parseFloat(amountStr);
              if (!isNaN(amount) && amount > 0 && amount < 50000) {
                log(`Found rain amount (near button): $${amount}`);
                return amount;
              }
            }
          }
          parent = parent.parentElement;
          depth++;
        }
      }
    }
    
    // Strategy 3: Simple regex search in Live Rain area
    const pageText = document.body.innerHTML;
    const liveRainMatch = pageText.match(/Live Rain[\s\S]*?\$(\d+\.?\d*)/);
    if (liveRainMatch) {
      const amount = parseFloat(liveRainMatch[1]);
      if (!isNaN(amount) && amount > 0 && amount < 50000) {
        log(`Found rain amount (regex): $${amount}`);
        return amount;
      }
    }
    
    log('Could not find rain amount');
    return 0; // Return 0 if no amount found
  }
  
  // Check if rain is currently active (Join button is available)
  function isRainActive() {
    const joinButton = findJoinButton();
    return joinButton !== null && !joinButton.disabled;
  }
  
  // Check if rain amount meets minimum requirement
  function isRainAmountSufficient() {
    const amount = getRainAmount();
    const minAmount = settings.minAmount || 0;
    
    if (minAmount <= 0) {
      return true; // No minimum set, always join
    }
    
    if (amount <= 0) {
      log(`Could not determine rain amount, skipping (minimum is $${minAmount})`);
      return false; // Can't determine amount, DON'T join if minimum is set
    }
    
    const sufficient = amount >= minAmount;
    log(`Rain amount: $${amount}, minimum: $${minAmount}, sufficient: ${sufficient}`);
    return sufficient;
  }

  // Click the Join button
  function clickJoinButton() {
    const joinButton = findJoinButton();
    
    if (joinButton && !joinButton.disabled) {
      log('Clicking Join button...');
      
      // Simulate a natural click
      joinButton.click();
      
      // Also dispatch events for frameworks that might need them
      joinButton.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      
      // Update stats
      settings.totalJoins++;
      settings.lastRainTime = Date.now();
      saveSettings();
      
      log(`Successfully joined! Total joins: ${settings.totalJoins}`);
      return true;
    }
    
    log('Join button not found or disabled');
    return false;
  }

  // Handle rain detection
  function handleRainDetected() {
    if (!settings.enabled) {
      log('Auto-join is disabled');
      return;
    }

    if (isWaitingToJoin) {
      log('Already waiting to join...');
      return;
    }

    const joinButton = findJoinButton();
    if (!joinButton || joinButton.disabled) {
      return;
    }
    
    // Check if rain amount meets minimum requirement
    if (!isRainAmountSufficient()) {
      log(`Rain amount below minimum ($${settings.minAmount}), skipping...`);
      return;
    }

    log(`Rain detected! Joining in ${settings.delay} seconds...`);
    isWaitingToJoin = true;

    // Clear any existing timeout
    if (joinTimeout) {
      clearTimeout(joinTimeout);
    }

    // Set timeout with user-specified delay
    joinTimeout = setTimeout(() => {
      if (settings.enabled) {
        // Re-check amount before joining (it might have changed)
        if (!isRainAmountSufficient()) {
          log(`Rain amount dropped below minimum ($${settings.minAmount}), cancelling...`);
          isWaitingToJoin = false;
          return;
        }
        
        const success = clickJoinButton();
        if (!success) {
          log('Failed to join, will retry on next detection');
        }
      }
      isWaitingToJoin = false;
    }, settings.delay * 1000);
  }

  // Set up mutation observer to detect DOM changes
  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      // Check if rain became active
      if (isRainActive()) {
        handleRainDetected();
      }
    });

    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'style']
    });

    log('Observer set up, watching for rain...');
  }

  // Periodic check for rain (backup to observer)
  function startPeriodicCheck() {
    setInterval(() => {
      if (settings.enabled && !isWaitingToJoin && isRainActive()) {
        handleRainDetected();
      }
    }, 1000); // Check every second
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED') {
      settings = { ...settings, ...message.settings };
      log('Settings updated:', settings);
      
      // If disabled, clear any pending join
      if (!settings.enabled && joinTimeout) {
        clearTimeout(joinTimeout);
        isWaitingToJoin = false;
        log('Auto-join disabled, cleared pending join');
      }
    }
    sendResponse({ success: true });
  });

  // Initialize
  async function init() {
    log('Initializing Winna Rain Claimer...');
    
    await loadSettings();
    setupObserver();
    startPeriodicCheck();
    
    // Initial check
    if (settings.enabled && isRainActive()) {
      handleRainDetected();
    }
    
    log('Winna Rain Claimer ready!');
  }

  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also reinitialize when page content changes significantly (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      log('URL changed, reinitializing...');
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();

