package com.sofian.nooralquran;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;

@CapacitorPlugin(name = "QuranBackgroundDownloads")
public class QuranBackgroundDownloads extends Plugin {
    @PluginMethod
    public void enqueue(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("HTTPS URL required"); return; }
        try {
            File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            if (directory == null) { call.reject("Music directory unavailable"); return; }
            String name = "quran-" + System.currentTimeMillis() + "-" + Math.abs(url.hashCode()) + ".mp3";
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("تنزيل تلاوة القرآن الكريم");
            request.setDescription("يستمر تنزيل التلاوة في الخلفية");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_MUSIC, name);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long id = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("id", String.valueOf(id));
            result.put("path", new File(directory, name).getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not start download", error); }
    }

    @PluginMethod
    public void status(PluginCall call) {
        String raw = call.getString("id");
        if (raw == null) { call.reject("Missing id"); return; }
        try {
            long id = Long.parseLong(raw);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                if (cursor == null || !cursor.moveToFirst()) { call.reject("Download not found"); return; }
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("received", received);
                result.put("total", total);
                result.put("reason", cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
                call.resolve(result);
            }
        } catch (Exception error) { call.reject("Could not query download", error); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            long id = Long.parseLong(call.getString("id", ""));
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            manager.remove(id);
            call.resolve();
        } catch (Exception error) { call.reject("Could not remove download", error); }
    }
}
