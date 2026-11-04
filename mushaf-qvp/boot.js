// QVP is the only production Mushaf renderer. No legacy fallback.
import {ready} from './reader.js';
ready.catch(error => {
    console.error('QVP Mushaf failed to initialize',error);
    document.getElementById('loading-screen')?.remove();
    const notice=document.createElement('div');
    notice.setAttribute('role','alert');
    notice.style.cssText='position:fixed;inset:auto 12px 18px;z-index:9999;padding:16px;border-radius:12px;background:#fff4dc;color:#582e00;box-shadow:0 4px 24px #0003;font:16px/1.7 sans-serif;text-align:center';
    const title=document.createElement('strong');
    title.textContent='تعذّر فتح المصحف. تأكد من تجهيز ملفات QVP ثم أعد تحميل الصفحة.';
    const detail=document.createElement('p');
    detail.style.cssText='font-size:12px;direction:ltr;overflow-wrap:anywhere';
    detail.textContent=String(error?.message||error);
    const retry=document.createElement('button');
    retry.type='button';retry.textContent='إعادة المحاولة';
    retry.style.cssText='padding:8px 16px;border-radius:9px;border:0;background:#176b63;color:white';
    retry.onclick=()=>location.reload();
    notice.append(title,detail,retry);document.body.append(notice);
});
