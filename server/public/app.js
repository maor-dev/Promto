// public/app.js

// ===== helpers to grab DOM =====
const $ = sel => document.querySelector(sel)

// Elements that already exist in your UI
const form = $('#searchForm')
const kwInput = $('#kw')
const resultCard = $('#result')
const titleEl = $('#title')
const productLink = $('#productLink')
const makeAffBtn = $('#makeAffBtn')
const affWrap = $('#affWrap')
const affLink = $('#affLink')
const statusBox = $('#status')
const debugBox = $('#debugBox')
const debugPre = $('#debugPre')

// NEW (optional UI — add these to index.html if you haven’t yet)
const campaignBtn = $('#campaignBtn')        // <button id="campaignBtn">🎬 צור קמפיין</button>
const briefInput = $('#brief')               // <textarea id="brief"></textarea>
const campaignOut = $('#campaignResult')     // <div id="campaignResult"></div>

let lastProductUrl = null
let lastAffiliateUrl = null

// ===== status / UI helpers =====
function setStatus(msg, type = 'info') {
  statusBox.textContent = msg || ''
  statusBox.className = `status ${type}`
}

function resetAffiliateUI() {
  affWrap.classList.add('hidden')
  affLink.textContent = ''
  affLink.removeAttribute('href')
  lastAffiliateUrl = null
}

function showAffiliate(url) {
  lastAffiliateUrl = url
  affLink.textContent = url
  affLink.href = url
  affWrap.classList.remove('hidden')
}

function showResult({ url, title, debug, aff_url }) {
  titleEl.textContent = title || ''
  productLink.href = url
  productLink.textContent = url
  resultCard.classList.remove('hidden')

  lastProductUrl = url
  makeAffBtn.disabled = !lastProductUrl
  resetAffiliateUI()

  if (debug) {
    debugBox.classList.remove('hidden')
    debugPre.textContent = JSON.stringify(debug, null, 2)
  } else {
    debugBox.classList.add('hidden')
    debugPre.textContent = ''
  }

  // אם כבר הגיע לינק אפילייט מהחיפוש – מציגים ומסמנים סטטוס
  if (aff_url) {
    showAffiliate(aff_url)
    setStatus('נמצא מוצר + לינק שותפים מוכן ✔️', 'ok')
    // makeAffBtn.disabled = true // אם רוצים לנעול
  }
}

// ===== search flow =====
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const keyword = kwInput.value.trim()
  if (!keyword) return

  setStatus('מחפש...', 'loading')
  resultCard.classList.add('hidden')
  makeAffBtn.disabled = true
  resetAffiliateUI()

  try {
    const resp = await fetch('/api/find-by-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword })
    })
    const data = await resp.json()

    if (resp.ok && data.found && data.url) {
      showResult(data)
      if (!data.aff_url) setStatus('נמצא מוצר מתאים ✔️', 'ok')
    } else if (resp.ok && !data.found) {
      showResult({ url: '#', title: '—', debug: data.debug })
      setStatus('לא נמצא מוצר מתאים — ראו דיבוג', 'warn')
      makeAffBtn.disabled = true
    } else {
      throw new Error(data?.error || 'Unknown error')
    }
  } catch (err) {
    console.error(err)
    setStatus(`שגיאה: ${err.message}`, 'err')
  }
})

// ===== affiliate link flow =====
makeAffBtn.addEventListener('click', async () => {
  if (!lastProductUrl) return

  // אם כבר יש לינק — לא נוציא שוב
  if (lastAffiliateUrl) {
    setStatus('כבר קיים לינק שותפים ✔️', 'ok')
    return
  }

  setStatus('מייצר לינק שותפים...', 'loading')
  makeAffBtn.disabled = true

  try {
    const resp = await fetch('/api/make-affiliate-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productUrl: lastProductUrl })
    })
    const data = await resp.json()

    if (resp.ok && data.link) {
      showAffiliate(data.link)
      setStatus('לינק שותפים מוכן ✔️', 'ok')
    } else {
      const msg = data?.error || 'נכשלה יצירת לינק שותפים'
      console.warn('Affiliate link error detail:', data)
      setStatus(msg, 'warn')
    }
  } catch (err) {
    console.error(err)
    setStatus(`שגיאה: ${err.message}`, 'err')
  } finally {
    makeAffBtn.disabled = !lastProductUrl
  }
})

/* =====================================================
   NEW: one-click campaign -> calls /api/make-campaign
   Requires: server has /api/make-campaign endpoint
   ===================================================== */
async function callMakeCampaign({ affiliateUrl, productTitle, brief }) {
  const resp = await fetch('/api/make-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ affiliateUrl, productTitle, brief })
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.detail || data?.error || 'make-campaign failed')
  return data   // { socialPost, adCopy, video:{videoUrl, jobId}, ... }
}

// attach only if the button exists in DOM
if (campaignBtn) {
  campaignBtn.addEventListener('click', async () => {
    if (!lastProductUrl) {
      alert('קודם חפש/י מוצר (הקלד/י מילת חיפוש ולחץ/י Enter)')
      return
    }
    // נוודא שיש לנו לינק אפילייט. אם אין — נבקש מהשרת ליצור.
    try {
      campaignOut && (campaignOut.innerHTML = '⏳ יוצר קמפיין...')
      setStatus('מכין קמפיין (טקסט + וידאו)...', 'loading')

      let affiliateUrl = lastAffiliateUrl
      if (!affiliateUrl) {
        const affResp = await fetch('/api/make-affiliate-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productUrl: lastProductUrl })
        })
        const affData = await affResp.json()
        if (!affResp.ok || !affData.link) throw new Error(affData?.error || 'לא נוצר לינק שותפים')
        affiliateUrl = affData.link
        showAffiliate(affiliateUrl) // עדכן UI
      }

      const brief = (briefInput && briefInput.value.trim()) || ''
      const productTitle = titleEl.textContent || kwInput.value.trim() || 'AliExpress Product'
      const data = await callMakeCampaign({ affiliateUrl, productTitle, brief })

      // הצגת תוצאות
      const videoHtml = data?.video?.videoUrl
        ? `<a href="${data.video.videoUrl}" target="_blank">${data.video.videoUrl}</a>`
        : '(קישור וידאו טרם זמין)'
      const postHtml =
        `<b>פוסט מאוחד:</b><pre style="white-space:pre-wrap">${data.socialPost || '(אין)'}</pre>` +
        `<div><b>וידאו:</b> ${videoHtml}</div>`
      campaignOut && (campaignOut.innerHTML = postHtml)

      setStatus('קמפיין מוכן ✔️', 'ok')
      console.log('adCopy:', data.adCopy)
      console.log('video:', data.video)
    } catch (err) {
      console.error(err)
      campaignOut && (campaignOut.innerHTML = `⚠️ ${err.message}`)
      setStatus(`שגיאה: ${err.message}`, 'err')
    }
  })
}
