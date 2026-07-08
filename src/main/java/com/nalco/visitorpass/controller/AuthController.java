package com.nalco.visitorpass.controller;

import com.nalco.visitorpass.service.AuthService;
import com.nalco.visitorpass.service.OtpMailService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final OtpMailService otpMailService;

    public AuthController(AuthService authService, OtpMailService otpMailService) {
        this.authService = authService;
        this.otpMailService = otpMailService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        String email = payload.get("email");
        String mobile = payload.get("mobile");
        String password = payload.get("password");
        String govtIdType = payload.get("govtIdType");
        String govtIdNumber = payload.get("govtIdNumber");
        String company = payload.get("company");
        String address = payload.get("address");
        String photoData = payload.get("photoData"); // Base64
        String govtIdData = payload.get("govtIdData"); // Base64
        String emergencyContact = payload.get("emergencyContact");
        String vehicleNumber = payload.get("vehicleNumber");

        if (name == null || email == null || mobile == null || password == null || govtIdType == null || govtIdNumber == null || emergencyContact == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Required registration fields are missing.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = authService.registerVisitor(
            name, email, mobile, password, govtIdType, govtIdNumber,
            company, address, photoData, govtIdData, emergencyContact, vehicleNumber
        );

        if (!(boolean) result.get("success")) {
            return ResponseEntity.badRequest().body(result);
        }

        return ResponseEntity.ok(result);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> payload) {
        String username = payload.get("username");
        String password = payload.get("password");

        if (username == null || password == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Username and password are required.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = authService.login(username, password);

        if (!(boolean) result.get("success")) {
            return ResponseEntity.status(401).body(result);
        }

        return ResponseEntity.ok(result);
    }

    @PostMapping("/otp/send")
    public ResponseEntity<?> sendOtp(@RequestBody Map<String, String> payload) {
        String destination = payload.get("destination");
        if (destination == null || destination.trim().isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Destination (email or phone number) is required.");
            return ResponseEntity.badRequest().body(error);
        }

        String otp = otpMailService.generateAndSendOtp(destination);
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "OTP sent successfully.");
        // Expose OTP in development mode for easy copy-paste testing
        response.put("mockOtp", otp);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<?> verifyOtp(@RequestBody Map<String, String> payload) {
        String destination = payload.get("destination");
        String otp = payload.get("otp");

        if (destination == null || otp == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Destination and OTP are required.");
            return ResponseEntity.badRequest().body(error);
        }

        boolean verified = otpMailService.verifyOtp(destination, otp);
        Map<String, Object> response = new HashMap<>();
        response.put("success", verified);
        
        if (verified) {
            response.put("message", "OTP verified successfully.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Invalid or expired OTP. Please try again.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> payload) {
        String destination = payload.get("destination");
        String otp = payload.get("otp");
        String newPassword = payload.get("newPassword");

        if (destination == null || otp == null || newPassword == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Destination, OTP, and new password are required.");
            return ResponseEntity.badRequest().body(error);
        }

        boolean otpValid = otpMailService.verifyOtp(destination, otp);
        if (!otpValid) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Invalid or expired OTP.");
            return ResponseEntity.badRequest().body(error);
        }

        boolean resetSuccess = authService.resetPassword(destination, newPassword);
        Map<String, Object> response = new HashMap<>();
        
        if (resetSuccess) {
            response.put("success", true);
            response.put("message", "Password reset successful! You can now log in with your new password.");
            return ResponseEntity.ok(response);
        } else {
            response.put("success", false);
            response.put("message", "Account not found for the given details.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/firebase-login")
    public ResponseEntity<?> firebaseLogin(@RequestBody Map<String, String> payload) {
        String idToken = payload.get("idToken");
        if (idToken == null || idToken.trim().isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Firebase ID Token is required.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = authService.loginWithFirebaseToken(idToken);
        if (!(boolean) result.get("success")) {
            return ResponseEntity.status(401).body(result);
        }

        return ResponseEntity.ok(result);
    }
}
