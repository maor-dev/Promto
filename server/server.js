// server.js
import express from 'express'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { callAli } from './aliexpress.js'
import fetch from 'node-fetch'
import { load } from 'cheerio'            // Cheerio (שימוש ב-load)

// FFmpeg + TTS (וידאו מקומי)
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import fs from 'fs'
import crypto from 'crypto'

// ===== env / paths =====
dotenv.config()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// הגדרת נתיבי FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path)
ffmpeg.setFfprobePath(ffprobePath.path)

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ===== config =====
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'en'
const TARGET_CURRENCY = process.env.TARGET_CURRENCY || 'USD'
const SHIP_TO_COUNTRY = process.env.SHIP_TO_COUNTRY || 'US'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

// ===== file/dir helpers (ללא top-level await) =====
const PUBLIC_DIR = path.join(__dirname, 'public')
const VIDEO_DIR  = path.join(PUBLIC_DIR, 'videos')
const TMP_DIR    = path.join(__dirname, '.tmp')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
ensureDir(VIDEO_DIR)
ensureDir(TMP_DIR)

const writeFile = (...args) => fs.promises.writeFile(...args)
const unlinkSafe = async (p) => { try { await fs.promises.unlink(p) } catch (_) {} }

// ===== text utils =====
function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function tokenize(s) {
  const t = normalizeText(s)
  return t ? t.split(' ') : []
}
const STOP = new Set(['the','and','or','for','with','a','an','to','of','in','on','by','from','at','is','are',
  'של','עם','או','ו','על','אל','את','זה','זו','אלה','ל','מ','לא'])

// ===== AliExpress helpers =====
function getRespRoot(resp) {
  return resp?.resp_result?.result ||
         resp?.aliexpress_affiliate_product_query_response?.resp_result?.result ||
         resp?.aliexpress_affiliate_product_search_response?.resp_result?.result ||
         null
}
function extractProducts(resp) {
  const r = getRespRoot(resp)
  if (!r) return []
  if (Array.isArray(r.products)) return r.products
  if (r.products && Array.isArray(r.products.product)) return r.products.product
  const p2 = r.items || r.result_list
  if (Array.isArray(p2)) return p2
  return []
}
function extractUrl(p) {
  return (
    p?.promotion_link ||
    p?.product_detail_url ||
    p?.product_url ||
    p?.detail_url ||
    p?.url ||
    p?.promotion_url ||
    null
  )
}
function extractTitle(p) {
  return p?.product_title || p?.title || ''
}
function canonicalize(p) {
  return {
    id: p.product_id || p.item_id || p.id || null,
    title: extractTitle(p),
    url: extractUrl(p)
  }
}
function relevanceScore(title, query) {
  const T = normalizeText(title)
  const Q = normalizeText(query)
  if (!T || !Q) return 0
  let score = 0
  if (T.includes(Q)) score += 4
  const tSet = new Set(tokenize(T).filter(w => !STOP.has(w)))
  const qToks = tokenize(Q).filter(w => !STOP.has(w))
  let overlap = 0
  for (const tok of qToks) if (tSet.has(tok)) overlap++
  score += (overlap / Math.max(1, Math.min(6, qToks.length))) * 3
  return score
}

