import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '../user-agent'

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0',
  firefoxIpad:
    'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
}

describe('describeUserAgent', () => {
  it('names the common browsers and systems', () => {
    expect(describeUserAgent(UA.chromeWindows)).toBe('Chrome on Windows')
    expect(describeUserAgent(UA.edgeWindows)).toBe('Edge on Windows')
    expect(describeUserAgent(UA.firefoxLinux)).toBe('Firefox on Linux')
    expect(describeUserAgent(UA.safariMac)).toBe('Safari on macOS')
    expect(describeUserAgent(UA.safariIphone)).toBe('Safari on iPhone')
    expect(describeUserAgent(UA.chromeIphone)).toBe('Chrome on iPhone')
    expect(describeUserAgent(UA.chromeAndroid)).toBe('Chrome on Android')
    expect(describeUserAgent(UA.samsungAndroid)).toBe('Samsung Internet on Android')
    expect(describeUserAgent(UA.operaWindows)).toBe('Opera on Windows')
    expect(describeUserAgent(UA.firefoxIpad)).toBe('Firefox on iPad')
    expect(describeUserAgent(UA.chromebook)).toBe('Chrome on ChromeOS')
  })

  it('says as much as it knows, and nothing for nothing', () => {
    expect(describeUserAgent('curl/8.9.1')).toBe('Unknown device')
    expect(describeUserAgent('SomeBot/1.0 (Windows NT 10.0)')).toBe('Browser on Windows')
    expect(describeUserAgent('Mozilla/5.0 Firefox/143.0')).toBe('Firefox')
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent('')).toBe('Unknown device')
  })
})
