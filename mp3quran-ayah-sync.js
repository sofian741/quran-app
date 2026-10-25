(() => {
    'use strict';
    // Best-effort AYAH (not word) highlighting for MP3Quran recordings whose
    // *exact folder URL* is published by MP3Quran's official timing API.
    // Never align by reciter name: different editions can have different timing.
    const core = window.QuranAudio;
    if (!core?.AudioEngine) return;
    const READS_URL = 'https://mp3quran.net/api/v3/ayat_timing/reads';
    const TIMING_URL = 'https://mp3quran.net/api/v3/ayat_timing';
    const READS_KEY = 'ayatMp3TimingReadsV1';
    const CHAPTER_PREFIX = 'ayatMp3AyahTimingV1:';
    const REFRESH_AGE = 30 * 86400000;
    let readsPromise = null;
    const chapterPromises = new Map();
    const bound = new WeakSet();

    const safeRead = key => {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); }
        catch (_) { return null; }
    };
    const safeWrite = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch (_) { /* Offline storage is optional. */ }
    };

    function normalizedFolder(value) {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username || url.password ||
                url.search || url.hash ||
                !(url.hostname === 'mp3quran.net' || url.hostname.endsWith('.mp3quran.net')))
                return '';
            return url.origin + (url.pathname.endsWith('/') ? url.pathname : url.pathname + '/');
        } catch (_) { return ''; }
    }

    async function availableReads() {
        if (readsPromise) return readsPromise;
        readsPromise = (async () => {
            const saved = safeRead(READS_KEY);
            if (Array.isArray(saved?.reads) &&
                (navigator.onLine === false || Date.now() - saved.savedAt < REFRESH_AGE)) {
                return saved.reads;
            }
            try {
                const response = await fetch(READS_URL, { cache: 'no-cache' });
                if (!response.ok) throw new Error('MP3Quran timing catalog failed');
                const payload = await response.json();
                const reads = (Array.isArray(payload) ? payload :
                    (Array.isArray(payload?.reads) ? payload.reads : []))
                    .map(row => ({
                        id: Number(row.id),
                        folder: normalizedFolder(row.folder_url || row.server || '')
                    }))
                    .filter(row => Number.isSafeInteger(row.id) && row.id > 0 && row.folder);
                if (!reads.length) throw new Error('MP3Quran timing catalog empty');
                safeWrite(READS_KEY, { reads, savedAt: Date.now() });
                return reads;
            } catch (error) {
                if (Array.isArray(saved?.reads)) return saved.reads;
                throw error;
            }
        })().catch(error => {
            readsPromise = null;
            throw error;
        });
        return readsPromise;
    }

    function validateChapter(rows, surah) {
        const expected = core.VERSE_COUNTS[surah - 1];
        if (!Array.isArray(rows)) return null;
        const seen = new Map();
        for (const row of rows) {
            const ayah = Number(row.ayah), start = Number(row.start_time), end = Number(row.end_time);
            if (!Number.isInteger(ayah) || ayah < 1 || ayah > expected ||
                !Number.isFinite(start) || !Number.isFinite(end) ||
                start < 0 || end <= start || seen.has(ayah)) continue;
            seen.set(ayah, { surah, ayah, timestampFrom: start,
                timestampTo: end, duration: end - start,
                segments: [], source: 'MP3Quran Ayah Timing' });
        }
        if (seen.size !== expected) return null;
        const ordered = [...seen.values()].sort((a,b)=>a.ayah-b.ayah);
        if (ordered.some((item,i)=>item.ayah!==i+1 ||
            (i>0 && item.timestampFrom < ordered[i-1].timestampFrom))) return null;
        return ordered;
    }

    async function chapterTiming(readId, surah) {
        const key = CHAPTER_PREFIX + readId + ':' + surah;
        if (chapterPromises.has(key)) return chapterPromises.get(key);
        const promise = (async()=>{
            const saved = safeRead(key);
            const verifiedSaved = validateChapter(saved?.rows, surah);
            if (verifiedSaved &&
                (navigator.onLine === false || Date.now()-saved.savedAt<REFRESH_AGE)) return verifiedSaved;
            try {
                const url = TIMING_URL + '?surah=' + surah + '&read=' + readId;
                const response = await fetch(url, { cache:'no-cache' });
                if (!response.ok) throw new Error('MP3Quran verse timing request failed');
                const raw = await response.json();
                const rows = validateChapter(Array.isArray(raw) ? raw : raw?.data, surah);
                if (!rows) throw new Error('MP3Quran verse timing is incomplete');
                safeWrite(key, { rows: rows.map(item=>({
                    ayah:item.ayah,start_time:item.timestampFrom,end_time:item.timestampTo
                })), savedAt: Date.now() });
                return rows;
            } catch (error) {
                if (verifiedSaved) return verifiedSaved;
                throw error;
            }
        })().catch(error=>{ chapterPromises.delete(key); throw error; });
        chapterPromises.set(key,promise);
        return promise;
    }

    // A saved MP3Quran recording can seek to a particular ayah only when
    // official timings match its exact recording folder. Offline use works
    // with previously cached timing data; never guess missing boundaries.
    async function chapterForRecording(server, surah) {
        const folder = normalizedFolder(server);
        if (!folder || !Number.isInteger(Number(surah)) ||
            Number(surah) < 1 || Number(surah) > 114) return null;
        const reads = await availableReads();
        const read = reads.find(row => row.folder === folder);
        if (!read) return null;
        const verses = await chapterTiming(read.id, Number(surah));
        return verses?.length === core.VERSE_COUNTS[Number(surah)-1]
            ? {server:folder,surah:Number(surah),verses} : null;
    }

    const proto = core.AudioEngine.prototype;
    const oldPrepare = proto.prepare;
    const oldBind = proto.bindAudio;

    proto.__syncMp3QuranAyah = function() {
        const doc = this.__mp3AyahChapter;
        if (!doc || this.state.provider !== 'mp3quran' ||
            doc.surah !== this.state.surah ||
            doc.server !== normalizedFolder(this.state.server) ||
            !Number.isFinite(this.audio.currentTime)) return;
        const ms = Math.max(0,this.audio.currentTime*1000);
        const verses = doc.verses;
        let lo=0,hi=verses.length-1,index=-1;
        while(lo<=hi) {
            const mid=(lo+hi)>>1;
            if(verses[mid].timestampFrom<=ms+25){index=mid;lo=mid+1;}
            else hi=mid-1;
        }
        if(index<0)return;
        const timing=verses[index];
        if(ms>timing.timestampTo+150)return;
        if(this.state.ayah===timing.ayah && this.currentTiming===timing)return;
        this.state.ayah=timing.ayah;
        this.currentTiming=timing;
        this.state.position=this.audio.currentTime;
        this.persist();
        this.emit('time');
    };

    proto.bindAudio = function(...args) {
        const result = oldBind.apply(this,args);
        const audio = this.audio;
        if (audio && !bound.has(audio)) {
            bound.add(audio);
            audio.addEventListener('timeupdate', () => {
                if (this.audio===audio) this.__syncMp3QuranAyah();
            });
            audio.addEventListener('seeked', () => {
                if (this.audio===audio) this.__syncMp3QuranAyah();
            });
        }
        return result;
    };

    proto.prepare = async function(...args) {
        this.__mp3AyahChapter=null;
        const result = await oldPrepare.apply(this,args);
        if (!result || this.state.provider!=='mp3quran') return result;
        const stamp=this.prepareVersion;
        const server=normalizedFolder(this.state.server);
        const surah=Number(this.state.surah);
        const audioUrl=this.trackUrl;
        if (!server || !Number.isInteger(surah)) return result;
        // All MP3 playback continues immediately; the API is optional and
        // must never delay Play, download, repeat or saved file restoration.
        (async()=>{
            try {
                const reads=await availableReads();
                const read=reads.find(row=>row.folder===server);
                if (!read) return;
                const verses=await chapterTiming(read.id,surah);
                if (stamp!==this.prepareVersion || this.state.provider!=='mp3quran' ||
                    Number(this.state.surah)!==surah ||
                    normalizedFolder(this.state.server)!==server || this.trackUrl!==audioUrl) return;
                this.__mp3AyahChapter={server,surah,verses};
                this.__syncMp3QuranAyah();
                this.emit();
            } catch (error) {
                console.info('MP3Quran timing not available for this recording; normal audio continues',error);
            }
        })();
        return result;
    };

    window.QuranMp3AyahTiming = Object.freeze({normalizedFolder,validateChapter,chapterForRecording});
})();
