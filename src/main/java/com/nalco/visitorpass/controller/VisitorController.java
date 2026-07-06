package com.nalco.visitorpass.controller;

import com.nalco.visitorpass.entity.Visitor;
import com.nalco.visitorpass.entity.VisitRecord;
import com.nalco.visitorpass.service.VisitorService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/visitor")
public class VisitorController {

    private final VisitorService visitorService;

    public VisitorController(VisitorService visitorService) {
        this.visitorService = visitorService;
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(Principal principal) {
        Visitor visitor = visitorService.getProfile(principal.getName());
        if (visitor == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Profile not found.");
            return ResponseEntity.status(404).body(error);
        }
        return ResponseEntity.ok(visitor);
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(Principal principal, @RequestBody Map<String, String> payload) {
        String fullName = payload.get("fullName");
        String company = payload.get("company");
        String address = payload.get("address");
        String emergencyContact = payload.get("emergencyContact");
        String vehicleNumber = payload.get("vehicleNumber");
        String photoData = payload.get("photoData");

        boolean success = visitorService.updateProfile(
            principal.getName(), fullName, company, address, emergencyContact, vehicleNumber, photoData
        );

        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        if (success) {
            response.put("message", "Profile updated successfully.");
            return ResponseEntity.ok(response);
        } else {
            response.put("message", "Unable to update profile.");
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/pass/apply")
    public ResponseEntity<?> applyPass(Principal principal, @RequestBody Map<String, String> payload) {
        String employeeToMeet = payload.get("employeeToMeet");
        String department = payload.get("department");
        String purpose = payload.get("purpose");
        String visitDate = payload.get("visitDate");
        String expectedTimeIn = payload.get("expectedTimeIn");
        String expectedTimeOut = payload.get("expectedTimeOut");

        if (employeeToMeet == null || department == null || purpose == null || visitDate == null || expectedTimeIn == null || expectedTimeOut == null) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Missing pass application details.");
            return ResponseEntity.badRequest().body(error);
        }

        Map<String, Object> result = visitorService.applyForPass(
            principal.getName(), employeeToMeet, department, purpose, visitDate, expectedTimeIn, expectedTimeOut
        );

        if (!(boolean) result.get("success")) {
            return ResponseEntity.badRequest().body(result);
        }

        return ResponseEntity.ok(result);
    }

    @GetMapping("/history")
    public ResponseEntity<List<VisitRecord>> getHistory(Principal principal) {
        List<VisitRecord> history = visitorService.getVisitHistory(principal.getName());
        return ResponseEntity.ok(history);
    }
}
