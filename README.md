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
AUTOPROMOTO/
├── server/
│ ├── node_modules/
│ ├── .tmp/ # Temporary videos / voice files
│ ├── server.js # Express server logic
│ ├── aliexpress.js # AliExpress API integration + HMAC signature
│ └── check-env.mjs # Environment validation
├── public/
│ ├── app.js # Client logic (fetch + UI updates)
│ ├── index.html # Simple search and campaign UI
│ ├── style.css # Styling for campaign results
│ └── videos/ # Generated output videos
├── .env # Environment configuration
├── package.json
├── .gitignore
└── README.md

makefile
Copy code

---

## 🔐 Environment Variables (`.env`)
```env
APP_KEY=your_aliexpress_app_key
APP_SECRET=your_aliexpress_secret
TRACKING_ID=mm_XXXX_YYYY_ZZZZ
ALI_BASE_URL=https://api-sg.aliexpress.com/sync
OPENAI_API_KEY=sk-XXXX
OPENAI_MODEL=gpt-4o-mini
TARGET_LANGUAGE=en
TARGET_CURRENCY=USD
SHIP_TO_COUNTRY=US
PORT=4000
🧱 API Endpoints
POST /api/find-by-name
Search for products on AliExpress.

json
Copy code
{
  "keyword": "wireless headphones"
}
Response:

json
Copy code
{
  "found": true,
  "title": "Baseus Wireless Headphones Bluetooth 5.3",
  "url": "https://s.click.aliexpress.com/e/_XYZabc",
  "score": 0.97
}
POST /api/make-campaign
Generate a full campaign (ad copy, TTS, video).

json
Copy code
{
  "affiliateUrl": "https://s.click.aliexpress.com/e/_XYZabc",
  "productTitle": "Baseus Wireless Headphones",
  "brief": "high quality, long battery life"
}
🧰 Installation & Run
1. Clone the repo
bash
Copy code
git clone https://github.com/maor-dev/Promto.git
cd Promto
2. Install dependencies
bash
Copy code
npm install
3. Run locally
bash
Copy code
npm run dev
Then visit 👉 http://localhost:4000

🧩 How It Works (Pipeline)
1.User searches for a product by keyword.

2.Server calls AliExpress API → returns product details.

3.OpenAI GPT-4o creates ad text.

4.TTS model converts it into a voiceover.

5.FFmpeg merges the voice + image into a video.

6.Frontend displays the campaign with a ready affiliate link.

