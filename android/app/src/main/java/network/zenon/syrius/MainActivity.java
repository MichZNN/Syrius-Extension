package network.zenon.syrius;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins are registered before the bridge starts.
        registerPlugin(QrScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