// ===== API: find-by-name =====
app.post('/api/find-by-name', async (req, res) => {
  try {
    const { keyword } = req.body || {}
    if (!keyword) return res.status(400).json({ error: 'Missing keyword' })

    const bizParams = {
      keywords: keyword,
      search_keyword: keyword,
      page_size: 50,
      page_no: 1,
      target_language: TARGET_LANGUAGE,
      target_currency: TARGET_CURRENCY,
      ship_to_country: SHIP_TO_COUNTRY,
      fields: 'product_id,product_title,product_detail_url,promotion_link'
    }

    const data = await callAli({ method: 'aliexpress.affiliate.product.query', bizParams })
    const raw = extractProducts(data)
    if (!raw.length) return res.json({ found: 0, reason: 'empty_after_extract' })

    const canonical = raw.map(canonicalize)
    const scored = canonical
      .map(c => ({ ...c, score: relevanceScore(c.title, keyword) }))
      .sort((a, b) => b.score - a.score)

    const best = scored.find(x => x.url)
    if (best) return res.json({ found: 1, url: best.url, title: best.title, score: Number(best.score?.toFixed(2) || 0) })

    // Fallbacks:
    const tokenMatch = canonical.find(c => c.url && tokenize(keyword).some(t => normalizeText(c.title).includes(t)))
    if (tokenMatch) return res.json({ found: 1, url: tokenMatch.url, title: tokenMatch.title, score: 0.8 })

    const firstWithUrl = canonical.find(c => c.url)
    if (firstWithUrl) return res.json({ found: 1, url: firstWithUrl.url, title: firstWithUrl.title, score: 0.5 })

    res.json({ found: 0, reason: 'no_url_anywhere' })
  } catch (err) {
    console.error('find-by-name error', err?.message)
    res.status(500).json({ error: 'AliExpress API failed', detail: err?.message })
  }
})

// ===== API: ali-debug =====
app.post('/api/ali-debug', async (req, res) => {
  try {
    const keywords = req.body?.keywords || 'laptop stand'
    const biz = {
      keywords,
      search_keyword: keywords,
      page_size: 5,
      page_no: 1,
      target_language: TARGET_LANGUAGE,
      target_currency: TARGET_CURRENCY,
      ship_to_country: SHIP_TO_COUNTRY,
      fields: 'product_id,product_title,product_detail_url,promotion_link'
    }
    const primary = await callAli({ method: 'aliexpress.affiliate.product.query', bizParams: biz })
    res.json({ primary })
  } catch (err) {
    console.error('ali-debug error', err?.message)
    res.status(500).json({ error: err?.message })
  }
})

// ===== Affiliate link generation =====
function normalizeAliItemUrl(u) {
  try {
    const url = new URL(u)
    if (url.hostname.includes('aliexpress.com')) {
      const m = url.pathname.match(/\/item\/(\d+)\.html/i)
      if (m) return `https://www.aliexpress.com/item/${m[1]}.html`
    }
    return u
  } catch { return u }
}
function collectAffiliateLinksFromAnyResponse(obj) {
  const links = []
  const dig = (o) => {
    if (!o || typeof o !== 'object') return
    if (o.promotion_link) links.push(o.promotion_link)
    if (o.promotion_short_link) links.push(o.promotion_short_link)
    if (o.promotionUrl) links.push(o.promotionUrl)
    const arrCandidates = [
      o.promotion_links, o.promotion_link_list, o.result_list, o.links,
      o.products, o.product_list && o.product_list.product
    ].filter(Boolean)
    for (const arr of arrCandidates) if (Array.isArray(arr)) for (const it of arr) dig(it)
    for (const v of Object.values(o)) if (v && typeof v === 'object') dig(v)
  }
  dig(obj)
  return Array.from(new Set(links))
}
function pickBestAffiliateLink(links) {
  if (!links || !links.length) return null
  const sClick = links.find(l => /s\.click\.aliexpress\.com/i.test(l))
  return sClick || links[0]
}

app.post('/api/make-affiliate-link', async (req, res) => {
  try {
    const { productUrl } = req.body || {}
    if (!productUrl) return res.status(400).json({ error: 'Missing productUrl' })

    const normalizedUrl = normalizeAliItemUrl(productUrl)
    const payload = {
      ship_to_country: SHIP_TO_COUNTRY,
      promotion_link_type: '0',
      source_values: normalizedUrl,
      tracking_id: 'default'
    }

    const resp = await callAli({ method: 'aliexpress.affiliate.link.generate', bizParams: payload })
    const links = collectAffiliateLinksFromAnyResponse(resp)
    const best = pickBestAffiliateLink(links)

    if (best) return res.json({ link: best, via: 'generate default', isAffiliate: /s\.click\.aliexpress\.com/i.test(best) })
    return res.status(502).json({ error: 'Affiliate link not found in API response' })
  } catch (err) {
    console.error('make-affiliate-link error', err?.message)
    res.status(500).json({ error: 'AliExpress API failed', detail: err?.message })
  }
})

