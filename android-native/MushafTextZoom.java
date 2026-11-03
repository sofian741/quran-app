package com.sofian.nooralquran;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebSettings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * QA-only A/B probe for Android WebView's OS-driven font scaling.
 * Records the device's original zoom before changing it, and allows switching
 * between original system scaling and 100%, with the choice persisted across reloads.
 * Never included in production MainActivity or its main-branch workflow.
 */
@CapacitorPlugin(name = "MushafTextZoom")
public class MushafTextZoom extends Plugin {
    private static final String PREFS_NAME = "mushaf_device_diagnostic";
    private static final String PREF_FIXED = "text_zoom_100_enabled";
    private int originalTextZoom = 100;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private WebSettings settings() {
        return getBridge().getWebView().getSettings();
    }

    @Override
    public void load() {
        super.load();
        // Plugin is registered before BridgeActivity.onCreate, so capture the
        // WebView's OS-derived initial value, not an already overwritten value.
        originalTextZoom = settings().getTextZoom();
        if (preferences().getBoolean(PREF_FIXED, true)) {
            settings().setTextZoom(100);
        }
    }

    private JSObject state() {
        JSObject result = new JSObject();
        result.put("mode", preferences().getBoolean(PREF_FIXED, true) ? "fixed" : "system");
        result.put("systemTextZoom", originalTextZoom);
        result.put("appliedTextZoom", settings().getTextZoom());
        return result;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { call.resolve(state()); }
            catch (Exception error) { call.reject("Unable to inspect text zoom", error); }
        });
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode", "");
        if (!"system".equals(mode) && !"fixed".equals(mode)) {
            call.reject("mode must be fixed or system");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                boolean useFixed = "fixed".equals(mode);
                settings().setTextZoom(useFixed ? 100 : originalTextZoom);
                preferences().edit().putBoolean(PREF_FIXED, useFixed).apply();
                call.resolve(state());
            } catch (Exception error) {
                call.reject("Unable to change text zoom", error);
            }
        });
    }
}
