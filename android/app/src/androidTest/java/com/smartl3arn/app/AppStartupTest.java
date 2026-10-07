package com.smartl3arn.app;

import static org.junit.Assert.*;

import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppStartupTest {
    @Test
    public void startsRendererAndRegistersNativePlugins() {
        assertEquals("com.smartl3arn.app", InstrumentationRegistry.getInstrumentation()
            .getTargetContext().getPackageName());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertNotNull(activity.getBridge());
                assertNotNull(activity.getBridge().getWebView());
                assertTrue(activity.getBridge().getWebView().getSettings().getJavaScriptEnabled());
                for (String plugin : new String[] { "Filesystem", "Share", "StatusBar" }) {
                    assertNotNull("Missing native plugin: " + plugin, activity.getBridge().getPlugin(plugin));
                }
            });
            AtomicBoolean rendered = new AtomicBoolean(false);
            long deadline = SystemClock.uptimeMillis() + 15000;
            while (!rendered.get() && SystemClock.uptimeMillis() < deadline) {
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "Boolean(document.querySelector('#app .workspace h1'))",
                    result -> rendered.set("true".equals(result))));
                SystemClock.sleep(50);
            }
            assertTrue("Vue library did not render within 15 seconds", rendered.get());
        }
    }
}
