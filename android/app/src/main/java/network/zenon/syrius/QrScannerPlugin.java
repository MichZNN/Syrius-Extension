package network.zenon.syrius;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.moduleinstall.ModuleInstall;
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

// QR scanning through Google Play services' code scanner, which draws the
// camera in its own process: the app holds no camera permission and ships no
// barcode library. @capacitor-mlkit/barcode-scanning did the same call but
// also bundled ML Kit's own decoder and CameraX, about 28 MB of the APK.
@CapacitorPlugin(name = "QrScanner")
public class QrScannerPlugin extends Plugin {

    @PluginMethod
    public void scan(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        scanner
            .startScan()
            .addOnSuccessListener(barcode -> {
                JSObject result = new JSObject();
                result.put("text", barcode.getRawValue());
                call.resolve(result);
            })
            // Backing out of the scanner is an answer, not an error.
            .addOnCanceledListener(() -> call.resolve(new JSObject()))
            .addOnFailureListener(error -> {
                // The scanner module is fetched on install (the manifest's
                // barcode_ui), but a phone can be offline then. Ask again.
                if (error instanceof MlKitException && ((MlKitException) error).getErrorCode() == MlKitException.UNAVAILABLE) {
                    ModuleInstall.getClient(getContext()).installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build());
                    call.reject("The scanner is being installed", "UNAVAILABLE");
                    return;
                }
                call.reject(error.getMessage(), error);
            });
    }
}
