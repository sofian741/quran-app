(() => {
    'use strict';

    // "Listen to this ayah" is a precise seek request, never a request to
    // silently replace the chosen sheikh with a hard-coded default.
    // Only the exact audio URL may be paired with a timing document.
    const core = window.QuranAudio;
    // Exact-ayah playback must work even if the download library is unavailable.
    if (!core) return;

    const OFFLINE_EMPTY = 'أنت غير متصل بالإنترنت، ولا توجد تلاوة محمّلة لهذه السورة على جهازك. شغّل الإنترنت للاستماع، أو نزّل السورة من «التلاوات» لتعمل بدون إنترنت.';
    const OFFLINE_UNALIGNED = 'السورة موجودة ضمن تحميلاتك، لكن تعذّر فتح التسجيل المحفوظ. جرّب تشغيله من «مكتبتي» أو أعد تنزيله.';
    const ONLINE_UNALIGNED = 'تعذّر تشغيل التسجيل المختار. جرّب قارئًا آخر أو تحقق من اتصال الإنترنت.';
    const validVerse = (surah, ayah) =>
        Number.isInteger(surah) && surah >= 1 && surah <= 114 &&
        Number.isInteger(ayah) && ayah >= 1 && ayah <= core.VERSE_COUNTS[surah - 1];

    function trackUrl(state, surah) {
        if (state.provider !== 'mp3quran') return '';
        return core.mp3Url({server:state.server, surahs:state.availableSurahs}, surah) || '';
    }

    function mp3ReciterForTrack(track, catalog) {
        let url;
        try { url = new URL(track.url); }
        catch (_) { return null; }
        if (url.protocol !== 'https:' || !url.pathname.endsWith('.mp3')) return null;
        const server = url.href.slice(0, url.href.lastIndexOf('/') + 1);
        const reciter = catalog.find(row => Number(row.id) === Number(track.reciterId) &&
                row.moshaf?.some(item => item.server === server)) ||
            catalog.find(row => row.moshaf?.some(item => item.server === server)) ||
            (Number.isSafeInteger(Number(track.reciterId)) && Number(track.reciterId) > 0
                ? {id:Number(track.reciterId), name:track.reciterName || 'القارئ', moshaf:[]} : null);
        if (!reciter) return null;
        const moshaf = reciter.moshaf.find(item => item.server === server) || {
            id: Number(track.moshafId) || Number(track.reciterId),
            name: track.moshafName || 'تلاوة محفوظة',
            server, surahs:[Number(track.surah)], complete:false
        };
        if (!core.mp3Url(moshaf, Number(track.surah)) ||
            core.mp3Url(moshaf, Number(track.surah)) !== track.url) return null;
        return {reciter,moshaf,server};
    }

    function create({engine, getCatalog = () => []}) {
        let requestNumber = 0;

        async function playAligned(surah, ayah, stillCurrent) {
            if (!stillCurrent()) return false;
            // A verse action belongs to the selected reciter, not to the
            // first unrelated downloaded surah found on the device.
            const ok = await engine.goTo(surah, ayah, {autoplay:true});
            return !!ok && engine.status !== 'error' && stillCurrent();
        }

        async function playMp3Track(track, chapter, ayah, stillCurrent) {
            if (!stillCurrent()) return false;
            const found = mp3ReciterForTrack(track, getCatalog());
            if (!found) return false;
            const timing = chapter?.verses?.find(row => Number(row.ayah) === ayah);
            if (!timing || !Number.isFinite(timing.timestampFrom)) return false;
            const seconds = timing.timestampFrom / 1000;
            const oldState = engine.snapshot();
            const same = trackUrl(oldState, Number(track.surah)) === track.url;
            const ready = same
                ? await engine.goTo(Number(track.surah), 1, {autoplay:false,position:seconds})
                : await engine.selectMp3(found.reciter, found.moshaf, {
                    surah:Number(track.surah),autoplay:false,position:seconds
                });
            if (!ready || !stillCurrent()) return false;
            const version = engine.prepareVersion;
            const audio = engine.audio;
            engine.__mp3AyahChapter = {
                server:window.QuranMp3AyahTiming.normalizedFolder(found.server),
                surah:Number(track.surah),verses:chapter.verses
            };
            engine.state.ayah = ayah;
            engine.currentTiming = timing;
            engine.state.position = seconds;
            engine.persist();
            const seek = () => {
                if (!stillCurrent() || version !== engine.prepareVersion ||
                    engine.audio !== audio || engine.trackUrl !== track.url) return;
                try { audio.currentTime = seconds; }
                catch (_) { /* Wait until the media metadata is available. */ }
            };
            if (audio.readyState >= 1) seek();
            else audio.addEventListener('loadedmetadata',seek,{once:true});
            const played = await engine.play();
            if (played && stillCurrent()) engine.__syncMp3QuranAyah?.();
            return !!played && stillCurrent();
        }

        async function attemptSelectedMp3(track,surah,ayah,stillCurrent) {
            if (!stillCurrent()) return false;
            const qud = window.QuranQud;
            // The QUD recording must have exactly the selected MP3 URL.
            // A different sheikh's downloaded chapter is never a substitute.
            try {
                const reciter = await qud?.matchMp3Track?.(track.url,surah);
                if (reciter && stillCurrent()) {
                    const same = engine.state.provider === 'quran-foundation' &&
                        Number(engine.state.reciterId) === Number(reciter.id);
                    const ok = same
                        ? await engine.goTo(surah,ayah,{autoplay:true})
                        : await engine.selectAligned(reciter.id,{surah,ayah,autoplay:true});
                    if (ok && engine.status !== 'error' && stillCurrent()) return true;
                }
            } catch (error) {
                console.info('Selected recording has no available QUD word timing',error);
            }
            if (!stillCurrent()) return false;
            // Only official offsets for the same MP3 edition may be used.
            const folder = track.url.slice(0,track.url.lastIndexOf('/')+1);
            try {
                const chapter = await window.QuranMp3AyahTiming?.chapterForRecording?.(folder,surah);
                if (chapter) return await playMp3Track(track,chapter,ayah,stillCurrent);
            } catch (error) {
                console.info('Selected recording has no exact verse timing',error);
            }
            return false;
        }

        async function listen(surah,ayah) {
            surah=Number(surah); ayah=Number(ayah);
            if (!validVerse(surah,ayah)) return {ok:false,message:'الآية المحددة غير صالحة.'};
            const token=++requestNumber;
            const stillCurrent=()=>token===requestNumber;
            const original=engine.snapshot();

            if (original.provider === 'quran-foundation') {
                // Try real verse playback directly. A CORS-blocked network
                // probe must never redirect this request to a downloaded
                // recording by another reciter.
                const ok=await playAligned(surah,ayah,stillCurrent);
                if (!stillCurrent()) return {ok:false,cancelled:true};
                if (ok) return {
                    ok:true,name:original.reciterName,kind:'stream',
                    downloaded:false,switched:false
                };
                const offline=navigator.onLine === false;
                return {
                    ok:false,offline,
                    message:offline ? OFFLINE_EMPTY :
                        (window.QuranAudioConnectivity?.safeError(engine.error) ||
                        'تعذّر تشغيل القارئ المختار من هذه الآية. حاول مرة أخرى.')
                };
            }

            if (original.provider !== 'mp3quran') {
                return {ok:false,message:'اختر قارئًا للاستماع من هذه الآية.'};
            }
            const selectedUrl=trackUrl(original,surah);
            if (!selectedUrl) return {
                ok:false,message:'السورة غير متاحة في تسجيل القارئ المختار.'
            };
            const selectedTrack={
                url:selectedUrl,surah,reciterId:original.reciterId,
                reciterName:original.reciterName,moshafId:original.moshafId,
                moshafName:original.moshafName
            };
            const ok=await attemptSelectedMp3(selectedTrack,surah,ayah,stillCurrent);
            if (!stillCurrent()) return {ok:false,cancelled:true};
            if (ok) return {
                ok:true,name:original.reciterName,kind:'ayah',
                switched:false,selected:original.reciterName
            };
            const offline=navigator.onLine === false;
            return {
                ok:false,offline,
                message:offline
                    ? 'لتشغيل هذه الآية دون إنترنت، يلزم تسجيل القارئ المختار وتوقيتات مطابقة له. يمكنك تشغيل السورة كاملة من «التلاوات».'
                    : 'التسجيل المختار لا تتوفر له حاليًا توقيتات مطابقة لبدء هذه الآية. يمكنك تشغيل السورة كاملة من «التلاوات»، أو اختيار قارئ متزامن من المصحف.'
            };
        }

        return Object.freeze({listen});
    }

    window.QuranVerseListen = Object.freeze({create,OFFLINE_EMPTY,OFFLINE_UNALIGNED});
})();