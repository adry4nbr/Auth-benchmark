package com.adryan.authbenchmark.backend_springboot.util;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;

@Component
public class InputSanitizer {

    private final PolicyFactory policy = new HtmlPolicyBuilder().toFactory();

    public String sanitize(String input) {
        if (input == null) {
            return null;
        }
        return policy.sanitize(input);
    }
}