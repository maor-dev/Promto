// aliexpress.js
import dotenv from 'dotenv'
dotenv.config() // <<< חשוב: טוען .env לפני גישה ל-process.env

import crypto from 'crypto'
import fetch from 'node-fetch'

const APP_KEY = process.env.APP_KEY
const APP_SECRET = process.env.APP_SECRET
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || ''
const API_GATEWAY = process.env.ALI_API_GATEWAY || 'https://api-sg.aliexpress.com/sync'

function sign(params, secret) {
  const sortedKeys = Object.keys(params).sort()
  const toSign = sortedKeys.reduce((acc, k) => acc + k + params[k], '')
  return crypto.createHmac('sha256', secret).update(toSign).digest('hex').toUpperCase()
}

function ensureAliEnv() {
  if (!APP_KEY || !APP_SECRET) {
    const detail = { APP_KEY: !!APP_KEY, APP_SECRET: !!APP_SECRET, ACCESS_TOKEN: !!ACCESS_TOKEN }
    const err = new Error('Missing APP_KEY/APP_SECRET env vars')
    err.detail = detail
    throw err
  }
}

export async function callAli({ method, bizParams }) {
  ensureAliEnv()

  const publicParams = {
    app_key: APP_KEY,
    method,
    sign_method: 'hmac-sha256',
    timestamp: Date.now(),
    v: '2.0',
    simplify: 'true'
  }
  if (ACCESS_TOKEN) publicParams.access_token = ACCESS_TOKEN

  const apiParams = {}
  for (const [k, v] of Object.entries(bizParams || {})) {
    if (v === undefined || v === null) continue
    apiParams[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }

  const all = { ...publicParams, ...apiParams }
  all.sign = sign(all, APP_SECRET)

  const url = `${API_GATEWAY}/${method.replace(/\./g, '/')}`
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(all)) form.append(k, v)

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form
  })

  if (!r.ok) {
    const text = await r.text().catch(()=> '')
    throw new Error(`AliExpress HTTP ${r.status}: ${text}`)
  }

  const json = await r.json().catch(async () => {
    const text = await r.text().catch(()=> '')
    throw new Error(`AliExpress non-JSON: ${text}`)
  })

  if (json.error_response?.code || json.error_response?.msg) {
    throw new Error(`AliExpress API error: ${json.error_response?.code} ${json.error_response?.msg}`)
  }
  return json
}
