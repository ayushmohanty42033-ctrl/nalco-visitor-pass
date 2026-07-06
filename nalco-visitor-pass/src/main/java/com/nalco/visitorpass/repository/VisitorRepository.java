package com.nalco.visitorpass.repository;

import com.nalco.visitorpass.entity.User;
import com.nalco.visitorpass.entity.Visitor;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VisitorRepository extends JpaRepository<Visitor, Long> {
    Optional<Visitor> findByUser(User user);
    Optional<Visitor> findByUserEmail(String email);
}
