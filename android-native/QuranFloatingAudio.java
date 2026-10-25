package com.sofian.nooralquran;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import java.util.ArrayList;

@CapacitorPlugin(name = "QuranFloatingAudio")
public class QuranFloatingAudio extends Plugin {
    private JSObject statusValue() {
        QuranPlaybackService service = QuranPlaybackService.current();
        JSObject out = new JSObject();
        if (service == null) { out.put("active",false); return out; }
        Bundle state = service.status();
        for (String key : state.keySet()) out.put(key,state.get(key));
        return out;
    }
    private void command(String action) {
        Intent intent = new Intent(getContext(),QuranPlaybackService.class).setAction(action);
        getContext().startService(intent);
    }
    @PluginMethod public void status(PluginCall call) { call.resolve(statusValue()); }
    @PluginMethod public void start(PluginCall call) {
        try {
            JSArray rawUrls = call.getArray("urls");
            JSArray rawTitles = call.getArray("titles");
            if (rawUrls == null || rawTitles == null || rawUrls.length() == 0 ||
                rawUrls.length() != rawTitles.length() || rawUrls.length() > 114) {
                call.reject("Invalid recitation playlist"); return;
            }
            ArrayList<String> urls = new ArrayList<>();
            ArrayList<String> titles = new ArrayList<>();
            for (int i = 0; i < rawUrls.length(); i++) {
                String url = rawUrls.getString(i);
                if (!QuranPlaybackService.approvedUrl(url)) {
                    call.reject("Unapproved recitation URL"); return;
                }
                urls.add(url);
                titles.add(rawTitles.getString(i).substring(0,
                    Math.min(100,rawTitles.getString(i).length())));
            }
            Intent intent = new Intent(getContext(),QuranPlaybackService.class)
                .setAction(QuranPlaybackService.ACTION_START)
                .putStringArrayListExtra("urls",urls)
                .putStringArrayListExtra("titles",titles)
                .putExtra("artist",call.getString("artist",""))
                .putExtra("index",call.getInt("index",0))
                .putExtra("position",call.getInt("position",0))
                .putExtra("speed",call.getFloat("speed",1f))
                .putExtra("repeat",call.getBoolean("repeat",false))
                .putExtra("autoplay",call.getBoolean("autoplay",true));
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception e) { call.reject("Could not start recitation playback",e); }
    }
    @PluginMethod public void play(PluginCall call) {
        if (QuranPlaybackService.current() != null) command(QuranPlaybackService.ACTION_PLAY);
        call.resolve(statusValue());
    }
    @PluginMethod public void pause(PluginCall call) {
        if (QuranPlaybackService.current() != null) command(QuranPlaybackService.ACTION_PAUSE);
        call.resolve(statusValue());
    }
    @PluginMethod public void next(PluginCall call) {
        if (QuranPlaybackService.current() != null) command(QuranPlaybackService.ACTION_NEXT);
        call.resolve(statusValue());
    }
    @PluginMethod public void previous(PluginCall call) {
        if (QuranPlaybackService.current() != null) command(QuranPlaybackService.ACTION_PREVIOUS);
        call.resolve(statusValue());
    }
    @PluginMethod public void stop(PluginCall call) {
        if (QuranPlaybackService.current() != null) command(QuranPlaybackService.ACTION_STOP);
        call.resolve();
    }
    @PluginMethod public void seek(PluginCall call) {
        QuranPlaybackService service = QuranPlaybackService.current();
        if (service != null) service.seek(call.getInt("position",0));
        call.resolve(statusValue());
    }
    @PluginMethod public void speed(PluginCall call) {
        QuranPlaybackService service = QuranPlaybackService.current();
        if (service != null) service.setSpeed(call.getFloat("speed",1f));
        call.resolve(statusValue());
    }
    @PluginMethod public void repeat(PluginCall call) {
        QuranPlaybackService service = QuranPlaybackService.current();
        if (service != null) service.setRepeat(call.getBoolean("repeat",false));
        call.resolve(statusValue());
    }
}