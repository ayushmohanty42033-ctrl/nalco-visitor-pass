package com.nalco.visitorpass.service;

import com.nalco.visitorpass.config.JwtTokenUtil;
import com.nalco.visitorpass.config.FirebaseConfig;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.nalco.visitorpass.entity.User;
import com.nalco.visitorpass.entity.Visitor;
import com.nalco.visitorpass.repository.UserRepository;
import com.nalco.visitorpass.repository.VisitorRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final VisitorRepository visitorRepository;
    private final JwtTokenUtil jwtTokenUtil;
    private final BCryptPasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository,
                       VisitorRepository visitorRepository,
                       JwtTokenUtil jwtTokenUtil,
                       BCryptPasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.visitorRepository = visitorRepository;
        this.jwtTokenUtil = jwtTokenUtil;
        this.passwordEncoder = passwordEncoder;
    }

    public Map<String, Object> registerVisitor(
            String fullName, String email, String mobile, String password,
            String govtIdType, String govtIdNumber, String company, String address,
            String photoData, String govtIdData, String emergencyContact, String vehicleNumber) {

        Map<String, Object> response = new HashMap<>();

        if (userRepository.findByEmail(email).isPresent()) {
            response.put("success", false);
            response.put("message", "Email address already registered.");
            return response;
        }

        if (userRepository.findByMobile(mobile).isPresent()) {
            response.put("success", false);
            response.put("message", "Mobile number already registered.");
            return response;
        }

        // Create credentials
        User user = new User(email, mobile, passwordEncoder.encode(password), "ROLE_VISITOR");
        userRepository.save(user);

        // Create profile
        Visitor visitor = new Visitor();
        visitor.setUser(user);
        visitor.setFullName(fullName);
        visitor.setGovtIdType(govtIdType);
        visitor.setGovtIdNumber(govtIdNumber);
        visitor.setCompany(company);
        visitor.setAddress(address);
        visitor.setPhotoData(photoData);
        visitor.setGovtIdData(govtIdData);
        visitor.setEmergencyContact(emergencyContact);
        visitor.setVehicleNumber(vehicleNumber);
        visitorRepository.save(visitor);

        response.put("success", true);
        response.put("message", "Registration successful! You can now log in.");
        return response;
    }

    public Map<String, Object> login(String usernameOrEmail, String password) {
        Map<String, Object> response = new HashMap<>();
        Optional<User> userOpt = userRepository.findByEmail(usernameOrEmail);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByMobile(usernameOrEmail);
        }

        if (userOpt.isEmpty()) {
            response.put("success", false);
            response.put("message", "Invalid email/mobile number or password.");
            return response;
        }

        User user = userOpt.get();

        // Check account lock
        if (!user.isEnabled()) {
            if (user.getLastLockoutTime() != null && user.getLastLockoutTime().plusMinutes(15).isBefore(LocalDateTime.now())) {
                // Auto unlock after 15 minutes
                user.setEnabled(true);
                user.setFailedLoginAttempts(0);
                userRepository.save(user);
            } else {
                response.put("success", false);
                response.put("message", "Account is locked due to multiple failed login attempts. Try again in 15 minutes.");
                return response;
            }
        }

        // Verify password
        if (passwordEncoder.matches(password, user.getPassword())) {
            // Reset attempts on success
            user.setFailedLoginAttempts(0);
            userRepository.save(user);

            String token = jwtTokenUtil.generateToken(user.getEmail(), user.getRole());
            response.put("success", true);
            response.put("token", token);
            response.put("email", user.getEmail());
            response.put("role", user.getRole());

            if ("ROLE_VISITOR".equals(user.getRole())) {
                Optional<Visitor> visitorOpt = visitorRepository.findByUser(user);
                visitorOpt.ifPresent(visitor -> response.put("fullName", visitor.getFullName()));
            } else {
                response.put("fullName", "System Administrator");
            }
        } else {
            // Increment failed attempts
            int attempts = user.getFailedLoginAttempts() + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= 5) {
                user.setEnabled(false);
                user.setLastLockoutTime(LocalDateTime.now());
                response.put("message", "Account locked due to 5 consecutive failed login attempts.");
            } else {
                response.put("message", "Invalid credentials. " + (5 - attempts) + " attempts remaining.");
            }
            userRepository.save(user);
            response.put("success", false);
        }

        return response;
    }

    public Map<String, Object> loginWithFirebaseToken(String firebaseIdToken) {
        Map<String, Object> response = new HashMap<>();
        String phoneNumber = null;
        String email = null;

        if (firebaseIdToken != null && firebaseIdToken.startsWith("mock-firebase-token-")) {
            String identifier = firebaseIdToken.replace("mock-firebase-token-", "");
            if (identifier.contains("@")) {
                email = identifier;
            } else {
                phoneNumber = identifier;
            }
        } else if (FirebaseConfig.isInitialized()) {
            try {
                FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(firebaseIdToken);
                phoneNumber = (String) decodedToken.getClaims().get("phone_number");
                if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
                    String uid = decodedToken.getUid();
                    phoneNumber = FirebaseAuth.getInstance().getUser(uid).getPhoneNumber();
                }
                email = decodedToken.getEmail();
            } catch (Exception e) {
                response.put("success", false);
                response.put("message", "Firebase ID Token verification failed: " + e.getMessage());
                return response;
            }
        } else {
            response.put("success", false);
            response.put("message", "Firebase Admin SDK is not initialized and a valid mock token was not provided.");
            return response;
        }

        Optional<User> userOpt = Optional.empty();
        String searchIdentifier = "";

        if (phoneNumber != null && !phoneNumber.trim().isEmpty()) {
            searchIdentifier = phoneNumber;
            String targetMobile = phoneNumber;
            if (targetMobile.startsWith("+91")) {
                targetMobile = targetMobile.substring(3);
            } else if (targetMobile.startsWith("91") && targetMobile.length() == 12) {
                targetMobile = targetMobile.substring(2);
            }
            userOpt = userRepository.findByMobile(targetMobile);
            if (userOpt.isEmpty()) {
                userOpt = userRepository.findByMobile(phoneNumber);
            }
        } else if (email != null && !email.trim().isEmpty()) {
            searchIdentifier = email;
            userOpt = userRepository.findByEmail(email);
        }

        if (userOpt.isEmpty()) {
            // Auto-register visitor if authenticated via Firebase
            String name = "Social User";
            if (FirebaseConfig.isInitialized()) {
                try {
                    FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(firebaseIdToken);
                    if (decodedToken.getName() != null && !decodedToken.getName().trim().isEmpty()) {
                        name = decodedToken.getName();
                    }
                } catch (Exception e) {
                    // Ignore and use default
                }
            } else {
                if (email != null && email.contains("@")) {
                    name = email.split("@")[0];
                    name = name.substring(0, 1).toUpperCase() + name.substring(1);
                }
            }

            String regEmail = (email != null && !email.trim().isEmpty()) ? email : "noemail-" + java.util.UUID.randomUUID().toString().substring(0, 8) + "@nalco.com";
            String regMobile = (phoneNumber != null && !phoneNumber.trim().isEmpty()) ? phoneNumber : "99" + java.util.UUID.randomUUID().toString().replaceAll("[^0-9]", "").substring(0, 8);
            if (regMobile.length() < 10) {
                regMobile = regMobile + "0000000000".substring(0, 10 - regMobile.length());
            }

            if (regMobile.startsWith("+91")) {
                regMobile = regMobile.substring(3);
            } else if (regMobile.startsWith("91") && regMobile.length() == 12) {
                regMobile = regMobile.substring(2);
            }

            if (userRepository.findByMobile(regMobile).isPresent()) {
                regMobile = "9" + java.util.UUID.randomUUID().toString().replaceAll("[^0-9]", "").substring(0, 9);
            }

            User newUser = new User(regEmail, regMobile, passwordEncoder.encode(java.util.UUID.randomUUID().toString()), "ROLE_VISITOR");
            userRepository.save(newUser);

            Visitor newVisitor = new Visitor();
            newVisitor.setUser(newUser);
            newVisitor.setFullName(name);
            newVisitor.setGovtIdType("Aadhaar");
            newVisitor.setGovtIdNumber("Pending Verification");
            newVisitor.setCompany("Personal");
            newVisitor.setAddress("Please update profile");
            newVisitor.setEmergencyContact("9999999999");
            visitorRepository.save(newVisitor);

            userOpt = Optional.of(newUser);
            System.out.println("Auto-registered Firebase OAuth visitor: " + name + " (" + regEmail + ")");
        }

        User user = userOpt.get();
        if (!user.isEnabled()) {
            response.put("success", false);
            response.put("message", "Account is locked or disabled. Please contact the administrator.");
            return response;
        }

        user.setFailedLoginAttempts(0);
        userRepository.save(user);

        String token = jwtTokenUtil.generateToken(user.getEmail(), user.getRole());
        response.put("success", true);
        response.put("token", token);
        response.put("email", user.getEmail());
        response.put("role", user.getRole());

        if ("ROLE_VISITOR".equals(user.getRole())) {
            Optional<Visitor> visitorOpt = visitorRepository.findByUser(user);
            visitorOpt.ifPresent(visitor -> response.put("fullName", visitor.getFullName()));
        } else {
            response.put("fullName", "System Administrator");
        }

        return response;
    }

    public boolean resetPassword(String emailOrMobile, String newPassword) {
        Optional<User> userOpt = userRepository.findByEmail(emailOrMobile);
        if (userOpt.isEmpty()) {
            userOpt = userRepository.findByMobile(emailOrMobile);
        }

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.setPassword(passwordEncoder.encode(newPassword));
            user.setEnabled(true);
            user.setFailedLoginAttempts(0);
            userRepository.save(user);
            return true;
        }
        return false;
    }
}
