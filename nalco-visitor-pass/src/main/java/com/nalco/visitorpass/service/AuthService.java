package com.nalco.visitorpass.service;

import com.nalco.visitorpass.config.JwtTokenUtil;
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
