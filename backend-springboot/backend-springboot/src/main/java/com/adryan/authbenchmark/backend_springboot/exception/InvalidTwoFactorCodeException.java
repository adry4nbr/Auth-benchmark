package com.adryan.authbenchmark.backend_springboot.exception;

public class InvalidTwoFactorCodeException extends RuntimeException {
    public InvalidTwoFactorCodeException(String message) {
        super(message);
    }
}
