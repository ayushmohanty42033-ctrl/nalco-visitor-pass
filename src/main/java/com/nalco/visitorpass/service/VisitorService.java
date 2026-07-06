package com.nalco.visitorpass.service;

import com.nalco.visitorpass.entity.User;
import com.nalco.visitorpass.entity.Visitor;
import com.nalco.visitorpass.entity.VisitRecord;
import com.nalco.visitorpass.repository.UserRepository;
import com.nalco.visitorpass.repository.VisitorRepository;
import com.nalco.visitorpass.repository.VisitRecordRepository;
import com.nalco.visitorpass.repository.BlacklistRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;

@Service
public class VisitorService {

    private final UserRepository userRepository;
    private final VisitorRepository visitorRepository;
    private final VisitRecordRepository visitRecordRepository;
    private final BlacklistRepository blacklistRepository;
    private final OtpMailService otpMailService;

    public VisitorService(UserRepository userRepository,
                          VisitorRepository visitorRepository,
                          VisitRecordRepository visitRecordRepository,
                          BlacklistRepository blacklistRepository,
                          OtpMailService otpMailService) {
        this.userRepository = userRepository;
        this.visitorRepository = visitorRepository;
        this.visitRecordRepository = visitRecordRepository;
        this.blacklistRepository = blacklistRepository;
        this.otpMailService = otpMailService;
    }

    public Visitor getProfile(String email) {
        return visitorRepository.findByUserEmail(email).orElse(null);
    }

    public boolean updateProfile(String email, String fullName, String company, String address, String emergencyContact, String vehicleNumber, String photoData) {
        Optional<Visitor> visitorOpt = visitorRepository.findByUserEmail(email);
        if (visitorOpt.isPresent()) {
            Visitor visitor = visitorOpt.get();
            visitor.setFullName(fullName);
            visitor.setCompany(company);
            visitor.setAddress(address);
            visitor.setEmergencyContact(emergencyContact);
            visitor.setVehicleNumber(vehicleNumber);
            if (photoData != null && !photoData.isEmpty()) {
                visitor.setPhotoData(photoData);
            }
            visitorRepository.save(visitor);
            return true;
        }
        return false;
    }

    public Map<String, Object> applyForPass(
            String email, String employeeToMeet, String department,
            String purpose, String visitDate, String timeIn, String timeOut) {

        Map<String, Object> response = new HashMap<>();

        Optional<Visitor> visitorOpt = visitorRepository.findByUserEmail(email);
        if (visitorOpt.isEmpty()) {
            response.put("success", false);
            response.put("message", "Visitor profile not found.");
            return response;
        }

        Visitor visitor = visitorOpt.get();

        // 1. Blacklist Check
        if (blacklistRepository.existsByGovtIdTypeAndGovtIdNumber(visitor.getGovtIdType(), visitor.getGovtIdNumber())) {
            response.put("success", false);
            response.put("message", "Pass application rejected. Security Clearance Issue (Visitor details match blacklist registry).");
            return response;
        }

        // 2. Create Pass ID
        long count = visitRecordRepository.count();
        String year = String.valueOf(LocalDate.now().getYear());
        String visitorPassId = "NALCO-" + year + "-" + String.format("%05d", 10001 + count);

        // 3. Create QR Code Token
        String qrToken = "NALCO-QR-" + UUID.randomUUID().toString().substring(0, 16).toUpperCase();

        // 4. Save Visit Record
        VisitRecord record = new VisitRecord();
        record.setVisitor(visitor);
        record.setVisitorPassId(visitorPassId);
        record.setEmployeeToMeet(employeeToMeet);
        record.setDepartment(department);
        record.setPurpose(purpose);
        record.setVisitDate(visitDate);
        record.setExpectedTimeIn(timeIn);
        record.setExpectedTimeOut(timeOut);
        record.setQrCodeToken(qrToken);
        record.setStatus("PENDING"); // Pending administrative approval

        visitRecordRepository.save(record);

        // Notify Host (Simulated)
        otpMailService.sendEmailNotification(
            "host." + employeeToMeet.toLowerCase().replace(" ", "") + "@nalcoindia.co.in",
            "NALCO Visitor Pass Approval Request: " + visitor.getFullName(),
            "Dear employee,\n\nA new visitor pass request has been raised to meet you.\n\n" +
            "Visitor Name: " + visitor.getFullName() + "\n" +
            "Company: " + visitor.getCompany() + "\n" +
            "Purpose: " + purpose + "\n" +
            "Scheduled Date: " + visitDate + " (" + timeIn + " - " + timeOut + ")\n\n" +
            "Please coordinate with Security for approvals."
        );

        response.put("success", true);
        response.put("message", "Pass application submitted successfully. Pending approval.");
        response.put("passId", visitorPassId);
        return response;
    }

    public List<VisitRecord> getVisitHistory(String email) {
        return visitRecordRepository.findByVisitorUserEmail(email);
    }
}
