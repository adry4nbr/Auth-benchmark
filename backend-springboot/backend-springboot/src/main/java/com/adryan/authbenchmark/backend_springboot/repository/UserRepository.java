package com.adryan.authbenchmark.backend_springboot.repository;

import com.adryan.authbenchmark.backend_springboot.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    @Modifying
    @Query("UPDATE User u SET u.twoFactorLastStep = :passo WHERE u.id = :id AND (u.twoFactorLastStep IS NULL OR u.twoFactorLastStep < :passo)")
    int updateTwoFactorLastStep(@Param("id") UUID id, @Param("passo") Integer passo);
}