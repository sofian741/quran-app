# جاهزية Google Play

**تاريخ محاولة التحقق:** 2026-10-17  
**الحالة:** تجهيز الويب جيد للتحويل التجريبي؛ النشر العام متوقف على الحقوق وبناء Android وحساب المالك.

## قيد التحقق الحي

حاولت البيئة فتح وثائق Android وGoogle Play الرسمية، لكن وكيل الشبكة رفض اتصال HTTPS
برمز `CONNECT 403`. الروابط الرسمية أدناه هي نقاط المراجعة الصحيحة، لكن يجب على المالك
إعادة فتحها وPlay Console مباشرة قبل تثبيت قيم Gradle أو إرسال الإصدار. خصوصًا قيمة
Target API وسياسة اختبار الحسابات الشخصية تتغير دوريًا.

## متطلبات البناء

- إصدار المتجر يكون **Android App Bundle (`.aab`)**؛ يستخدم APK للاختبار المحلي/الداخلي.
- اختر `applicationId` نهائيًا يملكه الناشر؛ تغييره بعد النشر ينشئ تطبيقًا مختلفًا.
- `versionCode` عدد صحيح يزيد كل إصدار، و`versionName` اسم عرض.
- بناء أكتوبر 2026 ينبغي أن يتهيأ لـ**Target SDK 36** وفق دورة Google Play السنوية
  المتوقعة، لكن يجب تأكيد الرقم في صفحة المتطلبات وPlay Console وقت البناء.
- توصية أولية `minSdk 24` لتوازن WebView/الأجهزة، بشرط أن تدعمها نسخة Capacitor المختارة
  وأن يوافق المالك على استبعاد الأجهزة الأقدم.
- إن وُجدت مكتبات native، يجب أن يتضمن الإصدار 64-bit (على الأقل `arm64-v8a`) وألا يشحن
  ABI 32-bit وحده. افحص Bundle Explorer بعد بناء AAB.
- جهز أيقونة adaptive، splash حديثة، اسم التطبيق الحالي، ألوان شريط الحالة والتنقل،
  edge-to-edge، زر الرجوع/Back gesture، تدوير الشاشة وسياسة إبقاء الشاشة.
- Manifest بأقل صلاحيات: الإنترنت، والاهتزاز عند الحاجة، وصلاحيات تشغيل media foreground
  فقط إن نُفذ التشغيل الخلفي. لا تطلب صلاحية تخزين عامة.

مراجع رسمية:

- [Target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Android App Bundles](https://developer.android.com/guide/app-bundle)
- [64-bit requirement](https://developer.android.com/google/play/requirements/64-bit)
- [Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge)

## التوقيع والشهادات

1. أنشئ upload keystore على جهاز المالك فقط، بكلمة مرور قوية ونسخة احتياطية مشفرة.
2. فعّل Google Play App Signing؛ احتفظ برفع الإصدارات باستخدام upload key.
3. لا ترفع `.jks` أو `.keystore` أو كلمات المرور أو `key.properties`. `.gitignore` يحمي
   الأنماط الشائعة، لكنه لا يغني عن فحص الـcommit.
4. APK التجريبي يمكن توقيعه بمفتاح debug؛ AAB الإنتاج يوقع بمفتاح الرفع.
5. `assetlinks.json` وDigital Asset Links غير مطلوبين لـCapacitor. يلزمان عادة عند اختيار
   Trusted Web Activity وربط نطاق HTTPS مملوك.

مرجع: [Sign your app](https://developer.android.com/studio/publish/app-signing).

## Play Console والسياسات

يتولى المالك داخل الحساب:

- صفحة المتجر، الوصف، الأيقونة، feature graphic، ولقطات هاتف/جهاز لوحي حقيقية.
- رابط **Privacy Policy عام عبر HTTPS**؛ يمكن بدء الصياغة من `PRIVACY_POLICY_DRAFT.md`.
- نموذج **Data Safety** بناءً على النسخة النهائية والمزودين: لا حساب أو تحليلات حاليًا،
  لكن الجهاز يرسل طلبات صوت/كتالوج إلى جهات خارجية.
- Content Rating، Target Audience، Ads Declaration (لا إعلانات حاليًا)، App Access
  (لا تسجيل دخول حاليًا)، وPermissions Declaration إن أضيفت صلاحية خاضعة للإقرار.
- اختبار internal/closed ثم production. إن كان الحساب الشخصي جديدًا وتنطبق عليه السياسة،
  تحقق من شرط الاختبار المغلق الحالي؛ القاعدة المنشورة سابقًا كانت 12 مختبرًا لمدة 14
  يومًا متصلًا للحسابات الشخصية الجديدة بعد 13 نوفمبر 2023، وقد تكون تغيرت.
- مراجعة حقوق النص والتفسير والصوت، وسياسة الحد الأدنى من الوظائف. التطبيق يحتوي وظائف
  محلية حقيقية ولا يعتمد على صفحة ويب بعيدة فقط، لكن القرار النهائي لمراجع Google Play.

مراجع رسمية:

- [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [App content and setup](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)
- [Content rating](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en)
- [Developer Program Policies](https://play.google.com/about/developer-content-policy/)

## ما أصبح جاهزًا

- التطبيق يعمل محليًا ومن دون إطار ويب بعيد.
- CSP وService Worker وغلاف أوفلاين وصفحة مصادر/خصوصية موجودة.
- لا أسرار أو إعلانات أو analytics أو صلاحيات Android مضافة.
- اختبارات النص والبيانات والوظائف والأوفلاين جاهزة لتعمل قبل تغليف كل إصدار.
- `.gitignore` يمنع أخطاء رفع مواد التوقيع الشائعة.

## ما يمنع الإرسال الآن

- لا مشروع Android ولا Manifest ولا application ID ولا APK/AAB موقع.
- لا اختبار جهاز Android أو WebView أو الخلفية أو استعادة التنزيلات تحت ضغط النظام.
- لا رابط Privacy Policy عام أو مواد متجر أو نماذج Play Console.
- حقوق تنزيل الصوت وإعادة توزيع التفسير/نص الأذكار غير محسومة.
- Target SDK وسياسة حساب المالك لم يعادا التحقق منهما حيًا بسبب قيد الشبكة.

