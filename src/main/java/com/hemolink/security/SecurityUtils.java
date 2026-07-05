package com.hemolink.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static AuthUser requireUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return user;
    }

    public static void requireAdmin(AuthUser user) {
        if (!user.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required.");
        }
    }

    public static void requireAdminOrHospital(AuthUser user) {
        if (!user.isAdmin() && !user.isHospital()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Hospital or admin access required.");
        }
    }

    public static void requireHospitalAccess(AuthUser user, String hospitalId) {
        if (user.isAdmin()) {
            return;
        }
        if (!user.isHospital() || user.hospitalId() == null || !user.hospitalId().equals(hospitalId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only manage your own hospital.");
        }
    }

    public static void requireSelfOrAdmin(AuthUser user, String userId) {
        if (user.isAdmin() || user.id().equals(userId)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only access your own account.");
    }
}
