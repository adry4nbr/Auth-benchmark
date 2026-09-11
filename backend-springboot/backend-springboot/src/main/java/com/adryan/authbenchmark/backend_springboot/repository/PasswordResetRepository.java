package com.adryan.authbenchmark.backend_springboot.repository;

import com.adryan.authbenchmark.backend_springboot.model.PasswordReset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface PasswordResetRepository extends JpaRepository<PasswordReset, java.util.UUID> {
    List<PasswordReset> findByExpiresAtAfter(LocalDateTime now);
}