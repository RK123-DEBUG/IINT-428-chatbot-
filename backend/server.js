// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import axios from "axios";
import fs from "fs";
import path from "path";

const app = express();

// 🌐 ENABLE CORS
app.use(cors());

// 📦 ENABLE JSON PARSING
app.use(express.json());

// API Keys Array
const apiKeys = [process.env.OPENROUTER_API_KEY, process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
let currentKeyIndex = 0;

// User Management (Basic JSON store)
const USERS_FILE = path.join(process.cwd(), 'users.json');

const loadUsers = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
        return JSON.parse(fs.readFileSync(USERS_FILE));
    } catch {
        return [];
    }
};
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

app.post('/api/signup', (req, res) => {
    const { username, emailOrMobile, password } = req.body;
    if (!username || !emailOrMobile || !password) return res.status(400).json({ error: "All fields are required" });
    
    const users = loadUsers();
    if (users.find(u => u.username === username || u.emailOrMobile === emailOrMobile)) {
        return res.status(400).json({ error: "User already exists with that username or email/mobile" });
    }
    
    users.push({ username, emailOrMobile, password });
    saveUsers(users);
    res.json({ success: true, message: "Registered successfully" });
});

app.post('/api/login', (req, res) => {
    // identifier can be username, email, or mobile
    const { identifier, password } = req.body; 
    if (!identifier || !password) return res.status(400).json({ error: "Identifier and password required" });
    
    const users = loadUsers();
    const user = users.find(u => (u.username === identifier || u.emailOrMobile === identifier) && u.password === password);
    
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ success: true, username: user.username });
});

// ─────────────────────────────────────────────
//  /chat  — Message handler
//  Enforces strict domain checks via System Prompt
// ─────────────────────────────────────────────
const systemPrompt = `You are a strict, domain-focused AI assistant. You specialize exclusively in chatbot technologies, AI, NLP, and conversational interfaces.
Your rules:
1. You may engage normally in casual conversation, greetings (like "hi", "hello", "how are you"), and polite pleasantries. Be friendly and conversational like ChatGPT.
2. If the user asks specific questions about OTHER subjects, general knowledge outside AI/chatbots, or programming unrelated to chatbots/CSE, YOU MUST REJECT IT.
3. If the user asks out-of-domain questions, politely reject them with exactly this message: "I am designed to answer questions related to chatbots and AI. I can explain to you about NLP chatbots, rule-based systems, and related topics."
4. Never answer out-of-domain questions, even partially. Just provide the polite rejection.
5. For valid questions within your domain (chatbots, AI, NLP), provide clear, insightful, and helpful answers.`;

app.post("/chat", async (req, res) => {
    const userMessage = req.body.message || "";
    const history = req.body.history || [];
    console.log("➡ Message:", userMessage);

    if (apiKeys.length === 0) {
        return res.status(500).json({ error: "No API keys configured. Please set OPENROUTER_API_KEY or GEMINI_API_KEY in .env" });
    }

    try {
        console.log("📡 Calling Gemini API...");

        let response;
        let success = false;
        let lastError = null;
        let reply = null;
// Try API keys in case of failure/rate limit
        for (let i = 0; i < apiKeys.length; i++) {
            const keyToUse = apiKeys[currentKeyIndex].trim();
            
            try {
                if (keyToUse.startsWith("sk-or-")) {
                    // Use OpenRouter endpoint
                    console.log(`📡 Calling OpenRouter API with key ${currentKeyIndex + 1}...`);
                    response = await axios.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        {
                            model: "google/gemini-2.5-flash",
                            max_tokens: 8000,
                            messages: [
                                { role: "system", content: systemPrompt },
                                ...history.map(msg => ({ role: msg.role, content: msg.content })),
                                { role: "user", content: userMessage }
                            ]
                        },
                        {
                            headers: {
                                "Authorization": `Bearer ${keyToUse}`,
                                "Content-Type": "application/json",
                                "HTTP-Referer": "http://localhost:3000",
                                "X-Title": "INT 428 Chatbot"
                            }
                        }
                    );
                    reply = response.data?.choices?.[0]?.message?.content;
                } else {
                    // Use Native Google Gemini endpoint
                    console.log(`📡 Calling Gemini Native API with key ${currentKeyIndex + 1}...`);
                    response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyToUse}`,
                        {
                            systemInstruction: { parts: [{ text: systemPrompt }] },
                            contents: [
                                ...history.map(msg => ({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] })),
                                { role: "user", parts: [{ text: userMessage }] }
                            ]
                        }
                    );
                    reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                }
                
                success = true;
                break; // Stop trying if successful
            } catch (error) {
                console.warn(`⚠️ API Key ${currentKeyIndex + 1} failed. Error: ${error.response?.data?.error?.message || error.message}`);
                console.warn(`   Moving to next key...`);
                lastError = error;
                // Rotate to the next available key
                currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
            }
        }

        if (!success) {
            throw lastError || new Error("All API keys failed.");
        }

        if (!reply) {
            console.warn("⚠️ Empty reply from API");
            return res.status(502).json({ error: "Empty response from API" });
        }

        console.log(`✅ Reply sent. (Used Key ${currentKeyIndex + 1 === 0 ? apiKeys.length : currentKeyIndex})`);
        res.json({ reply });

    } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        console.error("🔥 API Error:", errMsg);
        res.status(500).json({ error: errMsg });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 Loaded ${apiKeys.length} API key(s)`);
    if (apiKeys.length === 0) {
        console.warn("⚠️ Warning: OPENROUTER_API_KEY or GEMINI_API_KEY is NOT set in .env!");
    }
});
