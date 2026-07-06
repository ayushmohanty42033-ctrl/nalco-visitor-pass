package com.nalco.visitorpass.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "blacklist")
public class Blacklist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String govtIdType;

    @Column(nullable = false, unique = true)
    private String govtIdNumber;

    @Column(nullable = false)
    private String fullName;

    @Column(nullable = false, length = 1000)
    private String reason;

    private LocalDateTime createdAt = LocalDateTime.now();

    public Blacklist() {}

    public Blacklist(String govtIdType, String govtIdNumber, String fullName, String reason) {
        this.govtIdType = govtIdType;
        this.govtIdNumber = govtIdNumber;
        this.fullName = fullName;
        this.reason = reason;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getGovtIdType() { return govtIdType; }
    public void setGovtIdType(String govtIdType) { this.govtIdType = govtIdType; }

    public String getGovtIdNumber() { return govtIdNumber; }
    public void setGovtIdNumber(String govtIdNumber) { this.govtIdNumber = govtIdNumber; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
