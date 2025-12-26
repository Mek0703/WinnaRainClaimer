// ===== Translations =====
const translations = {
  en: {
    status_off: 'Off',
    status_on: 'Active',
    toggle_activate: 'Click to activate',
    toggle_enabled: 'Auto-claim enabled',
    min_amount_title: 'Minimum Amount',
    min_amount_tooltip: 'The script will only join rains with amount equal or higher than this value.',
    delay_title: 'Join Delay',
    delay_tooltip: 'Set the time the script will wait after rain starts before joining.',
    seconds: 'sec',
    stat_joins: 'Joins',
    stat_last_rain: 'Last Rain',
    cta_play: 'Play on Winna',
    time_just_now: 'Just now',
    time_min_ago: 'min. ago',
    time_hour_ago: 'h. ago'
  },
  ru: {
    status_off: 'Выключен',
    status_on: 'Активен',
    toggle_activate: 'Нажмите для активации',
    toggle_enabled: 'Автозахват включён',
    min_amount_title: 'Минимальная сумма',
    min_amount_tooltip: 'Скрипт будет участвовать только в дождях с суммой равной или выше этого значения.',
    delay_title: 'Задержка участия',
    delay_tooltip: 'Определите время, которое скрипт будет выжидать после запуска дождя перед тем, как участвовать в нём.',
    seconds: 'сек',
    stat_joins: 'Участий',
    stat_last_rain: 'Последний Rain',
    cta_play: 'Играть на Winna',
    time_just_now: 'Только что',
    time_min_ago: 'мин. назад',
    time_hour_ago: 'ч. назад'
  }
};

// Current language
let currentLang = 'en';

// DOM Elements
const enableToggle = document.getElementById('enableToggle');
const statusBadge = document.getElementById('statusBadge');
const toggleLabel = document.getElementById('toggleLabel');
const delayInput = document.getElementById('delayInput');
const delaySlider = document.getElementById('delaySlider');
const delayMinus = document.getElementById('delayMinus');
const delayPlus = document.getElementById('delayPlus');
const minAmountInput = document.getElementById('minAmountInput');
const minAmountSlider = document.getElementById('minAmountSlider');
const minAmountMinus = document.getElementById('minAmountMinus');
const minAmountPlus = document.getElementById('minAmountPlus');
const totalJoins = document.getElementById('totalJoins');
const lastRain = document.getElementById('lastRain');
const langToggle = document.getElementById('langToggle');
const langFlag = document.getElementById('langFlag');

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  delay: 3,
  minAmount: 100,
  totalJoins: 0,
  lastRainTime: null,
  language: 'en'
};

// ===== Language Functions =====
function t(key) {
  return translations[currentLang][key] || translations['en'][key] || key;
}

function applyTranslations() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  
  // Update flag
  langFlag.textContent = currentLang === 'en' ? '🇺🇸' : '🇷🇺';
  
  // Update dynamic elements based on current state
  updateStatusUI(enableToggle.checked);
  
  // Update last rain time with new language
  chrome.storage.local.get(['rainClaimerSettings']).then(result => {
    const settings = result.rainClaimerSettings || DEFAULT_SETTINGS;
    if (settings.lastRainTime) {
      lastRain.textContent = formatTime(new Date(settings.lastRainTime));
    }
  });
}

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ru' : 'en';
  applyTranslations();
  saveSettings({ language: currentLang });
}

