package com.nalco.visitorpass.config;

import com.nalco.visitorpass.entity.Blacklist;
import com.nalco.visitorpass.entity.Department;
import com.nalco.visitorpass.entity.Employee;
import com.nalco.visitorpass.entity.User;
import com.nalco.visitorpass.repository.BlacklistRepository;
import com.nalco.visitorpass.repository.DepartmentRepository;
import com.nalco.visitorpass.repository.EmployeeRepository;
import com.nalco.visitorpass.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import java.util.Arrays;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final EmployeeRepository employeeRepository;
    private final BlacklistRepository blacklistRepository;

    public DatabaseSeeder(UserRepository userRepository,
                          DepartmentRepository departmentRepository,
                          EmployeeRepository employeeRepository,
                          BlacklistRepository blacklistRepository) {
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.employeeRepository = employeeRepository;
        this.blacklistRepository = blacklistRepository;
    }

    @Override
    public void run(String... args) throws Exception {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        // 1. Seed Admin User
        if (userRepository.findByEmail("admin@nalcoindia.co.in").isEmpty()) {
            User admin = new User(
                "admin@nalcoindia.co.in",
                "9999999999",
                encoder.encode("Admin@Nalco2026"),
                "ROLE_ADMIN"
            );
            userRepository.save(admin);
            System.out.println("Seeded administrator: admin@nalcoindia.co.in");
        }

        // 2. Seed Departments
        if (departmentRepository.count() == 0) {
            departmentRepository.saveAll(Arrays.asList(
                new Department("Corporate Office", "CO"),
                new Department("Smelter Plant", "SP"),
                new Department("Alumina Refinery", "AR"),
                new Department("Captive Power Plant", "CPP"),
                new Department("Finance Department", "FD"),
                new Department("HR & Administration", "HR"),
                new Department("IT Department", "IT")
            ));
            System.out.println("Seeded organizational departments");
        }

        // 3. Seed Employees
        if (employeeRepository.count() == 0) {
            employeeRepository.saveAll(Arrays.asList(
                new Employee("Sri A. K. Senapati", "ak.senapati@nalcoindia.co.in", "+91 94370 12345", "Smelter Plant"),
                new Employee("Dr. S. K. Patel", "sk.patel@nalcoindia.co.in", "+91 94370 23456", "HR & Administration"),
                new Employee("Smt. R. Mishra", "r.mishra@nalcoindia.co.in", "+91 94370 34567", "Finance Department"),
                new Employee("Sri P. K. Mohapatra", "pk.mohapatra@nalcoindia.co.in", "+91 94370 45678", "IT Department"),
                new Employee("Sri B. Das", "b.das@nalcoindia.co.in", "+91 94370 56789", "Captive Power Plant")
            ));
            System.out.println("Seeded host employee directory");
        }

        // 4. Seed Blacklisted Visitors
        if (blacklistRepository.count() == 0) {
            blacklistRepository.save(new Blacklist(
                "Aadhaar",
                "111122223333",
                "Ramesh Kumar",
                "Previous safety violation and unauthorized entry in Smelter area."
            ));
            System.out.println("Seeded global blacklist database");
        }
    }
}
