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
  const apiBaseUrl = currentScript?.getAttribute('data-api-base')?.trim() || '';

  if (!tenantSlug) {
    console.warn('[AI Chatbot Widget] Missing required data-tenant attribute. Widget initialization aborted.');
    return;
  }

  window.__AI_CHATBOT_WIDGET_INITIALIZED__ = true;

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

  // Inject bundled Tailwind CSS
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
        });
      }

      render();
    } catch (err) {
      console.warn('[AI Chatbot Widget] Failed to load configuration:', err.message);
      // If tenant is inactive, disabled, or not configured, remove container cleanly
      container.remove();
      window.__AI_CHATBOT_WIDGET_INITIALIZED__ = false;
    }
  }

  // Send message
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || state.isLoading) return;

    // Add user message to local state
    state.messages.push({ role: 'user', text: trimmed });
    state.isLoading = true;
    state.error = null;
    render();

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
    const positionClasses = isLeft
      ? 'fixed bottom-5 left-5 z-[999999]'
      : 'fixed bottom-5 right-5 z-[999999]';

    root.className = `ai-widget-root text-slate-800 text-sm font-sans ${positionClasses}`;
    root.replaceChildren();

    // Launcher button
    const launcherBtn = document.createElement('button');
    launcherBtn.type = 'button';
    launcherBtn.setAttribute('aria-label', state.isOpen ? 'Close chat' : 'Open chat');
    launcherBtn.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    launcherBtn.className =
      'w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-offset-2';
    launcherBtn.style.backgroundColor = primaryColor;
    launcherBtn.style.color = '#ffffff';

    if (state.isOpen) {
      // Close (X) icon (SVG)
      launcherBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      // Chat bubble icon (SVG)
      launcherBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
        </svg>
      `;
    }

    launcherBtn.addEventListener('click', toggleOpen);

    // Chat Panel (shown if isOpen is true)
    if (state.isOpen) {
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', `${displayName} Chat`);
      panel.className = `w-[360px] sm:w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 mb-4 transition-all duration-200 ease-out origin-bottom ${
        isLeft ? 'origin-bottom-left' : 'origin-bottom-right'
      }`;

      // 1. Header
      const header = document.createElement('header');
      header.className = 'px-4 py-3.5 flex items-center justify-between text-white shadow-sm select-none';
      header.style.backgroundColor = primaryColor;

      const headerTitleGroup = document.createElement('div');
      headerTitleGroup.className = 'flex items-center gap-2.5';

      const avatar = document.createElement('div');
      avatar.className = 'w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs text-white';
      avatar.textContent = (displayName || 'A').slice(0, 1).toUpperCase();

      const titleContainer = document.createElement('div');
      const title = createTextElement('h2', displayName || 'Assistant', 'font-semibold text-sm leading-tight text-white');
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'flex items-center gap-1.5 text-[11px] text-white/80';
      statusIndicator.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>Online</span>';

      titleContainer.appendChild(title);
      titleContainer.appendChild(statusIndicator);
      headerTitleGroup.appendChild(avatar);
      headerTitleGroup.appendChild(titleContainer);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close chat window');
      closeBtn.className = 'p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40';
      closeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      closeBtn.addEventListener('click', toggleOpen);

      header.appendChild(headerTitleGroup);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // 2. Messages List
      const messageList = document.createElement('div');
      messageList.className = 'ai-widget-messages flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60';

      state.messages.forEach((msg) => {
        const msgRow = document.createElement('div');
        msgRow.className = `flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`;

        const bubble = document.createElement('div');
        bubble.className = `max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap shadow-xs ${
          msg.role === 'user'
            ? 'bg-blue-600 text-white rounded-br-xs'
            : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
        }`;

        if (msg.role === 'user') {
          bubble.style.backgroundColor = primaryColor;
          bubble.style.color = '#ffffff';
        }

        // Strictly safe text content assignment (no innerHTML)
        bubble.textContent = msg.text;
        msgRow.appendChild(bubble);

        if (msg.fallbackApplied) {
          const fallbackBadge = createTextElement(
            'span',
            'Automated response',
            'text-[10px] text-slate-400 mt-1 px-1'
          );
          msgRow.appendChild(fallbackBadge);
        }

        messageList.appendChild(msgRow);
      });

      // Loading state indicator
      if (state.isLoading) {
        const loadingRow = document.createElement('div');
        loadingRow.className = 'flex items-center gap-1.5 text-xs text-slate-400 px-3 py-2 bg-white rounded-2xl w-fit border border-slate-200 shadow-xs';
        loadingRow.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
          <span class="ml-1 text-[11px] font-medium text-slate-500">Thinking...</span>
        `;
        messageList.appendChild(loadingRow);
      }

      // Error banner
      if (state.error) {
        const errorBanner = document.createElement('div');
        errorBanner.className = 'p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs flex items-center gap-2';
        errorBanner.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        `;
        const errorText = createTextElement('span', state.error, 'flex-1');
        errorBanner.appendChild(errorText);
        messageList.appendChild(errorBanner);
      }

      panel.appendChild(messageList);

      // 3. Footer Input Area
      const footer = document.createElement('footer');
      footer.className = 'p-3 bg-white border-t border-slate-200';

      const form = document.createElement('form');
      form.className = 'flex items-end gap-2';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const textarea = form.querySelector('textarea');
        if (textarea && textarea.value) {
          sendMessage(textarea.value);
          textarea.value = '';
          textarea.style.height = 'auto';
        }
      });

      const textarea = document.createElement('textarea');
      textarea.rows = 1;
      textarea.placeholder = 'Type your message...';
      textarea.maxLength = 500;
      textarea.setAttribute('aria-label', 'Chat message');
      textarea.className =
        'flex-1 resize-none bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-800 placeholder:text-slate-400 rounded-xl px-3 py-2 text-xs sm:text-sm border border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-28 transition-colors';

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
      sendBtn.className =
        'p-2.5 rounded-xl text-white shadow-xs transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer';
      sendBtn.style.backgroundColor = primaryColor;
      sendBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;

      form.appendChild(textarea);
      form.appendChild(sendBtn);
      footer.appendChild(form);
      panel.appendChild(footer);

      root.appendChild(panel);
    }

    // Append launcher
    const launcherWrapper = document.createElement('div');
    launcherWrapper.className = `flex ${isLeft ? 'justify-start' : 'justify-end'}`;
    launcherWrapper.appendChild(launcherBtn);
    root.appendChild(launcherWrapper);
  }

  // Kick off configuration loading
  loadConfig();
})();
