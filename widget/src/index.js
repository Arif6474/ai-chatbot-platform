import widgetCss from './widget.css?inline';

(function initWidget() {
  // Prevent duplicate execution via window sentinel
  if (window.__AI_CHATBOT_WIDGET_INITIALIZED__) return;

  // Read configuration from document.currentScript or script with data-tenant
  const currentScript =
    document.currentScript ||
    document.querySelector('script[data-tenant]') ||
    document.querySelector('script[src*="widget.js"]');

  const tenantSlug = currentScript?.getAttribute('data-tenant')?.trim();
  const explicitApiBase = currentScript?.getAttribute('data-api-base')?.trim();
  let inferredApiBase = '';
  try {
    const src = currentScript?.getAttribute('src') || '';
    if (src.startsWith('http://') || src.startsWith('https://')) {
      inferredApiBase = new URL(src).origin;
    }
  } catch (_) {}
  const apiBaseUrl = (explicitApiBase || inferredApiBase || 'http://localhost:5050').replace(/\/+$/, '');

  if (!tenantSlug) {
    console.warn('[AI Chatbot Widget] Missing required data-tenant attribute. Widget initialization aborted.');
    return;
  }

  window.__AI_CHATBOT_WIDGET_INITIALIZED__ = true;

  // SVG Icons (compact, Lucide-aligned paths)
  const ICONS = {
    bot: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
    botMini: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M9 13v2"/><path d="M15 13v2"/></svg>',
    messageSquare: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    trash: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    maximize: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    minimize: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    globe: '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>',
    spin: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  };

  function resolveColor(hex) {
    if (!hex) return '#10b981';
    const clean = hex.trim().toLowerCase();
    if (clean === '#2563eb') return '#059669'; // Elevate plain blue to emerald
    return clean;
  }

  function hexToRgba(hex, alpha) {
    let c = resolveColor(hex).replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(16, 185, 129, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function darkenHex(hex, amount = 35) {
    let c = resolveColor(hex).replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return '#064e3b';
    const r = Math.max(0, ((num >> 16) & 255) - amount);
    const g = Math.max(0, ((num >> 8) & 255) - amount);
    const b = Math.max(0, (num & 255) - amount);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function formatTime(date = new Date()) {
    try {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  // Widget state
  const state = {
    isOpen: false,
    isExpanded: false,
    config: null,
    messages: [],
    sessionToken: null,
    isLoading: false,
    error: null,
  };

  // Host container
  const container = document.createElement('div');
  container.id = `ai-chatbot-widget-${tenantSlug}`;
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);

  // Attach Shadow DOM for total style and DOM isolation
  const shadow = container.attachShadow({ mode: 'open' });

  // Inject bundled styles
  const styleEl = document.createElement('style');
  styleEl.textContent = widgetCss;
  shadow.appendChild(styleEl);

  // Root wrapper inside shadow DOM
  const root = document.createElement('div');
  root.className = 'ai-widget-root text-stone-200 text-xs font-sans';
  shadow.appendChild(root);

  // Helper for safe text node creation (Strict XSS Prevention)
  function createTextElement(tag, text, className = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  // Fetch public chatbot configuration
  async function loadConfig() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/public/chat/${encodeURIComponent(tenantSlug)}/config`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || 'Chatbot service unavailable');
      }
      state.config = data.data;

      // Seed welcome message if configured
      if (state.config.welcomeMessage) {
        state.messages.push({
          role: 'assistant',
          text: state.config.welcomeMessage,
          isWelcome: true,
          time: formatTime(),
        });
      }

      render();
    } catch (err) {
      console.warn('[AI Chatbot Widget] Failed to load configuration:', err.message);
      container.remove();
      window.__AI_CHATBOT_WIDGET_INITIALIZED__ = false;
    }
  }

  // Send message
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || state.isLoading) return;

    // Add user message to local state
    state.messages.push({ role: 'user', text: trimmed, time: formatTime() });
    state.isLoading = true;
    state.error = null;
    render();
    scrollMessagesToBottom();

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/public/chat/${encodeURIComponent(tenantSlug)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          ...(state.sessionToken ? { sessionToken: state.sessionToken } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        state.error = data?.error?.message || 'Failed to send message. Please try again.';
      } else {
        if (data.data.sessionToken) {
          state.sessionToken = data.data.sessionToken;
        }
        state.messages.push({
          role: 'assistant',
          text: data.data.response,
          fallbackApplied: !!data.data.fallbackApplied,
          time: formatTime(),
        });
      }
    } catch (networkErr) {
      state.error = 'Network error. Please check your connection.';
    } finally {
      state.isLoading = false;
      render();
      scrollMessagesToBottom();
    }
  }

  function resetConversation() {
    state.messages = [];
    state.sessionToken = null;
    state.error = null;
    if (state.config?.welcomeMessage) {
      state.messages.push({
        role: 'assistant',
        text: state.config.welcomeMessage,
        isWelcome: true,
        time: formatTime(),
      });
    }
    render();
  }

  function toggleOpen() {
    state.isOpen = !state.isOpen;
    render();
    if (state.isOpen) {
      setTimeout(() => {
        const input = shadow.querySelector('textarea, input');
        input?.focus();
        scrollMessagesToBottom();
      }, 50);
    }
  }

  function scrollMessagesToBottom() {
    const msgList = shadow.querySelector('.ai-widget-messages');
    if (msgList) {
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  // Main Render function matching the reference ChatbotWidget design
  function render() {
    if (!state.config || !state.config.enabled) {
      root.replaceChildren();
      return;
    }

    const { displayName, primaryColor: rawColor, position } = state.config;
    const primaryColor = resolveColor(rawColor);
    const isLeft = position === 'bottom-left';
    const darkAccent = darkenHex(primaryColor, 35);
    const shadowRgba = hexToRgba(primaryColor, 0.4);

    const positionClasses = isLeft
      ? 'fixed bottom-6 left-6 z-[999999] flex flex-col items-start'
      : 'fixed bottom-6 right-6 z-[999999] flex flex-col items-end';

    root.className = `ai-widget-root text-stone-200 text-xs font-sans ${positionClasses}`;
    root.replaceChildren();

    // 1. Expanded Chat Window (Obsidian / Stone-900 Luxe Theme)
    if (state.isOpen) {
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', `${displayName} AI Chat`);

      // Expandable window sizing matching reference
      const sizeClasses = state.isExpanded
        ? 'w-[92vw] sm:w-[600px] h-[80vh] max-h-[750px]'
        : 'w-[92vw] sm:w-[400px] h-[550px] max-h-[85vh]';

      panel.className = `bg-stone-900 border border-stone-800 shadow-2xl rounded-3xl flex flex-col overflow-hidden mb-4 transition-all duration-300 ease-out origin-bottom widget-enter ${sizeClasses}`;
      panel.style.boxShadow = `0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 35px -5px ${shadowRgba}`;

      // --- Header (bg-stone-950/90 px-4 sm:px-5 py-3 border-b border-stone-800) ---
      const header = document.createElement('header');
      header.className = 'bg-stone-950/90 px-4 sm:px-5 py-3 border-b border-stone-800 flex flex-col shrink-0 select-none';

      // Header Row 1: Brand + Icon Controls
      const headerRow1 = document.createElement('div');
      headerRow1.className = 'flex items-center justify-between';

      // Brand left
      const brandWrapper = document.createElement('div');
      brandWrapper.className = 'flex items-center gap-2.5';

      const avatarBox = document.createElement('div');
      avatarBox.className = 'relative shrink-0';

      const avatarIcon = document.createElement('div');
      avatarIcon.className = 'w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md';
      avatarIcon.style.background = `linear-gradient(135deg, ${primaryColor}, ${darkAccent})`;
      avatarIcon.innerHTML = ICONS.bot;

      const presenceDot = document.createElement('span');
      presenceDot.className = 'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-stone-950';
      presenceDot.style.backgroundColor = primaryColor;

      avatarBox.appendChild(avatarIcon);
      avatarBox.appendChild(presenceDot);

      const brandTitleGroup = document.createElement('div');
      brandTitleGroup.className = 'flex items-center gap-1.5';

      const title = createTextElement('h3', displayName || 'AI Assistant', 'text-sm font-black text-white tracking-tight whitespace-nowrap');
      const aiBadge = document.createElement('span');
      aiBadge.className = 'border text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0';
      aiBadge.style.color = primaryColor;
      aiBadge.style.borderColor = hexToRgba(primaryColor, 0.4);
      aiBadge.style.backgroundColor = hexToRgba(primaryColor, 0.15);
      aiBadge.textContent = 'AI';

      brandTitleGroup.appendChild(title);
      brandTitleGroup.appendChild(aiBadge);
      brandWrapper.appendChild(avatarBox);
      brandWrapper.appendChild(brandTitleGroup);

      // Icon controls right (Reset, Expand, Close)
      const controls = document.createElement('div');
      controls.className = 'flex items-center gap-1 text-stone-400';

      // Reset / Clear
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.title = 'Reset conversation';
      resetBtn.setAttribute('aria-label', 'Reset conversation');
      resetBtn.className = 'p-1.5 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer text-stone-400';
      resetBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      resetBtn.innerHTML = ICONS.trash;
      resetBtn.addEventListener('click', resetConversation);

      // Expand / Minimize toggle
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.title = state.isExpanded ? 'Standard view' : 'Expand window';
      expandBtn.setAttribute('aria-label', state.isExpanded ? 'Standard view' : 'Expand window');
      expandBtn.className = 'hidden sm:block p-1.5 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer text-stone-400';
      expandBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      expandBtn.innerHTML = state.isExpanded ? ICONS.minimize : ICONS.maximize;
      expandBtn.addEventListener('click', () => {
        state.isExpanded = !state.isExpanded;
        render();
      });

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.title = 'Close chat';
      closeBtn.setAttribute('aria-label', 'Close chat');
      closeBtn.className = 'p-1.5 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer text-stone-400';
      closeBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      closeBtn.innerHTML = ICONS.close;
      closeBtn.addEventListener('click', toggleOpen);

      controls.appendChild(resetBtn);
      controls.appendChild(expandBtn);
      controls.appendChild(closeBtn);

      headerRow1.appendChild(brandWrapper);
      headerRow1.appendChild(controls);

      // Header Row 2: Model status + New Chat
      const headerRow2 = document.createElement('div');
      headerRow2.className = 'flex items-center justify-between mt-2 pt-2 border-t border-stone-800/80';

      const modelInfo = document.createElement('div');
      modelInfo.className = 'flex items-center gap-2 text-[10px] text-stone-400';
      modelInfo.innerHTML = `
        <span class="flex items-center gap-1">${ICONS.globe} Multilingual</span>
        <span class="text-stone-700">•</span>
        <span class="font-medium" style="color: ${primaryColor}">Online Assistant</span>
      `;

      const newChatBtn = document.createElement('button');
      newChatBtn.type = 'button';
      newChatBtn.title = 'Start fresh consultation';
      newChatBtn.className = 'flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border rounded-lg transition-colors cursor-pointer';
      newChatBtn.style.color = primaryColor;
      newChatBtn.style.borderColor = hexToRgba(primaryColor, 0.4);
      newChatBtn.style.backgroundColor = hexToRgba(primaryColor, 0.12);
      newChatBtn.innerHTML = `${ICONS.plus}<span>New Chat</span>`;
      newChatBtn.addEventListener('click', resetConversation);

      headerRow2.appendChild(modelInfo);
      headerRow2.appendChild(newChatBtn);

      header.appendChild(headerRow1);
      header.appendChild(headerRow2);
      panel.appendChild(header);

      // --- Messages Canvas (bg-[#161514] space-y-4 text-xs font-medium) ---
      const messageList = document.createElement('div');
      messageList.className = 'ai-widget-messages flex-1 p-4 overflow-y-auto space-y-4 text-xs font-medium bg-[#161514]';

      state.messages.forEach((msg) => {
        const isUser = msg.role === 'user';
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} widget-msg`;

        const bubble = document.createElement('div');
        if (isUser) {
          bubble.className = 'max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed text-white shadow-md break-words whitespace-pre-wrap';
          bubble.style.background = `linear-gradient(135deg, ${primaryColor}, ${darkAccent})`;
          bubble.style.boxShadow = `0 4px 14px -2px ${shadowRgba}`;
        } else {
          bubble.className = 'max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed bg-stone-900 border border-stone-800 text-stone-200 shadow-sm break-words whitespace-pre-wrap';
        }

        // Strictly safe text assignment (Strict XSS Prevention)
        bubble.textContent = msg.text;
        msgWrapper.appendChild(bubble);

        // Subtext / Timestamp row
        const metaRow = document.createElement('div');
        metaRow.className = `flex items-center gap-1.5 mt-1 px-1 text-[9px] text-stone-600 ${isUser ? 'justify-end' : 'justify-start'}`;

        if (msg.fallbackApplied) {
          const badge = document.createElement('span');
          badge.className = 'text-[9px] text-stone-500 bg-stone-900 border border-stone-800 rounded px-1.5 py-0.5';
          badge.textContent = 'Automated fallback';
          metaRow.appendChild(badge);
        }

        if (msg.time) {
          const timeSpan = document.createElement('span');
          timeSpan.textContent = msg.time;
          metaRow.appendChild(timeSpan);
        }

        msgWrapper.appendChild(metaRow);
        messageList.appendChild(msgWrapper);
      });

      // Loading Typing Indicator matching reference (Sparkles + bouncing dots)
      if (state.isLoading) {
        const loadingRow = document.createElement('div');
        loadingRow.className = 'flex items-start gap-2 widget-msg';

        const sparkIcon = document.createElement('div');
        sparkIcon.className = 'w-7 h-7 rounded-lg border flex items-center justify-center shrink-0';
        sparkIcon.style.backgroundColor = hexToRgba(primaryColor, 0.15);
        sparkIcon.style.borderColor = hexToRgba(primaryColor, 0.3);
        sparkIcon.style.color = primaryColor;
        sparkIcon.innerHTML = `<span class="animate-spin">${ICONS.sparkles}</span>`;

        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-stone-300 text-xs flex items-center gap-2';
        loadingBubble.innerHTML = `
          <span>Thinking</span>
          <span class="inline-flex gap-1 items-center">
            <span class="w-1.5 h-1.5 rounded-full widget-dot-1" style="background-color: ${primaryColor}"></span>
            <span class="w-1.5 h-1.5 rounded-full widget-dot-2" style="background-color: ${primaryColor}"></span>
            <span class="w-1.5 h-1.5 rounded-full widget-dot-3" style="background-color: ${primaryColor}"></span>
          </span>
        `;

        loadingRow.appendChild(sparkIcon);
        loadingRow.appendChild(loadingBubble);
        messageList.appendChild(loadingRow);
      }

      // Quick Suggestions Bar (when conversation has only welcome message)
      if (state.messages.length <= 1 && !state.isLoading) {
        const quickReplies = [
          'What services do you offer?',
          'What are your business hours?',
          'How can I get in touch?',
        ];

        const quickBar = document.createElement('div');
        quickBar.className = 'pt-2 flex flex-col gap-1.5';

        const barTitle = document.createElement('div');
        barTitle.className = 'text-[10px] font-bold uppercase tracking-wider text-stone-500 px-1';
        barTitle.textContent = 'Quick Questions';
        quickBar.appendChild(barTitle);

        quickReplies.forEach((reply) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'w-full text-left bg-stone-900/90 hover:bg-stone-800 border border-stone-800/90 text-stone-300 text-xs font-medium px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between shadow-sm';
          btn.style.cssText = 'background:rgba(28,25,23,0.9);border:1px solid rgba(41,37,36,0.9);cursor:pointer;';
          
          const textSpan = createTextElement('span', reply);
          const iconSpan = document.createElement('span');
          iconSpan.innerHTML = ICONS.plus;
          iconSpan.style.color = primaryColor;

          btn.appendChild(textSpan);
          btn.appendChild(iconSpan);
          btn.addEventListener('click', () => sendMessage(reply));
          quickBar.appendChild(btn);
        });

        messageList.appendChild(quickBar);
      }

      // Error banner
      if (state.error) {
        const errorBanner = document.createElement('div');
        errorBanner.className = 'p-3 rounded-2xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-center gap-2';
        const errorText = createTextElement('span', state.error, 'flex-1 font-medium');
        errorBanner.appendChild(errorText);
        messageList.appendChild(errorBanner);
      }

      panel.appendChild(messageList);

      // --- Input Bar matching reference ---
      const form = document.createElement('form');
      form.className = 'p-3 bg-stone-950 border-t border-stone-800 flex items-end gap-2 shrink-0';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const textarea = form.querySelector('textarea');
        if (textarea && textarea.value) {
          sendMessage(textarea.value);
          textarea.value = '';
          textarea.style.height = 'auto';
        }
      });

      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'flex-1 bg-stone-900/90 rounded-2xl border border-stone-800 transition-all flex items-center px-3.5 py-1.5';
      inputWrapper.style.cssText = `background: rgba(28, 25, 23, 0.9); border: 1px solid #292524; border-radius: 1rem;`;

      const textarea = document.createElement('textarea');
      textarea.rows = 1;
      textarea.placeholder = 'Ask in any language...';
      textarea.maxLength = 500;
      textarea.setAttribute('aria-label', 'Chat message');
      textarea.className = 'w-full bg-transparent text-xs text-white placeholder:text-stone-500 outline-none resize-none leading-relaxed py-1.5 max-h-28';
      textarea.style.cssText = 'width:100%;background:transparent;border:none;outline:none;resize:none;color:#ffffff;font-size:0.75rem;line-height:1.625;padding:0.375rem 0;box-shadow:none;';

      // Auto-expand textarea
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
      });

      // Enter to send (Shift+Enter for newline)
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });

      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.setAttribute('aria-label', 'Send message');
      sendBtn.disabled = state.isLoading;
      sendBtn.className = 'w-10 h-10 rounded-2xl text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shrink-0 cursor-pointer';
      sendBtn.style.cssText = `width:2.5rem;height:2.5rem;border-radius:1rem;color:#ffffff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:linear-gradient(135deg, ${primaryColor}, ${darkAccent});box-shadow:0 10px 20px -5px ${shadowRgba};`;
      sendBtn.innerHTML = state.isLoading ? ICONS.spin : ICONS.send;

      inputWrapper.appendChild(textarea);
      form.appendChild(inputWrapper);
      form.appendChild(sendBtn);
      panel.appendChild(form);

      root.appendChild(panel);
    }

    // 2. Floating Chat Trigger Button matching reference
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.setAttribute('aria-label', state.isOpen ? 'Close AI Concierge' : 'Open AI Concierge');
    triggerBtn.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    triggerBtn.className = 'group relative flex items-center gap-2.5 px-4 py-3.5 bg-stone-950 border text-white rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xl';
    triggerBtn.style.cssText = `cursor:pointer;display:flex;align-items:center;gap:0.625rem;padding:0.875rem 1rem;background-color:#0c0a09;border:1px solid ${hexToRgba(primaryColor, 0.35)};border-radius:9999px;box-shadow:0 20px 35px -10px rgba(0,0,0,0.8),0 0 20px -3px ${shadowRgba};`;

    const iconBox = document.createElement('div');
    iconBox.className = 'relative shrink-0';

    const circleBadge = document.createElement('div');
    circleBadge.className = 'w-8 h-8 rounded-full flex items-center justify-center text-white shadow-inner group-hover:rotate-12 transition-transform';
    circleBadge.style.cssText = `width:2rem;height:2rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#ffffff;background:linear-gradient(135deg, ${primaryColor}, ${darkAccent});`;
    circleBadge.innerHTML = state.isOpen ? ICONS.close : ICONS.messageSquare;
    iconBox.appendChild(circleBadge);

    const labelContainer = document.createElement('div');
    labelContainer.className = 'text-left hidden sm:block pr-1 select-none';

    const brandText = createTextElement('p', displayName || 'AI Assistant', 'text-[11px] font-black tracking-wider uppercase');
    brandText.style.color = primaryColor;

    const subText = createTextElement(
      'p',
      state.isOpen ? 'Click to minimize' : 'Ask in any language',
      'text-[9px] font-semibold text-stone-400'
    );

    labelContainer.appendChild(brandText);
    labelContainer.appendChild(subText);

    triggerBtn.appendChild(iconBox);
    triggerBtn.appendChild(labelContainer);
    triggerBtn.addEventListener('click', toggleOpen);

    root.appendChild(triggerBtn);
  }

  // Kick off configuration loading
  loadConfig();
})();
