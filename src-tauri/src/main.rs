// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const LOW_MEM_WEBVIEW_ARGS: &str = "--enable-low-end-device-mode --in-process-broker --renderer-process-limit=1 --process-per-site --disable-site-isolation-trials --gpu-rasterization-msaa-sample-count=0 --num-raster-threads=1 --disable-gpu-shader-disk-cache --disable-2d-canvas-image-chromium --js-flags=--optimize-for-size,--max-semi-space-size=2,--initial-old-space-size=8,--max-old-space-size=96 --disable-features=IsolateOrigins,site-per-process,SpareRendererForSitePerProcess,msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,WinUseBrowserSpellChecker,AudioServiceOutOfProcess,BackForwardCache,Prerender2,InterestFeedContentSuggestions,AutofillServerCommunication,CertificateTransparencyComponentUpdater,CalculateNativeWinOcclusion --disable-extensions --disable-component-update --disable-background-networking --disable-sync --disable-default-apps --no-first-run --no-default-browser-check --no-pings --disk-cache-size=2097152 --media-cache-size=1048576";

fn main() {
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", LOW_MEM_WEBVIEW_ARGS);
    }
    if std::env::var_os("WEBVIEW2_DEFAULT_BACKGROUND_COLOR").is_none() {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF141218");
    }
    zeusdesigns_lib::run()
}
