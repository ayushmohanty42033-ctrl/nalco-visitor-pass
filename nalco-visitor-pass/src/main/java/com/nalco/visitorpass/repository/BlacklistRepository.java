package com.nalco.visitorpass.repository;

import com.nalco.visitorpass.entity.Blacklist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BlacklistRepository extends JpaRepository<Blacklist, Long> {
    Optional<Blacklist> findByGovtIdTypeAndGovtIdNumber(String govtIdType, String govtIdNumber);
    boolean existsByGovtIdTypeAndGovtIdNumber(String govtIdType, String govtIdNumber);
}
