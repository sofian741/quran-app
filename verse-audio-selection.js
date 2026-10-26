(() => {
    'use strict';

    // "Listen to this ayah" is a precise seek request, never a request to
    // silently replace the chosen sheikh with a hard-coded default.
    // Only the exact audio URL may be paired with a timing document.
    const core = window.QuranAudio;
    const downloadsApi = window.QuranDownloads;
    if (!core || !downloadsApi) return;

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

    function create({engine, downloads, getCatalog = () => []}) {
        let requestNumber = 0;

        async function availableTracks(surah) {
            const tracks = downloads.list().filter(item =>
                Number(item.surah) === surah && !item.bundled &&
                typeof item.url === 'string' &&
                // Older versions indexed some QUD/MP3Quran downloads with
                // provider=quran-foundation; their URL is still MP3Quran.
                downloadsApi.canDownloadTrack({...item,provider:'mp3quran'}));
            const available = [];
            for (const track of tracks) {
                if (await downloads.has(track.url)) available.push(track);
            }
            return available;
        }

        async function playAligned(id, surah, ayah, isCurrent, stillCurrent) {
            if (!stillCurrent()) return false;
            const success = isCurrent
                ? await engine.goTo(surah, ayah, {autoplay:true})
                : await engine.selectAligned(id, {surah,ayah,autoplay:true});
            return !!success && engine.status !== 'error';
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
                server: window.QuranMp3AyahTiming.normalizedFolder(found.server),
                surah:Number(track.surah), verses:chapter.verses
            };
            engine.state.ayah = ayah;
            engine.currentTiming = timing;
            engine.state.position = seconds;
            engine.persist();
            const seek = () => {
                if (!stillCurrent() || version !== engine.prepareVersion ||
                    engine.audio !== audio || engine.trackUrl !== track.url) return;
                try { audio.currentTime = seconds; }
                catch (_) { /* Browser may defer seeking until metadata. */ }
            };
            if (audio.readyState >= 1) seek();
            else audio.addEventListener('loadedmetadata', seek, {once:true});
            const played = await engine.play();
            if (played) engine.__syncMp3QuranAyah?.();
            return !!played;
        }

        async function attemptTrack(track, surah, ayah, stillCurrent, mode = 'any') {
            if (!stillCurrent()) return null;
            const qud = window.QuranQud;
            // QUD's local metadata gives *word-level* highlighting for the
            // exact MP3Quran edition, without any internet requirement.
            if (mode !== 'ayah') try {
                const reciter = await qud?.matchMp3Track?.(track.url, surah);
                if (reciter && stillCurrent()) {
                    const same = engine.state.provider === 'quran-foundation' &&
                        Number(engine.state.reciterId) === Number(reciter.id);
                    if (await playAligned(reciter.id,surah,ayah,same,stillCurrent)) {
                        return {ok:true, name:reciter.name, kind:'word'};
                    }
                }
            } catch (error) {
                console.warn('Exact QUD chapter unavailable; checking verse timing',error);
            }
            if (!stillCurrent()) return null;
            if (mode === 'word') return null;
            const mp3Timing = window.QuranMp3AyahTiming;
            const folder = track.url.slice(0,track.url.lastIndexOf('/')+1);
            try {
                const chapter = await mp3Timing?.chapterForRecording?.(folder,surah);
                if (chapter && await playMp3Track(track,chapter,ayah,stillCurrent)) {
                    return {ok:true,name:track.reciterName || 'القارئ',kind:'ayah'};
                }
            } catch (error) {
                console.info('No exact MP3Quran ayah timing for this edition',error);
            }
            return null;
        }

        // A downloaded MP3 without matching verse timestamps is still useful.
        // Play the real saved recording from 00:00, never guess an ayah offset
        // or synthesize highlighting for a different recording edition.
        async function playFromSurahStart(track, stillCurrent) {
            if (!stillCurrent()) return false;
            const found = mp3ReciterForTrack(track, getCatalog());
            if (!found) return false;
            const surah = Number(track.surah);
            const same = trackUrl(engine.snapshot(), surah) === track.url;
            const ready = same
                ? await engine.goTo(surah, 1, {autoplay:false,position:0})
                : await engine.selectMp3(found.reciter, found.moshaf, {
                    surah, autoplay:false, position:0
                });
            if (!ready || !stillCurrent()) return false;
            engine.__mp3AyahChapter = null;
            engine.currentTiming = null;
            engine.state.ayah = 1;
            engine.state.position = 0;
            engine.pendingResume = 0;
            const audio = engine.audio;
            const version = engine.prepareVersion;
            const reset = () => {
                if (!stillCurrent() || version !== engine.prepareVersion ||
                    engine.audio !== audio || engine.trackUrl !== track.url) return;
                try { audio.currentTime = 0; }
                catch (_) { /* Metadata may still be loading. */ }
            };
            if (audio.readyState >= 1) reset();
            else audio.addEventListener('loadedmetadata', reset, {once:true});
            const played = await engine.play();
            if (!played || !stillCurrent()) return false;
            return {ok:true,name:found.reciter.name || track.reciterName || 'القارئ',
                kind:'surah-start',startedAtBeginning:true};
        }

        async function listen(surah, ayah) {
            surah = Number(surah); ayah = Number(ayah);
            if (!validVerse(surah,ayah)) return {ok:false,message:'الآية المحددة غير صالحة.'};
            const token = ++requestNumber;
            const stillCurrent = () => token === requestNumber;
            const original = engine.snapshot();
            const selectedUrl = trackUrl(original,surah);
            const saved = await availableTracks(surah);
            if (!stillCurrent()) return {ok:false,cancelled:true};
            // If the user selected an aligned MP3Quran/QUD reciter and saved
            // this exact recording, do not switch reciters unnecessarily.
            if (original.provider === 'quran-foundation' && window.QuranQud) {
                const chosen = window.QuranQud.reciters.find(item =>
                    Number(item.id) === Number(original.reciterId) &&
                    item.channel === 'mp3quran');
                if (chosen) {
                    try {
                        const chapter = await window.QuranQud.loadChapter(chosen,surah);
                        if (saved.some(track => track.url === chapter.audioUrl) &&
                            await playAligned(chosen.id,surah,ayah,true,stillCurrent)) {
                            return {ok:true,name:chosen.name,kind:'word',downloaded:true,switched:false};
                        }
                    } catch (error) { console.warn('Saved selected QUD recording unavailable',error); }
                }
            }
            // Selected saved sheikh first; otherwise another downloaded
            // recording with exact timing. Never pick a random online reader.
            const prioritized = [...saved].sort((a,b) =>
                Number(b.url === selectedUrl) - Number(a.url === selectedUrl) ||
                Number(b.savedAt || 0) - Number(a.savedAt || 0));
            // Search every saved recording for word timing first, then for
            // official verse timing. An unsynchronized favorite must not
            // eclipse a different saved reciter with precise highlighting.
            for (const mode of ['word','ayah']) {
                for (const track of prioritized) {
                    const result = await attemptTrack(track,surah,ayah,stillCurrent,mode);
                    if (!stillCurrent()) return {ok:false,cancelled:true};
                    if (result?.ok) return {
                        ...result,downloaded:true,
                        switched: result.name !== original.reciterName &&
                            track.url !== selectedUrl,
                        selected: original.reciterName
                    };
                }
            }

            // A synchronized selected reciter must take priority over unrelated
            // downloaded, untimed MP3s whenever the device is online.
            // Otherwise Android devices with older downloads unexpectedly
            // start the surah at 00:00 instead of the tapped verse.
            const offline = window.QuranAudioConnectivity
                ? await window.QuranAudioConnectivity.isOffline()
                : navigator.onLine === false;
            if (!stillCurrent()) return {ok:false,cancelled:true};

            if (!offline && original.provider === 'quran-foundation') {
                const played = await playAligned(original.reciterId,surah,ayah,true,stillCurrent);
                return played
                    ? {ok:true,name:original.reciterName,kind:'stream',downloaded:false,switched:false}
                    : {ok:false,message:window.QuranAudioConnectivity?.safeError(engine.error)
                        || 'تعذّر الاتصال بخادم التلاوة. تحقق من الإنترنت وحاول مرة أخرى.'};
            }

            // Without connectivity, a saved recording without verified verse
            // timings may still be played from the beginning, but it must not
            // displace the selected online synchronized reciter.
            for (const track of prioritized) {
                const result = await playFromSurahStart(track,stillCurrent);
                if (!stillCurrent()) return {ok:false,cancelled:true};
                if (result?.ok) return {
                    ...result,downloaded:true,
                    switched: result.name !== original.reciterName &&
                        track.url !== selectedUrl,
                    selected:original.reciterName
                };
            }
            if (offline) return {
                ok:false, offline:true,
                message:saved.length ? OFFLINE_UNALIGNED : OFFLINE_EMPTY
            };

            if (selectedUrl) {
                const selectedTrack = {
                    url:selectedUrl, surah, reciterId:original.reciterId,
                    reciterName:original.reciterName, moshafId:original.moshafId,
                    moshafName:original.moshafName
                };
                const result = await attemptTrack(selectedTrack,surah,ayah,stillCurrent);
                if (!stillCurrent()) return {ok:false,cancelled:true};
                if (result?.ok) return {
                    ...result,downloaded:false,
                    switched:result.name !== original.reciterName &&
                        selectedUrl !== (engine.trackUrl || ''),
                    selected:original.reciterName
                };
                const fallback = await playFromSurahStart(selectedTrack,stillCurrent);
                if (!stillCurrent()) return {ok:false,cancelled:true};
                if (fallback?.ok) return {
                    ...fallback,downloaded:false,switched:false,
                    selected:original.reciterName
                };
            }
            return {ok:false,message:ONLINE_UNALIGNED};
        }

        return Object.freeze({listen});
    }

    window.QuranVerseListen = Object.freeze({create,OFFLINE_EMPTY,OFFLINE_UNALIGNED});
})();