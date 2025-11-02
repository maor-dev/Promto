# 🚀 Promto – AI-Powered Affiliate Marketing Automation

Promto (formerly AutoPromoto) is an **AI-driven automation platform** that turns the entire affiliate marketing workflow — from product search to campaign-ready creative — into a single streamlined process.  
It connects with **AliExpress Affiliate API**, **OpenAI GPT-4o**, and **FFmpeg** to automatically generate ad content, voiceovers, and video creatives.

---

## 🧩 Key Features
- 🔎 **Product Discovery:** Search for trending AliExpress products using keywords.
- 🔗 **Affiliate Link Generator:** Automatically generate valid affiliate tracking URLs.
- 🧠 **AI Copywriting:** Create persuasive ad copy via OpenAI GPT-4o models.
- 🗣️ **Text-to-Speech (TTS):** Generate realistic voiceovers for each product.
- 🎥 **Video Generator:** Combine product images, voiceover, and ad text into a short video via FFmpeg.
- 📢 **Post Ready Output:** Get a ready-to-upload post for Instagram or Facebook.

---

## 🧠 Tech Stack
| Layer | Technologies |
|-------|---------------|
| **Backend** | Node.js, Express, dotenv, Cheerio, OpenAI API |
| **Media** | FFmpeg, fluent-ffmpeg, @ffmpeg-installer/ffmpeg, @ffprobe-installer/ffprobe |
| **Frontend** | Vanilla JS, HTML5, CSS3 |
| **External APIs** | AliExpress Affiliate API, OpenAI GPT-4o, GPT-4o-mini-TTS |

---

## ⚙️ Project Structure
```bash
AUTOPROMOTO/
├── server/
│   ├── node_modules/            # Dependencies
│   ├── .tmp/                    # Temporary videos / voice files
│   ├── server.js                # Express server logic
│   ├── aliexpress.js            # AliExpress API integration + HMAC signature
│   └── check-env.mjs            # Environment validation
│
├── public/
│   ├── app.js                   # Client logic (fetch + UI updates)
│   ├── index.html               # Simple search and campaign UI
│   ├── style.css                # Styling for campaign results
│   └── videos/                  # Generated output videos
│
├── .env                         # Environment configuration
├── package.json
├── .gitignore
└── README.md

Installation & Run:
git clone https://github.com/maor-dev/Promto.git
cd Promto
cd Server
npm install
npm install -D nodemon
npm install cheerio
npm run dev


