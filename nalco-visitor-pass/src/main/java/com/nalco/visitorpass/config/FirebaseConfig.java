package com.nalco.visitorpass.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import org.springframework.context.annotation.Configuration;
import jakarta.annotation.PostConstruct;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

@Configuration
public class FirebaseConfig {

    private static boolean initialized = false;

    @PostConstruct
    public void init() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                String credentialsJson = System.getenv("FIREBASE_CREDENTIALS_JSON");
                if (credentialsJson != null && !credentialsJson.trim().isEmpty() && !credentialsJson.equals("placeholder")) {
                    FirebaseOptions options = FirebaseOptions.builder()
                            .setCredentials(GoogleCredentials.fromStream(
                                    new ByteArrayInputStream(credentialsJson.getBytes(StandardCharsets.UTF_8))))
                            .build();
                    FirebaseApp.initializeApp(options);
                    initialized = true;
                    System.out.println("Firebase Admin SDK successfully initialized from environment variable.");
                } else {
                    System.out.println("WARNING: FIREBASE_CREDENTIALS_JSON env var not set. Firebase Admin SDK will operate in mock mode locally.");
                }
            } else {
                initialized = true;
            }
        } catch (Exception e) {
            System.err.println("CRITICAL: Failed to initialize Firebase Admin SDK: " + e.getMessage());
        }
    }

    public static boolean isInitialized() {
        return initialized;
    }
}
