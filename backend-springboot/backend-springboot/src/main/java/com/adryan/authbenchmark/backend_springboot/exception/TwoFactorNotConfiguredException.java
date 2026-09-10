package com.adryan.authbenchmark.backend_springboot.exception;

public class TwoFactorNotConfiguredException extends RuntimeException {
    public TwoFactorNotConfiguredException(String message) {
        super(message);
    }
}
