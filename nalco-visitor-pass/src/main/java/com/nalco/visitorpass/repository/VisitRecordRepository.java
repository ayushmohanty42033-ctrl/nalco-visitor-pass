package com.nalco.visitorpass.repository;

import com.nalco.visitorpass.entity.Visitor;
import com.nalco.visitorpass.entity.VisitRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface VisitRecordRepository extends JpaRepository<VisitRecord, Long> {
    List<VisitRecord> findByVisitor(Visitor visitor);
    List<VisitRecord> findByVisitorUserEmail(String email);
    Optional<VisitRecord> findByQrCodeToken(String token);
    Optional<VisitRecord> findByVisitorPassId(String passId);
    List<VisitRecord> findAllByOrderByVisitDateDesc();
}
