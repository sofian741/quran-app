/* Read-only Mushaf device geometry probe. No Quran text/layout mutations. */
(() => {
  'use strict';
  const nativeZoom = () => window.Capacitor?.Plugins?.MushafTextZoom || null;
  const nativeZoomStatus = async () => {
    const plugin = nativeZoom();
    if (!plugin?.getStatus) return {error:'QA native zoom plugin missing; this APK is not the updated diagnostic build'};
    try { return await plugin.getStatus(); }
    catch (error) { return {error:String(error)}; }
  };
  const round = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const rect = element => {
    if (!element) return null;
    const b = element.getBoundingClientRect();
    return {x:round(b.x), y:round(b.y), left:round(b.left), right:round(b.right),
      top:round(b.top), bottom:round(b.bottom), width:round(b.width), height:round(b.height)};
  };
  const css = element => {
    if (!element) return null;
    const c = getComputedStyle(element);
    return {display:c.display, fontFamily:c.fontFamily, fontSize:c.fontSize,
      lineHeight:c.lineHeight, fontWeight:c.fontWeight, letterSpacing:c.letterSpacing,
      transform:c.transform, minHeight:c.minHeight, height:c.height,
      paddingTop:c.paddingTop, paddingBottom:c.paddingBottom,
      paddingLeft:c.paddingLeft, paddingRight:c.paddingRight,
      flex:c.flex, alignItems:c.alignItems, justifyContent:c.justifyContent,
      columnGap:c.columnGap, overflowX:c.overflowX, overflowY:c.overflowY,
      whiteSpace:c.whiteSpace, direction:c.direction, fontFeatureSettings:c.fontFeatureSettings};
  };
  const delayFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  async function collect() {
    await Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 1800))]);
    await delayFrame();
    const root = document.getElementById('quran-text');
    const page = document.getElementById('mushaf-page');
    const stage = document.getElementById('reader-stage');
    if (!root || !root.querySelector('.mushaf-line')) throw Error('لم يتم تجهيز سطور المصحف بعد');
    const area = rect(root);
    const rootStyle = getComputedStyle(root);
    const innerLeft = area.left + (parseFloat(rootStyle.paddingLeft) || 0);
    const innerRight = area.right - (parseFloat(rootStyle.paddingRight) || 0);
    const lines = [...root.querySelectorAll('.mushaf-line')];
    const rowRecords = lines.map((line, index) => {
      const r = rect(line);
      const words = [...line.querySelectorAll('.mushaf-word')];
      const wordBoxes = words.map(w => rect(w));
      const textRects = [];
      // Range rects are text layout bounds, not guaranteed painted-ink bounds.
      for (const w of words) {
        const range = document.createRange();
        range.selectNodeContents(w);
        textRects.push(...[...range.getClientRects()].map(x => ({
          top:round(x.top), bottom:round(x.bottom), left:round(x.left),
          right:round(x.right), width:round(x.width), height:round(x.height)
        })));
        range.detach?.();
      }
      const outside = wordBoxes.filter(b => b && (b.left < innerLeft - 1 || b.right > innerRight + 1));
      const rangeOutside = textRects.filter(b => b.left < innerLeft - 1 || b.right > innerRight + 1);
      return {
        index:index + 1, box:r, css:css(line), role:line.dataset.lineRole || '',
        className:String(line.className), wordCount:words.length, outsideWordCount:outside.length,
        outsideRangeCount:rangeOutside.length,
        wordBounds:wordBoxes, textRangeBounds:textRects,
        scrollWidth:line.scrollWidth, clientWidth:line.clientWidth,
        scrollHeight:line.scrollHeight, clientHeight:line.clientHeight
      };
    });
    const overlaps = [];
    for (let i = 1; i < rowRecords.length; i++) {
      const prior = rowRecords[i - 1].box, next = rowRecords[i].box;
      const delta = round(next.top - prior.bottom);
      if (delta < -0.5) overlaps.push({rowA:i,rowB:i+1,overlapPx:round(-delta)});
    }
    let adjacentTextRangeOverlap = [];
    for (let i = 1; i < rowRecords.length; i++) {
      const a = rowRecords[i - 1].textRangeBounds, b = rowRecords[i].textRangeBounds;
      if (!a.length || !b.length) continue;
      const bottom = Math.max(...a.map(v=>v.bottom));
      const top = Math.min(...b.map(v=>v.top));
      if (bottom > top + 0.5) adjacentTextRangeOverlap.push({rowA:i,rowB:i+1,overlapPx:round(bottom-top)});
    }
    let canvas = null;
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        const font = getComputedStyle(root);
        ctx.font = font.font || `${font.fontSize} ${font.fontFamily}`;
        const m = ctx.measureText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');
        canvas = {font:ctx.font, ascent:round(m.actualBoundingBoxAscent),
          descent:round(m.actualBoundingBoxDescent), width:round(m.width)};
      }
    } catch (e) { canvas = {error:String(e)}; }
    const zoomStatus = await nativeZoomStatus();
    const requestedSize = parseFloat(root.style.fontSize);
    const computedSize = parseFloat(rootStyle.fontSize);
    const result = {
      diagnostic:'Ayat Mushaf geometry v2', capturedAt:new Date().toISOString(),
      pageNumber:document.getElementById('display-page-number')?.textContent?.trim() || '',
      pageSurah:document.getElementById('page-surah')?.textContent?.trim() || '',
      nativeZoom:zoomStatus,
      textInflation:{requestedInlineFontSize:round(requestedSize), computedFontSize:round(computedSize),
        ratio:round(computedSize / requestedSize),
        bodyFontSize:getComputedStyle(document.body).fontSize},
      navigator:{userAgent:navigator.userAgent, platform:navigator.platform,
        language:navigator.language, deviceMemory:navigator.deviceMemory || null,
        hardwareConcurrency:navigator.hardwareConcurrency || null},
      screen:{width:screen.width,height:screen.height,availWidth:screen.availWidth,
        availHeight:screen.availHeight,orientation:screen.orientation?.type || null,
        dpr:devicePixelRatio, innerWidth,innerHeight, outerWidth,outerHeight,
        visualViewport:window.visualViewport ? {width:round(visualViewport.width),
          height:round(visualViewport.height),scale:round(visualViewport.scale),
          offsetTop:round(visualViewport.offsetTop)} : null},
      fonts:{status:document.fonts?.status || null,
        amiri24:document.fonts?.check?.('24px "Amiri Quran"') ?? null,
        amiri20:document.fonts?.check?.('20px "Amiri Quran"') ?? null},
      stage:{box:rect(stage),css:css(stage)}, page:{box:rect(page),css:css(page)},
      root:{box:area,css:css(root),className:root.className,
        layoutState:root.dataset.layoutState || '',
        layoutPage:root.dataset.standardLayoutPage || '',
        scrollHeight:root.scrollHeight,clientHeight:root.clientHeight,
        scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,
        scrollTop:root.scrollTop},
      lineCount:lines.length, rowBoxOverlaps:overlaps,
      adjacentTextRangeOverlaps:adjacentTextRangeOverlap,
      horizontallyOutsideRows:rowRecords.filter(x => x.outsideWordCount || x.outsideRangeCount)
        .map(x=>({row:x.index,words:x.outsideWordCount,ranges:x.outsideRangeCount})),
      canvasMetrics:canvas,
      rows:rowRecords.map(({wordBounds, textRangeBounds, ...summary}) => summary),
      notes:'Range rects are NOT painted ink. Word-level boxes removed to keep report shareable. Fixed-mode changes only native WebView text zoom, not Quran words or CSS layout.'
    };
    return result;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '🔬 فحص المصحف';
  button.setAttribute('aria-label','فتح فحص تنسيق المصحف');
  button.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483640;background:#145b55;color:white;border:2px solid #fff;border-radius:22px;padding:9px 12px;font:600 13px sans-serif;box-shadow:0 2px 8px #0005';
  const shade = document.createElement('div');
  shade.hidden = true;
  shade.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:#000b;display:none;padding:14px;box-sizing:border-box;direction:rtl';
  const panel = document.createElement('section');
  panel.style.cssText = 'height:100%;max-width:690px;margin:auto;overflow:auto;background:#fff;color:#17231f;border-radius:14px;padding:14px;box-sizing:border-box;font:15px sans-serif;display:flex;flex-direction:column;gap:10px';
  const title = document.createElement('strong');
  title.textContent = 'تجربة A/B: تكبير الخط على Android WebView';
  const zoomInfo = document.createElement('div');
  zoomInfo.style.cssText = 'padding:7px 10px;background:#e5f3ee;border-radius:8px;font:600 14px sans-serif';
  zoomInfo.textContent = 'جاري قراءة تكبير النص من Android…';
  async function refreshZoomInfo() {
    const info = await nativeZoomStatus();
    zoomInfo.textContent = info.error ? ('⚠️ ' + info.error) :
      (info.mode === 'fixed' ? '✅ الإصلاح مفعّل: ' : '↩️ وضع النظام الأصلي: ') +
      `الآن ${info.appliedTextZoom}% | إعداد الجهاز ${info.systemTextZoom}%`;
  }
  const status = document.createElement('div');
  status.textContent = 'افتح الصفحة اللي فيها المشكلة، ثم اضغط «قياس الصفحة».';
  const area = document.createElement('textarea');
  area.readOnly = true;
  area.dir = 'ltr';
  area.spellcheck = false;
  area.placeholder = 'نتيجة الفحص هتظهر هنا';
  area.style.cssText = 'width:100%;min-height:180px;flex:1;box-sizing:border-box;font:11px monospace;white-space:pre;direction:ltr';
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap';
  const makeButton = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.type = 'button';
    b.style.cssText = 'padding:9px;border:1px solid #777;border-radius:8px;background:#e8f4f0;color:#123c35;font:600 13px sans-serif';
    b.addEventListener('click', fn);
    controls.append(b);
    return b;
  };
  let latestText = '';
  const switchMode = async mode => {
    const plugin = nativeZoom();
    if (!plugin?.setMode) { status.textContent = '⚠️ تحديث آيات فحص مطلوب: مفيش إضافة التكبير الأصلية.'; return; }
    status.textContent = 'جارٍ تغيير وضع التكبير وإعادة فتح الصفحة…';
    try {
      await plugin.setMode({mode});
      location.reload(); // Reconstruct all Quran line measurements from the new native zoom.
    } catch (error) { status.textContent = 'فشل تغيير الوضع: ' + String(error); }
  };
  makeButton('✅ وضع الإصلاح (100%)', () => switchMode('fixed'));
  makeButton('↩️ وضع النظام (قبل الإصلاح)', () => switchMode('system'));
  makeButton('📏 قياس الصفحة', async () => {
    status.textContent = 'بنجمع القياسات…';
    try {
      const report = await collect();
      latestText = JSON.stringify(report, null, 2);
      area.value = latestText;
      status.textContent = `صفحة ${report.pageNumber} | تكبير ${report.nativeZoom.appliedTextZoom || '?'}% | نسبة الحجم ${report.textInflation.ratio || '?'} | سطور ${report.lineCount} | تداخل النص ${report.adjacentTextRangeOverlaps.length} | خروج أفقي ${report.horizontallyOutsideRows.length}`;
    } catch (error) { status.textContent = 'خطأ في القياس: ' + error.message; }
  });
  makeButton('📋 نسخ التقرير', async () => {
    if (!latestText) return (status.textContent = 'قِس الصفحة الأول');
    try {
      await navigator.clipboard.writeText(latestText);
      status.textContent = 'تم النسخ. ابعت التقرير في المحادثة.';
    } catch (error) {
      area.focus(); area.select();
      status.textContent = 'النسخ التلقائي مش متاح؛ اضغط مطولًا على النص واختر نسخ.';
    }
  });
  makeButton('💾 حفظ JSON', () => {
    if (!latestText) return (status.textContent = 'قِس الصفحة الأول');
    const blob = new Blob([latestText], {type:'application/json;charset=utf-8'});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'ayat-mushaf-' + Date.now() + '.json';
    panel.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    status.textContent = 'اتطلب حفظ ملف JSON. لو التنزيل مش شغال استخدم النسخ.';
  });
  makeButton('إغلاق', () => { shade.hidden = true; shade.style.display = 'none'; });
  panel.append(title,zoomInfo,status,controls,area);
  shade.append(panel);
  button.addEventListener('click', () => { shade.hidden = false; shade.style.display = 'block'; refreshZoomInfo(); });
  document.body.append(button,shade);
  window.ayatMushafDiagnostic = {collect};
})();
