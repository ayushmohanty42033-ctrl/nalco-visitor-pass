package com.nalco.visitorpass.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "visit_records")
public class VisitRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "visitor_id", nullable = false)
    private Visitor visitor;

    @Column(unique = true, nullable = false)
    private String visitorPassId; // e.g. NALCO-2026-10001

    @Column(nullable = false)
    private String employeeToMeet;

    @Column(nullable = false)
    private String department;

    @Column(nullable = false)
    private String purpose;

    @Column(nullable = false)
    private String visitDate; // YYYY-MM-DD

    @Column(nullable = false)
    private String expectedTimeIn; // HH:MM

    @Column(nullable = false)
    private String expectedTimeOut; // HH:MM

    private LocalDateTime actualCheckInTime;

    private LocalDateTime actualCheckOutTime;

    @Column(unique = true, nullable = false)
    private String qrCodeToken;

    @Column(nullable = false)
    private String status = "PENDING"; // PENDING, APPROVED, REJECTED, CHECKED_IN, CHECKED_OUT

    private String statusMessage; // Message for rejection

    public VisitRecord() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Visitor getVisitor() { return visitor; }
    public void setVisitor(Visitor visitor) { this.visitor = visitor; }

    public String getVisitorPassId() { return visitorPassId; }
    public void setVisitorPassId(String visitorPassId) { this.visitorPassId = visitorPassId; }

    public String getEmployeeToMeet() { return employeeToMeet; }
    public void setEmployeeToMeet(String employeeToMeet) { this.employeeToMeet = employeeToMeet; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }

    public String getVisitDate() { return visitDate; }
    public void setVisitDate(String visitDate) { this.visitDate = visitDate; }

    public String getExpectedTimeIn() { return expectedTimeIn; }
    public void setExpectedTimeIn(String expectedTimeIn) { this.expectedTimeIn = expectedTimeIn; }

    public String getExpectedTimeOut() { return expectedTimeOut; }
    public void setExpectedTimeOut(String expectedTimeOut) { this.expectedTimeOut = expectedTimeOut; }

    public LocalDateTime getActualCheckInTime() { return actualCheckInTime; }
    public void setActualCheckInTime(LocalDateTime actualCheckInTime) { this.actualCheckInTime = actualCheckInTime; }

    public LocalDateTime getActualCheckOutTime() { return actualCheckOutTime; }
    public void setActualCheckOutTime(LocalDateTime actualCheckOutTime) { this.actualCheckOutTime = actualCheckOutTime; }

    public String getQrCodeToken() { return qrCodeToken; }
    public void setQrCodeToken(String qrCodeToken) { this.qrCodeToken = qrCodeToken; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getStatusMessage() { return statusMessage; }
    public void setStatusMessage(String statusMessage) { this.statusMessage = statusMessage; }
}
