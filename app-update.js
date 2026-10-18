/* QA updater. The app never stores GitHub credentials or silently installs APKs. */
(() => {
  'use strict';
  const button = document.getElementById('check-app-update');
  const status = document.getElementById('app-update-status');
  if (!button || !status) return;

  const show = text => { status.textContent = text; };
  const build = Number(window.NOOR_ANDROID_BUILD?.versionCode || 0);
  const source = window.NOOR_ANDROID_BUILD?.updateManifestUrl || '';
  const isNative = !!window.Capacitor?.isNativePlatform?.();

  if (build) show('الإصدار الحالي: 0.1.' + build);
  else show('التحديثات من داخل التطبيق متاحة لنسخة Android فقط.');

  button.addEventListener('click', async () => {
    if (!isNative) {
      show('افتح تطبيق نور القرآن المثبّت على Android للتحقق من التحديثات.');
      return;
    }
    if (!source) {
      show('مصدر التحديثات التجريبية لم يُفعّل بعد. يلزم رابط نشر عام وآمن للـAPK، لأن مستودع GitHub خاص.');
      return;
    }
    button.disabled = true;
    show('جارٍ التحقق من وجود إصدار أحدث…');
    try {
      const response = await fetch(source + (source.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const info = await response.json();
      const latest = Number(info.versionCode);
      const apk = info.apkUrl;
      if (!Number.isSafeInteger(latest) || latest <= 0 || typeof apk !== 'string') {
        throw new Error('Invalid update manifest');
      }
      const download = new URL(apk, source);
      if (download.protocol !== 'https:') throw new Error('HTTPS required');
      if (latest <= build) {
        show('تطبيقك مُحدّث بالفعل ✓ (0.1.' + build + ')');
        return;
      }
      show('تحديث جديد متاح: 0.1.' + latest);
      if (window.confirm('يتوفر تحديث جديد لنور القرآن (0.1.' + latest + '). هل تريد فتح تنزيل التحديث الآن؟')) {
        // Android requires user approval for APK installation.
        window.open(download.href, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.warn('Update check failed', error);
      show('تعذّر التحقق من التحديثات. تأكد من الإنترنت أو مصدر التحديث.');
    } finally {
      button.disabled = false;
    }
  });
})();
