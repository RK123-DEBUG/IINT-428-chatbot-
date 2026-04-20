// script.js — Pure message forwarder. No filtering. No domain checks.

if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('signup.html')) {
    if (!localStorage.getItem('currentUser')) {
        window.location.href = 'login.html';
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

const currentUser = localStorage.getItem('currentUser');
if (currentUser) {
    const userDisplay = document.getElementById('user-display-name');
    if (userDisplay) userDisplay.textContent = currentUser;
}

const chatContainer = document.getElementById('chat-container');
const defaultWelcomeHTML = chatContainer ? chatContainer.innerHTML : '';
const chatForm = document.getElementById('chat-form');
const userInputArea = document.getElementById('user-input');
const voiceButton = document.getElementById('voice-button');

let currentSessionId = null;

function getChatSessions() {
    if (!currentUser) return {};
    const data = localStorage.getItem(`chatSessions_${currentUser}`);
    return data ? JSON.parse(data) : {};
}

function saveChatSessions(sessions) {
    if (!currentUser) return;
    localStorage.setItem(`chatSessions_${currentUser}`, JSON.stringify(sessions));
}

function startNewChat() {
    currentSessionId = null;
    chatContainer.innerHTML = defaultWelcomeHTML;
    renderSidebar();
}

function loadSession(id) {
    currentSessionId = id;
    const sessions = getChatSessions();
    const session = sessions[id];
    chatContainer.innerHTML = ''; 
    
    if (session && session.messages) {
        session.messages.forEach(msg => {
            showMessage(msg.content, msg.isBot, false, true); // true to skip saving logic
        });
    }
    renderSidebar();
}

function deleteSession(e, id) {
    e.stopPropagation();
    let sessions = getChatSessions();
    delete sessions[id];
    saveChatSessions(sessions);
    if (currentSessionId === id) {
        startNewChat();
    } else {
        renderSidebar();
    }
}

function renderSidebar() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';
    const sessions = getChatSessions();
    const sorted = Object.values(sessions).sort((a,b) => b.updatedAt - a.updatedAt);
    
    sorted.forEach(session => {
        const div = document.createElement('div');
        div.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = session.title;
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";
        titleSpan.style.whiteSpace = "nowrap";

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '14px';
        deleteBtn.title = "Delete Chat";
        deleteBtn.onclick = (e) => deleteSession(e, session.id);

        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "space-between";
        div.appendChild(titleSpan);
        div.appendChild(deleteBtn);
        
        div.onclick = () => loadSession(session.id);
        list.appendChild(div);
    });
}

function scrollToBottom() {
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
}

function showMessage(content, isBot = true, isError = false, doNotSave = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', isBot ? 'bot-message' : 'user-message', 'appearing');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = isBot ? '🤖' : '👤';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    if (isError) {
        contentDiv.classList.add('error-msg');
    }

    // Convert newlines to <br> for basic formatting
    contentDiv.innerHTML = content.replace(/\n/g, '<br>');

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatContainer.appendChild(messageDiv);
    scrollToBottom();

    if (!doNotSave && !isError) {
        let sessions = getChatSessions();
        if (!currentSessionId) {
            currentSessionId = 'session_' + Date.now();
            sessions[currentSessionId] = {
                id: currentSessionId,
                title: isBot ? 'New Chat' : (content.substring(0, 25) + (content.length > 25 ? '...' : '')),
                updatedAt: Date.now(),
                messages: []
            };
            // Clear default welcome on first user message
            if (!isBot) {
                const initialBotNodes = Array.from(chatContainer.querySelectorAll('.bot-message'));
                if (initialBotNodes.length > 1) {
                    initialBotNodes[0].remove(); // Remove the welcome suggestions box if we started typing
                }
            }
        }
        
        sessions[currentSessionId].updatedAt = Date.now();
        sessions[currentSessionId].messages.push({ content, isBot });
        saveChatSessions(sessions);
        renderSidebar();
    }
}

function showTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.id = 'typing-indicator';
    messageDiv.classList.add('message', 'bot-message', 'appearing');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

// ─────────────────────────────────────────────
//  SUBMIT HANDLER
//  1. Show user message
//  2. POST full message to backend (no filtering)
//  3. Show API response as-is
// ─────────────────────────────────────────────
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const userInput = userInputArea.value.trim();
    if (!userInput) return;

    // Show user message
    showMessage(userInput, false);
    userInputArea.value = '';

    let historyContext = [];
    if (currentSessionId) {
        let sessions = getChatSessions();
        if (sessions[currentSessionId]) {
            const sessionMsgs = sessions[currentSessionId].messages;
            // Get last 10 messages excluding the current userInput we just added
            historyContext = sessionMsgs.slice(0, -1).slice(-10).map(msg => ({
                role: msg.isBot ? "assistant" : "user",
                content: msg.content
            }));
        }
    }

    // Show typing indicator and call backend
    showTypingIndicator();

    fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput, history: historyContext })
    })
    .then(res => res.json())
    .then(data => {
        removeTypingIndicator();
        console.log("Backend Response:", data);

        if (data.reply) {
            // ✅ Normal API response — display as-is
            showMessage(data.reply);
        } else if (data.error) {
            // ⚠️ API-level error returned by backend
            showMessage(`⚠️ API Error: ${data.error}`, true, true);
        }
    })
    .catch(err => {
        removeTypingIndicator();
        console.error("Fetch Error:", err);
        showMessage("❌ Network Error: Cannot reach server.", true, true);
    });
});

// Suggestion Chip Handler
function askAboutTopic(topic) {
    userInputArea.value = `Explain ${topic}`;
    chatForm.dispatchEvent(new Event('submit'));
}

window.askAboutTopic = askAboutTopic;

// ─────────────────────────────────────────────
//  VOICE INPUT HANDLER
// ─────────────────────────────────────────────
const defaultPlaceholder = "Ask about any chatbot type (e.g., AI chatbot, healthcare bot) or type 'help'...";
let recognition;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        if (voiceButton) voiceButton.classList.add('recording');
        if (userInputArea) userInputArea.placeholder = "Listening...";
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        if (userInputArea) userInputArea.value = transcript;
        // Automatically submit the form after capturing voice
        if (chatForm) chatForm.dispatchEvent(new Event('submit'));
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        if (voiceButton) voiceButton.classList.remove('recording');
        if (userInputArea) userInputArea.placeholder = defaultPlaceholder;
    };

    recognition.onend = function() {
        if (voiceButton) voiceButton.classList.remove('recording');
        if (userInputArea) userInputArea.placeholder = defaultPlaceholder;
    };

    if (voiceButton) {
        voiceButton.addEventListener('click', () => {
            if (voiceButton.classList.contains('recording')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    }
} else {
    if (voiceButton) voiceButton.style.display = 'none';
    console.warn("Speech Recognition API not supported in this browser.");
}

// Initial sidebar render
if (currentUser) {
    renderSidebar();
}