/* ===========================
   Viral product idea via OpenAI (אופציונלי)
   =========================== */
async function fetchViralIdea(excludeList = []) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
  const system = `You are an e-commerce product scout for AliExpress. 
Return a *single* concise product search phrase that is likely to be trending/viral on social media and sells on AliExpress.
Rules:
- 2–6 words max, in English.
- Be specific.
- Avoid brand names and IP.
- Optimize for buyer intent.
- Must NOT equal any excluded phrase.`
  const user = `Give one product phrase only. Excluded:\n${excludeList.map(s=>`- ${s}`).join('\n') || '(none)'}`
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 1.0,
      max_tokens: 50,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!resp.ok) {
    const text = await resp.text().catch(()=> '')
    throw new Error(`OpenAI HTTP ${resp.status}: ${text}`)
  }
  const json = await resp.json()
  const content = json?.choices?.[0]?.message?.content?.trim() || ''
  return content.split('\n')[0].replace(/^"+|"+$/g,'').trim()
}

app.post('/api/viral-idea', async (req, res) => {
  try {
    const exclude = Array.isArray(req.body?.exclude) ? req.body.exclude : []
    const idea = await fetchViralIdea(exclude)
    if (!idea) return res.status(502).json({ error: 'Failed to get idea' })
    res.json({ idea })
  } catch (err) {
    console.error('viral-idea error', err?.message)
    res.status(500).json({ error: 'OpenAI failed', detail: err?.message })
  }
})

// ===== Utilities: image + OpenAI ad copy =====
function toDataUrl(buffer, contentType) {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`
}
async function downloadImageAsBuffer(imageUrl) {
  const r = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!r.ok) throw new Error(`download image failed: ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const ct = r.headers.get('content-type') || 'image/jpeg'
  return { buf, ct }
}
function normalizeImgUrl(u) { return u?.startsWith('//') ? 'https:' + u : u }
async function extractMainImageFromProductPage(productUrl) {
  const r = await fetch(productUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!r.ok) throw new Error(`fetch html failed: ${r.status}`)
  const html = await r.text()
  const $ = load(html)

  const og = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content')
  if (og) return normalizeImgUrl(og)

  const tw = $('meta[name="twitter:image"]').attr('content') || $('meta[property="twitter:image"]').attr('content')
  if (tw) return normalizeImgUrl(tw)

  let jsonImage = null
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const o = JSON.parse($(el).text().trim())
      if (o?.image) {
        if (typeof o.image === 'string') jsonImage = o.image
        else if (Array.isArray(o.image) && o.image.length) jsonImage = o.image[0]
      }
    } catch {}
  })
  if (jsonImage) return normalizeImgUrl(jsonImage)

  const runParamsMatch = html.match(/"imagePath"\s*:\s*"([^"]+)"/i)
  if (runParamsMatch?.[1]) return normalizeImgUrl(runParamsMatch[1])

  const ae = html.match(/https?:\/\/ae01\.alicdn\.com\/[^\s"'<>]+/i)
  if (ae?.[0]) return normalizeImgUrl(ae[0])

  throw new Error('main image not found')
}
async function resolveProductImageUrl({ productUrl, imageUrlHint }) {
  if (imageUrlHint) return imageUrlHint
  return await extractMainImageFromProductPage(productUrl)
}
async function openaiCreateAdCopy({ title, imageDataUrl, brief }) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a creative ad copywriter. Create concise, high-converting social ad copy in Hebrew.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: `שם המוצר: ${title}\n${brief || 'כתוב טקסט קצר, ממוקד המרה, לטיקטוק/אינסטגרם. הוסף קריאה לפעולה.'}` },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    temperature: 0.9,
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.choices?.[0]?.message?.content?.trim() || ''
}
function composeSocialPost({ title, adCopy, videoUrl, affiliateUrl }) {
  return [
    `🎯 ${title}`,
    '',
    adCopy,
    '',
    videoUrl ? `🎬 וידאו: ${videoUrl}` : '',
    affiliateUrl ? `🛒 קנה עכשיו: ${affiliateUrl}` : '',
  ].filter(Boolean).join('\n')
}

