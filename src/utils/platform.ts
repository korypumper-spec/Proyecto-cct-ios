import { Capacitor } from '@capacitor/core';

export function isIosOrIpadOs(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports Macintosh in userAgent with touch points > 1
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const hasSafari = /Safari/i.test(ua);
  const isOtherEngine = /Chrome|CriOS|Chromium|Edg|EdgiOS|EdgA|Firefox|FxiOS|OPR|Opera|Android/i.test(ua);
  return hasSafari && !isOtherEngine;
}

/**
 * iOS Safari, iPadOS, macOS Safari (inside iframes / fragment jumps),
 * Capacitor WebViews, and mobile browsers render PDFs reliably via
 * the embedded pdf.js canvas viewer instead of native <iframe src="...#page=">.
 */
export function prefersCanvasPdfViewer(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (isIosOrIpadOs() || isSafari()) return true;
  if (typeof window !== 'undefined') {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    if (coarse || window.innerWidth < 1024) return true;
  }
  return false;
}

export function getRecommendedPdfScale(): number {
  if (typeof window === 'undefined') return 1.25;
  if (window.innerWidth < 480) return 0.75;
  if (window.innerWidth < 768) return 0.95;
  if (window.innerWidth < 1024) return 1.1;
  return 1.25;
}
