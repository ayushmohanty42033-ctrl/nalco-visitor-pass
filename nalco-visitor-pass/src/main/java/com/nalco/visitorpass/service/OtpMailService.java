package com.nalco.visitorpass.service;

import com.nalco.visitorpass.entity.OTPLog;
import com.nalco.visitorpass.repository.OTPLogRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Random;

@Service
public class OtpMailService {

    private final OTPLogRepository otpLogRepository;
    private final Random random = new Random();

    public OtpMailService(OTPLogRepository otpLogRepository) {
        this.otpLogRepository = otpLogRepository;
    }

    public String generateAndSendOtp(String destination) {
        // Generate a 6-digit OTP
        String otp = String.format("%06d", random.nextInt(1000000));
        LocalDateTime expiry = LocalDateTime.now().plusMinutes(5); // Valid for 5 minutes

        OTPLog otpLog = new OTPLog(destination, otp, expiry);
        otpLogRepository.save(otpLog);

        // Print beautiful logs simulating SMS/Email dispatch
        System.out.println("==================================================");
        System.out.println("   NALCO SECURE NOTIFICATION GATEWAY (SIMULATED)  ");
        System.out.println("==================================================");
        System.out.println("To: " + destination);
        System.out.println("Message: Your NALCO Visitor Pass OTP is: " + otp);
        System.out.println("Valid for: 5 minutes. Do not share this OTP.");
        System.out.println("Timestamp: " + LocalDateTime.now());
        System.out.println("==================================================");

        return otp;
    }

    public boolean verifyOtp(String destination, String otp) {
        Optional<OTPLog> latestLogOpt = otpLogRepository.findTopByDestinationOrderByExpiryTimeDesc(destination);

        if (latestLogOpt.isPresent()) {
            OTPLog log = latestLogOpt.get();
            
            // Check if already verified or expired or maximum attempts reached
            if (log.isVerified()) {
                return false;
            }
            if (log.getExpiryTime().isBefore(LocalDateTime.now())) {
                return false;
            }
            if (log.getAttempts() >= 3) {
                return false;
            }

            log.setAttempts(log.getAttempts() + 1);

            if (log.getOtp().equals(otp)) {
                log.setVerified(true);
                otpLogRepository.save(log);
                return true;
            } else {
                otpLogRepository.save(log);
            }
        }
        return false;
    }

    public void sendEmailNotification(String to, String subject, String body) {
        System.out.println("==================================================");
        System.out.println("       NALCO MAIL SERVICE GATEWAY (SIMULATED)     ");
        System.out.println("==================================================");
        System.out.println("To: " + to);
        System.out.println("Subject: " + subject);
        System.out.println("Message Body:\n" + body);
        System.out.println("==================================================");
    }
}
