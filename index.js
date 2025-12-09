const express = require('express');
const app = express();
const pino = require('pino');
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require("baileys");

// --- API CONFIGURATION ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT || 3000;

var sock;
const msgRetryCounterCache = new NodeCache();
let pairtime = 0;

// --- 1. BUTTON PARSER (ඔයාගේ Format එකට හරවන කොටස) ---
function parseButtons(buttonsData) {
    if (!buttonsData) return undefined;
    
    // GET request එකක් නම් string එක parse කරගන්නවා
    let buttons = typeof buttonsData === 'string' ? JSON.parse(buttonsData) : buttonsData;

    if (!Array.isArray(buttons) || buttons.length === 0) return undefined;

    return buttons.map((btn, index) => {
        if (btn.url) {
            return {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text,
                    url: btn.url,
                    merchant_url: btn.url
                })
            };
        } else if (btn.copy) {
            return {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text,
                    id: `copy_${index}`,
                    copy_code: btn.copy
                })
            };
        } else if (btn.reply) {
            return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text || btn.reply,
                    id: `reply_${index}`
                })
            };
        }
    }).filter(Boolean);
}

// --- MAIN BOT FUNCTION ---
async function bot(Num) {
    const { state, saveCreds } = await useMultiFileAuthState("./session/" + Num);
    
    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
        },
        printQRInTerminal: true,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.macOS("Safari"),
        msgRetryCounterCache
    });

    if (!sock.authState.creds.registered) {
        await delay(2000);
        const code = await sock.requestPairingCode(Num, "CDTWABOT");
        console.log("Pairing Code:", code);
        pairtime = Date.now();
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ Connected successfully!');
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("Logged out.");
                try { await fs.rm('session/' + Num, { recursive: true, force: true }); } catch (e) {}
                bot(Num);
            } else {
                bot(Num);
            }
        }
    });
}

// --- 2. API ROUTE (SEND MESSAGE) ---
app.all('/send', async (req, res) => {
    if (!sock) return res.status(503).json({ status: false, msg: "Bot not initialized" });

    const data = req.method === 'GET' ? req.query : req.body;
    
    const number = data.nb;
    const text = data.text;
    const imgUrl = data.img; // Image URL
    const buttonsRaw = data.buttons;

    if (!number || !text) {
        return res.status(400).json({ status: false, msg: "Missing 'nb' or 'text'" });
    }

    const jid = number.includes('@s.whatsapp.net') ? number : number + "@s.whatsapp.net";

    try {
        // Buttons ටික Format කරගන්නවා
        const interactiveButtons = parseButtons(buttonsRaw);

        // --- MESSAGE CONSTRUCTING ---
        let interactiveMessage = {};

        if (imgUrl) {
            // Image එකක් තිබේ නම් (User Code 2)
            interactiveMessage = {
                image: { url: imgUrl }, // කෙලින්ම URL එක
                caption: text,
                footer: "Site Alerts", // කැමති නම් වෙනස් කරන්න
                // title: "New Notification", // කැමති නම් දාන්න
                interactiveButtons: interactiveButtons // Buttons තිබේ නම් පමණක් යයි
            };
        } else {
            // Image එකක් නැත්නම් Text පමණයි (User Code 1)
            interactiveMessage = {
                text: text,
                footer: "Site Alerts",
                // title: "New Notification",
                interactiveButtons: interactiveButtons
            };
        }

        // --- SENDING ---
        // ඔයා දුන්නු විදියටම sock.sendMessage එක පාවිච්චි කරනවා
        await sock.sendMessage(jid, interactiveMessage, { quoted: null });

        return res.json({ status: true, msg: "Message sent successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, msg: "Failed to send", error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Site Alerts API Guide</title>
        <style>
            :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --accent: #3b82f6; --code-bg: #0f172a; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; }
            header { text-align: center; padding: 40px 0; border-bottom: 1px solid #334155; margin-bottom: 30px; }
            h1 { margin: 0; color: #fff; font-size: 2.5rem; }
            .badge { background: var(--accent); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; vertical-align: middle; }
            .card { background: var(--card); padding: 25px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #334155; }
            h2 { color: var(--accent); margin-top: 0; border-bottom: 1px solid #334155; padding-bottom: 10px; }
            code { background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
            pre { background: var(--code-bg); padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #334155; }
            pre code { background: transparent; color: #cbd5e1; padding: 0; }
            .method { font-weight: bold; color: #4ade80; margin-right: 10px; }
            .param-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .param-table th, .param-table td { text-align: left; padding: 12px; border-bottom: 1px solid #334155; }
            .param-table th { color: var(--accent); }
            .req { color: #f87171; font-size: 0.8rem; }
            .opt { color: #94a3b8; font-size: 0.8rem; }
            .footer { text-align: center; color: #64748b; margin-top: 50px; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>🔔 Site Alerts API</h1>
                <p>Automated WhatsApp Notification Gateway</p>
                <span class="badge">v1.0.0</span> <span class="badge" style="background:#22c55e">Online</span>
            </header>

            <div class="card">
                <h2>🚀 Send Message Endpoint</h2>
                <p>Use this endpoint to send notifications to any WhatsApp number.</p>
                <div style="background: #0f172a; padding: 15px; border-radius: 8px; font-family: monospace;">
                    <span class="method">POST / GET</span> 
                    <span style="color: #fff;">/send</span>
                </div>
            </div>

            <div class="card">
                <h2>📦 Parameters</h2>
                <table class="param-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Type</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>nb <span class="req">(Required)</span></td>
                            <td>String</td>
                            <td>Phone number (e.g., 94771234567)</td>
                        </tr>
                        <tr>
                            <td>text <span class="req">(Required)</span></td>
                            <td>String</td>
                            <td>The message content.</td>
                        </tr>
                        <tr>
                            <td>img <span class="opt">(Optional)</span></td>
                            <td>String (URL)</td>
                            <td>Direct URL to an image.</td>
                        </tr>
                        <tr>
                            <td>buttons <span class="opt">(Optional)</span></td>
                            <td>Array/JSON</td>
                            <td>List of interactive buttons.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>📝 JSON Body Example</h2>
                <p>Send a raw JSON POST request with the following structure:</p>
<pre><code>{
  "nb": "94771234567",
  "text": "Hello! Your order #1024 is confirmed.",
  "img": "https://example.com/product.jpg",
  "buttons": [
    { "url": "https://myshop.com", "text": "View Order" },
    { "copy": "ORDER1024", "text": "Copy Order ID" },
    { "reply": "Support", "text": "Contact Support" }
  ]
}</code></pre>
            </div>

            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Site Alerts System. Protected Route.</p>
            </div>
        </div>
    </body>
    </html>
    `);
});


// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
    bot(process.env.NUM || '94740945396'); // ඔබේ අංකය
});