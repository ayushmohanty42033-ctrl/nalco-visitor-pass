package com.nalco.visitorpass.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "visitors")
public class Visitor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "user_id", referencedColumnName = "id")
    private User user;

    @Column(nullable = false)
    private String fullName;

    private String company;

    @Column(nullable = false)
    private String govtIdType; // Aadhaar, PAN, Passport, Driving License

    @Column(nullable = false)
    private String govtIdNumber;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String photoData; // Store as base64 in database for self-containment

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String govtIdData; // Store as base64 in database for self-containment

    @Column(nullable = false)
    private String emergencyContact;

    private String vehicleNumber;

    public Visitor() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }

    public String getGovtIdType() { return govtIdType; }
    public void setGovtIdType(String govtIdType) { this.govtIdType = govtIdType; }

    public String getGovtIdNumber() { return govtIdNumber; }
    public void setGovtIdNumber(String govtIdNumber) { this.govtIdNumber = govtIdNumber; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getPhotoData() { return photoData; }
    public void setPhotoData(String photoData) { this.photoData = photoData; }

    public String getGovtIdData() { return govtIdData; }
    public void setGovtIdData(String govtIdData) { this.govtIdData = govtIdData; }

    public String getEmergencyContact() { return emergencyContact; }
    public void setEmergencyContact(String emergencyContact) { this.emergencyContact = emergencyContact; }

    public String getVehicleNumber() { return vehicleNumber; }
    public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
}
