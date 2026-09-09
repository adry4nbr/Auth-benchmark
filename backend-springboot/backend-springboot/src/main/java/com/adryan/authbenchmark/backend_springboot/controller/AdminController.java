package com.adryan.authbenchmark.backend_springboot.controller;

import com.adryan.authbenchmark.backend_springboot.dto.PagedResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.service.AdminService;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public PagedResponseDto<UserResponseDto> getUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int limit
    ) {
        return adminService.listUsers(page, limit);
    }

    @DeleteMapping("/users/{id}")
    public void deleteUser(@PathVariable UUID id){
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        String userIdString = (String) authentication.getPrincipal();
        UUID requesterId = UUID.fromString(userIdString);

        adminService.deleteUsers(id, requesterId);
    }
}
