package com.sofian.nooralquran;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.*;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Owns MP3Quran playback independently of the Capacitor WebView lifecycle. */
public class QuranPlaybackService extends Service {
    static final String ACTION_START = "com.sofian.nooralquran.START_RECITATION";
    static final String ACTION_PLAY = "com.sofian.nooralquran.PLAY_RECITATION";
    static final String ACTION_PAUSE = "com.sofian.nooralquran.PAUSE_RECITATION";
    static final String ACTION_NEXT = "com.sofian.nooralquran.NEXT_RECITATION";
    static final String ACTION_PREVIOUS = "com.sofian.nooralquran.PREV_RECITATION";
    static final String ACTION_STOP = "com.sofian.nooralquran.STOP_RECITATION";
    private static final String CHANNEL = "ayat-recitation-playback";
    private static final int NOTIFICATION_ID = 814;
    private static QuranPlaybackService instance;

    private final ArrayList<String> urls = new ArrayList<>();
    private final ArrayList<String> titles = new ArrayList<>();
    private int index = 0;
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager audioManager;
    private boolean ready, pendingPlay, loading, repeat, active;
    private float speed = 1f;
    private String artist = "", error = "";
    private int requestedPosition;
    private int generation;

    static QuranPlaybackService current() { return instance; }

    static boolean approvedUrl(String raw) {
        try {
            Uri uri = Uri.parse(raw);
            String host = uri.getHost();
            return "https".equalsIgnoreCase(uri.getScheme()) && host != null &&
                (host.equals("mp3quran.net") || host.endsWith(".mp3quran.net")) &&
                uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null &&
                uri.getPath() != null && uri.getPath().matches("/(?:[^/]+/)+[0-9]{3}\\.mp3");
        } catch (Exception e) { return false; }
    }

