package com.nalco.visitorpass.repository;

import com.nalco.visitorpass.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {
    List<Employee> findByDepartment(String department);
    List<Employee> findByNameContainingIgnoreCase(String query);
}
