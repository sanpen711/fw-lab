package com.fwyanjiusuo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://fwyanjiusuo.com/app/";
    private static final String APP_HOST = "fwyanjiusuo.com";
    private static final String UPDATE_URL = "https://fwyanjiusuo.com/download/android-version.json";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private boolean updateDialogShowing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);
        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
        checkForAppUpdate();
    }

    private void configureSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#10170F"));
            getWindow().setNavigationBarColor(Color.parseColor("#10170F"));
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        String ua = settings.getUserAgentString();
        if (ua != null && !ua.contains("FWYanjiusuoAndroid")) {
            settings.setUserAgentString(ua + " FWYanjiusuoAndroid/" + BuildConfig.VERSION_NAME);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && request != null) {
                    return handleExternalUrl(request.getUrl());
                }
                return false;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadCallback != null) {
                    uploadCallback.onReceiveValue(null);
                }
                uploadCallback = filePathCallback;
                Intent intent;
                try {
                    intent = fileChooserParams.createIntent();
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                }
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    uploadCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private boolean handleExternalUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null) return false;
        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && APP_HOST.equalsIgnoreCase(host)) {
            return false;
        }
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            openExternalUrl(uri.toString());
            return true;
        }
        return false;
    }

    private void checkForAppUpdate() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_URL + "?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setUseCaches(false);
                connection.setRequestMethod("GET");
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) return;
                String jsonText = readStream(connection.getInputStream());
                JSONObject json = new JSONObject(jsonText);
                int latestCode = json.optInt("versionCode", BuildConfig.VERSION_CODE);
                if (latestCode <= BuildConfig.VERSION_CODE) return;
                String versionName = json.optString("versionName", "新版");
                String apkUrl = json.optString("apkUrl", "");
                String notes = json.optString("notes", "发现新版本，建议更新后继续使用。");
                boolean forceUpdate = json.optBoolean("forceUpdate", false);
                if (apkUrl.trim().isEmpty()) return;
                runOnUiThread(() -> showUpdateDialog(versionName, notes, apkUrl, forceUpdate));
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private String readStream(InputStream inputStream) throws Exception {
        StringBuilder builder = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line);
        }
        reader.close();
        return builder.toString();
    }

    private void showUpdateDialog(String versionName, String notes, String apkUrl, boolean forceUpdate) {
        if (isFinishing() || updateDialogShowing) return;
        updateDialogShowing = true;
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("发现新版本 " + versionName)
                .setMessage(notes)
                .setPositiveButton("立即更新", (dialog, which) -> {
                    updateDialogShowing = false;
                    openExternalUrl(apkUrl);
                    if (forceUpdate) moveTaskToBack(true);
                });
        if (!forceUpdate) {
            builder.setNegativeButton("稍后再说", (dialog, which) -> updateDialogShowing = false);
        }
        AlertDialog dialog = builder.create();
        dialog.setOnCancelListener(d -> updateDialogShowing = false);
        dialog.setCanceledOnTouchOutside(!forceUpdate);
        dialog.show();
    }

    private void openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "无法打开下载链接", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || uploadCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        }
        uploadCallback.onReceiveValue(results);
        uploadCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        handleAppBackButton();
    }

    private void handleAppBackButton() {
        String script = "(function(){" +
                "try{" +
                "var fw=window.FWApp;" +
                "var view=(fw&&fw.state&&fw.state.view)||'';" +
                "if(!view){var active=document.querySelector('[data-app-view].is-active');view=active&&active.dataset?active.dataset.appView:'';}" +
                "if(!view||view==='nav'){return false;}" +
                "if(fw&&typeof fw.openView==='function'){fw.openView('nav');return true;}" +
                "if(fw&&typeof fw.setView==='function'){fw.setView('nav');return true;}" +
                "return false;" +
                "}catch(e){return false;}" +
                "})()";

        webView.evaluateJavascript(script, value -> {
            boolean handled = "true".equals(String.valueOf(value));
            if (handled) return;
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
            moveTaskToBack(true);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
