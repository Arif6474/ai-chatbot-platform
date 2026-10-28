import widgetCss from './widget.css?inline';

(function initWidget() {
  // Prevent duplicate execution
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

  // SVG Icons
  const ICONS = {
    bot: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M9 13v2"/><path d="M15 13v2"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    reset: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    chat: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    arrowRight: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };

  function hexToRgba(hex, alpha) {
    let c = (hex || '#2563eb').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(37, 99, 235, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function darkenHex(hex, amount = 30) {
    let c = (hex || '#2563eb').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return hex || '#1e40af';
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

  // Inject bundled Tailwind CSS and custom animations
  const styleEl = document.createElement('style');
  styleEl.textContent = widgetCss;
  shadow.appendChild(styleEl);

  // Root wrapper inside shadow DOM
  const root = document.createElement('div');
  root.className = 'ai-widget-root text-slate-800 text-sm font-sans';
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

  // Main Render function building the UI with accessible elements
  function render() {
    if (!state.config || !state.config.enabled) {
      root.replaceChildren();
      return;
    }

    const { displayName, primaryColor, position } = state.config;
    const isLeft = position === 'bottom-left';
    const darkColor = darkenHex(primaryColor, 35);
    const shadowRgba = hexToRgba(primaryColor, 0.38);

    const positionClasses = isLeft
      ? 'fixed bottom-5 left-5 z-[999999]'
      : 'fixed bottom-5 right-5 z-[999999]';

    root.className = `ai-widget-root text-slate-800 text-sm font-sans ${positionClasses}`;
    root.replaceChildren();

    // Chat Panel (shown if isOpen is true)
    if (state.isOpen) {
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', `${displayName} Chat`);
      panel.className = `w-[370px] sm:w-[390px] max-w-[calc(100vw-2.5rem)] h-[580px] max-h-[calc(100vh-6.5rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 mb-3.5 transition-all duration-200 ease-out origin-bottom widget-enter ${
        isLeft ? 'origin-bottom-left' : 'origin-bottom-right'
      }`;
      panel.style.boxShadow = `0 20px 40px -12px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.06), 0 8px 16px -6px rgba(0, 0, 0, 0.08)`;

      // 1. Premium Header with gradient and action controls
      const header = document.createElement('header');
      header.className = 'px-4 py-3.5 flex items-center justify-between text-white select-none relative overflow-hidden shrink-0 shadow-sm';
      header.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${darkColor} 100%)`;

      // Header subtle gloss sheen
      const gloss = document.createElement('div');
      gloss.className = 'absolute inset-0 pointer-events-none opacity-20';
      gloss.style.background = 'radial-gradient(circle at 10% 20%, rgba(255,255,255,0.8) 0%, transparent 60%)';
      header.appendChild(gloss);

      // Header left title group
      const headerTitleGroup = document.createElement('div');
      headerTitleGroup.className = 'flex items-center gap-2.5 relative z-10';

      // Avatar container with live status
      const avatarWrapper = document.createElement('div');
      avatarWrapper.className = 'relative flex items-center justify-center';

      const avatar = document.createElement('div');
      avatar.className = 'w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs text-white shadow-sm';
      avatar.innerHTML = ICONS.bot;

      // Live green presence dot
      const liveDot = document.createElement('span');
      liveDot.className = 'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white';

      avatarWrapper.appendChild(avatar);
      avatarWrapper.appendChild(liveDot);

      const titleContainer = document.createElement('div');
      titleContainer.className = 'flex flex-col';

      const title = createTextElement('h2', displayName || 'AI Assistant', 'font-semibold text-sm leading-tight text-white tracking-tight');
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'flex items-center gap-1.5 text-[11px] text-white/80 font-normal mt-0.5';
      statusIndicator.innerHTML = '<span>Typically replies instantly</span>';

      titleContainer.appendChild(title);
      titleContainer.appendChild(statusIndicator);
      headerTitleGroup.appendChild(avatarWrapper);
      headerTitleGroup.appendChild(titleContainer);

      // Header right action controls (Reset + Close)
      const headerActions = document.createElement('div');
      headerActions.className = 'flex items-center gap-1 relative z-10';

      // Refresh / Restart button
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.setAttribute('aria-label', 'Reset conversation');
      resetBtn.title = 'New conversation';
      resetBtn.className = 'p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer focus:outline-none';
      resetBtn.innerHTML = ICONS.reset;
      resetBtn.addEventListener('click', resetConversation);

      // Minimize / Close button
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close chat window');
      closeBtn.className = 'p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-colors cursor-pointer focus:outline-none';
      closeBtn.innerHTML = ICONS.close;
      closeBtn.addEventListener('click', toggleOpen);

      headerActions.appendChild(resetBtn);
      headerActions.appendChild(closeBtn);

      header.appendChild(headerTitleGroup);
      header.appendChild(headerActions);
      panel.appendChild(header);

      // 2. Messages Canvas
      const messageList = document.createElement('div');
      messageList.className = 'ai-widget-messages flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50';

      // Date pill divider
      const dateDivider = document.createElement('div');
      dateDivider.className = 'flex justify-center select-none my-1';
      dateDivider.innerHTML = '<span class="text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded-full px-2.5 py-0.5 shadow-sm">Today</span>';
      messageList.appendChild(dateDivider);

      state.messages.forEach((msg) => {
        const isUser = msg.role === 'user';
        const msgRow = document.createElement('div');
        msgRow.className = `flex gap-2 widget-msg ${isUser ? 'justify-end' : 'justify-start'}`;

        // Assistant avatar for assistant rows
        if (!isUser) {
          const botAvatar = document.createElement('div');
          botAvatar.className = 'w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5';
          botAvatar.style.background = `linear-gradient(135deg, ${primaryColor}, ${darkColor})`;
          botAvatar.innerHTML = ICONS.bot;
          msgRow.appendChild(botAvatar);
        }

        const bubbleCol = document.createElement('div');
        bubbleCol.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[82%]`;

        const bubble = document.createElement('div');
        if (isUser) {
          bubble.className = 'px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-[13px] leading-relaxed break-words whitespace-pre-wrap text-white shadow-sm';
          bubble.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${darkColor} 100%)`;
        } else {
          bubble.className = 'px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-[13px] leading-relaxed break-words whitespace-pre-wrap text-slate-800 bg-white border border-slate-200 shadow-sm';
        }

        // Strictly safe text content assignment (Strict XSS Prevention)
        bubble.textContent = msg.text;
        bubbleCol.appendChild(bubble);

        // Subtext row with time and optional automated badge
        const metaRow = document.createElement('div');
        metaRow.className = `flex items-center gap-1.5 mt-1 px-1 text-[10px] ${isUser ? 'text-slate-400 justify-end' : 'text-slate-400 justify-start'}`;

        if (msg.fallbackApplied) {
          const badge = document.createElement('span');
          badge.className = 'inline-flex items-center text-[9.5px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5';
          badge.textContent = 'Automated fallback';
          metaRow.appendChild(badge);
        }

        if (msg.time) {
          const timeSpan = document.createElement('span');
          timeSpan.textContent = msg.time;
          metaRow.appendChild(timeSpan);
        }

        bubbleCol.appendChild(metaRow);
        msgRow.appendChild(bubbleCol);
        messageList.appendChild(msgRow);
      });

      // Quick Starter Prompts (shown when only welcome message is present)
      if (state.messages.length <= 1 && !state.isLoading) {
        const promptGroup = document.createElement('div');
        promptGroup.className = 'pt-2 space-y-1.5';

        const promptTitle = document.createElement('div');
        promptTitle.className = 'text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1';
        promptTitle.textContent = 'Suggested Questions';
        promptGroup.appendChild(promptTitle);

        const suggestions = [
          'What services do you offer?',
          'What are your business hours?',
          'How can I get in touch with you?',
        ];

        suggestions.forEach((text) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'w-full text-left px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-medium transition-all shadow-sm cursor-pointer flex items-center justify-between';
          
          const chipText = createTextElement('span', text, 'flex-1 overflow-hidden');
          const chipArrow = document.createElement('span');
          chipArrow.className = 'text-slate-300 ml-1.5 shrink-0';
          chipArrow.innerHTML = ICONS.arrowRight;

          chip.appendChild(chipText);
          chip.appendChild(chipArrow);
          chip.addEventListener('click', () => sendMessage(text));
          promptGroup.appendChild(chip);
        });

        messageList.appendChild(promptGroup);
      }

      // Loading state indicator with bot avatar
      if (state.isLoading) {
        const loadingRow = document.createElement('div');
        loadingRow.className = 'flex gap-2 items-center widget-msg';

        const botAvatar = document.createElement('div');
        botAvatar.className = 'w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm';
        botAvatar.style.background = `linear-gradient(135deg, ${primaryColor}, ${darkColor})`;
        botAvatar.innerHTML = ICONS.bot;

        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'flex items-center gap-1.5 text-xs text-slate-500 px-3.5 py-2.5 bg-white rounded-2xl rounded-tl-xs border border-slate-200 shadow-sm';
        loadingBubble.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 widget-dot-1"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 widget-dot-2"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 widget-dot-3"></span>
          <span class="ml-1 text-[11px] font-medium text-slate-400">Thinking...</span>
        `;

        loadingRow.appendChild(botAvatar);
        loadingRow.appendChild(loadingBubble);
        messageList.appendChild(loadingRow);
      }

      // Error banner
      if (state.error) {
        const errorBanner = document.createElement('div');
        errorBanner.className = 'p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-center gap-2 shadow-sm';
        errorBanner.innerHTML = ICONS.error;
        const errorText = createTextElement('span', state.error, 'flex-1 font-medium');
        errorBanner.appendChild(errorText);
        messageList.appendChild(errorBanner);
      }

      panel.appendChild(messageList);

      // 3. Footer Input Area with Card Enclosure and Branding
      const footer = document.createElement('footer');
      footer.className = 'p-3 bg-white border-t border-slate-100 shrink-0';

      const form = document.createElement('form');
      form.className = 'flex flex-col gap-1.5';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const textarea = form.querySelector('textarea');
        if (textarea && textarea.value) {
          sendMessage(textarea.value);
          textarea.value = '';
          textarea.style.height = 'auto';
        }
      });

      // Capsule input card
      const inputCard = document.createElement('div');
      inputCard.className = 'flex items-end gap-1.5 bg-slate-100 hover:bg-slate-100 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-300 border border-slate-200 rounded-2xl p-1.5 transition-all shadow-sm';

      const textarea = document.createElement('textarea');
      textarea.rows = 1;
      textarea.placeholder = 'Type your message...';
      textarea.maxLength = 500;
      textarea.setAttribute('aria-label', 'Chat message');
      textarea.className = 'flex-1 bg-transparent border-0 outline-none text-slate-800 text-[13px] placeholder:text-slate-400 resize-none max-h-24 px-2 py-1 leading-normal';

      // Auto-expand textarea
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
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
      sendBtn.className = 'w-8 h-8 rounded-xl text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex items-center justify-center cursor-pointer shrink-0';
      sendBtn.style.background = `linear-gradient(135deg, ${primaryColor}, ${darkColor})`;
      sendBtn.innerHTML = ICONS.send;

      inputCard.appendChild(textarea);
      inputCard.appendChild(sendBtn);
      form.appendChild(inputCard);

      // Subtle branding note
      const brandBadge = document.createElement('div');
      brandBadge.className = 'flex items-center justify-center gap-1 text-[10px] text-slate-400 font-medium select-none pt-0.5';
      brandBadge.innerHTML = '<span>⚡ Powered by AI</span>';
      form.appendChild(brandBadge);

      footer.appendChild(form);
      panel.appendChild(footer);

      root.appendChild(panel);
    }

    // 4. Floating Action Launcher Button
    const launcherWrapper = document.createElement('div');
    launcherWrapper.className = `flex items-center ${isLeft ? 'justify-start' : 'justify-end'} gap-2.5`;

    // Tooltip prompt when closed
    if (!state.isOpen) {
      const tooltip = document.createElement('div');
      tooltip.className = 'hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 text-xs font-medium rounded-full shadow-lg border border-slate-200 cursor-pointer select-none transition-transform hover:scale-105';
      tooltip.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>Chat with us 👋</span>
      `;
      tooltip.addEventListener('click', toggleOpen);
      launcherWrapper.appendChild(tooltip);
    }

    const launcherBtn = document.createElement('button');
    launcherBtn.type = 'button';
    launcherBtn.setAttribute('aria-label', state.isOpen ? 'Close chat' : 'Open chat');
    launcherBtn.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    launcherBtn.className =
      'w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-offset-2 shrink-0 shadow-lg';
    launcherBtn.style.color = '#ffffff';

    if (state.isOpen) {
      launcherBtn.style.backgroundColor = '#1e293b';
      launcherBtn.style.boxShadow = '0 10px 25px -4px rgba(15, 23, 42, 0.35)';
      launcherBtn.innerHTML = ICONS.close;
    } else {
      launcherBtn.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${darkColor} 100%)`;
      launcherBtn.style.boxShadow = `0 10px 25px -4px ${shadowRgba}, 0 4px 10px -2px rgba(0,0,0,0.1)`;
      launcherBtn.innerHTML = ICONS.chat;
    }

    launcherBtn.addEventListener('click', toggleOpen);
    launcherWrapper.appendChild(launcherBtn);
    root.appendChild(launcherWrapper);
  }

  // Kick off configuration loading
  loadConfig();
})();
