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
                java.io.InputStream stream = null;
                if (credentialsJson != null && !credentialsJson.trim().isEmpty() && !credentialsJson.equals("placeholder")) {
                    stream = new ByteArrayInputStream(credentialsJson.getBytes(StandardCharsets.UTF_8));
                    System.out.println("Firebase Admin SDK initializing from environment variable.");
                } else {
                    java.io.File localFile = new java.io.File("firebase-service-account.json");
                    if (localFile.exists()) {
                        stream = new java.io.FileInputStream(localFile);
                        System.out.println("Firebase Admin SDK initializing from local firebase-service-account.json file.");
                    }
                }

                if (stream != null) {
                    FirebaseOptions options = FirebaseOptions.builder()
                            .setCredentials(GoogleCredentials.fromStream(stream))
                            .build();
                    FirebaseApp.initializeApp(options);
                    initialized = true;
                    System.out.println("Firebase Admin SDK successfully initialized.");
                } else {
                    System.out.println("WARNING: Firebase credentials not found. Firebase Admin SDK will operate in mock mode locally.");
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