// ===== TTS + FFmpeg (וידאו מקומי) =====
async function openaiTTS(text) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: text
    })
  })
  if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${await r.text()}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const id = crypto.randomBytes(6).toString('hex')
  const mp3Path = path.join(TMP_DIR, `${id}.mp3`)
  await writeFile(mp3Path, buf)
  return mp3Path
}

async function makeVideoFromImageAndAudio({ imageBuffer, audioPath }) {
  const id = crypto.randomBytes(6).toString('hex')
  const imgPath = path.join(TMP_DIR, `${id}.jpg`)
  const outPath = path.join(VIDEO_DIR, `${id}.mp4`)
  await writeFile(imgPath, imageBuffer)

  // יצירת וידאו אנכי 1080x1920 עם תמונה סטטית ואודיו; אורך לפי האודיו
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(imgPath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=decrease',
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2'
      ])
      .outputOptions([
        '-r 30',
        '-c:v libx264',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 192k',
        '-shortest'
      ])
      .on('end', resolve)
      .on('error', reject)
      .save(outPath)
  }).finally(async () => {
    await unlinkSafe(imgPath)
    await unlinkSafe(audioPath)
  })

  return `/videos/${path.basename(outPath)}`
}

async function createVideoLocally({ imageDataUrl, title, adCopy }) {
  // imageDataUrl הוא data:...; נמיר לבופר
  const base64 = imageDataUrl.split(',')[1]
  const imageBuffer = Buffer.from(base64, 'base64')

  // 1) קריינות
  const audioPath = await openaiTTS(adCopy || `פרסומת ל-${title}`)

  // 2) יצירת וידאו
  const videoUrl = await makeVideoFromImageAndAudio({ imageBuffer, audioPath })
  return { videoUrl }
}

// ====== NEW: one-shot campaign builder ======
app.post('/api/make-campaign', async (req, res) => {
  try {
    const { affiliateUrl, productTitle, imageUrlHint, brief } = req.body || {}
    if (!affiliateUrl) return res.status(400).json({ error: 'Missing affiliateUrl' })
    if (!productTitle) return res.status(400).json({ error: 'Missing productTitle' })

    // 1) זיהוי URL של התמונה (דרך דף המוצר אם אין hint)
    const imageUrl = await resolveProductImageUrl({ productUrl: affiliateUrl, imageUrlHint })

    // 2) הורדת התמונה → Data URL (ל־OpenAI) וגם Buffer (ל-FFmpeg)
    const { buf, ct } = await downloadImageAsBuffer(imageUrl)
    const imageDataUrl = toDataUrl(buf, ct)

    // 3) ניסוח פרסומי מ-OpenAI (מבוסס תמונה + כותרת)
    const adCopy = await openaiCreateAdCopy({ title: productTitle, imageDataUrl, brief })

    // 4) יצירת וידאו מקומי (תמונה + קריינות)
    const { videoUrl } = await createVideoLocally({ imageDataUrl, title: productTitle, adCopy })

    // 5) פוסט מאוחד
    const socialPost = composeSocialPost({ title: productTitle, adCopy, videoUrl, affiliateUrl })

    res.json({
      ok: true,
      inputs: { affiliateUrl, productTitle, brief: brief || null, imageUrlDetected: imageUrl },
      assets: { imageDataUrlContentType: ct, imageDataUrlPreview: imageDataUrl.slice(0, 128) + '...' },
      adCopy,
      video: { videoUrl },
      socialPost
    })
  } catch (err) {
    console.error('make-campaign error', err)
    res.status(500).json({ error: 'make_campaign_failed', detail: err?.message })
  }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Server running → http://localhost:${PORT}`))
