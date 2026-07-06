package com.nalco.visitorpass.repository;

import com.nalco.visitorpass.entity.OTPLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface OTPLogRepository extends JpaRepository<OTPLog, Long> {
    Optional<OTPLog> findTopByDestinationOrderByExpiryTimeDesc(String destination);
}
