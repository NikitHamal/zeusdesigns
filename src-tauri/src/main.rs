// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Physical working-set RAM (<17 MB) is governed by PerfGovernor (`SetProcessWorkingSetSizeEx` + `K32EmptyWorkingSet`).
// Never pass `--max-old-space-size=48` or `--max-semi-space-size=1` to V8, as V8 aborts the renderer with
// "Error code: Out of Memory" whenever virtual JS heap allocation spikes during folder open or agent turns.
const LOW_MEM_WEBVIEW_ARGS: &str = "--in-process-broker --renderer-process-limit=1 --process-per-site --disable-site-isolation-trials --force-gpu-mem-available-mb=64 --gpu-program-cache-size-kb=512 --gpu-rasterization-msaa-sample-count=0 --num-raster-threads=1 --disable-gpu-shader-disk-cache --aggressive-cache-discard --disable-webgl --disable-webgl2 --disable-3d-apis --disable-accelerated-video-decode --disable-accelerated-video-encode --disable-notifications --disable-speech-api --disable-presentation-api --disable-shared-workers --js-flags=--optimize-for-size,--lazy --enable-features=NetworkServiceInProcess,NetworkServiceInProcess2,StorageServiceInProcess,OptimizeLoadingDataUrls --disable-features=IsolateOrigins,site-per-process,SpareRendererForSitePerProcess,msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,WinUseBrowserSpellChecker,AudioServiceOutOfProcess,BackForwardCache,Prerender2,InterestFeedContentSuggestions,AutofillServerCommunication,CertificateTransparencyComponentUpdater,CalculateNativeWinOcclusion --disable-extensions --disable-component-update --disable-background-networking --disable-sync --disable-default-apps --no-first-run --no-default-browser-check --no-pings --disk-cache-size=1048576 --media-cache-size=524288";

fn main() {
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", LOW_MEM_WEBVIEW_ARGS);
    }
    if std::env::var_os("WEBVIEW2_DEFAULT_BACKGROUND_COLOR").is_none() {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF141218");
    }
    zeusdesigns_lib::run()
}
