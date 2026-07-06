package com.nalco.visitorpass.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    private final ConcurrentHashMap<String, IpRequestTracker> ipTrackers = new ConcurrentHashMap<>();
    private final int MAX_REQUESTS_PER_MINUTE = 60; // 1 request per second average
    private final int MAX_LOGIN_REQUESTS_PER_MINUTE = 10;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String ipAddress = request.getRemoteAddr();
        String uri = request.getRequestURI();

        ipTrackers.computeIfAbsent(ipAddress, k -> new IpRequestTracker());
        IpRequestTracker tracker = ipTrackers.get(ipAddress);

        tracker.resetIfExpired();

        int currentTotalRequests = tracker.totalRequests.incrementAndGet();
        int currentLoginRequests = 0;

        if (uri.contains("/api/auth/login")) {
            currentLoginRequests = tracker.loginRequests.incrementAndGet();
        }

        if (currentTotalRequests > MAX_REQUESTS_PER_MINUTE || currentLoginRequests > MAX_LOGIN_REQUESTS_PER_MINUTE) {
            response.setStatus(429); // Too Many Requests
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"Too many requests. Please wait before retrying.\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private static class IpRequestTracker {
        private final long windowStartTime;
        private final AtomicInteger totalRequests;
        private final AtomicInteger loginRequests;

        public IpRequestTracker() {
            this.windowStartTime = System.currentTimeMillis();
            this.totalRequests = new AtomicInteger(0);
            this.loginRequests = new AtomicInteger(0);
        }

        public void resetIfExpired() {
            long now = System.currentTimeMillis();
            if (now - windowStartTime > 60000) { // 1 minute window
                totalRequests.set(0);
                loginRequests.set(0);
            }
        }
    }
}
