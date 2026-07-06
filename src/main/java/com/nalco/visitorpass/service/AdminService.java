package com.nalco.visitorpass.service;

import com.nalco.visitorpass.entity.*;
import com.nalco.visitorpass.repository.*;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AdminService {

    private final VisitRecordRepository visitRecordRepository;
    private final BlacklistRepository blacklistRepository;
    private final AuditLogRepository auditLogRepository;
    private final EmployeeRepository employeeRepository;
    private final DepartmentRepository departmentRepository;
    private final OtpMailService otpMailService;

    public AdminService(VisitRecordRepository visitRecordRepository,
                        BlacklistRepository blacklistRepository,
                        AuditLogRepository auditLogRepository,
                        EmployeeRepository employeeRepository,
                        DepartmentRepository departmentRepository,
                        OtpMailService otpMailService) {
        this.visitRecordRepository = visitRecordRepository;
        this.blacklistRepository = blacklistRepository;
        this.auditLogRepository = auditLogRepository;
        this.employeeRepository = employeeRepository;
        this.departmentRepository = departmentRepository;
        this.otpMailService = otpMailService;
    }

    public Map<String, Long> getStatistics() {
        Map<String, Long> stats = new HashMap<>();
        List<VisitRecord> all = visitRecordRepository.findAll();
        String todayStr = LocalDate.now().toString();

        stats.put("total", (long) all.size());
        stats.put("pending", all.stream().filter(r -> "PENDING".equals(r.getStatus())).count());
        stats.put("approved", all.stream().filter(r -> "APPROVED".equals(r.getStatus())).count());
        stats.put("checkedIn", all.stream().filter(r -> "CHECKED_IN".equals(r.getStatus())).count());
        stats.put("checkedOut", all.stream().filter(r -> "CHECKED_OUT".equals(r.getStatus())).count());
        stats.put("today", all.stream().filter(r -> todayStr.equals(r.getVisitDate())).count());

        return stats;
    }

    public List<VisitRecord> searchAndFilter(String query, String dept, String host, String date) {
        return visitRecordRepository.findAllByOrderByVisitDateDesc().stream()
            .filter(r -> {
                if (query != null && !query.trim().isEmpty()) {
                    String q = query.toLowerCase();
                    boolean matchName = r.getVisitor().getFullName().toLowerCase().contains(q);
                    boolean matchPass = r.getVisitorPassId().toLowerCase().contains(q);
                    boolean matchCompany = r.getVisitor().getCompany() != null && r.getVisitor().getCompany().toLowerCase().contains(q);
                    if (!matchName && !matchPass && !matchCompany) return false;
                }
                if (dept != null && !dept.trim().isEmpty() && !"All".equalsIgnoreCase(dept)) {
                    if (!r.getDepartment().equalsIgnoreCase(dept)) return false;
                }
                if (host != null && !host.trim().isEmpty() && !"All".equalsIgnoreCase(host)) {
                    if (!r.getEmployeeToMeet().equalsIgnoreCase(host)) return false;
                }
                if (date != null && !date.trim().isEmpty()) {
                    if (!r.getVisitDate().equals(date)) return false;
                }
                return true;
            })
            .collect(Collectors.toList());
    }

    public boolean approveVisitor(Long recordId, String adminEmail, String ipAddress) {
        Optional<VisitRecord> recordOpt = visitRecordRepository.findById(recordId);
        if (recordOpt.isPresent()) {
            VisitRecord record = recordOpt.get();
            record.setStatus("APPROVED");
            visitRecordRepository.save(record);

            // Save Audit Log
            auditLogRepository.save(new AuditLog(
                adminEmail,
                "Approved pass " + record.getVisitorPassId() + " for visitor " + record.getVisitor().getFullName(),
                ipAddress
            ));

            // Notify Visitor (Simulated)
            otpMailService.sendEmailNotification(
                record.getVisitor().getUser().getEmail(),
                "NALCO Visitor Pass Approved: " + record.getVisitorPassId(),
                "Dear " + record.getVisitor().getFullName() + ",\n\n" +
                "Your Visitor Pass request has been APPROVED.\n\n" +
                "Pass ID: " + record.getVisitorPassId() + "\n" +
                "Host: " + record.getEmployeeToMeet() + " (" + record.getDepartment() + ")\n" +
                "Date: " + record.getVisitDate() + "\n\n" +
                "Please display the digital pass and QR code at the security checkpoint upon arrival."
            );

            return true;
        }
        return false;
    }

    public boolean rejectVisitor(Long recordId, String reason, String adminEmail, String ipAddress) {
        Optional<VisitRecord> recordOpt = visitRecordRepository.findById(recordId);
        if (recordOpt.isPresent()) {
            VisitRecord record = recordOpt.get();
            record.setStatus("REJECTED");
            record.setStatusMessage(reason);
            visitRecordRepository.save(record);

            // Save Audit Log
            auditLogRepository.save(new AuditLog(
                adminEmail,
                "Rejected pass " + record.getVisitorPassId() + " for visitor " + record.getVisitor().getFullName() + ". Reason: " + reason,
                ipAddress
            ));

            // Notify Visitor
            otpMailService.sendEmailNotification(
                record.getVisitor().getUser().getEmail(),
                "NALCO Visitor Pass Application Rejected",
                "Dear " + record.getVisitor().getFullName() + ",\n\n" +
                "Your Visitor Pass request has been rejected.\n\n" +
                "Reason: " + reason + "\n\n" +
                "Please contact administrative operations if this was in error."
            );

            return true;
        }
        return false;
    }

    public Map<String, Object> checkInVisitor(String qrToken, String adminEmail, String ipAddress) {
        Map<String, Object> result = new HashMap<>();
        Optional<VisitRecord> recordOpt = visitRecordRepository.findByQrCodeToken(qrToken);
        if (recordOpt.isEmpty()) {
            recordOpt = visitRecordRepository.findByVisitorPassId(qrToken); // Fallback to raw Pass ID input
        }

        if (recordOpt.isEmpty()) {
            result.put("success", false);
            result.put("message", "Invalid QR code or Pass ID.");
            return result;
        }

        VisitRecord record = recordOpt.get();

        // Check if blacklisted
        if (blacklistRepository.existsByGovtIdTypeAndGovtIdNumber(
                record.getVisitor().getGovtIdType(), record.getVisitor().getGovtIdNumber())) {
            record.setStatus("REJECTED");
            record.setStatusMessage("Blacklisted visitor attempt.");
            visitRecordRepository.save(record);

            auditLogRepository.save(new AuditLog(
                "SYSTEM_GUARD",
                "BLOCKED Entry Attempt! Blacklisted visitor: " + record.getVisitor().getFullName(),
                ipAddress
            ));

            result.put("success", false);
            result.put("message", "BLOCKED: Visitor matches blacklist database registry!");
            return result;
        }

        if ("CHECKED_IN".equals(record.getStatus())) {
            result.put("success", false);
            result.put("message", "Visitor is already Checked-In.");
            return result;
        }

        if ("CHECKED_OUT".equals(record.getStatus())) {
            result.put("success", false);
            result.put("message", "Visitor pass has expired (already Checked-Out).");
            return result;
        }

        if (!"APPROVED".equals(record.getStatus())) {
            result.put("success", false);
            result.put("message", "Visitor pass is not approved (Status: " + record.getStatus() + ").");
            return result;
        }

        record.setStatus("CHECKED_IN");
        record.setActualCheckInTime(LocalDateTime.now());
        visitRecordRepository.save(record);

        auditLogRepository.save(new AuditLog(
            adminEmail,
            "Checked-In visitor " + record.getVisitor().getFullName() + " (Pass: " + record.getVisitorPassId() + ")",
            ipAddress
        ));

        // Notify Host
        otpMailService.sendEmailNotification(
            "host." + record.getEmployeeToMeet().toLowerCase().replace(" ", "") + "@nalcoindia.co.in",
            "Visitor Arrived: " + record.getVisitor().getFullName(),
            "Dear employee,\n\nYour visitor " + record.getVisitor().getFullName() + " has checked in at the security gate and is on their way to meet you."
        );

        result.put("success", true);
        result.put("message", "Check-In successful! Access granted for " + record.getVisitor().getFullName());
        result.put("record", record);
        return result;
    }

    public Map<String, Object> checkOutVisitor(String qrToken, String adminEmail, String ipAddress) {
        Map<String, Object> result = new HashMap<>();
        Optional<VisitRecord> recordOpt = visitRecordRepository.findByQrCodeToken(qrToken);
        if (recordOpt.isEmpty()) {
            recordOpt = visitRecordRepository.findByVisitorPassId(qrToken);
        }

        if (recordOpt.isEmpty()) {
            result.put("success", false);
            result.put("message", "Invalid QR code or Pass ID.");
            return result;
        }

        VisitRecord record = recordOpt.get();

        if (!"CHECKED_IN".equals(record.getStatus())) {
            result.put("success", false);
            result.put("message", "Visitor is not Checked-In (Status: " + record.getStatus() + ").");
            return result;
        }

        record.setStatus("CHECKED_OUT");
        record.setActualCheckOutTime(LocalDateTime.now());
        visitRecordRepository.save(record);

        auditLogRepository.save(new AuditLog(
            adminEmail,
            "Checked-Out visitor " + record.getVisitor().getFullName() + " (Pass: " + record.getVisitorPassId() + ")",
            ipAddress
        ));

        result.put("success", true);
        result.put("message", "Check-Out successful! Pass deactivated for " + record.getVisitor().getFullName());
        result.put("record", record);
        return result;
    }

    public List<AuditLog> getAuditLogs() {
        return auditLogRepository.findAllByOrderByTimestampDesc();
    }

    public List<Blacklist> getBlacklist() {
        return blacklistRepository.findAll();
    }

    public boolean addToBlacklist(String type, String number, String name, String reason, String adminEmail, String ipAddress) {
        if (blacklistRepository.existsByGovtIdTypeAndGovtIdNumber(type, number)) {
            return false;
        }
        Blacklist blacklist = new Blacklist(type, number, name, reason);
        blacklistRepository.save(blacklist);

        auditLogRepository.save(new AuditLog(
            adminEmail,
            "BLACKLISTED visitor: " + name + " (ID: " + type + " - " + number + "). Reason: " + reason,
            ipAddress
        ));
        return true;
    }

    public boolean removeFromBlacklist(Long blacklistId, String adminEmail, String ipAddress) {
        Optional<Blacklist> blacklistOpt = blacklistRepository.findById(blacklistId);
        if (blacklistOpt.isPresent()) {
            Blacklist bl = blacklistOpt.get();
            blacklistRepository.delete(bl);

            auditLogRepository.save(new AuditLog(
                adminEmail,
                "Removed visitor from blacklist: " + bl.getFullName() + " (ID: " + bl.getGovtIdNumber() + ")",
                ipAddress
            ));
            return true;
        }
        return false;
    }

    public List<Employee> getEmployees() {
        return employeeRepository.findAll();
    }

    public List<Department> getDepartments() {
        return departmentRepository.findAll();
    }
}
