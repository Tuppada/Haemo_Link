package com.hemolink.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class DemoPasswordInitializer implements ApplicationRunner {

    private static final Map<String, String> DEMO_PASSWORDS = Map.of(
            "admin@hemolink.in", "admin123",
            "manipal@hemolink.in", "Manipal@123",
            "fortis@hemolink.in", "Fortis@123",
            "apollo@hemolink.in", "Apollo@123",
            "aiims@hemolink.in", "AIIMS@123"
    );

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;

    public DemoPasswordInitializer(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        DEMO_PASSWORDS.forEach((email, plain) -> {
            String currentHash = jdbcTemplate.query(
                    "select password_hash from users where lower(email)=lower(?)",
                    rs -> rs.next() ? rs.getString(1) : null,
                    email
            );
            if (currentHash == null || !currentHash.startsWith("$2a$")) {
                jdbcTemplate.update(
                        "update users set password_hash=? where lower(email)=lower(?)",
                        passwordEncoder.encode(plain),
                        email
                );
            }
        });
    }
}