    private boolean approvedLocal(String path) {
        try {
            File dir = getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC);
            File file = new File(path).getCanonicalFile();
            return dir != null && file.isFile() && file.getParentFile().equals(dir.getCanonicalFile()) &&
                file.getName().matches("quran-[0-9]+-[0-9]+\\.mp3");
        } catch (Exception e) { return false; }
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "تلاوات آيات",
                NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("التحكم في تشغيل تلاوات القرآن الكريم");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        session = new MediaSession(this, "Ayat Recitations");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { play(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { skip(1); }
            @Override public void onSkipToPrevious() { skip(-1); }
            @Override public void onStop() { stopPlayback(); }
            @Override public void onSeekTo(long pos) { seek((int)pos); }
        });
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setActive(true);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            ArrayList<String> incoming = intent.getStringArrayListExtra("urls");
            ArrayList<String> names = intent.getStringArrayListExtra("titles");
            if (incoming == null || names == null || incoming.isEmpty() ||
                incoming.size() != names.size() || incoming.size() > 114) {
                stopSelf(); return START_NOT_STICKY;
            }
            for (String url : incoming) {
                if (!approvedUrl(url)) { stopSelf(); return START_NOT_STICKY; }
            }
            urls.clear(); urls.addAll(incoming);
            titles.clear(); titles.addAll(names);
            index = Math.min(urls.size()-1, Math.max(0,intent.getIntExtra("index", 0)));
            artist = intent.getStringExtra("artist");
            if (artist == null) artist = "";
            speed = Math.max(.75f, Math.min(2f,intent.getFloatExtra("speed",1f)));
            repeat = intent.getBooleanExtra("repeat", false);
            requestedPosition = Math.max(0,intent.getIntExtra("position",0));
            pendingPlay = intent.getBooleanExtra("autoplay", true);
            active = true;
            error = "";
            // Foreground is entered immediately, before asynchronous media preparation.
            startForeground(NOTIFICATION_ID, notification());
            loadCurrent();
        } else if (ACTION_PLAY.equals(action)) play();
        else if (ACTION_PAUSE.equals(action)) pause();
        else if (ACTION_NEXT.equals(action)) skip(1);
        else if (ACTION_PREVIOUS.equals(action)) skip(-1);
        else if (ACTION_STOP.equals(action)) stopPlayback();
        return START_NOT_STICKY;
    }

    private void loadCurrent() {
        generation++;
        final int version = generation;
        releasePlayer();
        if (!active || urls.isEmpty()) return;
        loading = true;
        ready = false;
        error = "";
        try {
            MediaPlayer next = new MediaPlayer();
            player = next;
            next.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            String url = urls.get(index);
            // A local file is accepted only from our app-owned download directory.
            if (url.startsWith("file://") && approvedLocal(Uri.parse(url).getPath())) {
                next.setDataSource(Uri.parse(url).getPath());
            } else if (approvedUrl(url)) next.setDataSource(url);
            else throw new SecurityException("Invalid recitation source");
            next.setOnPreparedListener(mp -> {
                if (version != generation || mp != player) return;
                loading = false; ready = true;
                try {
                    if (requestedPosition > 0) mp.seekTo(Math.min(requestedPosition,
                        Math.max(0,mp.getDuration()-250)));
                    if (Build.VERSION.SDK_INT >= 23) mp.setPlaybackParams(
                        mp.getPlaybackParams().setSpeed(speed));
                    if (pendingPlay) startPlayer();
                } catch (Exception e) { error = "تعذّر بدء التلاوة"; }
                updateNotification();
            });
            next.setOnCompletionListener(mp -> {
                if (version != generation || mp != player) return;
                if (repeat) { seek(0); play(); }
                else if (index + 1 < urls.size()) skip(1);
                else { pendingPlay = false; updateNotification(); }
            });
            next.setOnErrorListener((mp,what,extra) -> {
                if (version == generation) {
                    loading = false; ready = false; pendingPlay = false;
                    error = "تعذّر تحميل التلاوة. تحقق من الإنترنت.";
                    updateNotification();
                }
                return true;
            });
            next.prepareAsync();
        } catch (Exception e) {
            loading = false; ready = false; pendingPlay = false;
            error = "تعذّر فتح التسجيل الصوتي.";
            updateNotification();
        }
    }

    private void startPlayer() {
        if (!ready || player == null) return;
        try {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            player.start();
            pendingPlay = true;
            updateNotification();
        } catch (Exception e) { error = "تعذّر تشغيل التلاوة."; updateNotification(); }
    }
    void play() {
        pendingPlay = true;
        if (ready) startPlayer();
        else if (active && !loading) loadCurrent();
    }
    void pause() {
        pendingPlay = false;
        if (player != null && ready && player.isPlaying()) player.pause();
        updateNotification();
    }
    void skip(int delta) {
        if (!active || urls.isEmpty()) return;
        int next = index + delta;
        if (next < 0 || next >= urls.size()) return;
        index = next;
        requestedPosition = 0;
        loadCurrent();
        updateNotification();
    }
    void seek(int position) {
        if (!active) return;
        if (!ready || player == null) { requestedPosition = Math.max(0,position); return; }
        try { player.seekTo(Math.max(0,Math.min(position,player.getDuration()))); }
        catch (Exception ignored) {}
        updateNotification();
    }
    void setSpeed(float value) {
        speed = Math.max(.75f,Math.min(2f,value));
        if (ready && player != null && Build.VERSION.SDK_INT >= 23) {
            try { player.setPlaybackParams(player.getPlaybackParams().setSpeed(speed)); }
            catch (Exception ignored) {}
        }
    }
    void setRepeat(boolean value) { repeat = value; }
    void stopPlayback() {
        active = false; pendingPlay = false; loading = false; ready = false;
        urls.clear(); titles.clear();
        releasePlayer();
        audioManager.abandonAudioFocus(null);
        stopForeground(true);
        stopSelf();
    }
    private void releasePlayer() {
        if (player != null) {
            try { player.reset(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
    }

    android.os.Bundle status() {
        android.os.Bundle out = new android.os.Bundle();
        out.putBoolean("active", active);
        out.putBoolean("playing", ready && player != null && player.isPlaying());
        out.putBoolean("loading", loading);
        out.putString("error", error);
        out.putString("title", titles.isEmpty() ? "" : titles.get(index));
        out.putString("artist", artist);
        out.putInt("index", index);
        out.putInt("count", urls.size());
        out.putString("url", urls.isEmpty() ? "" : urls.get(index));
        out.putInt("position", ready && player != null ? player.getCurrentPosition() : requestedPosition);
        out.putInt("duration", ready && player != null ? player.getDuration() : 0);
        return out;
    }
    private PendingIntent action(String name, int requestCode) {
        Intent intent = new Intent(this, QuranPlaybackService.class).setAction(name);
        return PendingIntent.getService(this,requestCode,intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification() {
        boolean playing = ready && player != null && player.isPlaying();
        Intent open = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this,0,open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(titles.isEmpty() ? "تلاوات آيات" : titles.get(index))
            .setContentText(artist).setContentIntent(content)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true)
            .setOngoing(playing || loading)
            .addAction(android.R.drawable.ic_media_previous,"السابق",action(ACTION_PREVIOUS,1))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "إيقاف مؤقت" : "تشغيل",action(playing ? ACTION_PAUSE : ACTION_PLAY,2))
            .addAction(android.R.drawable.ic_media_next,"التالي",action(ACTION_NEXT,3))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel,"إغلاق",action(ACTION_STOP,4))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0,1,2));
        return b.build();
    }
    private void updateNotification() {
        if (!active) return;
        boolean playing = ready && player != null && player.isPlaying();
        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE,titles.isEmpty() ? "تلاوات آيات" : titles.get(index))
            .putString(MediaMetadata.METADATA_KEY_ARTIST,artist).build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO |
                PlaybackState.ACTION_STOP)
            .setState(loading ? PlaybackState.STATE_BUFFERING :
                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                ready && player != null ? player.getCurrentPosition() : requestedPosition,
                playing ? speed : 0f).build());
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID,notification());
    }
    @Override public android.os.IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        active = false; releasePlayer();
        if (session != null) session.release();
        if (audioManager != null) audioManager.abandonAudioFocus(null);
        instance = null;
        super.onDestroy();
    }
}