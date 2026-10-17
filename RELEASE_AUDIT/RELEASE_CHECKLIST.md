# قائمة الإصدار

## قبل إنشاء مشروع Android

- [x] ثبات نص Tanzil وبصمته.
- [x] فحص 604 صفحة و114 سورة آليًا.
- [x] فحص 656 مرجع آية تدبر.
- [x] فحص التفسير وبيانات QUD مقابل 6236 مرجعًا.
- [x] الأوفلاين للوظائف الأساسية وصفحة الحقوق.
- [x] CSP و`no-referrer` وعدم وجود JavaScript بعيد أو أسرار.
- [x] حماية أنماط keystore وبيانات التوقيع في `.gitignore`.
- [ ] إذن مكتوب لبث/تنزيل كل مصدر صوت سيبقى في الإصدار.
- [ ] إذن/ترخيص موثق لإعادة توزيع تفسير QuranEnc.
- [ ] توثيق حقوق نص «حصن المسلم» الأصلي.
- [ ] نشر سياسة خصوصية نهائية على URL عام HTTPS.

## APK تجريبي

- [ ] اختيار `applicationId` واسم الناشر و`minSdk`.
- [ ] إعادة التحقق من Target SDK الرسمي في Play Console.
- [ ] إنشاء مشروع Capacitor وManifest بأقل صلاحيات.
- [ ] أيقونة adaptive وSplashScreen ودعم edge-to-edge/back.
- [ ] بناء APK debug بلا مفاتيح إنتاج.
- [ ] اختبار أجهزة Android الفعلية ومصفوفة الإصدارات.
- [ ] اختبار الصوت والخلفية وAudio Focus والتنزيل ومساحة التخزين.
- [ ] اختبار تحديث التطبيق مع بقاء الحالة والتنزيلات.
- [ ] مراجعة TalkBack وRTL والوضع الليلي والشاشات الصغيرة.

## AAB للنشر

- [ ] إنشاء upload keystore خارج Git ونسخة احتياطية مشفرة.
- [ ] تفعيل Google Play App Signing.
- [ ] ضبط `versionCode`/`versionName` وبناء AAB release.
- [ ] فحص Bundle Analyzer/Explorer و64-bit وأحجام التنزيل.
- [ ] اختبار internal ثم closed track حسب متطلبات الحساب.
- [ ] Store listing، screenshots، feature graphic، بيانات الدعم والتواصل.
- [ ] Data Safety وPrivacy Policy وContent Rating وTarget Audience.
- [ ] Ads Declaration (لا إعلانات) وApp Access (لا حساب) ومراجعة الصلاحيات.
- [ ] إرفاق نسب المصادر والتراخيص داخل النسخة النهائية.
- [ ] مراجعة pre-launch report والأعطال وANR وسياسات Google Play الحالية.
- [ ] قرار المالك النهائي بعد حسم المخاطر القانونية الثلاثة.

## أوامر تحقق الويب قبل كل تغليف

```bash
node tests/content.cjs
node tests/reflection.cjs
node tests/adhkar-data.cjs
node tests/data-integrity.cjs
node tests/security-static.cjs
node tests/quran-features.cjs
node tests/offline-browser.cjs
```

وشغّل مجموعة Chromium الكاملة، ومنها `tests/all-pages.cjs`، عند أي تعديل يمس المصحف أو CSS.