// ===== Settings Functions =====
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['rainClaimerSettings']);
    const settings = result.rainClaimerSettings || DEFAULT_SETTINGS;
    
    // Load language first
    currentLang = settings.language || 'en';
    applyTranslations();
    
    // Apply settings to UI
    enableToggle.checked = settings.enabled;
    delayInput.value = settings.delay;
    delaySlider.value = settings.delay;
    minAmountInput.value = settings.minAmount || 100;
    minAmountSlider.value = Math.min(settings.minAmount || 100, 500);
    totalJoins.textContent = settings.totalJoins || 0;
    
    if (settings.lastRainTime) {
      const date = new Date(settings.lastRainTime);
      lastRain.textContent = formatTime(date);
    } else {
      lastRain.textContent = '—';
    }
    
    updateStatusUI(settings.enabled);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings(updates) {
  try {
    const result = await chrome.storage.local.get(['rainClaimerSettings']);
    const currentSettings = result.rainClaimerSettings || DEFAULT_SETTINGS;
    const newSettings = { ...currentSettings, ...updates };
    
    await chrome.storage.local.set({ rainClaimerSettings: newSettings });
    
    // Notify content script about settings change
    notifyContentScript(newSettings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

async function notifyContentScript(settings) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('winna.com')) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SETTINGS_UPDATED',
        settings: settings
      }).catch(() => {});
    }
  } catch (error) {}
}

// ===== UI Functions =====
function updateStatusUI(enabled) {
  if (enabled) {
    statusBadge.classList.add('active');
    statusBadge.querySelector('.status-text').textContent = t('status_on');
    toggleLabel.textContent = t('toggle_enabled');
    toggleLabel.style.color = '#22c55e';
  } else {
    statusBadge.classList.remove('active');
    statusBadge.querySelector('.status-text').textContent = t('status_off');
    toggleLabel.textContent = t('toggle_activate');
    toggleLabel.style.color = '';
  }
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return t('time_just_now');
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} ${t('time_min_ago')}`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${t('time_hour_ago')}`;
  } else {
    const locale = currentLang === 'ru' ? 'ru-RU' : 'en-US';
    return date.toLocaleDateString(locale, { 
      day: 'numeric', 
      month: 'short' 
    });
  }
}

function updateDelay(value) {
  value = Math.max(0, Math.min(60, parseInt(value) || 0));
  delayInput.value = value;
  delaySlider.value = value;
  saveSettings({ delay: value });
}

function updateMinAmount(value) {
  value = Math.max(0, Math.min(10000, parseInt(value) || 0));
  minAmountInput.value = value;
  minAmountSlider.value = Math.min(value, 500);
  saveSettings({ minAmount: value });
}

// ===== Event Listeners =====
enableToggle.addEventListener('change', () => {
  const enabled = enableToggle.checked;
  updateStatusUI(enabled);
  saveSettings({ enabled });
});

delayInput.addEventListener('input', () => {
  updateDelay(delayInput.value);
});

delayInput.addEventListener('blur', () => {
  updateDelay(delayInput.value);
});

delaySlider.addEventListener('input', () => {
  updateDelay(delaySlider.value);
});

delayMinus.addEventListener('click', () => {
  updateDelay(parseInt(delayInput.value) - 1);
});

delayPlus.addEventListener('click', () => {
  updateDelay(parseInt(delayInput.value) + 1);
});

minAmountInput.addEventListener('input', () => {
  updateMinAmount(minAmountInput.value);
});

minAmountInput.addEventListener('blur', () => {
  updateMinAmount(minAmountInput.value);
});

minAmountSlider.addEventListener('input', () => {
  updateMinAmount(minAmountSlider.value);
});

minAmountMinus.addEventListener('click', () => {
  updateMinAmount(parseInt(minAmountInput.value) - 10);
});

minAmountPlus.addEventListener('click', () => {
  updateMinAmount(parseInt(minAmountInput.value) + 10);
});

langToggle.addEventListener('click', toggleLanguage);

// Listen for stats updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STATS_UPDATED') {
    totalJoins.textContent = message.totalJoins || 0;
    if (message.lastRainTime) {
      lastRain.textContent = formatTime(new Date(message.lastRainTime));
    }
  }
});

// ===== Initialize =====
loadSettings();

// Refresh stats every second while popup is open
setInterval(async () => {
  const result = await chrome.storage.local.get(['rainClaimerSettings']);
  const settings = result.rainClaimerSettings || DEFAULT_SETTINGS;
  
  totalJoins.textContent = settings.totalJoins || 0;
  if (settings.lastRainTime) {
    lastRain.textContent = formatTime(new Date(settings.lastRainTime));
  }
}, 1000);
