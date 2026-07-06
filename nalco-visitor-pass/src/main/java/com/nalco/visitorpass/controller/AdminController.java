package com.nalco.visitorpass.controller;

import com.nalco.visitorpass.entity.*;
import com.nalco.visitorpass.service.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Long>> getStatistics() {
        return ResponseEntity.ok(adminService.getStatistics());
    }

    @GetMapping("/visitors")
    public ResponseEntity<List<VisitRecord>> listVisitors(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String employee,
            @RequestParam(required = false) String date) {
        List<VisitRecord> visitors = adminService.searchAndFilter(query, department, employee, date);
        return ResponseEntity.ok(visitors);
    }

    @PostMapping("/visitors/approve/{id}")
    public ResponseEntity<?> approveVisitor(@PathVariable Long id, Principal principal, HttpServletRequest request) {
        boolean success = adminService.approveVisitor(id, principal.getName(), request.getRemoteAddr());
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        if (success) {
            response.put("message", "Visitor pass approved.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Unable to approve pass.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/visitors/reject/{id}")
    public ResponseEntity<?> rejectVisitor(
            @PathVariable Long id,
            @RequestBody Map<String, String> payload,
            Principal principal,
            HttpServletRequest request) {
        String reason = payload.get("reason");
        if (reason == null || reason.trim().isEmpty()) {
            reason = "Rejected by security administration.";
        }

        boolean success = adminService.rejectVisitor(id, reason, principal.getName(), request.getRemoteAddr());
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        if (success) {
            response.put("message", "Visitor pass rejected.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Unable to reject pass.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/check-in")
    public ResponseEntity<?> checkIn(@RequestBody Map<String, String> payload, Principal principal, HttpServletRequest request) {
        String qrToken = payload.get("qrToken");
        if (qrToken == null || qrToken.trim().isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "QR token or Pass ID is required.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = adminService.checkInVisitor(qrToken, principal.getName(), request.getRemoteAddr());
        if (!(boolean) result.get("success")) {
            return ResponseEntity.badRequest().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/check-out")
    public ResponseEntity<?> checkOut(@RequestBody Map<String, String> payload, Principal principal, HttpServletRequest request) {
        String qrToken = payload.get("qrToken");
        if (qrToken == null || qrToken.trim().isEmpty()) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "QR token or Pass ID is required.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = adminService.checkOutVisitor(qrToken, principal.getName(), request.getRemoteAddr());
        if (!(boolean) result.get("success")) {
            return ResponseEntity.badRequest().body(result);
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/logs")
    public ResponseEntity<List<AuditLog>> getAuditLogs() {
        return ResponseEntity.ok(adminService.getAuditLogs());
    }

    @GetMapping("/blacklist")
    public ResponseEntity<List<Blacklist>> getBlacklist() {
        return ResponseEntity.ok(adminService.getBlacklist());
    }

    @PostMapping("/blacklist")
    public ResponseEntity<?> addToBlacklist(
            @RequestBody Map<String, String> payload,
            Principal principal,
            HttpServletRequest request) {
        String type = payload.get("type");
        String number = payload.get("number");
        String name = payload.get("name");
        String reason = payload.get("reason");

        if (type == null || number == null || name == null || reason == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "All blacklist details (type, number, name, reason) are required.");
            return ResponseEntity.badRequest().body(error);
        }

        boolean success = adminService.addToBlacklist(type, number, name, reason, principal.getName(), request.getRemoteAddr());
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        if (success) {
            response.put("message", "Visitor added to blacklist successfully.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Visitor is already blacklisted.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @DeleteMapping("/blacklist/{id}")
    public ResponseEntity<?> removeFromBlacklist(@PathVariable Long id, Principal principal, HttpServletRequest request) {
        boolean success = adminService.removeFromBlacklist(id, principal.getName(), request.getRemoteAddr());
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        if (success) {
            response.put("message", "Visitor removed from blacklist.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Unable to find blacklist entry.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @GetMapping("/employees")
    public ResponseEntity<List<Employee>> getEmployees() {
        return ResponseEntity.ok(adminService.getEmployees());
    }

    @GetMapping("/departments")
    public ResponseEntity<List<Department>> getDepartments() {
        return ResponseEntity.ok(adminService.getDepartments());
    }
}
