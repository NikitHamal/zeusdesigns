// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const LOW_MEM_WEBVIEW_ARGS: &str = "--renderer-process-limit=1 --process-per-site --disable-site-isolation-trials --disable-features=IsolateOrigins,site-per-process,SpareRendererForSitePerProcess,msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,WinUseBrowserSpellChecker,AudioServiceOutOfProcess,BackForwardCache,Prerender2,InterestFeedContentSuggestions,AutofillServerCommunication,CertificateTransparencyComponentUpdater --disable-extensions --disable-component-update --disable-background-networking --disable-sync --disable-default-apps --no-first-run --no-default-browser-check --no-pings --disk-cache-size=4194304 --media-cache-size=2097152";

fn main() {
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", LOW_MEM_WEBVIEW_ARGS);
    }
    zeusdesigns_lib::run()
}
