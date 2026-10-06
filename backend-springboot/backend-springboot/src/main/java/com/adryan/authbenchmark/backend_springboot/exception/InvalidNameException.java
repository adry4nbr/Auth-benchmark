package com.adryan.authbenchmark.backend_springboot.exception;

public class InvalidNameException extends RuntimeException {
    public InvalidNameException(String message) {
        super(message);
    }
}