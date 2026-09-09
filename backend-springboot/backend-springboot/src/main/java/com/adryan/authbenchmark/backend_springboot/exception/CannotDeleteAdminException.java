package com.adryan.authbenchmark.backend_springboot.exception;

public class CannotDeleteAdminException extends RuntimeException {
    public CannotDeleteAdminException(String message) {
        super(message);
    }
}
