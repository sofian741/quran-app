package com.sofian.nooralquran;

import android.webkit.WebSettings;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keep Quran layout CSS pixel geometry stable across Android system font-scale
 * preferences. Capacitor registers this plugin before BridgeActivity loads its
 * WebView content, so the text zoom is set before Mushaf line measurements run.
 *
 * This controls WebView text inflation, not the user's pinch-to-zoom feature.
 */
@CapacitorPlugin(name = "MushafTextScale")
public class MushafTextScale extends Plugin {
    @Override
    public void load() {
        super.load();
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setTextZoom(100);
    }
}
